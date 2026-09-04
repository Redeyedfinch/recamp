/**
 * Database — table · board · calendar · gallery · timeline.
 * Every row is a page; opening one peeks it beside the view.
 */
import { h, icon, clear, debounce, initials } from '../core/dom.js';
import { fmtDate, isoDate, toDate, MONTHS_LONG, MONTHS, DAYS, daysBetween, addDays } from '../core/dates.js';
import { propValue, formatValue, catalogueMark, provenanceMark, statusTag, typeTag } from '../ui/props.js';
import { showMenu } from '../ui/menu.js';
import { prompt, confirm } from '../ui/dialog.js';
import { toneOf, PROP_TYPES } from '../data/schema.js';
import { arr } from '../data/store.js';
import { plateEl } from '../ui/plate.js';
import { href } from '../ui/router.js';
import { iconForType } from './page.js';
import { empty } from './common.js';

const VIEW_ICON = { table: 'table', board: 'board', calendar: 'calendar', gallery: 'gallery', timeline: 'timeline' };

export function mount(ctx, host, route) {
  const db = ctx.store.db(route.id);
  if (!db || db.archived) { host.append(h('div.view', h('div.label', 'NOT FOUND'), h('h1.t-display', { style: { marginTop: '8px' } }, 'No such database.'))); ctx.shell.setTopbar({ crumbs: [{ title: 'Not found' }] }); return {}; }
  ctx.store.touchRecent(db.id);
  return mountDatabase(ctx, host, db.id, { viewId: route.query.v });
}

export function mountDatabase(ctx, host, dbId, { viewId = null, fixedFilters = [], title = null, kicker = null, lockedView = null } = {}) {
  const { store } = ctx;
  const wrap = h('div.view.view--wide.dbview'); host.append(wrap);
  let calMonth = null; let currentView = viewId;
  const saveTitle = debounce(v => store.updateNode(dbId, { title: v }), 400);
  const saveDesc = debounce(v => store.updateNode(dbId, { description: v }, { log: false }), 400);

  function render() {
    const db = store.db(dbId); if (!db) return;
    const view = db.views.find(v => v.id === (lockedView || currentView)) || db.views[0]; currentView = view.id;
    clear(wrap);
    const all = store.records(dbId);
    const rows = applyView(store, db, view, all, fixedFilters);

    /* head */
    const titleEl = h('h1.dbview__title', { contenteditable: title ? 'false' : 'true', spellcheck: 'false' }, title || db.title);
    titleEl.addEventListener('input', () => saveTitle(titleEl.textContent.trim())); titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
    const desc = h('p.dbview__desc', { contenteditable: title ? 'false' : 'true', 'data-placeholder': 'Add a description', 'data-empty': String(!db.description) }, db.description || '');
    desc.addEventListener('input', () => { desc.dataset.empty = String(!desc.textContent.trim()); saveDesc(desc.textContent.trim()); });
    wrap.append(h('header.dbview__head',
      h('div', h('div.viewhead__kicker', h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), `${db.catalogue}`), h('span.label', `${all.length} RECORD${all.length === 1 ? '' : 'S'}`), kicker), titleEl, desc),
      h('div.viewhead__actions', h('button.btn.btn--primary', { type: 'button', onclick: () => create(view) }, icon('plus'), `New ${singular(db.title)}`))));

    /* toolbar */
    const tabs = h('div.tabs', { role: 'tablist' }, db.views.map(v => h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(v.id === view.id), onclick: e => { if (v.id === view.id) return viewMenu(v, e.currentTarget); currentView = v.id; if (!lockedView) history.replaceState(null, '', href.db(dbId, v.id)); render(); }, oncontextmenu: e => { e.preventDefault(); viewMenu(v, e.currentTarget); } }, icon(VIEW_ICON[v.type]), v.name)),
      lockedView ? null : h('button.tab', { type: 'button', onclick: e => showMenu(e.currentTarget, Object.entries(VIEW_ICON).map(([type, ic]) => ({ label: cap(type), icon: ic, onSelect: () => { const v = store.addView(dbId, { name: cap(type), type, groupBy: type === 'board' ? firstSelect(db)?.id : undefined, dateProp: ['calendar', 'timeline'].includes(type) ? firstDate(db)?.id : undefined }); currentView = v.id; render(); } })), { head: 'New view' }) }, icon('plus'), 'View'));
    const filterBtn = h('button.btn.btn--ghost.btn--sm', { type: 'button', 'aria-pressed': String(view.filters.length > 0), onclick: e => filterMenu(view, e.currentTarget) }, icon('filter'), view.filters.length ? `${view.filters.length} filter${view.filters.length === 1 ? '' : 's'}` : 'Filter');
    const sortBtn = h('button.btn.btn--ghost.btn--sm', { type: 'button', 'aria-pressed': String(view.sorts.length > 0), onclick: e => sortMenu(view, e.currentTarget) }, icon('sort'), view.sorts.length ? `Sorted by ${db.schema.find(p => p.id === view.sorts[0].prop)?.name || view.sorts[0].prop}` : 'Sort');
    wrap.append(h('div.dbview__toolbar', tabs, h('span.dbview__count', `${rows.length}${rows.length !== all.length ? ` OF ${all.length}` : ''}`), filterBtn, sortBtn,
      view.type === 'table' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: e => hideMenu(view, e.currentTarget) }, icon('table'), 'Columns') : null));
    if (view.filters.length) wrap.append(h('div.filterbar', view.filters.map((f, i) => h('button.tag.tag--btn', { type: 'button', 'data-tone': 'celestial', onclick: () => { const filters = view.filters.filter((_, j) => j !== i); store.updateView(dbId, view.id, { filters }); } }, `${db.schema.find(p => p.id === f.prop)?.name || f.prop} ${f.op === 'is' ? '=' : f.op === 'isnot' ? '≠' : f.op} ${f.value ?? ''}`, icon('close')))));

    /* body */
    const body = h('div.dbview__body');
    ({ table, board, calendar, gallery, timeline })[view.type](body, db, view, rows);
    wrap.append(body);
  }

  /* ------------------------------------------------------------- table */
  function table(body, db, view, rows) {
    const cols = db.schema.filter(p => !view.hidden.includes(p.id));
    const grid = h('div.dbtable', { role: 'table', style: { gridTemplateColumns: `minmax(280px, 2fr) ${cols.map(p => p.long ? 'minmax(220px, 2fr)' : 'minmax(150px, 1fr)').join(' ')} 40px` } });
    const head = h('div.dbtable__head', { role: 'row' }, h('button.dbtable__h.label', { type: 'button', onclick: e => colMenu(view, null, e.currentTarget) }, icon('text'), 'Title'),
      cols.map(p => h('button.dbtable__h.label', { type: 'button', onclick: e => colMenu(view, p, e.currentTarget) }, icon(iconForType(p.type)), p.name, view.sorts[0]?.prop === p.id ? h('span.sort', view.sorts[0].dir === 'asc' ? '↑' : '↓') : null)),
      h('button.dbtable__h.label', { type: 'button', 'aria-label': 'Add property', onclick: e => addPropMenu(db, e.currentTarget) }, icon('plus')));
    grid.append(head);
    const groups = view.groupBy && view.type === 'table' ? groupRows(db, view, rows) : [{ key: null, rows }];
    for (const g of groups) {
      if (g.key !== null) grid.append(h('div.dbtable__group', h('span.node', { 'data-tone': g.tone }), h('span.label.label--ink', g.key || 'None'), h('span.count', String(g.rows.length))));
      for (const r of g.rows) {
        const row = h('div.dbtable__row', { role: 'row', 'data-id': r.id });
        row.append(h('div.dbtable__cell', h('div.dbtable__title', icon(r.icon || 'page'), propValue(ctx, r, { id: '__title', type: 'text' }, { compact: true }), r.provenance === 'demo' ? h('span.prov', { 'data-prov': 'demo' }, 'demo') : null, h('span.dbtable__seq', `${db.catalogue}-${String(r.seq || 0).padStart(3, '0')}`), h('button.iconbtn.iconbtn--sm.dbtable__open', { type: 'button', 'aria-label': 'Open', onclick: e => { e.stopPropagation(); ctx.openNode(r.id, { peek: true }); } }, icon('arrowUR')))));
        cols.forEach(p => row.append(h('div.dbtable__cell', propValue(ctx, r, p, { compact: true }))));
        row.append(h('div.dbtable__cell', h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Row options', onclick: e => rowMenu(r, e.currentTarget) }, icon('more'))));
        grid.append(row);
      }
    }
    grid.append(h('button.dbtable__add', { type: 'button', onclick: () => create(view) }, icon('plus'), 'New'));
    // title cell edits: our fake '__title' prop writes node.title
    grid.addEventListener('focusout', e => { const t = e.target.closest?.('.dbtable__title .pv__text'); if (t) { const id = t.closest('.dbtable__row').dataset.id; const v = t.textContent.trim(); const n = store.node(id); if (n && v !== n.title) store.updateNode(id, { title: v }); } });
    grid.addEventListener('click', e => { const t = e.target.closest?.('.dbtable__title'); if (t && !e.target.closest('.pv__text, button, a')) ctx.openNode(t.closest('.dbtable__row').dataset.id, { peek: true }); });
    body.append(h('div.dbtable-wrap', grid));
  }

  /* ------------------------------------------------------------- board */
  function board(body, db, view, rows) {
    const prop = db.schema.find(p => p.id === view.groupBy && p.type === 'select') || firstSelect(db);
    if (!prop) { body.append(empty('Add a select property to use a board.')); return; }
    const groups = [...prop.options.map(o => ({ key: o.name, tone: o.tone })), { key: '', tone: 'faint' }];
    const wrap = h('div.board');
    for (const g of groups) {
      const items = rows.filter(r => (r.props[prop.id] || '') === g.key);
      if (!g.key && !items.length) continue;
      const col = h('div.board__col', { 'data-key': g.key });
      col.append(h('div.board__colhead', h('span.node', { 'data-tone': g.tone }), h('span.label.label--ink', g.key || `No ${prop.name.toLowerCase()}`), h('span.count', String(items.length))));
      const cards = h('div.board__cards');
      for (const r of items) cards.append(card(db, view, r, prop));
      cards.append(h('button.board__add', { type: 'button', onclick: () => create(view, { [prop.id]: g.key }) }, icon('plus'), 'New'));
      col.append(cards);
      col.addEventListener('dragover', e => { if (dragging) { e.preventDefault(); col.dataset.dragover = 'true'; } });
      col.addEventListener('dragleave', () => delete col.dataset.dragover);
      col.addEventListener('drop', e => { e.preventDefault(); delete col.dataset.dragover; const id = e.dataTransfer.getData('text/recamp-record') || dragging; if (id) store.setProp(id, prop.id, g.key); dragging = null; });
      wrap.append(col);
    }
    body.append(wrap);
  }
  let dragging = null;
  function card(db, view, r, groupProp) {
    const metaProps = db.schema.filter(p => p.id !== groupProp?.id && !view.hidden.includes(p.id) && !p.long && !['files', 'created', 'updated', 'url'].includes(p.type)).slice(0, 3);
    const c = h('div.card', { draggable: 'true', tabindex: '0', role: 'button', onclick: () => ctx.openNode(r.id, { peek: true }), onkeydown: e => { if (e.key === 'Enter') ctx.openNode(r.id, { peek: true }); } },
      h('div.card__title', r.title || 'Untitled'),
      h('div.card__meta', catalogueMark(store, r), ...metaProps.map(p => { const v = formatValue(store, r, p); if (!v) return null; return p.type === 'select' ? h('span.tag.tag--soft', { 'data-tone': toneOf(p.options, r.props[p.id]) }, v) : h('span', v); }), r.provenance === 'demo' ? h('span.prov', { 'data-prov': 'demo' }, 'demo') : null));
    c.addEventListener('dragstart', e => { dragging = r.id; e.dataTransfer.setData('text/recamp-record', r.id); c.classList.add('is-dragging'); });
    c.addEventListener('dragend', () => { c.classList.remove('is-dragging'); dragging = null; wrap_dragclear(); });
    return c;
  }
  const wrap_dragclear = () => wrap.querySelectorAll('[data-dragover]').forEach(x => delete x.dataset.dragover);

  /* ---------------------------------------------------------- calendar */
  function calendar(body, db, view, rows) {
    const prop = db.schema.find(p => p.id === view.dateProp && p.type === 'date') || firstDate(db);
    if (!prop) { body.append(empty('Add a date property to use a calendar.')); return; }
    const today = new Date();
    if (!calMonth) { const first = rows.map(r => r.props[prop.id]).filter(Boolean).sort(); const upcoming = first.find(d => d >= isoDate(today)); const base = toDate(upcoming || first[first.length - 1]) || today; calMonth = new Date(base.getFullYear(), base.getMonth(), 1); }
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const start = new Date(y, m, 1); const startDow = start.getDay(); const gridStart = addDays(start, -startDow);
    const nav = h('div.cal__nav', h('h2.cal__month', `${MONTHS_LONG[m]} ${y}`),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { calMonth = new Date(y, m - 1, 1); render(); } }, icon('chevronL')),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { calMonth = new Date(today.getFullYear(), today.getMonth(), 1); render(); } }, 'Today'),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { calMonth = new Date(y, m + 1, 1); render(); } }, icon('chevronR')));
    const grid = h('div.cal__grid', DAYS.map(d => h('div.cal__dow.label', d.toUpperCase())));
    const byDay = new Map(); for (const r of rows) { const d = r.props[prop.id]; if (d) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); } }
    const statusProp = db.schema.find(p => p.id === 'status');
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i); const iso = isoDate(d); const out = d.getMonth() !== m;
      if (i >= 35 && out) break;
      const cell = h('div.cal__cell', { class: `${out ? 'cal__cell--out' : ''} ${iso === isoDate(today) ? 'cal__cell--today' : ''}` },
        h('button.iconbtn.iconbtn--sm.cal__add', { type: 'button', 'aria-label': `New on ${fmtDate(d)}`, onclick: () => create(view, { [prop.id]: iso }) }, icon('plus')),
        h('div.cal__n', String(d.getDate())));
      for (const r of byDay.get(iso) || []) cell.append(h('button.cal__item', { type: 'button', 'data-tone': statusProp ? toneOf(statusProp.options, r.props.status) : 'celestial', title: r.title, onclick: () => ctx.openNode(r.id, { peek: true }) }, r.title || 'Untitled'));
      grid.append(cell);
    }
    const undated = rows.filter(r => !r.props[prop.id]);
    body.append(h('div.cal', nav, grid, undated.length ? h('div.tl__unplaced', h('div.section__head', h('span.label', `${undated.length} without a ${prop.name.toLowerCase()}`)), undated.map(r => h('button.inline-db__row', { type: 'button', style: { width: '100%' }, onclick: () => ctx.openNode(r.id, { peek: true }) }, icon(r.icon || 'page'), h('span.grow.truncate', { style: { textAlign: 'left' } }, r.title || 'Untitled'), r.dateConfidence === 'year' ? h('span.coord', `${r.props.year} · YEAR ONLY`) : h('span.coord', 'DATE UNAVAILABLE')))) : null));
  }

  /* ------------------------------------------------------------ gallery */
  function gallery(body, db, view, rows) {
    const isPeople = dbId === 'db_members';
    const metaProps = db.schema.filter(p => !view.hidden.includes(p.id) && !p.long && !['files', 'created', 'updated'].includes(p.type)).slice(0, 4);
    const g = h('div.gallery');
    for (const r of rows) {
      const c = h('button.gcard', { type: 'button', onclick: () => ctx.openNode(r.id, { peek: true }) });
      if (isPeople) c.append(h('div.gcard__person', h('span.avatar.avatar--lg', { class: r.provenance === 'demo' ? 'avatar--demo' : '' }, initials(r.title)), h('div', h('div.gcard__title', r.title || 'Untitled'), h('div.gcard__sub', [r.props.role, r.props.year].filter(Boolean).join(' · ') || (r.provenance === 'demo' ? 'Placeholder' : '')))));
      else c.append(plateEl(r, { cls: 'plate--gallery', height: 110, label: `${db.catalogue}-${String(r.seq || 0).padStart(3, '0')}`, right: r.props.year || (r.props.date || '').slice(0, 4) || '' }));
      const bodyEl = h('div.gcard__body');
      if (!isPeople) bodyEl.append(h('div.gcard__title', r.title || 'Untitled'));
      bodyEl.append(h('div.gcard__meta', ...metaProps.map(p => { const v = formatValue(store, r, p); if (!v) return null; return p.type === 'select' ? h('span.tag.tag--soft', { 'data-tone': toneOf(p.options, r.props[p.id]) }, v) : p.type === 'multiselect' ? arr(r.props[p.id]).map(x => h('span.tag.tag--soft', x)) : p.type === 'url' ? null : h('span', v); }), provenanceMark(r)));
      c.append(bodyEl); g.append(c);
    }
    g.append(h('button.gcard', { type: 'button', style: { alignItems: 'center', justifyContent: 'center', minHeight: '120px', color: 'var(--text-faint)', borderStyle: 'dashed', background: 'transparent' }, onclick: () => create(view) }, icon('plus'), h('span', { style: { marginTop: '6px', fontSize: 'var(--fs-small)' } }, `New ${singular(db.title)}`)));
    body.append(g);
  }

  /* ----------------------------------------------------------- timeline */
  function timeline(body, db, view, rows) {
    const startProp = db.schema.find(p => p.id === view.dateProp && p.type === 'date') || firstDate(db);
    const endProp = db.schema.find(p => p.id === view.endProp && p.type === 'date') || null;
    if (!startProp) { body.append(empty('Add a date property to use a timeline.')); return; }
    const dated = rows.filter(r => r.props[startProp.id]);
    const today = new Date();
    const dates = dated.flatMap(r => [r.props[startProp.id], endProp ? r.props[endProp.id] : null]).filter(Boolean).map(toDate);
    let min = dates.length ? new Date(Math.min(...dates)) : today, max = dates.length ? new Date(Math.max(...dates)) : today;
    min = new Date(Math.min(min, today)); max = new Date(Math.max(max, today));
    const m0 = new Date(min.getFullYear(), min.getMonth() - 1, 1), m1 = new Date(max.getFullYear(), max.getMonth() + 2, 1);
    const months = []; for (let d = new Date(m0); d < m1; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
    const totalDays = daysBetween(m0, m1); const pxPerDay = Math.max(2.2, Math.min(9, 1100 / totalDays)); const width = totalDays * pxPerDay;
    const x = d => daysBetween(m0, toDate(d)) * pxPerDay;
    const axis = h('div.tl__axis', { style: { gridTemplateColumns: months.map(mm => `${daysBetween(mm, new Date(mm.getFullYear(), mm.getMonth() + 1, 1)) * pxPerDay}px`).join(' ') } }, months.map(mm => h('div.tl__month.label', `${MONTHS[mm.getMonth()].toUpperCase()} ${mm.getFullYear()}`)));
    const rowsEl = h('div.tl__rows', { style: { width: width + 'px', backgroundSize: `${pxPerDay * 30.4}px 100%` } }, h('div.tl__today', { style: { left: x(today) + 'px' } }));
    const statusProp = db.schema.find(p => p.id === 'status');
    for (const r of dated.sort((a, b) => a.props[startProp.id].localeCompare(b.props[startProp.id]))) {
      const s = x(r.props[startProp.id]); const e = endProp && r.props[endProp.id] ? x(r.props[endProp.id]) : null;
      const tone = statusProp ? toneOf(statusProp.options, r.props.status) : 'celestial';
      const row = h('div.tl__row');
      if (e !== null && e > s) row.append(h('button.tl__bar', { type: 'button', 'data-tone': tone, style: { left: s + 'px', width: Math.max(24, e - s) + 'px' }, onclick: () => ctx.openNode(r.id, { peek: true }) }, r.title || 'Untitled'));
      else { row.append(h('button.tl__dot', { type: 'button', 'data-tone': tone, 'aria-label': r.title, style: { left: s + 'px' }, onclick: () => ctx.openNode(r.id, { peek: true }) }), h('button.tl__label', { type: 'button', style: { left: s + 'px' }, onclick: () => ctx.openNode(r.id, { peek: true }) }, r.title || 'Untitled')); }
      rowsEl.append(row);
    }
    const undated = rows.filter(r => !r.props[startProp.id]);
    body.append(h('div.tl', h('div.tl__inner', { style: { width: width + 'px' } }, axis, rowsEl)),
      undated.length ? h('div.tl__unplaced', h('div.section__head', h('span.label', `${undated.length} not placed — no ${startProp.name.toLowerCase()}`)), undated.map(r => h('button.inline-db__row', { type: 'button', style: { width: '100%' }, onclick: () => ctx.openNode(r.id, { peek: true }) }, icon(r.icon || 'page'), h('span.grow.truncate', { style: { textAlign: 'left' } }, r.title || 'Untitled'), r.dateConfidence === 'year' ? h('span.coord', `${r.props.year} · YEAR ONLY`) : h('span.coord', 'DATE UNAVAILABLE')))) : null);
  }

  /* -------------------------------------------------------------- menus */
  function create(view, extra = {}) {
    const db = store.db(dbId);
    const props = { ...extra };
    for (const f of [...fixedFilters, ...view.filters]) if (f.op === 'is' && props[f.prop] === undefined) props[f.prop] = f.value;
    const statusProp = db.schema.find(p => p.id === 'status'); if (statusProp && !props.status) props.status = statusProp.options[0]?.name;
    ctx.createRecord(dbId, props);
  }
  function viewMenu(v, anchor) {
    if (lockedView) return;
    const db = store.db(dbId);
    showMenu(anchor, [
      { label: 'Rename view', icon: 'text', onSelect: () => prompt({ title: 'Rename view', label: 'Name', value: v.name }).then(n => { if (n) store.updateView(dbId, v.id, { name: n }); }) },
      v.type === 'board' ? { label: 'Group by…', icon: 'board', onSelect: () => setTimeout(() => showMenu(anchor, db.schema.filter(p => p.type === 'select').map(p => ({ label: p.name, selected: v.groupBy === p.id, onSelect: () => store.updateView(dbId, v.id, { groupBy: p.id }) })), { head: 'Group by' }), 0) } : null,
      ['calendar', 'timeline'].includes(v.type) ? { label: 'Date property…', icon: 'calendar', onSelect: () => setTimeout(() => showMenu(anchor, db.schema.filter(p => p.type === 'date').map(p => ({ label: p.name, selected: v.dateProp === p.id, onSelect: () => store.updateView(dbId, v.id, { dateProp: p.id }) })), { head: 'Date property' }), 0) } : null,
      v.type === 'timeline' ? { label: 'End date property…', icon: 'calendar', onSelect: () => setTimeout(() => showMenu(anchor, [{ label: 'None', selected: !v.endProp, onSelect: () => store.updateView(dbId, v.id, { endProp: null }) }, ...db.schema.filter(p => p.type === 'date').map(p => ({ label: p.name, selected: v.endProp === p.id, onSelect: () => store.updateView(dbId, v.id, { endProp: p.id }) }))], { head: 'End date' }), 0) } : null,
      'sep',
      db.views.length > 1 ? { label: 'Delete view', icon: 'trash', danger: true, onSelect: () => { store.removeView(dbId, v.id); currentView = null; render(); } } : null,
    ].filter(Boolean), { head: v.name });
  }
  function filterMenu(view, anchor) {
    const db = store.db(dbId);
    const props = db.schema.filter(p => ['select', 'multiselect', 'checkbox', 'person', 'relation', 'date'].includes(p.type));
    showMenu(anchor, [
      ...props.map(p => ({ label: p.name, icon: iconForType(p.type), onSelect: () => setTimeout(() => filterValueMenu(view, p, anchor), 0) })),
      view.filters.length ? 'sep' : null, view.filters.length ? { label: 'Clear filters', icon: 'close', onSelect: () => store.updateView(dbId, view.id, { filters: [] }) } : null,
    ].filter(Boolean), { head: 'Filter by' });
  }
  function filterValueMenu(view, p, anchor) {
    const add = (op, value) => store.updateView(dbId, view.id, { filters: [...view.filters, { prop: p.id, op, value }] });
    let items = [];
    if (p.type === 'select' || p.type === 'multiselect') items = p.options.map(o => ({ label: o.name, node: true, tone: o.tone, onSelect: () => add('is', o.name) }));
    else if (p.type === 'checkbox') items = [{ label: 'Checked', onSelect: () => add('is', true) }, { label: 'Unchecked', onSelect: () => add('is', false) }];
    else if (p.type === 'date') items = [{ label: 'Upcoming', onSelect: () => add('after', isoDate(new Date())) }, { label: 'Past', onSelect: () => add('before', isoDate(new Date())) }];
    else items = store.records(p.target).map(r => ({ label: r.title || 'Untitled', onSelect: () => add('contains', r.id) }));
    items.push('sep', { label: 'Is set', onSelect: () => add('isset', null) }, { label: 'Is empty', onSelect: () => add('empty', null) });
    showMenu(anchor, items, { head: `${p.name} …`, searchable: items.length > 8 });
  }
  function sortMenu(view, anchor) {
    const db = store.db(dbId);
    showMenu(anchor, [
      ...db.schema.filter(p => !['files'].includes(p.type)).map(p => ({ label: p.name, icon: iconForType(p.type), selected: view.sorts[0]?.prop === p.id, onSelect: () => store.updateView(dbId, view.id, { sorts: [{ prop: p.id, dir: view.sorts[0]?.prop === p.id && view.sorts[0].dir === 'asc' ? 'desc' : 'asc' }] }) })),
      'sep', { label: 'Manual order', icon: 'grip', selected: !view.sorts.length, onSelect: () => store.updateView(dbId, view.id, { sorts: [] }) },
    ], { head: 'Sort by' });
  }
  function hideMenu(view, anchor) {
    const db = store.db(dbId);
    showMenu(anchor, db.schema.map(p => ({ label: p.name, check: !view.hidden.includes(p.id), onSelect: () => { store.updateView(dbId, view.id, { hidden: view.hidden.includes(p.id) ? view.hidden.filter(x => x !== p.id) : [...view.hidden, p.id] }); return false; } })), { head: 'Columns' });
  }
  function colMenu(view, p, anchor) {
    const db = store.db(dbId);
    if (!p) return showMenu(anchor, [{ label: 'Sort A → Z', icon: 'sort', onSelect: () => store.updateView(dbId, view.id, { sorts: [{ prop: '__title', dir: 'asc' }] }) }, { label: 'Sort Z → A', icon: 'sort', onSelect: () => store.updateView(dbId, view.id, { sorts: [{ prop: '__title', dir: 'desc' }] }) }], { head: 'Title' });
    showMenu(anchor, [
      { label: 'Sort ascending', icon: 'sort', onSelect: () => store.updateView(dbId, view.id, { sorts: [{ prop: p.id, dir: 'asc' }] }) },
      { label: 'Sort descending', icon: 'sort', onSelect: () => store.updateView(dbId, view.id, { sorts: [{ prop: p.id, dir: 'desc' }] }) },
      { label: 'Hide column', icon: 'close', onSelect: () => store.updateView(dbId, view.id, { hidden: [...view.hidden, p.id] }) },
      { label: 'Rename property', icon: 'text', onSelect: () => prompt({ title: 'Rename property', label: 'Name', value: p.name }).then(v => { if (v) store.updateProperty(dbId, p.id, { name: v }); }) },
      (p.type === 'select' || p.type === 'multiselect') ? { label: 'Add option', icon: 'plus', onSelect: () => prompt({ title: `New ${p.name} option`, label: 'Name' }).then(v => { if (v) store.addOption(dbId, p.id, v); }) } : null,
      'sep',
      { label: 'Remove property', icon: 'trash', danger: true, onSelect: async () => { if (await confirm({ title: `Remove “${p.name}”?`, message: 'Values on every record stay in the data but are no longer shown.', confirmLabel: 'Remove', danger: true })) store.removeProperty(dbId, p.id); } },
    ].filter(Boolean), { head: p.name });
  }
  function addPropMenu(db, anchor) {
    showMenu(anchor, Object.entries(PROP_TYPES).filter(([t]) => !['created', 'updated', 'person', 'relation'].includes(t)).map(([type, def]) => ({ label: def.label, icon: iconForType(type), onSelect: () => prompt({ title: `New ${def.label.toLowerCase()} property`, label: 'Name' }).then(name => { if (name) store.addProperty(dbId, { name, type, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || undefined }); }) })), { head: 'Property type' });
  }
  function rowMenu(r, anchor) {
    showMenu(anchor, [
      { label: 'Open as page', icon: 'arrowUR', onSelect: () => ctx.router.page(r.id) },
      { label: 'Open preview', icon: 'sidebar', onSelect: () => ctx.openNode(r.id, { peek: true }) },
      { label: store.isFavorite(r.id) ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onSelect: () => store.toggleFavorite(r.id) },
      { label: 'Duplicate', icon: 'copy', onSelect: () => store.duplicateNode(r.id) },
      'sep',
      { label: 'Move to trash', icon: 'trash', danger: true, onSelect: () => { store.trashNode(r.id); ctx.toast(`“${r.title || 'Untitled'}” moved to trash`, { action: 'Undo', onAction: () => store.restoreNode(r.id) }); } },
    ]);
  }

  const unsub = store.on('change', d => { if (['block:update', 'recent', 'noop'].includes(d.type)) return; if (d.type === 'node:touch') return; render(); });
  render();
  const db = store.db(dbId);
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: title || db.title, icon: db.icon }], actions: title ? [] : [h('button.iconbtn', { type: 'button', 'aria-label': 'Favorite', 'aria-pressed': String(store.isFavorite(dbId)), onclick: () => store.toggleFavorite(dbId) }, icon(store.isFavorite(dbId) ? 'starFill' : 'star'))] });
  return { destroy() { unsub(); } };
}

/* ----------------------------------------------------------- pure helpers */

export function applyView(store, db, view, rows, fixed = []) {
  let out = rows;
  for (const f of [...fixed, ...view.filters]) out = out.filter(r => matches(store, r, f));
  const sorts = view.sorts.length ? view.sorts : [];
  if (sorts.length) {
    const s = sorts[0]; const prop = db.schema.find(p => p.id === s.prop);
    out = [...out].sort((a, b) => { const va = sortKey(store, a, prop, s.prop), vb = sortKey(store, b, prop, s.prop); const c = va < vb ? -1 : va > vb ? 1 : 0; return s.dir === 'desc' ? -c : c; });
  }
  return out;
}
function sortKey(store, r, prop, id) {
  if (id === '__title') return (r.title || '').toLowerCase();
  if (!prop) return '';
  if (prop.type === 'updated') return r.updatedAt; if (prop.type === 'created') return r.createdAt;
  const v = r.props[prop.id];
  if (v == null || v === '') return prop.type === 'date' ? '9999' : '￿';
  if (prop.type === 'select') { const i = prop.options.findIndex(o => o.name === v); return String(i < 0 ? 99 : i).padStart(2, '0'); }
  if (prop.type === 'person' || prop.type === 'relation') return arr(v).map(x => store.node(x)?.title || '').join(',').toLowerCase();
  if (typeof v === 'number') return v;
  return String(v).toLowerCase();
}
export function matches(store, r, f) {
  const v = r.props[f.prop];
  switch (f.op) {
    case 'is': return Array.isArray(v) ? v.includes(f.value) : (v ?? '') === f.value || (f.value === false && !v);
    case 'isnot': return Array.isArray(v) ? !v.includes(f.value) : (v ?? '') !== f.value;
    case 'in': return arr(f.value).includes(v);
    case 'contains': return arr(v).includes(f.value);
    case 'isset': return !(v == null || v === '' || (Array.isArray(v) && !v.length) || v === false);
    case 'empty': return v == null || v === '' || (Array.isArray(v) && !v.length) || v === false;
    case 'after': return !!v && v >= f.value;
    case 'before': return !!v && v < f.value;
    default: return true;
  }
}
export function groupRows(db, view, rows) {
  const prop = db.schema.find(p => p.id === view.groupBy);
  if (!prop) return [{ key: null, rows }];
  const groups = [...prop.options.map(o => ({ key: o.name, tone: o.tone, rows: rows.filter(r => r.props[prop.id] === o.name) })), { key: '', tone: 'faint', rows: rows.filter(r => !r.props[prop.id]) }];
  return groups.filter(g => g.rows.length);
}
const firstSelect = db => db.schema.find(p => p.type === 'select');
const firstDate = db => db.schema.find(p => p.type === 'date');
const cap = s => s[0].toUpperCase() + s.slice(1);
export const singular = s => s.replace(/ies$/, 'y').replace(/s$/, '').replace(/Meeting Note/, 'meeting note').toLowerCase();
