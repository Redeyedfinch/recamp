/**
 * Page — a document, or a database record opened as one. Cover plate,
 * catalogue kicker, editable title, properties, the editor, children.
 * Event records get the expedition-record hero.
 */
import { h, icon, clear, setCaret, debounce, esc } from '../core/dom.js';
import { fmtDate, relative, fmtStamp } from '../core/dates.js';
import { mountEditor } from '../editor/editor.js';
import { plateEl } from '../ui/plate.js';
import { showMenu } from '../ui/menu.js';
import { confirm, prompt } from '../ui/dialog.js';
import { propValue, catalogueMark, provenanceMark, statusTag, typeTag, dateLine } from '../ui/props.js';
import { ICONS } from '../core/icons.js';
import { isPhone, onPhoneChange } from '../core/viewport.js';
import { PROP_TYPES } from '../data/schema.js';
import { href } from '../ui/router.js';
import { datebox } from './home.js';
import { empty } from './common.js';

export function mount(ctx, host, route) {
  const node = ctx.store.node(route.id);
  if (!node || node.archived) return notFound(ctx, host, route.id);
  const wrap = h('div.view'); host.append(wrap);
  ctx.store.touchRecent(node.id);
  const v = mountPage(ctx, wrap, node.id, { focusTitle: ctx.consumeFocusTitle?.(node.id) });
  return v;
}

export function mountPage(ctx, host, nodeId, { peek = false, focusTitle = false } = {}) {
  const { store } = ctx;
  const root = h('article.page'); host.append(root);
  let editor = null; let destroyed = false; let showAllProps = false;
  const saveTitle = debounce((v) => store.updateNode(nodeId, { title: v }), 400);

  function render() {
    const node = store.node(nodeId); if (!node || destroyed) return;
    const db = store.databaseOf(node);
    const isRecord = node.kind === 'record';
    editor?.destroy(); clear(root);

    /* cover */
    if (node.cover) {
      const cover = plateEl(node, { label: db ? `RECAMP / ${db.catalogue}-${String(node.seq || 0).padStart(3, '0')}` : 'RECAMP / PAGE', right: node.props?.year || (node.props?.date || '').slice(0, 4) || '' });
      cover.classList.add('page__cover');
      cover.append(h('button.iconbtn', { type: 'button', 'aria-label': 'Cover options', onclick: e => showMenu(e.currentTarget, [{ label: 'Re-plot cover', icon: 'restore', onSelect: () => store.updateNode(nodeId, { cover: { kind: 'plate', seed: Math.random().toString(36).slice(2, 8) } }, { log: false }) }, { label: 'Remove cover', icon: 'close', onSelect: () => store.updateNode(nodeId, { cover: null }, { log: false }) }]) }, icon('more')));
      root.append(cover);
    }

    /* head */
    const head = h('header.page__head');
    const kicker = h('div.page__kicker', catalogueMark(store, node), provenanceMark(node), db ? h('a.label', { href: href.db(db.id) }, db.title.toUpperCase()) : (node.kind === 'page' ? h('span.label', 'PAGE') : null), isRecord && db?.id === 'db_events' && node.props.status === 'Completed' ? h('span.label.label--ink', 'RECAMP EVENT ARCHIVE') : null);
    head.append(kicker);
    const tools = h('div.page__tools',
      // Contextual primary action: announcements are sent, events are announced.
      db?.id === 'db_announcements' ? h('button.btn.btn--sm.btn--primary', { type: 'button', onclick: async () => { const { openCompose } = await import('../ui/compose.js'); openCompose(ctx, nodeId); } }, icon('inbox'), node.props?.status === 'Sent' ? 'Send again' : 'Send…') : null,
      db?.id === 'db_events' ? h('button.btn.btn--sm', { type: 'button', onclick: async () => { const { announceEvent } = await import('../ui/compose.js'); announceEvent(ctx, node); } }, icon('inbox'), 'Email members') : null,
      !node.cover ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => store.updateNode(nodeId, { cover: { kind: 'plate' } }, { log: false }) }, icon('cover'), 'Add cover') : null,
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => store.toggleFavorite(nodeId) }, icon(store.isFavorite(nodeId) ? 'starFill' : 'star'), store.isFavorite(nodeId) ? 'Favorited' : 'Favorite'),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: e => pageMenu(ctx, node, e.currentTarget) }, icon('more'), 'More'));
    head.append(h('div.page__iconwrap', h('button.page__icon', { type: 'button', 'aria-label': 'Change icon', onclick: e => iconMenu(e.currentTarget) }, icon(node.icon || 'page')), tools));
    const title = h('h1.page__title', { contenteditable: 'true', spellcheck: 'true', 'data-placeholder': isRecord ? `Untitled ${db?.title.replace(/s$/, '').toLowerCase() || 'record'}` : 'Untitled', 'data-empty': String(!node.title) }, node.title || '');
    title.addEventListener('input', () => { title.dataset.empty = String(!title.textContent.trim()); saveTitle(title.textContent.trim()); });
    title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveTitle.flush(title.textContent.trim()); editor?.focusFirst(); } if (e.key === 'ArrowDown') { e.preventDefault(); editor?.focusFirst(); } if (e.key === 'Escape') title.blur(); });
    title.addEventListener('blur', () => saveTitle.flush(title.textContent.trim()));
    title.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ')); });
    head.append(title);
    head.append(h('div.page__meta', h('span.coord', `CREATED ${fmtDate(node.createdAt).toUpperCase()}`), h('span.coord', `UPDATED ${relative(node.updatedAt).toUpperCase()}`), store.hasChildren(nodeId) ? h('span.coord', `${store.children(nodeId).length} INSIDE`) : null));
    root.append(head);

    /* event hero */
    if (isRecord && db?.id === 'db_events') {
      const lines = [['Status', statusTag(store, node) || h('span.t-faint', 'Unset')], ['Type', typeTag(store, node) || h('span.t-faint', 'Not recorded')], ['Date', h('span', dateLine(node))]];
      if (node.props.venue) lines.push(['Venue', h('span', node.props.venue)]);
      if (node.props.time) lines.push(['Time', h('span', node.props.time)]);
      root.append(h('div.record-hero', datebox(node), h('div.record-hero__lines', lines.map(([k, v]) => h('div.record-hero__line', h('span.label', k), h('span.status', v))))));
    }

    /* properties */
    if (isRecord && db) {
      const props = h('div.props');
      // On a phone, eleven mostly-empty rows push the writing off the screen.
      // Show what is filled in; keep the blanks one tap away so they stay fillable.
      const filled = p => { const v = node.props?.[p.id]; return !(v == null || v === '' || (Array.isArray(v) && !v.length) || v === false) || ['created', 'updated'].includes(p.type) || (p.id === 'date' && node.dateConfidence === 'year'); };
      const collapse = isPhone() && !showAllProps && db.schema.some(p => !filled(p));
      const shown = collapse ? db.schema.filter(filled) : db.schema;
      for (const p of shown) {
        props.append(h('div.props__row',
          h('button.props__label.label', { type: 'button', onclick: e => propMenu(db, p, e.currentTarget) }, icon(iconForType(p.type)), p.name),
          h('div.props__value', propValue(ctx, node, p))));
      }
      if (collapse) props.append(h('div.props__add', h('button.btn.btn--ghost.btn--sm.props__more', { type: 'button', onclick: () => { showAllProps = true; render(); } }, icon('chevronD'), `Show all ${db.schema.length} properties`)));
      else props.append(h('div.props__add', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: e => addPropMenu(db, e.currentTarget) }, icon('plus'), 'Add a property')));
      root.append(props);
    }

    /* editor */
    const edHost = h('div.page__editor'); root.append(edHost);
    editor = mountEditor(ctx, edHost, nodeId);

    /* children */
    const kids = store.children(nodeId);
    if (kids.length || node.kind === 'page') {
      const sec = h('section.children', h('div.section__head', h('span.label', node.kind === 'database' ? 'Records' : 'Pages inside'), h('button', { type: 'button', onclick: () => { const n = store.createNode({ kind: 'page', parentId: nodeId }); ctx.openNode(n.id, { focusTitle: true }); } }, '+ New page')));
      for (const k of kids) sec.append(h('a.children__row', { href: k.kind === 'database' ? href.db(k.id) : href.page(k.id) }, icon(k.icon || 'page'), h('span.truncate', k.title || 'Untitled'), h('span.children__meta', k.kind === 'record' ? `${store.db(k.databaseId)?.catalogue || ''}-${String(k.seq).padStart(3, '0')}` : k.kind === 'database' ? `${store.records(k.id).length} RECORDS` : relative(k.updatedAt).toUpperCase())));
      if (!kids.length) sec.append(h('div.t-faint', { style: { fontSize: 'var(--fs-small)', padding: '8px 0' } }, 'No pages inside yet.'));
      root.append(sec);
    }

    /* backlinks: records elsewhere that point here */
    const back = backlinks(store, node);
    if (back.length) {
      const sec = h('section.backlinks', h('div.section__head', h('span.label', 'Linked from')));
      for (const { rec, prop } of back) sec.append(h('a.children__row', { href: href.page(rec.id) }, icon(rec.icon || 'page'), h('span.truncate', rec.title || 'Untitled'), h('span.children__meta', `${store.db(rec.databaseId)?.title.toUpperCase()} · ${prop.name.toUpperCase()}`)));
      root.append(sec);
    }

    if (!peek) ctx.shell.setTopbar({ crumbs: crumbsFor(store, node), actions: [
      h('button.iconbtn', { type: 'button', 'aria-label': 'Favorite', 'aria-pressed': String(store.isFavorite(nodeId)), onclick: () => store.toggleFavorite(nodeId) }, icon(store.isFavorite(nodeId) ? 'starFill' : 'star')),
      h('button.iconbtn', { type: 'button', 'aria-label': 'Page options', onclick: e => pageMenu(ctx, node, e.currentTarget) }, icon('more')),
    ] });

    // focus the fresh title — unless the user has already moved on (palette, dialog, menu, another field)
    if (focusTitle) { focusTitle = false; setTimeout(() => { if (!document.querySelector('.palette-scrim, .dialog-scrim, .menu') && !document.activeElement?.closest?.('input, textarea, [contenteditable]')) setCaret(title); }, 0); }
  }

  function iconMenu(anchor) {
    const names = Object.keys(ICONS).filter(n => !['starFill', 'chevronR', 'chevronD', 'chevronL', 'more', 'close', 'grip', 'arrowL', 'arrowR', 'arrowUR', 'menu', 'sidebar', 'plus', 'minus', 'check', 'h1', 'h2', 'h3', 'bullets', 'numbers', 'divider', 'copy', 'restore', 'logout', 'cover', 'emoji', 'sort', 'filter'].includes(n));
    showMenu(anchor, names.map(n => ({ label: n, icon: n, keywords: n, onSelect: () => store.updateNode(nodeId, { icon: n }, { log: false }) })), { searchable: true, head: 'Icon', width: 240 });
  }
  function propMenu(db, p, anchor) {
    showMenu(anchor, [
      { label: 'Rename', icon: 'text', onSelect: () => prompt({ title: 'Rename property', label: 'Name', value: p.name }).then(v => { if (v) store.updateProperty(db.id, p.id, { name: v }); }) },
      (p.type === 'select' || p.type === 'multiselect') ? { label: 'Add option', icon: 'plus', onSelect: () => prompt({ title: `New ${p.name} option`, label: 'Name' }).then(v => { if (v) store.addOption(db.id, p.id, v); }) } : null,
      'sep',
      { label: 'Remove property', icon: 'trash', danger: true, onSelect: async () => { if (await confirm({ title: `Remove “${p.name}” from ${db.title}?`, message: 'Values on every record are kept in the data but no longer shown.', confirmLabel: 'Remove', danger: true })) store.removeProperty(db.id, p.id); } },
    ].filter(Boolean), { head: p.name });
  }
  function addPropMenu(db, anchor) {
    showMenu(anchor, Object.entries(PROP_TYPES).filter(([t]) => !['created', 'updated', 'person', 'relation'].includes(t)).map(([type, def]) => ({ label: def.label, icon: iconForType(type), onSelect: () => prompt({ title: `New ${def.label.toLowerCase()} property`, label: 'Name' }).then(name => { if (name) store.addProperty(db.id, { name, type, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || undefined }); }) })), { head: 'Property type' });
  }

  const unsub = store.on('change', d => {
    if (d.type === 'block:update' || d.type === 'recent') return;
    if (d.type === 'node:touch' && d.id === nodeId) return;           // editor handles its own content
    if (d.type === 'node:update' && d.id === nodeId && d.keys?.every(k => k === 'title')) { const n = store.node(nodeId); const t = root.querySelector('.page__title'); if (t && document.activeElement !== t && t.textContent !== n.title) t.textContent = n.title; refreshCrumbs(); return; }
    if (d.type === 'node:delete' || (d.type === 'node:trash' && (d.id === nodeId || store.isAncestor(d.id, nodeId)))) { if (!peek && !store.node(nodeId)?.archived === false) { /* navigated away by caller */ } }
    render();
  });
  function refreshCrumbs() { if (!peek) { const n = store.node(nodeId); if (n) ctx.shell.setTopbar({ crumbs: crumbsFor(store, n), actions: [...ctx.shell.content.ownerDocument.querySelectorAll('.topbar__actions > *')] }); } }
  const unsubPhone = onPhoneChange(() => render());
  render();
  return { destroy() { destroyed = true; unsub(); unsubPhone(); editor?.destroy(); saveTitle.flush?.(root.querySelector('.page__title')?.textContent.trim() ?? store.node(nodeId)?.title); } };
}

export function crumbsFor(store, node) {
  const path = store.path(node.id);
  const crumbs = [{ title: 'Workspace', href: '#/', icon: 'home' }];
  if (node.kind === 'record' && node.parentId === node.databaseId) { /* db is already in the path */ }
  for (const p of path) crumbs.push({ title: p.title || 'Untitled', href: p.kind === 'database' ? href.db(p.id) : href.page(p.id), icon: p.icon || 'page' });
  if (node.kind === 'record' && !path.some(p => p.id === node.databaseId)) { const db = store.db(node.databaseId); if (db) crumbs.splice(1, 0, { title: db.title, href: href.db(db.id), icon: db.icon }); }
  return crumbs;
}

export function pageMenu(ctx, node, anchor) {
  const { store, router } = ctx;
  showMenu(anchor, [
    { label: store.isFavorite(node.id) ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onSelect: () => store.toggleFavorite(node.id) },
    { label: 'Copy link', icon: 'link', onSelect: () => { navigator.clipboard?.writeText(location.origin + location.pathname + href.page(node.id)); ctx.toast('Link copied'); } },
    { label: 'Duplicate', icon: 'copy', onSelect: () => { const c = store.duplicateNode(node.id); if (c) ctx.openNode(c.id); } },
    { label: 'Move to…', icon: 'arrowR', onSelect: () => moveDialog(ctx, node) },
    node.kind === 'record' ? { label: `Open ${store.db(node.databaseId)?.title || 'database'}`, icon: 'database', onSelect: () => router.db(node.databaseId) } : null,
    'sep',
    { label: 'Move to trash', icon: 'trash', danger: true, onSelect: () => { store.trashNode(node.id); ctx.toast(`“${node.title || 'Untitled'}” moved to trash`, { action: 'Undo', onAction: () => store.restoreNode(node.id) }); if (router.current.id === node.id) router.go(node.kind === 'record' ? `/db/${node.databaseId}` : '/'); } },
  ].filter(Boolean));
}

function moveDialog(ctx, node) {
  const { store } = ctx;
  const targets = store.allNodes().filter(n => n.id !== node.id && n.kind !== 'record' && !store.isAncestor(node.id, n.id));
  showMenu(document.activeElement?.getBoundingClientRect?.() || new DOMRect(window.innerWidth / 2 - 140, 120, 280, 0), [
    { label: 'Workspace (top level)', icon: 'home', onSelect: () => store.moveNode(node.id, { parentId: 'root' }) },
    ...targets.map(t => ({ label: t.title || 'Untitled', icon: t.icon || 'page', desc: store.path(t.id).slice(0, -1).map(p => p.title).join(' / '), keywords: t.title, onSelect: () => store.moveNode(node.id, { parentId: t.id }) })),
  ], { searchable: true, head: 'Move to', placeholder: 'Find a page…' });
}

function backlinks(store, node) {
  const out = [];
  for (const db of store.databases()) for (const prop of db.schema) {
    if ((prop.type === 'relation' || prop.type === 'person') && (prop.target === node.databaseId || (node.kind === 'database' && prop.target === node.id))) {
      for (const rec of store.records(db.id)) if ((Array.isArray(rec.props[prop.id]) ? rec.props[prop.id] : []).includes(node.id)) out.push({ rec, prop });
    }
  }
  return out;
}

export function iconForType(type) {
  return { text: 'text', select: 'circle', multiselect: 'bullets', date: 'calendar', time: 'clock', person: 'user', relation: 'link', checkbox: 'todo', url: 'arrowUR', email: 'inbox', number: 'sigma', files: 'paperclip', created: 'clock', updated: 'clock' }[type] || 'circle';
}

function notFound(ctx, host, id) {
  const n = ctx.store.state.nodes[id];
  host.append(h('div.view', h('div.column', h('div.label', 'NOT FOUND'), h('h1.t-display', { style: { marginTop: '8px' } }, n?.archived ? 'This page is in the trash.' : 'No such page.'),
    h('p.t-secondary', { style: { marginTop: '12px' } }, n?.archived ? 'Restore it from Trash to open it again.' : 'It may have been deleted, or the link is wrong.'),
    h('div.row', { style: { marginTop: '20px', gap: '8px' } }, n?.archived ? h('button.btn.btn--primary', { type: 'button', onclick: () => { ctx.store.restoreNode(id); ctx.router.page(id); } }, 'Restore') : null, h('a.btn', { href: '#/' }, 'Home')))));
  ctx.shell.setTopbar({ crumbs: [{ title: 'Not found' }] });
  return {};
}
