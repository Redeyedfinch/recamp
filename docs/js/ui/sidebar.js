/**
 * Sidebar — sections in typography, a nested page tree with drag-to-nest,
 * favourites, recents. Quiet by design: no coloured icons, no badges except
 * counts that mean something.
 */
import { h, icon, clear, MOD } from '../core/dom.js';
import { showMenu } from './menu.js';
import { confirm } from './dialog.js';
import { href } from './router.js';

export function mountSidebar(ctx, host) {
  const { store, router } = ctx;
  const expanded = new Set(JSON.parse(sessionStorage.getItem('recamp.tree') || '["root"]'));
  const persistExpanded = () => sessionStorage.setItem('recamp.tree', JSON.stringify([...expanded]));
  let dragId = null;

  const el = h('aside.sidebar', { 'aria-label': 'Workspace navigation' });
  host.append(el);

  function render() {
    clear(el);
    const route = router.current;
    const ws = store.meta.workspace || {};
    el.append(h('div.sidebar__mast',
      h('a.brand', { href: href.home() }, h('div.brand__name', ws.name || 'RECAMP'), h('div.brand__desc.label', ws.descriptor || 'The Physical Science Forum')),
      h('button.iconbtn', { type: 'button', 'aria-label': 'Collapse sidebar', title: `Collapse sidebar  ${MOD}+\\`, onclick: () => ctx.shell.toggleSidebar(false) }, icon('sidebar'))));

    const scroll = h('div.sidebar__scroll');
    const openTasks = store.records('db_tasks').filter(t => !t.props.done).length;
    const inboxCount = ctx.inboxCount?.() ?? 0;

    scroll.append(section('Workspace', null, [
      item({ label: 'Home', icon: 'home', to: href.home(), current: route.name === 'home' }),
      item({ label: 'Inbox', icon: 'inbox', to: href.inbox(), current: route.name === 'inbox', count: inboxCount || null }),
      item({ label: 'Search', icon: 'search', onclick: () => ctx.palette.open('search'), kbd: `${MOD} K` }),
    ]));

    const pagesTree = h('div.tree', { role: 'tree' });
    renderChildren(pagesTree, 'root', 0);
    scroll.append(section('Knowledge', () => newPage('root'), [
      pagesTree,
      dbItem('db_resources', 'book'), dbItem('db_research', 'flask'), dbItem('db_meetings', 'notes'),
    ]));
    scroll.append(section('Operations', null, [
      dbItem('db_events', 'calendar'), dbItem('db_projects', 'compass'), dbItem('db_tasks', 'task', openTasks || null), dbItem('db_teams', 'users'), dbItem('db_announcements', 'signal'),
    ]));
    scroll.append(section('People', null, [
      item({ label: 'Members', icon: 'user', to: href.members(), current: route.name === 'members' }),
      item({ label: 'Committee', icon: 'badge', to: href.committee(), current: route.name === 'committee' }),
    ]));
    scroll.append(section('Archive', null, [
      item({ label: 'Past Events', icon: 'archive', to: href.archive(), current: route.name === 'archive' }),
      item({ label: 'Documents', icon: 'document', to: href.documents(), current: route.name === 'documents' }),
      item({ label: 'Media', icon: 'image', to: href.media(), current: route.name === 'media' }),
    ]));

    const favs = store.favorites();
    const rec = store.recent().filter(n => !favs.includes(n)).slice(0, 6);
    scroll.append(section('System', null, [
      collapsible('favorites', 'Favorites', 'star', favs.map(n => nodeItem(n, { indent: true })), favs.length ? null : h('div.tree__empty', 'Star a page to keep it here.')),
      collapsible('recent', 'Recently Viewed', 'clock', rec.map(n => nodeItem(n, { indent: true })), rec.length ? null : h('div.tree__empty', 'Nothing yet.')),
      item({ label: 'Trash', icon: 'trash', to: href.trash(), current: route.name === 'trash', count: store.trashed().length || null }),
      item({ label: 'Settings', icon: 'settings', to: href.settings(), current: route.name === 'settings' }),
    ]));
    el.append(scroll);

    const user = store.meta.user || {};
    const sync = ctx.syncState?.() || { kind: 'local' };
    el.append(h('div.sidebar__foot',
      h('button.nav-item.grow', { type: 'button', onclick: () => router.go('/settings'), title: 'Account & storage' },
        h('span.avatar.avatar--sm', initialsOf(user.name)), h('span.nav-item__text', user.name || 'Set your name'),
        h('span.node', { 'data-tone': sync.kind === 'cloud' ? (sync.ok === false ? 'rust' : 'sage') : 'faint', title: sync.kind === 'cloud' ? (sync.ok === false ? 'Sync error' : 'Synced to Google Sheets') : 'Stored in this browser' })),
      h('button.iconbtn', { type: 'button', 'aria-label': 'Toggle theme', title: 'Toggle light / dark', onclick: () => ctx.theme.toggle() }, icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'))));
  }

  function section(title, onAdd, children) {
    return h('div.nav-section', h('div.nav-section__head', h('span.label', title), onAdd ? h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': `New page`, onclick: onAdd }, icon('plus')) : null), ...children);
  }
  function item({ label, icon: ic, to, onclick, current, count, kbd, actions }) {
    const tag = to ? 'a' : 'button';
    return h(`${tag}.nav-item`, { href: to || null, type: to ? null : 'button', onclick, 'aria-current': current ? 'page' : null },
      h('span.nav-item__icon', icon(ic)), h('span.nav-item__text', label),
      count != null ? h('span.nav-item__count', String(count)) : null, kbd ? h('span.nav-item__kbd', kbd) : null, actions || null);
  }
  function dbItem(id, ic, count) {
    const db = store.db(id); if (!db) return null;
    const route = router.current;
    return item({ label: db.title, icon: ic, to: href.db(id), current: route.name === 'db' && route.id === id, count });
  }
  function collapsible(key, title, ic, children, empty) {
    const open = expanded.has(key);
    const wrap = h('div.tree__node');
    wrap.append(h('div.tree__row',
      h('button.tree__toggle', { type: 'button', 'aria-expanded': String(open), 'aria-label': `Toggle ${title}`, onclick: () => { open ? expanded.delete(key) : expanded.add(key); persistExpanded(); render(); } }, icon('chevronR')),
      h('button.nav-item.grow', { type: 'button', onclick: () => { open ? expanded.delete(key) : expanded.add(key); persistExpanded(); render(); } }, h('span.nav-item__icon', icon(ic)), h('span.nav-item__text', title))));
    if (open) wrap.append(h('div.tree__children', children.length ? children : empty));
    return wrap;
  }

  function renderChildren(container, parentId, depth) {
    const kids = store.children(parentId).filter(n => n.kind !== 'database' || parentId !== 'root');
    if (!kids.length && depth > 0) { container.append(h('div.tree__empty', 'No pages inside')); return; }
    for (const n of kids) container.append(treeNode(n, depth));
  }

  function treeNode(n, depth) {
    const has = store.hasChildren(n.id);
    const open = expanded.has(n.id);
    const node = h('div.tree__node', { role: 'treeitem', 'aria-expanded': has ? String(open) : null, 'data-id': n.id });
    const toggle = h('button.tree__toggle', { type: 'button', class: has ? '' : 'tree__toggle--empty', 'aria-expanded': String(open), 'aria-label': 'Expand', tabindex: has ? '0' : '-1', onclick: e => { e.preventDefault(); e.stopPropagation(); open ? expanded.delete(n.id) : expanded.add(n.id); persistExpanded(); render(); } }, icon('chevronR'));
    const row = h('div.tree__row', toggle, nodeItem(n, { draggable: true }));
    node.append(row);
    if (has && open) { const ch = h('div.tree__children'); renderChildren(ch, n.id, depth + 1); node.append(ch); }
    return node;
  }

  function nodeItem(n, { draggable = false, indent = false } = {}) {
    const route = router.current;
    const current = (route.name === 'p' && route.id === n.id) || (route.name === 'db' && route.id === n.id);
    const a = h('a.nav-item.grow', { href: n.kind === 'database' ? href.db(n.id) : href.page(n.id), 'aria-current': current ? 'page' : null, draggable: draggable ? 'true' : null, 'data-id': n.id },
      h('span.nav-item__icon', icon(n.icon || (n.kind === 'database' ? 'database' : 'page'))),
      h('span.nav-item__text', n.title || 'Untitled'),
      h('span.nav-item__actions',
        h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Page options', onclick: e => { e.preventDefault(); e.stopPropagation(); nodeMenu(n, e.currentTarget); } }, icon('more')),
        n.kind !== 'record' ? h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Add page inside', onclick: e => { e.preventDefault(); e.stopPropagation(); newPage(n.id); } }, icon('plus')) : null));
    if (draggable) {
      a.addEventListener('dragstart', e => { dragId = n.id; e.dataTransfer.setData('text/recamp-node', n.id); e.dataTransfer.effectAllowed = 'move'; a.closest('.tree__node')?.classList.add('is-dragging'); });
      a.addEventListener('dragend', () => { dragId = null; el.querySelectorAll('[data-dragover]').forEach(x => delete x.dataset.dragover); el.querySelectorAll('.is-dragging').forEach(x => x.classList.remove('is-dragging')); });
      a.addEventListener('dragover', e => { if (!dragId || dragId === n.id || store.isAncestor(dragId, n.id)) return; e.preventDefault(); const r = a.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; el.querySelectorAll('[data-dragover]').forEach(x => delete x.dataset.dragover); a.closest('.tree__node').dataset.dragover = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'; });
      a.addEventListener('dragleave', () => { delete a.closest('.tree__node')?.dataset.dragover; });
      a.addEventListener('drop', e => {
        e.preventDefault(); const id = e.dataTransfer.getData('text/recamp-node') || dragId; const pos = a.closest('.tree__node').dataset.dragover; delete a.closest('.tree__node').dataset.dragover;
        if (!id || id === n.id) return;
        if (pos === 'inside') { store.moveNode(id, { parentId: n.id }); expanded.add(n.id); persistExpanded(); }
        else store.moveNode(id, { parentId: n.parentId, [pos]: n.id });
      });
    }
    return a;
  }

  function nodeMenu(n, anchor) {
    showMenu(anchor, [
      { label: store.isFavorite(n.id) ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onSelect: () => store.toggleFavorite(n.id) },
      { label: 'Copy link', icon: 'link', onSelect: () => { navigator.clipboard?.writeText(location.origin + location.pathname + href.page(n.id)); ctx.toast('Link copied'); } },
      n.kind !== 'database' ? { label: 'Duplicate', icon: 'copy', onSelect: () => { const c = store.duplicateNode(n.id); if (c) ctx.openNode(c.id); } } : null,
      n.kind !== 'record' ? { label: 'Add page inside', icon: 'plus', onSelect: () => newPage(n.id) } : null,
      'sep',
      { label: 'Move to trash', icon: 'trash', danger: true, onSelect: async () => {
        const kids = store.descendants(n.id, { includeArchived: false }).length;
        if (n.kind === 'database' || kids > 3) { if (!(await confirm({ title: `Move “${n.title || 'Untitled'}” to trash?`, message: n.kind === 'database' ? `All ${store.records(n.id).length} records go with it. You can restore from Trash.` : `${kids} pages inside go with it. You can restore from Trash.`, confirmLabel: 'Move to trash', danger: true }))) return; }
        const wasCurrent = router.current.id === n.id || store.isAncestor(n.id, router.current.id || '');
        store.trashNode(n.id);
        ctx.toast(`“${n.title || 'Untitled'}” moved to trash`, { action: 'Undo', onAction: () => store.restoreNode(n.id) });
        if (wasCurrent) router.go('/');
      } },
    ].filter(Boolean));
  }

  function newPage(parentId) {
    const n = store.createNode({ kind: 'page', parentId, title: '' });
    if (parentId !== 'root') { expanded.add(parentId); persistExpanded(); }
    ctx.openNode(n.id, { focusTitle: true });
  }

  store.on('change', d => { if (d.type !== 'block:update') render(); });
  router.on('change', render);
  ctx.theme.on?.('change', render);
  render();
  return { el, refresh: render, expand(id) { expanded.add(id); persistExpanded(); render(); } };
}

function initialsOf(name) { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p[1]?.[0] || '')).toUpperCase() : '·'; }
