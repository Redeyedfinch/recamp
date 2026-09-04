/**
 * Store — the whole workspace in memory, persisted as a snapshot.
 *
 *   nodes    pages, databases, records (one table, `kind` tells them apart)
 *   blocks   the content of a node, a flat list with parent pointers
 *   activity the observatory log
 *
 * Every write: mutate → stamp updatedAt → log if it matters → emit('change')
 * → persist (debounced). Views re-render on 'change'. Snapshots from two
 * devices merge per record by updatedAt, and deletions are tombstones so a
 * merge can never resurrect a page someone emptied from Trash.
 */
import { Emitter } from '../core/emitter.js';
import { uid } from '../core/id.js';
import { between, after as orderAfter, before as orderBefore, byOrder } from '../core/order.js';
import { debounce } from '../core/dom.js';
import { DATABASES, TEXT_BLOCKS } from './schema.js';
import { buildSeed, SEED_VERSION } from './seed.js';

const now = () => new Date().toISOString();
const TOMBSTONE_DAYS = 30;
const ACTIVITY_MAX = 600;
const RECENT_MAX = 12;
const COALESCE_MS = 10 * 60 * 1000;

export class Store extends Emitter {
  constructor(adapter) {
    super();
    this.adapter = adapter;
    this.cloud = null;
    this.state = null;
    this.saving = false;
    this.lastSave = null;
    this._persistLocal = debounce(() => this._flush(this.adapter), 500);
    this._persistCloud = debounce(() => this.cloud && this._flush(this.cloud), 2500);
  }

  /* ------------------------------------------------------------ lifecycle */

  async init() {
    let snap = await this.adapter.load();
    if (!snap) { snap = buildSeed(); this._seeded = true; }
    else if ((snap.meta?.seedVersion || 0) < SEED_VERSION) snap = mergeSeed(snap, buildSeed());
    this.hydrate(snap);
    if (this._seeded) this._flush(this.adapter);
    return this;
  }

  hydrate(snap) {
    this.state = normalise(snap);
    purgeTombstones(this.state);
    this.emit('change', { type: 'hydrate' });
  }

  snapshot() {
    return { ...this.state, v: 1, savedAt: now() };
  }

  async attachCloud(cloud) {
    this.cloud = cloud;
    const remote = await cloud.load().catch(e => { this.emit('sync', { ok: false, error: String(e.message || e) }); return null; });
    if (remote) {
      const merged = mergeSnapshots(this.snapshot(), remote);
      this.hydrate(merged);
    }
    await this._flush(this.adapter);
    const r = await this._flush(cloud);
    this.emit('sync', { ok: r?.ok !== false, error: r?.error });
    return r;
  }

  detachCloud() { this.cloud = null; this.emit('sync', { ok: true, detached: true }); }

  async _flush(adapter) {
    if (!adapter || !this.state) return;
    this.saving = true; this.emit('saving', true);
    const r = await adapter.save(this.snapshot());
    this.saving = false; this.emit('saving', false);
    if (r?.ok) this.lastSave = now();
    if (adapter.kind === 'cloud') {
      this.emit('sync', { ok: !!r?.ok, error: r?.error, at: this.lastSave });
      if (r?.snapshot) { this.hydrate(mergeSnapshots(this.snapshot(), r.snapshot)); this._persistLocal(); }
    }
    return r;
  }

  persist() { this._persistLocal(); this._persistCloud(); }
  async flushNow() { this._persistLocal.cancel(); this._persistCloud.cancel(); await this._flush(this.adapter); if (this.cloud) await this._flush(this.cloud); }

  _changed(detail) { this.emit('change', detail); this.persist(); }

  /* -------------------------------------------------------------- settings */

  setting(key, fallback) { const v = this.state.settings[key]; return v === undefined ? fallback : v; }
  setSetting(key, value) { this.state.settings[key] = value; this._changed({ type: 'setting', key }); }
  get meta() { return this.state.meta; }
  setMeta(patch) { Object.assign(this.state.meta, patch); this._changed({ type: 'meta' }); }

  /* ----------------------------------------------------------------- reads */

  node(id) { const n = this.state.nodes[id]; return n && !n.deleted ? n : null; }
  block(id) { const b = this.state.blocks[id]; return b && !b.deleted ? b : null; }

  allNodes({ includeArchived = false } = {}) {
    return Object.values(this.state.nodes).filter(n => !n.deleted && (includeArchived || !n.archived));
  }

  children(parentId, { kinds, includeArchived = false } = {}) {
    return this.allNodes({ includeArchived })
      .filter(n => n.parentId === parentId && (!kinds || kinds.includes(n.kind)))
      .sort(byOrder);
  }

  hasChildren(id) { return this.allNodes().some(n => n.parentId === id); }

  /** Breadcrumb path from root to `id` (inclusive). */
  path(id) {
    const out = []; let cur = this.node(id); let guard = 0;
    while (cur && guard++ < 64) { out.unshift(cur); cur = cur.parentId === 'root' ? null : this.node(cur.parentId); }
    return out;
  }

  isAncestor(maybeAncestorId, id) {
    let cur = this.node(id); let guard = 0;
    while (cur && guard++ < 64) { if (cur.parentId === maybeAncestorId) return true; cur = this.node(cur.parentId); }
    return false;
  }

  descendants(id, { includeArchived = true } = {}) {
    const out = []; const stack = [id];
    const all = Object.values(this.state.nodes).filter(n => !n.deleted && (includeArchived || !n.archived));
    while (stack.length) {
      const pid = stack.pop();
      for (const n of all) if (n.parentId === pid) { out.push(n); stack.push(n.id); }
    }
    return out;
  }

  db(id) { const n = this.node(id); return n?.kind === 'database' ? n : null; }
  databases() { return this.allNodes().filter(n => n.kind === 'database'); }

  /** All live records of a database, wherever they sit in the tree. */
  records(dbId, { includeArchived = false } = {}) {
    return this.allNodes({ includeArchived }).filter(n => n.kind === 'record' && n.databaseId === dbId).sort(byOrder);
  }

  databaseOf(node) { return node?.kind === 'record' ? this.db(node.databaseId) : node?.kind === 'database' ? node : null; }
  property(dbId, propId) { return this.db(dbId)?.schema.find(p => p.id === propId) || null; }

  /** Records in `dbId` whose relation `propId` includes `targetId`. */
  relatedTo(dbId, propId, targetId) {
    return this.records(dbId).filter(r => (arr(r.props[propId])).includes(targetId));
  }

  favorites() { return this.state.favorites.map(id => this.node(id)).filter(n => n && !n.archived); }
  isFavorite(id) { return this.state.favorites.includes(id); }
  recent() { return this.state.recent.map(id => this.node(id)).filter(n => n && !n.archived); }
  trashed() { return Object.values(this.state.nodes).filter(n => !n.deleted && n.archived && n.archivedRoot).sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || '')); }

  activity(limit = 60) { return this.state.activity.slice(0, limit); }

  /* ------------------------------------------------------------ node writes */

  createNode({ kind = 'page', parentId = null, databaseId = null, title = '', icon = null, props = {}, before = null, after = null, schema, views, description, catalogue, provenance = null, blocks = null, silent = false } = {}) {
    const t = now();
    parentId = parentId || (kind === 'record' && databaseId) || 'root';
    const siblings = this.children(parentId, { includeArchived: true });
    const order = orderFor(siblings, before, after);
    const node = {
      id: uid(kind === 'record' ? 'r' : kind === 'database' ? 'db' : 'p'),
      kind, parentId, databaseId: kind === 'record' ? databaseId : null,
      title, icon: icon || defaultIcon(kind, databaseId), cover: null, order, props: { ...props },
      createdAt: t, updatedAt: t, archived: false, provenance,
    };
    if (kind === 'database') {
      node.schema = schema || [{ id: 'status', name: 'Status', type: 'select', options: [{ name: 'Open', tone: 'celestial' }, { name: 'Done', tone: 'sage' }] }];
      node.views = views || [{ id: 'v_table', name: 'Table', type: 'table', filters: [], sorts: [], hidden: [] }];
      node.description = description || '';
      node.catalogue = catalogue || (title || 'DB').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DB';
      node.nextSeq = 1;
    }
    if (kind === 'record') {
      const db = this.db(databaseId);
      if (db) { node.seq = db.nextSeq || 1; db.nextSeq = node.seq + 1; db.updatedAt = t; }
    }
    this.state.nodes[node.id] = node;
    if (blocks !== false) {
      const initial = blocks && blocks.length ? blocks : [{ type: 'paragraph', text: '' }];
      let prev = null;
      for (const b of initial) prev = this._addBlockRaw({ nodeId: node.id, parentId: node.id, ...b, afterOrder: prev?.order });
    }
    if (!silent) this.log(kind === 'record' ? 'RECORD CREATED' : kind === 'database' ? 'DATABASE CREATED' : 'PAGE CREATED', { nodeId: node.id, title: node.title || 'Untitled', detail: kind === 'record' ? `in ${this.db(databaseId)?.title || 'database'}` : '' });
    this._changed({ type: 'node:create', id: node.id });
    return node;
  }

  updateNode(id, patch, { log = true } = {}) {
    const n = this.node(id); if (!n) return null;
    const before = { ...n };
    Object.assign(n, patch, { updatedAt: now() });
    if (log && ('title' in patch) && before.title !== n.title) this._coalesce('PAGE RENAMED', { nodeId: id, title: n.title || 'Untitled', detail: before.title ? `was “${before.title}”` : '' });
    this._changed({ type: 'node:update', id, keys: Object.keys(patch) });
    return n;
  }

  touch(id) { const n = this.node(id); if (n) { n.updatedAt = now(); this._coalesce('PAGE UPDATED', { nodeId: id, title: n.title || 'Untitled', detail: n.kind === 'record' ? `${this.db(n.databaseId)?.title || ''} record edited`.trim() : 'Content edited' }); this._changed({ type: 'node:touch', id }); } }

  setProp(id, propId, value) {
    const n = this.node(id); if (!n) return;
    const db = this.db(n.databaseId); const prop = db?.schema.find(p => p.id === propId);
    const before = n.props[propId];
    n.props[propId] = value; n.updatedAt = now();
    if (prop?.type === 'select' && propId === 'status' && before !== value) this.log('STATUS CHANGED', { nodeId: id, title: n.title || 'Untitled', detail: `${before || '—'} → ${value || '—'}` });
    else if (propId === 'done' && value === true) this.log('TASK COMPLETED', { nodeId: id, title: n.title || 'Untitled', detail: '' });
    else this._coalesce('RECORD UPDATED', { nodeId: id, title: n.title || 'Untitled', detail: `${prop?.name || propId} changed` });
    // keep Tasks' checkbox and status in step
    if (db?.id === 'db_tasks') {
      if (propId === 'done') n.props.status = value ? 'Done' : (n.props.status === 'Done' ? 'To do' : n.props.status || 'To do');
      if (propId === 'status') n.props.done = value === 'Done';
    }
    this._changed({ type: 'node:prop', id, propId });
  }

  moveNode(id, { parentId, before = null, after = null }) {
    const n = this.node(id); if (!n) return false;
    if (parentId === id || this.isAncestor(id, parentId)) return false;
    const target = parentId === 'root' ? { id: 'root' } : this.node(parentId); if (!target) return false;
    const siblings = this.children(parentId, { includeArchived: true }).filter(s => s.id !== id);
    n.order = orderFor(siblings, before, after);
    const moved = n.parentId !== parentId;
    n.parentId = parentId; n.updatedAt = now();
    if (moved) this.log('PAGE MOVED', { nodeId: id, title: n.title || 'Untitled', detail: `into ${parentId === 'root' ? 'Workspace' : target.title || 'Untitled'}` });
    this._changed({ type: 'node:move', id });
    return true;
  }

  trashNode(id) {
    const n = this.node(id); if (!n || n.archived) return;
    const t = now();
    n.archived = true; n.archivedAt = t; n.archivedRoot = true; n.updatedAt = t;
    for (const d of this.descendants(id)) { if (!d.archived) { d.archived = true; d.archivedAt = t; d.updatedAt = t; } }
    this.state.favorites = this.state.favorites.filter(f => f !== id);
    this.log('PAGE TRASHED', { nodeId: id, title: n.title || 'Untitled', detail: n.kind });
    this._changed({ type: 'node:trash', id });
  }

  restoreNode(id) {
    const n = this.state.nodes[id]; if (!n || !n.archived) return;
    const t = now();
    const parentAlive = n.parentId === 'root' || (this.node(n.parentId) && !this.node(n.parentId).archived);
    if (!parentAlive) n.parentId = n.kind === 'record' && this.db(n.databaseId) ? n.databaseId : 'root';
    n.archived = false; n.archivedRoot = false; n.archivedAt = null; n.updatedAt = t;
    for (const d of this.descendants(id)) { if (d.archived && !d.archivedRoot) { d.archived = false; d.archivedAt = null; d.updatedAt = t; } }
    this.log('PAGE RESTORED', { nodeId: id, title: n.title || 'Untitled', detail: '' });
    this._changed({ type: 'node:restore', id });
  }

  deleteForever(id) {
    const n = this.state.nodes[id]; if (!n) return;
    const t = now(); const title = n.title;
    for (const d of [n, ...this.descendants(id)]) {
      d.deleted = true; d.updatedAt = t;
      for (const b of Object.values(this.state.blocks)) if (b.nodeId === d.id) { b.deleted = true; b.updatedAt = t; }
    }
    this.state.favorites = this.state.favorites.filter(f => f !== id);
    this.state.recent = this.state.recent.filter(f => f !== id);
    this.log('PAGE DELETED', { nodeId: null, title: title || 'Untitled', detail: 'removed permanently' });
    this._changed({ type: 'node:delete', id });
  }

  emptyTrash() { for (const n of this.trashed()) this.deleteForever(n.id); }

  toggleFavorite(id) {
    const i = this.state.favorites.indexOf(id);
    if (i >= 0) this.state.favorites.splice(i, 1); else this.state.favorites.push(id);
    const n = this.node(id);
    this.log(i >= 0 ? 'FAVORITE REMOVED' : 'FAVORITE ADDED', { nodeId: id, title: n?.title || 'Untitled', detail: '' });
    this._changed({ type: 'favorite', id });
  }

  touchRecent(id) {
    if (!this.node(id)) return;
    this.state.recent = [id, ...this.state.recent.filter(r => r !== id)].slice(0, RECENT_MAX);
    this.emit('change', { type: 'recent' }); this._persistLocal();
  }

  duplicateNode(id) {
    const n = this.node(id); if (!n) return null;
    const copy = this.createNode({ kind: n.kind, parentId: n.parentId, databaseId: n.databaseId, title: `${n.title} (copy)`, icon: n.icon, props: JSON.parse(JSON.stringify(n.props)), after: n.id, schema: n.schema && JSON.parse(JSON.stringify(n.schema)), views: n.views && JSON.parse(JSON.stringify(n.views)), blocks: false, silent: true });
    const map = { [n.id]: copy.id };
    const src = Object.values(this.state.blocks).filter(b => b.nodeId === n.id && !b.deleted && !b.archived).sort(byOrder);
    for (const b of src) { const nb = { ...b, id: uid('b'), nodeId: copy.id, createdAt: now(), updatedAt: now() }; map[b.id] = nb.id; nb.parentId = map[b.parentId] || copy.id; this.state.blocks[nb.id] = nb; }
    this.log('PAGE DUPLICATED', { nodeId: copy.id, title: copy.title, detail: '' });
    this._changed({ type: 'node:create', id: copy.id });
    return copy;
  }

  /* ---------------------------------------------------------- schema writes */

  addProperty(dbId, prop) { const db = this.db(dbId); if (!db) return; db.schema.push({ id: prop.id || uid('prop'), options: [], ...prop }); db.updatedAt = now(); this._changed({ type: 'schema', id: dbId }); }
  updateProperty(dbId, propId, patch) { const p = this.property(dbId, propId); if (!p) return; Object.assign(p, patch); this.db(dbId).updatedAt = now(); this._changed({ type: 'schema', id: dbId }); }
  removeProperty(dbId, propId) { const db = this.db(dbId); if (!db) return; db.schema = db.schema.filter(p => p.id !== propId); db.updatedAt = now(); this._changed({ type: 'schema', id: dbId }); }
  addOption(dbId, propId, name, tone = 'faint') { const p = this.property(dbId, propId); if (!p || p.options.some(o => o.name === name)) return; p.options.push({ name, tone }); this.db(dbId).updatedAt = now(); this._changed({ type: 'schema', id: dbId }); }
  updateView(dbId, viewId, patch) { const db = this.db(dbId); const v = db?.views.find(x => x.id === viewId); if (!v) return; Object.assign(v, patch); db.updatedAt = now(); this._changed({ type: 'view', id: dbId }); }
  addView(dbId, view) { const db = this.db(dbId); if (!db) return null; const v = { id: uid('v'), filters: [], sorts: [], hidden: [], ...view }; db.views.push(v); db.updatedAt = now(); this._changed({ type: 'view', id: dbId }); return v; }
  removeView(dbId, viewId) { const db = this.db(dbId); if (!db || db.views.length < 2) return; db.views = db.views.filter(v => v.id !== viewId); db.updatedAt = now(); this._changed({ type: 'view', id: dbId }); }

  /* ----------------------------------------------------------------- blocks */

  blocks(nodeId) { return Object.values(this.state.blocks).filter(b => b.nodeId === nodeId && !b.deleted && !b.archived); }
  childBlocks(nodeId, parentId) { return this.blocks(nodeId).filter(b => b.parentId === parentId).sort(byOrder); }

  /** Nested tree: [{ block, children: [...] }] */
  blockTree(nodeId, parentId = nodeId) {
    return this.childBlocks(nodeId, parentId).map(block => ({ block, children: this.blockTree(nodeId, block.id) }));
  }

  /** Flattened in document order, with depth. */
  blockList(nodeId) {
    const out = []; const walk = (parentId, depth) => { for (const b of this.childBlocks(nodeId, parentId)) { out.push({ block: b, depth }); walk(b.id, depth + 1); } };
    walk(nodeId, 0); return out;
  }

  _addBlockRaw({ nodeId, parentId, type = 'paragraph', text = '', props = {}, afterOrder = null, beforeOrder = null }) {
    const t = now();
    const b = { id: uid('b'), nodeId, parentId: parentId || nodeId, type, text, props: { ...props }, order: between(afterOrder, beforeOrder), createdAt: t, updatedAt: t, archived: false };
    this.state.blocks[b.id] = b; return b;
  }

  createBlock({ nodeId, parentId = null, type = 'paragraph', text = '', props = {}, after = null, before = null }) {
    parentId = parentId || nodeId;
    const sibs = this.childBlocks(nodeId, parentId);
    const a = after ? sibs.find(s => s.id === after) : null;
    const b = before ? sibs.find(s => s.id === before) : null;
    let afterOrder = a?.order || null, beforeOrder = b?.order || null;
    if (a && !b) beforeOrder = sibs[sibs.indexOf(a) + 1]?.order || null;
    if (b && !a) afterOrder = sibs[sibs.indexOf(b) - 1]?.order || null;
    if (!a && !b) afterOrder = sibs[sibs.length - 1]?.order || null;
    const blk = this._addBlockRaw({ nodeId, parentId, type, text, props, afterOrder, beforeOrder });
    this.touch(nodeId);
    return blk;
  }

  updateBlock(id, patch, { touch = true } = {}) {
    const b = this.block(id); if (!b) return null;
    Object.assign(b, patch, { updatedAt: now() });
    if (touch) this.touch(b.nodeId); else this._changed({ type: 'block:update', id, quiet: true });
    return b;
  }

  deleteBlock(id) {
    const b = this.block(id); if (!b) return;
    const t = now();
    const kill = bid => { const x = this.state.blocks[bid]; if (!x) return; x.deleted = true; x.updatedAt = t; for (const c of Object.values(this.state.blocks)) if (c.parentId === bid && !c.deleted) kill(c.id); };
    kill(id); this.touch(b.nodeId);
  }

  moveBlock(id, { parentId, after = null, before = null }) {
    const b = this.block(id); if (!b) return false;
    if (parentId === id) return false;
    let p = parentId; while (p && p !== b.nodeId) { if (p === id) return false; p = this.block(p)?.parentId; }
    const sibs = this.childBlocks(b.nodeId, parentId).filter(s => s.id !== id);
    const a = after ? sibs.find(s => s.id === after) : null;
    const bb = before ? sibs.find(s => s.id === before) : null;
    let afterOrder = a?.order || null, beforeOrder = bb?.order || null;
    if (a && !bb) beforeOrder = sibs[sibs.indexOf(a) + 1]?.order || null;
    if (bb && !a) afterOrder = sibs[sibs.indexOf(bb) - 1]?.order || null;
    if (!a && !bb) afterOrder = sibs[sibs.length - 1]?.order || null;
    b.parentId = parentId; b.order = between(afterOrder, beforeOrder); b.updatedAt = now();
    this.touch(b.nodeId); return true;
  }

  /** Previous / next block in document order (for caret travel). */
  siblingInDocument(nodeId, id, dir) {
    const list = this.blockList(nodeId).map(x => x.block);
    const i = list.findIndex(b => b.id === id);
    let j = i + dir;
    while (j >= 0 && j < list.length && !TEXT_BLOCKS.has(list[j].type) && !['code', 'equation', 'table'].includes(list[j].type)) j += dir;
    return list[j] || null;
  }

  /* --------------------------------------------------------------- activity */

  log(type, { nodeId = null, title = '', detail = '' }) {
    const e = { id: uid('a'), at: now(), type, nodeId, title, detail, actor: this.state.meta.user?.name || '' };
    this.state.activity.unshift(e);
    if (this.state.activity.length > ACTIVITY_MAX) this.state.activity.length = ACTIVITY_MAX;
    return e;
  }

  /** Like log, but folds into the last entry for the same node+type within 10 min. */
  _coalesce(type, info) {
    const last = this.state.activity.find(a => a.nodeId === info.nodeId && a.type === type);
    if (last && Date.now() - new Date(last.at).getTime() < COALESCE_MS) { last.at = now(); last.detail = info.detail || last.detail; last.title = info.title; this.state.activity.sort((a, b) => b.at.localeCompare(a.at)); return last; }
    return this.log(type, info);
  }

  /* ----------------------------------------------------------------- search */

  search(query, { limit = 40, includeArchived = false } = {}) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const results = [];
    for (const n of this.allNodes({ includeArchived })) {
      const title = (n.title || '').toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title === t) score += 100; else if (title.startsWith(t)) score += 60;
        else if (new RegExp(`\\b${escapeRe(t)}`).test(title)) score += 40; else if (title.includes(t)) score += 22;
      }
      const props = n.props ? Object.values(n.props).flat().filter(v => typeof v === 'string').join(' ').toLowerCase() : '';
      if (props) for (const t of terms) if (props.includes(t)) score += 10;
      let snippet = '';
      if (score < 40) {
        for (const b of this.blocks(n.id)) {
          const txt = stripHtml(b.text || '').toLowerCase();
          if (!txt) continue;
          let hit = terms.every(t => txt.includes(t));
          if (hit) { score += 12; const i = txt.indexOf(terms[0]); snippet = stripHtml(b.text).slice(Math.max(0, i - 40), i + 80); break; }
        }
      }
      if (score > 0) { score += Math.min(8, (Date.now() - new Date(n.updatedAt).getTime()) < 7 * 86400000 ? 8 : 0); results.push({ node: n, score, snippet }); }
    }
    return results.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title)).slice(0, limit);
  }

  /* ---------------------------------------------------------- convenience */

  tasksFor({ assignee = null, open = true } = {}) {
    return this.records('db_tasks').filter(t => (!open || !t.props.done) && (!assignee || arr(t.props.assignee).includes(assignee)));
  }
  upcomingEvents(from = new Date()) {
    const iso = from.toISOString().slice(0, 10);
    return this.records('db_events').filter(e => e.props.date && e.props.date >= iso && !['Archived', 'Completed'].includes(e.props.status)).sort((a, b) => a.props.date.localeCompare(b.props.date));
  }
  activeProjects() { return this.records('db_projects').filter(p => p.props.status === 'Active'); }
  recentlyEdited(limit = 8) { return this.allNodes().filter(n => n.kind !== 'database').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit); }
}

/* ============================================================ helpers */

export const arr = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function defaultIcon(kind, databaseId) {
  if (kind === 'database') return 'database';
  if (kind === 'record') return DATABASES[databaseId]?.recordIcon || DATABASES[databaseId]?.icon || 'page';
  return 'page';
}

function orderFor(siblings, before, after) {
  const sorted = [...siblings].sort(byOrder);
  if (before) { const i = sorted.findIndex(s => s.id === before); if (i >= 0) return between(sorted[i - 1]?.order || null, sorted[i].order); }
  if (after) { const i = sorted.findIndex(s => s.id === after); if (i >= 0) return between(sorted[i].order, sorted[i + 1]?.order || null); }
  return orderAfter(sorted.map(s => s.order));
}

function normalise(snap) {
  const s = { v: 1, meta: {}, settings: {}, nodes: {}, blocks: {}, activity: [], favorites: [], recent: [], ...snap };
  s.meta = { seedVersion: 0, workspace: { name: 'RECAMP' }, user: { id: 'me', name: '' }, ...s.meta };
  s.settings = { theme: 'dark', sidebar: 'open', ...s.settings };
  if (Array.isArray(s.nodes)) s.nodes = Object.fromEntries(s.nodes.map(n => [n.id, n]));
  if (Array.isArray(s.blocks)) s.blocks = Object.fromEntries(s.blocks.map(b => [b.id, b]));
  for (const n of Object.values(s.nodes)) { n.props ||= {}; if (n.kind === 'database') { n.schema ||= []; n.views ||= []; } }
  return s;
}

function purgeTombstones(state) {
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
  for (const [k, n] of Object.entries(state.nodes)) if (n.deleted && new Date(n.updatedAt).getTime() < cutoff) delete state.nodes[k];
  for (const [k, b] of Object.entries(state.blocks)) if (b.deleted && new Date(b.updatedAt).getTime() < cutoff) delete state.blocks[k];
  // orphaned blocks whose node is gone
  for (const [k, b] of Object.entries(state.blocks)) if (!state.nodes[b.nodeId]) delete state.blocks[k];
}

/** Per-record last-write-wins merge of two snapshots. Pure; exported for tests. */
export function mergeSnapshots(a, b) {
  const pick = (x, y) => (!x ? y : !y ? x : (y.updatedAt || '') > (x.updatedAt || '') ? y : x);
  const nodes = {}; for (const id of new Set([...Object.keys(a.nodes || {}), ...Object.keys(b.nodes || {})])) nodes[id] = pick(a.nodes?.[id], b.nodes?.[id]);
  const blocks = {}; for (const id of new Set([...Object.keys(a.blocks || {}), ...Object.keys(b.blocks || {})])) blocks[id] = pick(a.blocks?.[id], b.blocks?.[id]);
  const seen = new Set(); const activity = [...(a.activity || []), ...(b.activity || [])].filter(e => !seen.has(e.id) && seen.add(e.id)).sort((x, y) => y.at.localeCompare(x.at)).slice(0, ACTIVITY_MAX);
  const newer = (b.savedAt || '') > (a.savedAt || '') ? b : a;
  const older = newer === a ? b : a;
  return {
    v: 1, savedAt: newer.savedAt,
    meta: { ...(older.meta || {}), ...(newer.meta || {}) },
    settings: { ...(older.settings || {}), ...(newer.settings || {}) },
    nodes, blocks, activity,
    favorites: [...new Set([...(newer.favorites || []), ...(older.favorites || [])])],
    recent: newer.recent || older.recent || [],
  };
}

/** Add seed nodes/blocks that are missing; never overwrite user data. */
export function mergeSeed(snap, seed) {
  const out = normalise(snap);
  for (const [id, n] of Object.entries(seed.nodes)) if (!out.nodes[id]) out.nodes[id] = n;
  for (const [id, b] of Object.entries(seed.blocks)) if (!out.blocks[id] && out.nodes[b.nodeId]) out.blocks[id] = b;
  out.meta.seedVersion = seed.meta.seedVersion;
  return out;
}
