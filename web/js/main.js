/**
 * RECAMP Observatory — boot.
 * Store → theme → router → shell → palette → route views.
 */
import { Store } from './data/store.js';
import { LocalAdapter } from './data/adapters/local.js';
import { CloudAdapter } from './data/adapters/cloud.js';
import { Router } from './ui/router.js';
import { mountShell } from './ui/shell.js';
import { mountPalette } from './ui/palette.js';
import { toast } from './ui/toast.js';
import { Emitter } from './core/emitter.js';
import { clear } from './core/dom.js';
import { inboxItems } from './views/inbox.js';

const store = new Store(new LocalAdapter());
await store.init();
// ?enter=1 skips the Enter screen (QA screenshots, kiosk links); ?theme=light|dark presets the theme.
if (/[?&]enter=1/.test(location.search)) store.setSetting('entered', true);
if (/[?&]enter=0/.test(location.search)) store.setSetting('entered', false);   // back to the Enter screen (QA, demos)
const themeParam = /[?&]theme=(light|dark)/.exec(location.search)?.[1];
if (themeParam) store.setSetting('theme', themeParam);

/* ---- theme ---------------------------------------------------------- */
const themeEmitter = new Emitter();
const media = matchMedia('(prefers-color-scheme: light)');
const theme = {
  get() { return store.setting('theme', 'dark'); },
  resolved() { const t = theme.get(); return t === 'system' ? (media.matches ? 'light' : 'dark') : t; },
  apply() { document.documentElement.dataset.theme = theme.resolved(); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.resolved() === 'light' ? '#f5f2eb' : '#0b0d10'); themeEmitter.emit('change', theme.resolved()); },
  set(t) { store.setSetting('theme', t); theme.apply(); },
  toggle() { theme.set(theme.resolved() === 'dark' ? 'light' : 'dark'); },
  on: (e, fn) => themeEmitter.on(e, fn),
};
media.addEventListener('change', () => { if (theme.get() === 'system') theme.apply(); });
theme.apply();

/* ---- context -------------------------------------------------------- */
const router = new Router();
let sync = { kind: 'local' };
store.on('sync', s => { sync = { kind: s.detached ? 'local' : 'cloud', ...s }; });
let pendingFocusTitle = null;

const ctx = {
  store, router, theme, toast,
  syncState: () => sync,
  inboxCount: () => inboxItems(store).filter(i => !i.soft).length,
  user: () => store.meta.user || { id: 'me', name: '' },
  consumeFocusTitle(id) { const ok = pendingFocusTitle === id; pendingFocusTitle = null; return ok; },
  openNode(id, { focusTitle = false, peek = false } = {}) {
    const n = store.node(id); if (!n) return;
    if (focusTitle) pendingFocusTitle = id;
    if (n.kind === 'database') return router.db(id);
    if (peek && router.current.name !== 'p' && window.innerWidth > 720) return ctx.shell.openPeek(id);
    if (router.current.name === 'p' && router.current.id === id) return;
    router.page(id);
  },
  createRecord(dbId, props = {}, { open = true, template = null } = {}) {
    const db = store.db(dbId); if (!db) return null;
    const blocks = template ? store.blocks(template).filter(b => b.parentId === template).sort((a, b) => a.order < b.order ? -1 : 1).map(b => ({ type: b.type, text: b.text, props: JSON.parse(JSON.stringify(b.props || {})) })) : null;
    const n = store.createNode({ kind: 'record', databaseId: dbId, title: '', props, blocks: blocks?.length ? blocks : null });
    if (open) { pendingFocusTitle = n.id; if (router.current.name === 'db' && router.current.id === dbId && window.innerWidth > 720) ctx.shell.openPeek(n.id); else router.page(n.id); }
    return n;
  },
};

/* ---- shell + palette ------------------------------------------------ */
const root = document.getElementById('app');
mountShell(ctx, root);
ctx.palette = mountPalette(ctx);
window.recamp = ctx;            // console access + the QA driver

/* ---- cloud, if configured -------------------------------------------- */
const cloudCfg = store.setting('cloud', null);
if (cloudCfg?.url) {
  store.attachCloud(new CloudAdapter(cloudCfg)).then(r => { if (r?.ok === false) toast(`Sync problem: ${r.error}`, { action: 'Settings', onAction: () => router.go('/settings') }); }).catch(e => toast(`Could not reach the backend: ${e.message}`));
}

/* ---- routing --------------------------------------------------------- */
const views = {
  home: () => import('./views/home.js'),
  p: () => import('./views/page.js'),
  db: () => import('./views/database.js'),
  archive: () => import('./views/archive.js'),
  activity: () => import('./views/activity.js'),
  inbox: () => import('./views/inbox.js'),
  trash: () => import('./views/trash.js'),
  settings: () => import('./views/settings.js'),
  search: () => import('./views/search.js'),
  enter: () => import('./views/login.js'),
  media: () => import('./views/media.js').then(m => ({ mount: m.mountMedia })),
  documents: () => import('./views/media.js').then(m => ({ mount: m.mountDocuments })),
  members: () => import('./views/people.js').then(m => ({ mount: m.mountMembers })),
  committee: () => import('./views/people.js').then(m => ({ mount: m.mountCommittee })),
};

let current = null; let loginView = null; let navSeq = 0;
async function route(r) {
  const seq = ++navSeq;
  if (!store.setting('entered', false) && r.name !== 'enter') { router.go('/enter', { replace: true }); return; }
  if (r.name === 'enter') {
    if (store.setting('entered', false)) { router.go('/', { replace: true }); return; }
    const m = await views.enter(); loginView?.destroy?.(); loginView = m.mount(ctx, document.body); return;
  }
  loginView?.destroy?.(); loginView = null;
  ctx.shell.closePeek();
  const loader = views[r.name] || views.home;
  const mod = await loader();
  if (seq !== navSeq) return;
  current?.destroy?.(); current = null;
  clear(ctx.shell.content);
  ctx.shell.content.scrollTop = 0;
  try { current = mod.mount(ctx, ctx.shell.content, r) || {}; }
  catch (e) { console.error(e); ctx.shell.content.append(Object.assign(document.createElement('div'), { className: 'view', textContent: `Something went wrong rendering this view: ${e.message}` })); }
  document.title = titleFor(r);
  // Keyboard and screen-reader users land in the new view — unless the view has
  // already placed focus (a fresh page title, the search box) or an overlay is up.
  setTimeout(() => { const a = document.activeElement; if ((!a || a === document.body || !ctx.shell.content.contains(a)) && !document.querySelector('.palette-scrim, .dialog-scrim, .menu')) ctx.shell.content.focus({ preventScroll: true }); }, 40);
}
function titleFor(r) {
  const base = 'RECAMP';
  if (r.name === 'home') return `${base} — Observatory`;
  if (r.name === 'p' || r.name === 'db') { const n = store.node(r.id); return n ? `${n.title || 'Untitled'} · ${base}` : base; }
  return `${r.name[0].toUpperCase()}${r.name.slice(1)} · ${base}`;
}
router.on('change', route);
store.on('change', d => { if ((d.type === 'node:update' && d.id === router.current.id)) document.title = titleFor(router.current); });
route(router.current);

/* ---- global keys ------------------------------------------------------ */
document.addEventListener('keydown', e => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n' && !e.target.closest('input, textarea, [contenteditable]')) { e.preventDefault(); const n = store.createNode({ kind: 'page', title: '' }); ctx.openNode(n.id, { focusTitle: true }); }
  if (e.altKey && e.key.toLowerCase() === 'h' && !e.target.closest('input, textarea, [contenteditable]')) { e.preventDefault(); router.go('/'); }
});
window.addEventListener('beforeunload', () => { store.flushNow(); });
window.addEventListener('pagehide', () => { store.flushNow(); });

if (store._seeded) { const once = router.on('change', r => { if (r.name !== 'enter') { once(); toast('Welcome. This workspace is stored in your browser until you connect a Google Sheet.', { action: 'Guide', onAction: () => router.page('p_guide'), duration: 8000 }); } }); if (router.current.name !== 'enter') once(), toast('Welcome. This workspace is stored in your browser until you connect a Google Sheet.', { action: 'Guide', onAction: () => router.page('p_guide'), duration: 8000 }); }
