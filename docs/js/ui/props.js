/**
 * Property values — one renderer per property type, editable in place.
 * Used by record pages, table cells, board cards and gallery tiles.
 */
import { h, icon, initials, esc } from '../core/dom.js';
import { fmtDate, fmtStamp } from '../core/dates.js';
import { showMenu } from './menu.js';
import { dialog, prompt } from './dialog.js';
import { toneOf } from '../data/schema.js';
import { arr } from '../data/store.js';

const EMPTY = '—';

export function propValue(ctx, node, prop, { editable = true, compact = false } = {}) {
  const { store } = ctx;
  const isTitle = prop.id === '__title';
  const value = isTitle ? node.title : node.props?.[prop.id];
  const set = v => isTitle ? store.updateNode(node.id, { title: v }) : store.setProp(node.id, prop.id, v);
  const pv = (cls, ...kids) => h('div.pv', { class: cls, 'data-prop': prop.id }, ...kids);

  switch (prop.type) {
    case 'select': {
      const tag = value ? h('span.tag', { 'data-tone': toneOf(prop.options, value) }, value) : h('span.pv--empty', compact ? EMPTY : 'Empty');
      const el = pv(editable ? '' : 'pv--static', tag);
      if (editable) el.onclick = e => { e.stopPropagation(); selectMenu(ctx, node, prop, el, false); };
      return el;
    }
    case 'multiselect': {
      const vals = arr(value);
      const el = pv(editable ? '' : 'pv--static', vals.length ? vals.map(v => h('span.tag', { 'data-tone': toneOf(prop.options, v) }, v)) : h('span.pv--empty', compact ? EMPTY : 'Empty'));
      if (editable) el.onclick = e => { e.stopPropagation(); selectMenu(ctx, node, prop, el, true); };
      return el;
    }
    case 'date': case 'time': {
      const shown = value ? (prop.type === 'date' ? fmtDate(value) : value) : null;
      // a sourced record may know only the year — say so rather than showing nothing
      const yearOnly = prop.id === 'date' && !value && node.dateConfidence === 'year' && node.props?.year ? h('span.pv__stamp', { title: 'Exact date unrecorded' }, `${node.props.year}`, h('span.t-faint', ' · year only')) : null;
      if (!editable) return pv('pv--static', shown ? h('span.pv__stamp', shown) : yearOnly || h('span.pv--empty', EMPTY));
      const el = pv('', shown ? h('span.pv__stamp', shown) : yearOnly || h('span.pv--empty', compact ? EMPTY : 'Empty'));
      el.onclick = e => {
        e.stopPropagation();
        const input = h('input', { type: prop.type, value: value || '' });
        el.replaceChildren(input, h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Clear', onclick: ev => { ev.stopPropagation(); set(''); } }, icon('close')));
        input.onchange = () => set(input.value);
        input.onblur = () => setTimeout(() => { if (document.activeElement !== input) store.emit('change', { type: 'noop' }); }, 100);
        input.onkeydown = ev => { if (ev.key === 'Escape' || ev.key === 'Enter') { input.blur(); } };
        input.focus(); try { input.showPicker?.(); } catch { /* not user-activated */ }
      };
      return el;
    }
    case 'text': {
      if (!editable) return pv('pv--static', value ? h('span.pv__text', String(value)) : h('span.pv--empty', EMPTY));
      const t = h('div.pv__text', { contenteditable: 'true', spellcheck: 'true', 'data-placeholder': isTitle ? 'Untitled' : compact ? EMPTY : 'Empty', 'data-empty': String(!value) }, value || '');
      const el = pv(prop.long ? 'pv--block' : '', t);
      el.onclick = e => { e.stopPropagation(); t.focus(); };
      t.oninput = () => t.dataset.empty = String(!t.textContent.trim());
      t.onkeydown = e => { if (e.key === 'Enter' && !prop.long) { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.textContent = value || ''; t.blur(); } e.stopPropagation(); };
      t.onblur = () => { const v = t.textContent.trim(); if (v !== (value || '')) set(v); };
      return el;
    }
    case 'number': {
      if (!editable) return pv('pv--static', value != null && value !== '' ? h('span.pv__stamp', String(value)) : h('span.pv--empty', EMPTY));
      const input = h('input', { type: 'number', value: value ?? '', placeholder: EMPTY, onchange: () => set(input.value === '' ? '' : Number(input.value)), onkeydown: e => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); } });
      return pv('', input);
    }
    case 'email': {
      const val = String(value || '').trim();
      const bad = val && !/^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(val);
      if (!editable) return pv('pv--static', val ? h('a.pv__link', { href: `mailto:${val}` }, val) : h('span.pv--empty', EMPTY));
      const t = h('div.pv__text', { contenteditable: 'true', spellcheck: 'false', inputmode: 'email', 'data-placeholder': compact ? EMPTY : 'name@example.com', 'data-empty': String(!val) }, val);
      const el = pv(bad ? 'pv--invalid' : '', t, bad ? h('span.pv__warn', { title: 'This does not look like an email address' }, '!') : null);
      el.onclick = e => { e.stopPropagation(); t.focus(); };
      t.oninput = () => { t.dataset.empty = String(!t.textContent.trim()); };
      t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.textContent = val; t.blur(); } e.stopPropagation(); };
      t.onblur = () => { const v = t.textContent.trim().toLowerCase(); if (v !== val) set(v); };
      return el;
    }
    case 'url': {
      const link = value ? h('a.pv__link', { href: value, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, value.replace(/^https?:\/\//, '')) : null;
      if (!editable) return pv('pv--static', link || h('span.pv--empty', EMPTY));
      const el = pv('', link || h('span.pv--empty', compact ? EMPTY : 'Add a link'), editable && value ? h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Edit link', onclick: e => { e.stopPropagation(); edit(); } }, icon('more')) : null);
      const edit = () => prompt({ title: prop.name, label: 'URL', value: value || '', placeholder: 'https://' }).then(v => { if (v !== null) set(v); });
      if (!value) el.onclick = e => { e.stopPropagation(); edit(); };
      return el;
    }
    case 'checkbox': {
      const cb = h('button.checkbox', { type: 'button', role: 'checkbox', 'aria-checked': String(!!value), 'aria-label': prop.name, disabled: !editable, onclick: e => { e.stopPropagation(); set(!value); } }, icon('check'));
      return pv('pv--static', cb);
    }
    case 'person': case 'relation': {
      const ids = arr(value);
      const target = prop.target;
      const chips = ids.map(id => { const n = store.node(id); if (!n) return null; return h('a.pv__rel', { href: `#/p/${id}`, onclick: e => e.stopPropagation() }, prop.type === 'person' ? h('span.avatar.avatar--sm', { class: n.provenance === 'demo' ? 'avatar--demo' : '' }, initials(n.title)) : icon(n.icon || 'page'), h('span.truncate', n.title || 'Untitled')); }).filter(Boolean);
      const el = pv(editable ? '' : 'pv--static', chips.length ? chips : h('span.pv--empty', compact ? EMPTY : (prop.type === 'person' ? 'Unassigned' : 'Empty')));
      if (editable) el.onclick = e => { e.stopPropagation(); relationMenu(ctx, node, prop, el, target); };
      return el;
    }
    case 'files': {
      const files = arr(value).filter(f => f && f.url);
      const list = h('div.pv__files', files.slice(0, compact ? 2 : 50).map(f => h('a.pv__file', { href: f.url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, icon('paperclip'), h('span.truncate', f.name || f.url))), compact && files.length > 2 ? h('span.pv__more', `+${files.length - 2} more`) : null);
      if (!editable) return pv('pv--static pv--block', files.length ? list : h('span.pv--empty', EMPTY));
      const add = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: e => { e.stopPropagation(); addFile(); } }, icon('plus'), compact ? '' : 'Add file link');
      const addFile = () => {
        const name = h('input.input', { type: 'text', placeholder: 'Name (e.g. Rules PDF)' }); const url = h('input.input', { type: 'url', placeholder: 'https://drive.google.com/…' });
        dialog({ title: `Add to ${prop.name}`, body: h('div.stack', h('div.field', h('span.label', 'Name'), name), h('div.field', h('span.label', 'Link'), url, h('span.field__hint', 'Files live in Drive; the workspace keeps the link.'))), actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: () => url.value.trim() ? true : false }] })
          .then(ok => { if (ok) set([...files, { name: name.value.trim() || url.value.trim(), url: url.value.trim() }]); });
      };
      return pv('pv--static pv--block', files.length ? list : null, add);
    }
    case 'created': return pv('pv--static', h('span.pv__stamp', fmtStamp(node.createdAt)));
    case 'updated': return pv('pv--static', h('span.pv__stamp', fmtStamp(node.updatedAt)));
    default: return pv('pv--static', h('span.pv--empty', EMPTY));
  }
}

function selectMenu(ctx, node, prop, anchor, multi) {
  const { store } = ctx;
  const current = multi ? arr(node.props[prop.id]) : node.props[prop.id];
  const items = prop.options.map(o => ({
    label: o.name, node: true, tone: o.tone, keywords: o.name,
    check: multi ? current.includes(o.name) : undefined, selected: !multi && current === o.name,
    onSelect: () => {
      if (multi) { const next = current.includes(o.name) ? current.filter(x => x !== o.name) : [...current, o.name]; store.setProp(node.id, prop.id, next); return false; }
      store.setProp(node.id, prop.id, current === o.name ? '' : o.name);
    },
  }));
  items.push('sep', { label: 'New option…', icon: 'plus', onSelect: () => prompt({ title: `New ${prop.name} option`, label: 'Name' }).then(name => { if (!name) return; store.addOption(store.databaseOf(node).id, prop.id, name); store.setProp(node.id, prop.id, multi ? [...current, name] : name); }) });
  if (!multi && current) items.push({ label: 'Clear', icon: 'close', onSelect: () => store.setProp(node.id, prop.id, '') });
  showMenu(anchor, items, { searchable: prop.options.length > 6, head: prop.name });
}

function relationMenu(ctx, node, prop, anchor, targetId) {
  const { store } = ctx;
  const db = store.db(targetId); if (!db) return;
  const many = prop.many || prop.type === 'relation' && prop.many !== false && !['project', 'event', 'team', 'parent_event'].includes(prop.id);
  const current = arr(node.props[prop.id]);
  const records = store.records(targetId).filter(r => r.id !== node.id);
  const items = records.map(r => ({
    label: r.title || 'Untitled', desc: r.provenance === 'demo' ? 'demo' : '', keywords: r.title, icon: prop.type === 'person' ? 'user' : (r.icon || 'page'),
    check: current.includes(r.id),
    onSelect: () => {
      const next = current.includes(r.id) ? current.filter(x => x !== r.id) : (many ? [...current, r.id] : [r.id]);
      store.setProp(node.id, prop.id, next);
      return many ? false : undefined;
    },
  }));
  items.push('sep', { label: `New in ${db.title}…`, icon: 'plus', onSelect: () => prompt({ title: `New ${db.title} record`, label: 'Title' }).then(title => { if (!title) return; const r = store.createNode({ kind: 'record', databaseId: targetId, title }); store.setProp(node.id, prop.id, many ? [...current, r.id] : [r.id]); }) });
  if (current.length) items.push({ label: 'Clear', icon: 'close', onSelect: () => store.setProp(node.id, prop.id, []) });
  showMenu(anchor, items, { searchable: true, head: prop.name, placeholder: `Search ${db.title.toLowerCase()}…` });
}

/** Plain-text rendering, for cards and secondary lines. */
export function formatValue(store, node, prop) {
  const v = node.props?.[prop.id];
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  switch (prop.type) {
    case 'date': return fmtDate(v);
    case 'person': case 'relation': return arr(v).map(id => store.node(id)?.title || '').filter(Boolean).join(', ');
    case 'multiselect': return arr(v).join(', ');
    case 'checkbox': return v ? 'Yes' : 'No';
    case 'files': return `${arr(v).length} file${arr(v).length === 1 ? '' : 's'}`;
    case 'created': return fmtDate(node.createdAt);
    case 'updated': return fmtDate(node.updatedAt);
    default: return String(v);
  }
}

export function statusTag(store, node) {
  const db = store.databaseOf(node); const prop = db?.schema.find(p => p.id === 'status');
  const v = node.props?.status; if (!prop || !v) return null;
  return h('span.tag', { 'data-tone': toneOf(prop.options, v) }, v);
}

export function typeTag(store, node, propId = 'type') {
  const db = store.databaseOf(node); const prop = db?.schema.find(p => p.id === propId);
  const v = node.props?.[propId]; if (!prop || !v) return null;
  return h('span.tag.tag--soft', { 'data-tone': toneOf(prop.options, v) }, v);
}

/** RECAMP / EVT-007 */
export function catalogueMark(store, node) {
  const db = store.databaseOf(node);
  if (!db || node.kind !== 'record') return null;
  return h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), `${db.catalogue || 'REC'}-${String(node.seq || 0).padStart(3, '0')}`);
}

export function provenanceMark(node) {
  if (!node.provenance) return null;
  return h('span.prov', { 'data-prov': node.provenance, title: node.provenance === 'sourced' ? 'From RECAMP\'s public record' : 'Placeholder content — replace or delete' }, node.provenance);
}

/** Human date line honouring dateConfidence. */
export function dateLine(node) {
  const d = node.props?.date;
  if (d) return fmtDate(d);
  if (node.dateConfidence === 'year' && node.props?.year) return `${node.props.year} · exact date unrecorded`;
  return 'Date unavailable';
}

export { esc };
