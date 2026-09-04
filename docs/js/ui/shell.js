/**
 * Shell — sidebar + main pane (topbar, content, peek) + mobile bar.
 */
import { h, icon, clear, MOD } from '../core/dom.js';
import { fmtTime } from '../core/dates.js';
import { mountSidebar } from './sidebar.js';
import { href } from './router.js';

export function mountShell(ctx, root) {
  const { store, router } = ctx;
  clear(root);
  root.className = 'shell';
  root.dataset.sidebar = window.innerWidth <= 880 ? 'closed' : store.setting('sidebar', 'open');

  const crumbs = h('nav.topbar__crumbs', { 'aria-label': 'Breadcrumb' });
  const meta = h('span.topbar__meta');
  const actions = h('div.topbar__actions');
  const openBtn = h('button.iconbtn', { type: 'button', 'aria-label': 'Open sidebar', title: `Open sidebar  ${MOD}+\\`, onclick: () => shell.toggleSidebar(true) }, icon('menu'));
  const topbar = h('header.topbar', openBtn, crumbs, meta, actions);
  const content = h('div.content', { id: 'content', tabindex: '-1' });
  const peekBody = h('div.peek__body');
  const peekBar = h('div.peek__bar');
  const peek = h('aside.peek', { 'aria-label': 'Record preview' }, peekBar, peekBody);
  const main = h('section.main', topbar, content, peek);
  const scrim = h('div.scrim', { onclick: () => shell.toggleSidebar(false) });
  const mobilebar = h('nav.mobilebar', { 'aria-label': 'Quick navigation' },
    mb('Home', 'home', () => router.go('/')), mb('Search', 'search', () => ctx.palette.open('search')),
    mb('New', 'plus', () => ctx.palette.open('new')), mb('Inbox', 'inbox', () => router.go('/inbox')), mb('Menu', 'menu', () => shell.toggleSidebar()));

  let peekView = null;
  const shell = {
    content,
    setTopbar({ crumbs: cs = [], actions: acts = [], meta: m = null } = {}) {
      clear(crumbs);
      cs.forEach((c, i) => {
        if (i) crumbs.append(h('span.crumb__sep', '/'));
        crumbs.append(h(c.href ? 'a.crumb' : 'span.crumb', { href: c.href || null, 'aria-current': i === cs.length - 1 ? 'page' : null }, c.icon ? icon(c.icon, 'icon') : null, h('span.truncate', c.title)));
      });
      clear(actions); actions.append(...acts);
      shell.customMeta = m; renderMeta();
    },
    toggleSidebar(force) {
      const open = force !== undefined ? force : root.dataset.sidebar !== 'open';
      root.dataset.sidebar = open ? 'open' : 'closed';
      if (window.innerWidth > 880) store.setSetting('sidebar', open ? 'open' : 'closed');
    },
    async openPeek(nodeId) {
      const { mountPage } = await import('../views/page.js');
      peekView?.destroy?.(); clear(peekBody); clear(peekBar);
      const node = store.node(nodeId); if (!node) return;
      peekBar.append(
        h('button.iconbtn', { type: 'button', 'aria-label': 'Close preview', onclick: () => shell.closePeek() }, icon('close')),
        h('a.btn.btn--ghost.btn--sm', { href: href.page(nodeId) }, icon('arrowUR'), 'Open as page'),
        h('span.grow'),
        h('button.iconbtn', { type: 'button', 'aria-label': 'Favorite', 'aria-pressed': String(store.isFavorite(nodeId)), onclick: e => { store.toggleFavorite(nodeId); e.currentTarget.setAttribute('aria-pressed', String(store.isFavorite(nodeId))); } }, icon(store.isFavorite(nodeId) ? 'starFill' : 'star')));
      peekView = mountPage(ctx, peekBody, nodeId, { peek: true });
      main.dataset.peek = 'open'; peek.classList.add('is-open');
      setTimeout(() => peekBody.querySelector('.page__title')?.focus?.(), 50);
    },
    closePeek() { if (!peek.classList.contains('is-open')) return; peek.classList.remove('is-open'); delete main.dataset.peek; peekView?.destroy?.(); peekView = null; setTimeout(() => { if (!peek.classList.contains('is-open')) clear(peekBody); }, 450); },
    get peekOpen() { return peek.classList.contains('is-open'); },
    refresh() { sidebar.refresh(); },
    focusContent() { content.focus({ preventScroll: true }); },
  };
  ctx.shell = shell;

  const sidebar = mountSidebar(ctx, root);
  root.append(main, scrim, mobilebar);

  function renderMeta() {
    const s = ctx.syncState?.() || { kind: 'local' };
    let text = shell.customMeta || '';
    if (!text) {
      if (store.saving) text = 'Saving…';
      else if (s.kind === 'cloud') text = s.ok === false ? 'SYNC ERROR' : `SYNCED${s.at ? ' · ' + fmtTime(s.at) : ''}`;
      else text = store.lastSave ? `SAVED · ${fmtTime(store.lastSave)}` : 'LOCAL';
    }
    meta.textContent = text;
  }
  store.on('saving', renderMeta); store.on('sync', renderMeta);

  function mb(label, ic, onclick) { return h('button', { type: 'button', onclick }, icon(ic), h('span', label)); }
  const updateMobile = () => { const n = router.current.name; mobilebar.querySelectorAll('button').forEach(b => b.removeAttribute('aria-current')); const map = { home: 0, inbox: 3 }; if (n in map) mobilebar.children[map[n]].setAttribute('aria-current', 'page'); };
  router.on('change', () => { updateMobile(); if (window.innerWidth <= 880) root.dataset.sidebar = 'closed'; });
  updateMobile();

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); shell.toggleSidebar(); }
    if (e.key === 'Escape' && shell.peekOpen && !document.querySelector('.menu, .dialog-scrim, .palette-scrim')) shell.closePeek();
  });
  return shell;
}
