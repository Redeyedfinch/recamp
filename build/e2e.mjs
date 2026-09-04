/**
 * End-to-end checklist (brief §49), driven through the real UI in headless
 * Chrome: create / nest / move / trash / restore a page, favourite, search,
 * events, projects, tasks, meeting notes, resources, archive, theme,
 * keyboard and mobile navigation. Exit code 1 on any failure.
 *
 *   node build/e2e.mjs
 */
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { serve, launch, root } from './cdp.mjs';

const out = path.join(root, 'qa'); await mkdir(out, { recursive: true });
const { port, close: closeServer } = serve();
const b = await launch({ profile: path.join(out, '.cdp-e2e') });
const base = `http://localhost:${port}/?enter=1`;
const results = [];
async function step(name, fn) {
  b.errors.length = 0;
  try { await fn(); if (b.errors.length) throw new Error(`console: ${b.errors.join(' | ')}`); results.push([true, name]); console.log('✓', name); }
  catch (e) { results.push([false, name, e.message]); console.log('✗', name, '—', e.message.split('\n')[0]); await b.screenshot(path.join(out, `e2e-fail-${results.length}.png`)).catch(() => {}); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const S = s => JSON.stringify(s);
const store = expr => b.evaluate(`(() => { const s = window.recamp.store; return ${expr}; })()`);

await b.navigate(`${base}#/`);

await step('home renders the observatory', async () => {
  assert(await b.evaluate(`!!document.querySelector('.masthead .starfield') && document.querySelector('.home__title').textContent.includes("What's happening")`));
});

let pageId;
await step('create page from the sidebar and title it', async () => {
  await b.click('.nav-section:nth-of-type(2) .nav-section__head .iconbtn');
  assert(await b.waitFor(`location.hash.startsWith('#/p/') && document.activeElement?.classList.contains('page__title')`), 'title not focused');
  pageId = await b.evaluate(`location.hash.slice(4)`);
  await b.type('Test Page'); await b.key('Enter');
  assert(await b.waitFor(`window.recamp.store.node(${S(pageId)})?.title === 'Test Page'`), 'title not saved');
  assert(await b.evaluate(`document.activeElement?.classList.contains('blk__text')`), 'Enter should move into the editor');
});

await step('write in the editor: paragraph, Enter, /h2 slash command', async () => {
  await b.type('Hello observatory'); await b.key('Enter'); await b.sleep(120);
  await b.type('/h2');
  assert(await b.waitFor(`!!document.querySelector('.menu.slash')`), 'slash menu did not open');
  await b.key('Enter'); await b.sleep(150);
  const afterEnter = await store(`s.blockList(${S(pageId)}).map(x => x.block.type + ':' + x.block.text)`) ;
  const menuStill = await b.evaluate(`!!document.querySelector('.menu.slash')`);
  await b.type('Section'); await b.sleep(500);
  const types = await store(`s.blockList(${S(pageId)}).map(x => x.block.type + ':' + x.block.text)`);
  if (types[1] !== 'h2:Section') throw new Error(`second block ${types[1]} (after Enter: ${JSON.stringify(afterEnter)}, menu still open: ${menuStill}, active: ${await b.evaluate(`document.activeElement?.className`)})`);
  assert(types[0] === 'paragraph:Hello observatory', `first block ${types[0]}`);
  assert(types[1] === 'h2:Section', `second block ${types[1]}`);
});

await step('markdown shortcut "- " makes a bullet; Tab nests it; Backspace on empty converts', async () => {
  await b.key('Enter'); await b.sleep(80); await b.type('- '); await b.sleep(80); await b.type('item one'); await b.key('Enter'); await b.type('item two'); await b.key('Tab'); await b.sleep(450);
  const list = await store(`s.blockList(${S(pageId)}).map(x => x.depth + ':' + x.block.type + ':' + x.block.text)`);
  assert(list.some(x => x === '0:bullet:item one'), `bullet missing: ${list}`);
  assert(list.some(x => x === '1:bullet:item two'), `nested bullet missing: ${list}`);
});

let childId;
await step('nest a page inside, then move it back to top level via Move to…', async () => {
  childId = await store(`s.createNode({ kind: 'page', parentId: ${S(pageId)}, title: 'Child page' }).id`);
  assert((await store(`s.node(${S(childId)}).parentId`)) === pageId);
  await b.navigate(`${base}#/p/${childId}`);
  await b.click('.topbar__actions .iconbtn:last-child');
  assert(await b.waitFor(`[...document.querySelectorAll('.menu__item')].some(b => b.textContent.includes('Move to'))`), 'page menu');
  await b.evaluate(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('Move to')).click()`);
  assert(await b.waitFor(`[...document.querySelectorAll('.menu__item')].some(b => b.textContent.includes('Workspace (top level)'))`), 'move menu');
  await b.evaluate(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('Workspace (top level)')).click()`);
  assert(await b.waitFor(`window.recamp.store.node(${S(childId)}).parentId === 'root'`), 'not moved');
});

await step('favorite from the topbar star; it appears under Favorites', async () => {
  await b.click('.topbar__actions .iconbtn:first-child');
  assert(await b.waitFor(`window.recamp.store.isFavorite(${S(childId)})`), 'not favorited');
  await b.evaluate(`[...document.querySelectorAll('.tree__node .nav-item__text')].find(t => t.textContent === 'Favorites')?.closest('.tree__row').querySelector('.tree__toggle').click()`);
  assert(await b.waitFor(`[...document.querySelectorAll('.sidebar .nav-item__text')].filter(t => t.textContent === 'Child page').length >= 2`), 'not listed in Favorites');
});

await step('move to trash (undo toast shown), then restore from Trash', async () => {
  await b.click('.topbar__actions .iconbtn:last-child');
  await b.waitFor(`!!document.querySelector('.menu__item[data-danger]')`);
  await b.evaluate(`document.querySelector('.menu__item[data-danger]').click()`);
  assert(await b.waitFor(`window.recamp.store.node(${S(childId)}).archived === true && location.hash === '#/'`), 'not trashed / not redirected');
  assert(await b.evaluate(`!!document.querySelector('.toast') && document.querySelector('.toast').textContent.includes('Undo')`), 'no undo toast');
  await b.navigate(`${base}#/trash`);
  assert(await b.waitFor(`[...document.querySelectorAll('.trash__title')].some(t => t.textContent === 'Child page')`), 'not in trash');
  await b.evaluate(`[...document.querySelectorAll('.trash__row')].find(r => r.textContent.includes('Child page')).querySelector('.btn').click()`);
  assert(await b.waitFor(`window.recamp.store.node(${S(childId)}).archived === false`), 'not restored');
});

await step('Ctrl+K palette searches and opens Gates of Solace', async () => {
  await b.key('k', { ctrl: true });
  assert(await b.waitFor(`!!document.querySelector('.palette input')`), 'palette closed');
  await b.type('gates');
  assert(await b.waitFor(`document.querySelector('.palette__item[aria-selected="true"] .palette__label')?.textContent.startsWith('Gates of Solace')`), 'wrong first result');
  await b.key('Enter');
  assert(await b.waitFor(`location.hash === '#/p/r_evt_gates_solace' && !!document.querySelector('.record-hero .datebox')`), 'did not open event');
});

let eventId;
await step('create an event from the database view; it opens in the peek panel', async () => {
  await b.navigate(`${base}#/db/db_events`);
  await b.click('.dbview__head .btn--primary');
  assert(await b.waitFor(`document.querySelector('.peek.is-open .page__title') === document.activeElement`), 'peek not open / focused');
  await b.type('Test Event'); await b.key('Enter'); await b.sleep(500);
  eventId = await store(`s.records('db_events').find(r => r.title === 'Test Event')?.id`);
  assert(eventId, 'record missing'); assert((await store(`s.node(${S(eventId)}).props.status`)) === 'Planning');
});

await step('set the event status through the select menu, then open as page', async () => {
  await b.evaluate(`document.querySelector('.peek .pv[data-prop="status"]').click()`);
  assert(await b.waitFor(`[...document.querySelectorAll('.menu__item')].some(b => b.textContent.trim().startsWith('Confirmed'))`), 'status menu');
  await b.evaluate(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.trim().startsWith('Confirmed')).click()`);
  assert(await b.waitFor(`window.recamp.store.node(${S(eventId)}).props.status === 'Confirmed'`), 'status not set');
  await b.evaluate(`document.querySelector('.peek__bar a.btn').click()`);
  assert(await b.waitFor(`location.hash === '#/p/' + ${S(eventId)} && !!document.querySelector('.record-hero')`), 'not opened as page');
  assert((await store(`s.activity(3).some(a => a.type === 'STATUS CHANGED')`)), 'no STATUS CHANGED log');
});

await step('create a project from the palette', async () => {
  await b.key('k', { ctrl: true }); await b.waitFor(`!!document.querySelector('.palette input')`);
  await b.type('new project');
  assert(await b.waitFor(`document.querySelector('.palette__item[aria-selected="true"] .palette__label')?.textContent.startsWith('New project')`, 4000), 'command not first: ' + await b.evaluate(`JSON.stringify({ q: document.querySelector('.palette input').value, first: [...document.querySelectorAll('.palette__item .palette__label')].slice(0, 3).map(l => l.firstChild?.textContent) })`));
  await b.key('Enter');
  assert(await b.waitFor(`location.hash.startsWith('#/p/') && window.recamp.store.node(location.hash.slice(4))?.databaseId === 'db_projects'`), 'no project page');
  assert(await b.waitFor(`document.activeElement?.classList.contains('page__title')`), 'new project title not focused');
  await b.type('Test Project'); await b.key('Enter'); await b.sleep(400);
  assert(await store(`s.records('db_projects').some(r => r.title === 'Test Project' && r.props.status === 'Proposed')`));
});

let taskId;
await step('create a task, assign it to a member, complete it', async () => {
  taskId = await b.evaluate(`window.recamp.createRecord('db_tasks', { status: 'To do', done: false, priority: 'High' }, { open: false }).id`);
  await b.evaluate(`window.recamp.store.updateNode(${S(taskId)}, { title: 'Test Task' })`);
  await b.navigate(`${base}#/p/${taskId}`);
  await b.evaluate(`document.querySelector('.pv[data-prop="assignee"]').click()`);
  assert(await b.waitFor(`[...document.querySelectorAll('.menu__item')].some(b => b.textContent.includes('Member placeholder 01'))`), 'assignee menu');
  await b.evaluate(`[...document.querySelectorAll('.menu__item')].find(b => b.textContent.includes('Member placeholder 01')).click()`);
  assert(await b.waitFor(`window.recamp.store.node(${S(taskId)}).props.assignee?.[0] === 'r_mbr_1'`), 'not assigned');
  await b.evaluate(`document.querySelector('.pv[data-prop="done"] .checkbox').click()`);
  assert(await b.waitFor(`window.recamp.store.node(${S(taskId)}).props.done === true && window.recamp.store.node(${S(taskId)}).props.status === 'Done'`), 'not completed');
  assert(await store(`s.activity(3).some(a => a.type === 'TASK COMPLETED')`), 'no TASK COMPLETED log');
});

await step('create a meeting note from the template (sections present)', async () => {
  const id = await b.evaluate(`window.recamp.createRecord('db_meetings', { kind: 'Planning' }, { open: false, template: 'p_tpl_meeting' }).id`);
  const heads = await store(`s.blockList(${S(id)}).filter(x => x.block.type === 'h2').map(x => x.block.text)`);
  for (const h of ['Attendees', 'Agenda', 'Discussion', 'Decisions', 'Action items', 'Next steps']) assert(heads.includes(h), `missing ${h}`);
});

await step('add a resource with a URL through the prompt dialog', async () => {
  const id = await b.evaluate(`window.recamp.createRecord('db_resources', { type: 'Paper' }, { open: false }).id`);
  await b.evaluate(`window.recamp.store.updateNode(${S(id)}, { title: 'Test Resource' })`);
  await b.navigate(`${base}#/p/${id}`);
  await b.evaluate(`document.querySelector('.pv[data-prop="url"]').click()`);
  assert(await b.waitFor(`document.activeElement === document.querySelector('.dialog input')`), 'dialog input not focused');
  await b.type('https://arxiv.org/abs/1234.5678');
  const typed = await b.evaluate(`document.querySelector('.dialog input').value`);
  await b.key('Enter');
  assert(await b.waitFor(`window.recamp.store.node(${S(id)}).props.url === 'https://arxiv.org/abs/1234.5678'`, 4000), 'url not saved; typed=' + typed + ' dialogOpen=' + await b.evaluate(`!!document.querySelector('.dialog')`) + ' url=' + await store(`s.node(${S(id)}).props.url`));
  await b.navigate(`${base}#/documents`);
  assert(await b.waitFor(`[...document.querySelectorAll('.children__row')].some(r => r.textContent.includes('Test Resource'))`), 'not listed in Documents');
});

await step('archive lists the sourced events by year and opens one', async () => {
  await b.navigate(`${base}#/archive`);
  const n = await b.evaluate(`document.querySelectorAll('.archive__entry').length`);
  assert(n >= 8, `only ${n} entries`);
  assert(await b.evaluate(`[...document.querySelectorAll('.archive__yearnum')].some(y => y.textContent.startsWith('2023'))`), 'no 2023');
  await b.evaluate(`[...document.querySelectorAll('.archive__entry')].find(e => e.textContent.includes('Chandrayaan-3')).click()`);
  assert(await b.waitFor(`location.hash === '#/p/r_evt_chandrayaan3'`), 'entry did not open');
});

await step('theme toggle switches light / dark and persists', async () => {
  await b.click('.sidebar__foot .iconbtn');
  assert(await b.waitFor(`document.documentElement.dataset.theme === 'light'`, 4000), 'not light: ' + await b.evaluate(`document.documentElement.dataset.theme + ' / setting=' + window.recamp.store.setting('theme') + ' / btn=' + !!document.querySelector('.sidebar__foot .iconbtn') + ' / sidebar=' + document.getElementById('app').dataset.sidebar`));
  assert((await store(`s.setting('theme')`)) === 'light');
  await b.click('.sidebar__foot .iconbtn');
  assert(await b.waitFor(`document.documentElement.dataset.theme === 'dark'`), 'not dark');
});

await step('keyboard: Tab reaches the sidebar, Ctrl+\\ toggles it, Escape closes menus', async () => {
  await b.navigate(`${base}#/`);
  await b.evaluate(`document.body.focus()`); await b.key('Tab', { vk: 9 });
  assert(await b.waitFor(`document.activeElement?.closest('.sidebar') !== null`), 'focus not in sidebar');
  await b.key('\\', { ctrl: true, code: 'Backslash', vk: 220 });
  assert(await b.waitFor(`document.getElementById('app').dataset.sidebar === 'closed'`), 'sidebar not closed');
  await b.key('\\', { ctrl: true, code: 'Backslash', vk: 220 });
  assert(await b.waitFor(`document.getElementById('app').dataset.sidebar === 'open'`), 'sidebar not reopened');
  await b.key('k', { ctrl: true }); await b.waitFor(`!!document.querySelector('.palette input')`);
  await b.key('Escape', { vk: 27 });
  assert(await b.waitFor(`!document.querySelector('.palette input')`), 'palette not closed');
});

await step('mobile: bottom bar shows, Menu opens the sidebar drawer, scrim closes it', async () => {
  await b.setViewport(420, 860);
  await b.navigate(`${base}#/`);
  assert((await b.evaluate('window.innerWidth')) === 420, 'viewport is not reporting true CSS pixels');
  assert(await b.waitFor(`getComputedStyle(document.querySelector('.mobilebar')).display === 'flex'`), 'mobile bar hidden');
  assert(await b.evaluate(`document.getElementById('app').dataset.sidebar === 'closed'`), 'sidebar should start closed on mobile');
  await b.evaluate(`[...document.querySelectorAll('.mobilebar button')].find(x => x.textContent.includes('Menu')).click()`);
  assert(await b.waitFor(`document.getElementById('app').dataset.sidebar === 'open'`), 'drawer did not open');
  await b.evaluate(`document.querySelector('.scrim').click()`);
  assert(await b.waitFor(`document.getElementById('app').dataset.sidebar === 'closed'`), 'drawer did not close');
  await b.screenshot(path.join(out, 'e2e-mobile-home.png'));
});

await step('mobile: nothing scrolls the page sideways, and the toast clears the bottom bar', async () => {
  for (const hash of ['#/', '#/db/db_events', '#/archive', '#/p/r_evt_gates_solace', '#/settings', '#/activity']) {
    await b.navigate(`${base}${hash}`);
    const over = await b.evaluate(`({ body: document.body.scrollWidth, win: window.innerWidth })`);
    assert(over.body <= over.win + 1, `${hash} overflows sideways (${over.body} > ${over.win})`);
  }
  await b.navigate(`${base}#/`);
  await b.evaluate(`window.recamp.toast('probe')`);
  assert(await b.waitFor(`!!document.querySelector('.toast')`), 'no toast');
  assert(await b.evaluate(`(() => { const t = document.querySelector('.toast').getBoundingClientRect(); const m = document.querySelector('.mobilebar').getBoundingClientRect(); return t.bottom <= m.top; })()`), 'toast overlaps the bottom bar');
});

await step('mobile: the table becomes labelled cards and the calendar becomes an agenda', async () => {
  await b.navigate(`${base}#/db/db_events`);
  const table = await b.evaluate(`(() => {
    const wrap = document.querySelector('.dbtable-wrap');
    const cell = document.querySelector('.dbtable__cell[data-label]');
    return { scrolls: wrap.scrollWidth > wrap.clientWidth + 1,
             headHidden: getComputedStyle(document.querySelector('.dbtable__head')).display === 'none',
             label: cell && getComputedStyle(cell, '::before').content,
             emptiesHidden: [...document.querySelectorAll('.dbtable__cell[data-empty="true"]')].every(c => getComputedStyle(c).display === 'none') };
  })()`);
  assert(!table.scrolls, 'table still scrolls horizontally on a phone');
  assert(table.headHidden, 'column header row should be hidden');
  assert(table.label && table.label !== 'none', 'cells are not showing their property label');
  assert(table.emptiesHidden, 'empty properties should drop out of the card');
  await b.navigate(`${base}#/db/db_events?v=v_cal`);
  assert(await b.waitFor(`!!document.querySelector('.agenda') && !document.querySelector('.cal__grid')`), 'calendar did not become an agenda');
  assert(await b.evaluate(`[...document.querySelectorAll('.agenda__title')].some(t => t.textContent === 'Gates of Solace')`), 'agenda is missing the dated event');
});

await step('mobile: breadcrumbs collapse to a back step, properties collapse to what is filled', async () => {
  await b.navigate(`${base}#/p/r_evt_gates_solace`);
  const crumbs = await b.evaluate(`(() => {
    const vis = [...document.querySelectorAll('.topbar__crumbs .crumb')].filter(c => getComputedStyle(c).display !== 'none');
    return { count: vis.length, back: vis.some(c => c.classList.contains('crumb--back')), current: vis[vis.length - 1].textContent.trim() };
  })()`);
  assert(crumbs.count === 2 && crumbs.back, `expected back + current, got ${JSON.stringify(crumbs)}`);
  assert(crumbs.current.includes('Gates of Solace'), `current crumb is "${crumbs.current}"`);
  const rowsBefore = await b.evaluate(`document.querySelectorAll('.props__row').length`);
  const total = await store(`s.db('db_events').schema.length`);
  assert(rowsBefore < total, `properties not collapsed (${rowsBefore} of ${total})`);
  await b.evaluate(`document.querySelector('.props__more').click()`);
  assert(await b.waitFor(`document.querySelectorAll('.props__row').length === ${total}`), 'Show all properties did not expand');
});

await step('mobile: the block menu button replaces the drag handle', async () => {
  await b.navigate(`${base}#/p/${pageId}`);
  assert(await b.evaluate(`getComputedStyle(document.querySelector('.blk__gutter')).display === 'none'`), 'drag handle should be hidden on touch');
  await b.click('.blk .blk__text');
  assert(await b.waitFor(`!!document.querySelector('.blk.is-active .blk__menu-touch')`), 'no block menu button on the focused block');
  await b.evaluate(`document.querySelector('.blk.is-active .blk__menu-touch').click()`);
  assert(await b.waitFor(`[...document.querySelectorAll('.menu__item')].some(x => x.textContent.includes('Move down'))`), 'block menu did not open');
  await b.key('Escape', { vk: 27 });
});

await step('everything persisted to localStorage and reloads', async () => {
  await b.evaluate(`window.recamp.store.flushNow()`);
  const before = await b.evaluate(`({ bytes: localStorage.getItem('recamp.workspace.v1')?.length || 0, title: window.recamp.store.node(${S(pageId)})?.title, events: window.recamp.store.records('db_events').map(r => r.title) })`);
  await b.setViewport(1440, 900);
  await b.navigate(`${base}#/`);
  const after = await b.evaluate(`({ seeded: !!window.recamp.store._seeded, bytes: localStorage.getItem('recamp.workspace.v1')?.length || 0, title: window.recamp.store.node(${S(pageId)})?.title, events: window.recamp.store.records('db_events').map(r => r.title) })`);
  assert(after.title === 'Test Page' && after.events.includes('Test Event'), 'data lost on reload: before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));
});

b.close(); closeServer();
const failed = results.filter(r => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
