/**
 * Command palette — Ctrl/⌘ K. A scientific instrument index: search across
 * everything, create anything, go anywhere. Grouped, keyboard-first.
 */
import { h, icon, clear, MOD } from '../core/dom.js';
import { href } from './router.js';
import { DATABASES } from '../data/schema.js';

export function mountPalette(ctx) {
  const { store, router } = ctx;
  let scrim = null, input = null, list = null, items = [], index = 0, mode = 'all';

  const commands = () => [
    { group: 'Create', label: 'New page', icon: 'page', kind: 'create', kbd: '', run: () => { const n = store.createNode({ kind: 'page', title: '' }); ctx.openNode(n.id, { focusTitle: true }); } },
    { group: 'Create', label: 'New event', icon: 'event', kind: 'create', run: () => ctx.createRecord('db_events', { status: 'Planning' }) },
    { group: 'Create', label: 'New task', icon: 'task', kind: 'create', run: () => ctx.createRecord('db_tasks', { status: 'To do', done: false, priority: 'Medium' }) },
    { group: 'Create', label: 'New project', icon: 'compass', kind: 'create', run: () => ctx.createRecord('db_projects', { status: 'Proposed' }) },
    { group: 'Create', label: 'New meeting note', icon: 'notes', kind: 'create', run: () => ctx.createRecord('db_meetings', { kind: 'Planning' }, { template: 'p_tpl_meeting' }) },
    { group: 'Create', label: 'New announcement', icon: 'signal', kind: 'create', run: () => ctx.createRecord('db_announcements', { status: 'Draft', kind: 'Announcement', audience: 'All subscribed members' }) },
    { group: 'Create', label: 'New resource', icon: 'book', kind: 'create', run: () => ctx.createRecord('db_resources', { type: 'Link' }) },
    { group: 'Create', label: 'New research note', icon: 'flask', kind: 'create', run: () => ctx.createRecord('db_research', { kind: 'Research Note' }) },
    { group: 'Go to', label: 'Home', icon: 'home', kind: 'go', run: () => router.go('/') },
    { group: 'Go to', label: 'Inbox', icon: 'inbox', kind: 'go', run: () => router.go('/inbox') },
    ...Object.entries(DATABASES).map(([id, d]) => ({ group: 'Go to', label: d.title, icon: d.icon, kind: 'go', run: () => router.db(id) })),
    { group: 'Go to', label: 'Members', icon: 'user', kind: 'go', run: () => router.go('/members') },
    { group: 'Go to', label: 'Committee', icon: 'badge', kind: 'go', run: () => router.go('/committee') },
    { group: 'Go to', label: 'Past Events (Archive)', icon: 'archive', kind: 'go', run: () => router.go('/archive') },
    { group: 'Go to', label: 'Activity log', icon: 'signal', kind: 'go', run: () => router.go('/activity') },
    { group: 'Go to', label: 'Trash', icon: 'trash', kind: 'go', run: () => router.go('/trash') },
    { group: 'Go to', label: 'Settings', icon: 'settings', kind: 'go', run: () => router.go('/settings') },
    { group: 'Commands', label: 'Toggle light / dark', icon: 'sun', kind: 'cmd', run: () => ctx.theme.toggle() },
    { group: 'Commands', label: 'Toggle sidebar', icon: 'sidebar', kind: 'cmd', kbd: `${MOD} \\`, run: () => ctx.shell.toggleSidebar() },
    { group: 'Commands', label: 'Open full search', icon: 'search', kind: 'cmd', run: () => router.go(href.search(input?.value || '').slice(1)) },
  ];

  function build(q) {
    q = q.trim();
    const cmds = commands();
    let out = [];
    if (mode === 'new') out = cmds.filter(c => c.kind === 'create');
    else if (mode === 'search') out = [];
    else out = q ? cmds.filter(c => c.label.toLowerCase().includes(q.toLowerCase())) : cmds.filter(c => c.kind !== 'cmd');
    if (mode !== 'new') {
      const nodes = q ? store.search(q, { limit: 14 }) : store.recent().slice(0, 6).map(node => ({ node }));
      const results = nodes.map(({ node, snippet }) => ({ group: q ? 'Results' : 'Recent', label: node.title || 'Untitled', icon: node.icon || 'page', kind: kindOf(store, node), path: pathOf(store, node) + (snippet ? ` — ${snippet}` : ''), run: () => ctx.openNode(node.id) }));
      // a query that names a command ("new project", "settings") puts the command first
      const commandFirst = q.length >= 3 && out.some(c => c.label.toLowerCase().startsWith(q.toLowerCase()));
      out = commandFirst ? [...out, ...results] : [...results, ...out];
    }
    if (q && mode !== 'new') out.push({ group: 'Search', label: `Search everything for “${q}”`, icon: 'search', kind: 'go', run: () => router.go(href.search(q).slice(1)) });
    return out;
  }

  function render() {
    clear(list); items = build(input.value); index = 0;
    if (!items.length) { list.append(h('div.palette__empty', 'Nothing matches. Try a page title, an event, or a command.')); return; }
    let lastGroup = null;
    items.forEach((it, i) => {
      if (it.group !== lastGroup) { list.append(h('div.palette__group', h('span.label', it.group))); lastGroup = it.group; }
      const b = h('button.palette__item', { type: 'button', role: 'option', 'aria-selected': String(i === index), 'data-i': i, onclick: () => choose(i), onmousemove: () => select(i) },
        icon(it.icon), h('span.palette__label', it.label, it.path ? h('span.palette__path', it.path) : null), h('span.palette__kind', it.kbd || it.kind));
      list.append(b);
    });
  }
  const select = i => { const all = list.querySelectorAll('.palette__item'); if (!all.length) return; index = (i + all.length) % all.length; all.forEach((b, j) => b.setAttribute('aria-selected', String(j === index))); all[index].scrollIntoView({ block: 'nearest' }); };
  const choose = i => { const it = items[i]; close(); it?.run(); };

  function open(m = 'all') {
    if (scrim) close();
    mode = m;
    input = h('input', { type: 'text', placeholder: m === 'new' ? 'What do you want to create?' : m === 'search' ? 'Search pages, events, tasks, notes…' : 'Search, create, or jump to…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Command palette', role: 'combobox', 'aria-expanded': 'true' });
    list = h('div.palette__list', { role: 'listbox' });
    const box = h('div.palette', { role: 'dialog', 'aria-label': 'Command palette' },
      h('div.palette__input', icon(m === 'new' ? 'plus' : 'search'), input, h('span.palette__mode', m === 'new' ? 'create' : m === 'search' ? 'search' : 'index')),
      list,
      h('div.palette__foot', h('span', h('span.kbd', '↑↓'), 'move'), h('span', h('span.kbd', '↵'), 'open'), h('span', h('span.kbd', 'esc'), 'close'), h('span', h('span.kbd', '/'), 'blocks in editor')));
    scrim = h('div.palette-scrim', { onmousedown: e => { if (e.target === scrim) close(); } }, box);
    document.body.append(scrim);
    input.addEventListener('input', render);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(index + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(index - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(index); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    render(); input.focus();
  }
  function close() { scrim?.remove(); scrim = null; }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); scrim ? close() : open('all'); }
  });
  return { open, close, get isOpen() { return !!scrim; } };
}

export function kindOf(store, node) {
  if (node.kind === 'database') return 'database';
  if (node.kind === 'record') return (store.db(node.databaseId)?.title || 'record').toLowerCase().replace(/s$/, '');
  return 'page';
}
export function pathOf(store, node) {
  return store.path(node.id).slice(0, -1).map(n => n.title || 'Untitled').join(' / ') || 'Workspace';
}
