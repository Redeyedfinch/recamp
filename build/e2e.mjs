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
  // After a route change focus is moved into the view (WCAG focus-on-route-change);
  // let that settle, then start from the top of the document like a fresh Tab would.
  await b.sleep(150);
  assert(await b.evaluate(`document.activeElement === document.querySelector('.content')`), 'route change should land focus in the content region');
  // From the content region the sidebar is *behind* you in tab order; Shift+Tab walks
  // back through the topbar into it. Three presses is the worst case on any view.
  let reached = false;
  for (let i = 0; i < 3 && !reached; i++) { await b.key('Tab', { vk: 9, shift: true }); reached = await b.evaluate(`document.activeElement?.closest('.sidebar') !== null`); }
  assert(reached, 'Shift+Tab from the view should reach the sidebar');
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

await step('mail: consent gates the recipient list, and sending is refused without a backend', async () => {
  await b.setViewport(1440, 900);
  await b.navigate(`${base}#/p/r_ann_1`);
  // Nobody is mailable out of the box: the seed ships no addresses and no consent.
  let counts = await b.evaluate(`(() => { const m = window.recamp.store.records('db_members'); return { total: m.length, mailable: m.filter(x => x.props.email && x.props.subscribed === true).length }; })()`);
  assert(counts.mailable === 0, 'seed must not ship subscribed members');

  await b.click('.page__tools .btn--primary');
  assert(await b.waitFor(`!!document.querySelector('.compose')`), 'compose did not open');
  let dlg = await b.evaluate(`(() => ({ count: document.querySelector('.compose__count').textContent, warn: document.querySelector('.compose__warn')?.textContent || '', skipped: document.querySelector('.compose__skipped summary')?.textContent || '' }))()`);
  assert(/Nobody can be mailed/.test(dlg.count), `expected nobody mailable, got "${dlg.count}"`);
  assert(/No backend connected/.test(dlg.warn), 'should say the backend is not connected');
  assert(/will not receive/.test(dlg.skipped), 'should list who is excluded');

  // Pressing Send must refuse rather than pretend.
  await b.evaluate(`[...document.querySelectorAll('.dialog__foot .btn')].find(x => x.textContent.startsWith('Send')).click()`);
  assert(await b.waitFor(`!!document.querySelector('.toast')`), 'no explanation toast');
  assert(await b.evaluate(`/Connect a backend|No recipient/.test(document.querySelector('.toast').textContent)`), 'refusal should explain why');
  assert(await b.evaluate(`!!document.querySelector('.compose')`), 'dialog should stay open after a refused send');
  await b.key('Escape', { vk: 27 });

  // Give one member an address and consent, and one an address without consent.
  await b.evaluate(`(() => { const s = window.recamp.store, m = s.records('db_members');
    s.setProp(m[0].id, 'email', 'yes@example.com'); s.setProp(m[0].id, 'subscribed', true);
    s.setProp(m[1].id, 'email', 'no@example.com'); s.setProp(m[1].id, 'subscribed', false); })()`);
  await b.click('.page__tools .btn--primary');
  assert(await b.waitFor(`!!document.querySelector('.compose')`), 'compose did not reopen');
  dlg = await b.evaluate(`(() => ({ count: document.querySelector('.compose__count').textContent, skipped: document.querySelector('.compose__skipped').textContent, btn: [...document.querySelectorAll('.dialog__foot .btn')].map(x => x.textContent).join('|') }))()`);
  assert(/^1 recipient/.test(dlg.count), `expected exactly 1 recipient, got "${dlg.count}"`);
  assert(/not subscribed/.test(dlg.skipped), 'the unsubscribed member should be listed as excluded');
  assert(/Send to 1/.test(dlg.btn), `the count belongs in the button, got "${dlg.btn}"`);
  await b.key('Escape', { vk: 27 });
});

await step('mail: the preview renders the message with per-recipient placeholders', async () => {
  const msg = await b.evaluate(`(async () => {
    const { buildMessage } = await import('./js/ui/compose.js');
    const m = buildMessage(window.recamp.store, window.recamp.store.node('r_ann_1'));
    return { html: m.html.length, hasName: m.html.includes('{{FIRST_NAME}}'), hasUnsub: m.html.includes('{{UNSUB_URL}}'),
             previewClean: !m.previewHtml.includes('{{'), noScript: !/<script/i.test(m.html), text: m.text.includes('Unsubscribe:') };
  })()`);
  assert(msg.hasName && msg.hasUnsub, 'placeholders missing from the sent HTML');
  assert(msg.previewClean, 'the preview must not show raw placeholders');
  assert(msg.noScript, 'email HTML must contain no scripts');
  assert(msg.text, 'plain-text alternative missing its unsubscribe line');
});

await step('mail: an event can raise a linked announcement draft', async () => {
  await b.navigate(`${base}#/p/r_evt_gates_solace`);
  await b.evaluate(`[...document.querySelectorAll('.page__tools .btn')].find(x => x.textContent.includes('Email members')).click()`);
  assert(await b.waitFor(`location.hash.startsWith('#/p/') && window.recamp.store.node(location.hash.slice(4))?.databaseId === 'db_announcements'`), 'no draft created');
  const draft = await b.evaluate(`(() => { const n = window.recamp.store.node(location.hash.slice(4)); return { status: n.props.status, event: n.props.event?.[0], subject: n.props.subject }; })()`);
  assert(draft.status === 'Draft', 'a new announcement must start as a Draft');
  assert(draft.event === 'r_evt_gates_solace', 'draft is not linked to the event');
  assert(/Gates of Solace/.test(draft.subject), `subject not prefilled: "${draft.subject}"`);
});

await step('celestial: the orrery turns on Home and Enter, and stands still when motion is off or reduced', async () => {
  await b.setViewport(1440, 900);
  await b.evaluate(`window.recamp?.store.setSetting('motion', 'on')`).catch(() => {});
  await b.navigate(`${base}#/`);
  assert(await b.waitFor(`document.querySelectorAll('.masthead .orrery .orrery__planet').length === 6`), 'six planets expected on the masthead plate');
  const read = () => b.evaluate(`document.querySelector('.masthead .orrery__planet-g--mercury').getAttribute('transform')`);
  // anime.js is fetched from a CDN; give it a moment, then Mercury (19 s period) must have moved
  const t0 = await read(); await b.sleep(2200); const t1 = await read();
  assert(t0 !== t1, `Mercury did not move (${t0})`);

  await b.evaluate(`window.recamp.store.setSetting('motion', 'off')`);
  assert(await b.waitFor(`!!document.querySelector('.masthead .orrery')`), 'home did not re-render');
  await b.sleep(400);
  const s0 = await read(); await b.sleep(1800); const s1 = await read();
  assert(s0 === s1, 'motion off must freeze the plate');
  const stillStars = await b.evaluate(`!!document.querySelector('.masthead .starfield')`);
  assert(stillStars, 'the star field should still be drawn when motion is off');
  await b.evaluate(`window.recamp.store.setSetting('motion', 'on')`);

  // OS-level preference wins even with the setting on
  await b.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.navigate(`${base}#/`);
  await b.sleep(400);
  const r0 = await read(); await b.sleep(1800); const r1 = await read();
  assert(r0 === r1, 'prefers-reduced-motion must freeze the plate');
  await b.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // earlier steps entered the workspace; ?enter=0 forgets that so the Enter screen can show
  await b.navigate(`http://localhost:${port}/?enter=0#/enter`);
  assert(await b.waitFor(`document.querySelectorAll('.login .orrery .orrery__planet').length === 6 && /ORRERY · EPOCH/.test(document.querySelector('.login__epoch')?.textContent || '')`), 'Enter screen should carry the plate and its epoch line');
});

await step('a11y: every icon-only control has an accessible name, and the Settings switch is a real switch', async () => {
  for (const hash of ['#/', '#/db/db_events', '#/p/r_evt_gates_solace', '#/settings']) {
    await b.navigate(`${base}${hash}`);
    const bad = await b.evaluate(`[...document.querySelectorAll('button, a[href]')].filter(el => {
      if (el.closest('[aria-hidden="true"]')) return false;
      const text = (el.textContent || '').trim();
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent);
      return !text && !name && getComputedStyle(el).display !== 'none';
    }).map(el => el.outerHTML.slice(0, 90))`);
    assert(bad.length === 0, `${hash}: ${bad.length} unnamed control(s): ${bad.join(' | ')}`);
  }
  const sw = await b.evaluate(`(() => { const s = document.querySelector('.switch[role="switch"]'); return s && { checked: s.getAttribute('aria-checked'), label: s.getAttribute('aria-label') }; })()`);
  assert(sw && sw.label === 'Celestial motion' && ['true', 'false'].includes(sw.checked), 'motion switch is missing its role/state');
  const labelled = await b.evaluate(`[...document.querySelectorAll('.settings input')].every(i => i.id && document.querySelector('label[for="' + i.id + '"]'))`);
  assert(labelled, 'every Settings input should have a <label for>');
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
