/**
 * Visual QA: screenshot every route in headless Chrome, waiting for the view
 * and fonts before capturing; console errors are collected per route.
 *
 *   node build/qa.mjs                    dark, 1440×900, local web/
 *   node build/qa.mjs --light            light theme
 *   node build/qa.mjs --mobile           420×900, mobile emulation
 *   node build/qa.mjs --only home,archive
 *   node build/qa.mjs --url https://redeyedfinch.github.io/recamp/   (live site)
 */
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { serve, launch, root } from './cdp.mjs';

const out = path.join(root, 'qa'); await mkdir(out, { recursive: true });
const args = process.argv.slice(2);
const light = args.includes('--light'), mobile = args.includes('--mobile');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const liveUrl = args.includes('--url') ? args[args.indexOf('--url') + 1].replace(/\/?$/, '/') : null;
const [W, H] = mobile ? [420, 900] : [1440, 900];

const local = liveUrl ? null : serve();
const base = liveUrl || `http://localhost:${local.port}/`;
const b = await launch({ width: W, height: H, mobile, profile: path.join(out, `.cdp-${liveUrl ? 'live-' : ''}${light ? 'light' : 'dark'}${mobile ? '-m' : ''}`) });

const routes = [
  ['enter', '#/enter'], ['home', '#/'], ['about', '#/p/p_about'], ['events-table', '#/db/db_events'], ['events-board', '#/db/db_events?v=v_board'],
  ['events-calendar', '#/db/db_events?v=v_cal'], ['events-timeline', '#/db/db_events?v=v_timeline'], ['events-gallery', '#/db/db_events?v=v_gallery'],
  ['gates', '#/p/r_evt_gates_solace'], ['archive', '#/archive'], ['tasks-board', '#/db/db_tasks'], ['members', '#/members'], ['research', '#/db/db_research'],
  ['experiment-log', '#/p/r_rsn_3'], ['activity', '#/activity'], ['inbox', '#/inbox'], ['settings', '#/settings'], ['search', '#/search?q=solace'], ['trash', '#/trash'], ['guide', '#/p/p_guide'],
].filter(([n]) => !only || only.includes(n));

// what each route's document.title must contain once its own view has rendered
const expectTitle = { enter: 'Observatory', home: 'Observatory', about: 'About RECAMP', gates: 'Gates of Solace', archive: 'Archive', 'tasks-board': 'Tasks', members: 'Members', research: 'Research', 'experiment-log': 'Experiment log', activity: 'Activity', inbox: 'Inbox', settings: 'Settings', search: 'Search', trash: 'Trash', guide: 'Workspace guide' };

let failures = 0;
for (const [name, hash] of routes) {
  b.errors.length = 0;
  const q = name === 'enter' ? '' : `?enter=1${light ? '&theme=light' : ''}`;
  await b.navigate(`${base}${q}${hash}`);
  const want = expectTitle[name] || 'Events';
  const routed = await b.waitFor(`document.title.includes(${JSON.stringify(want)})`, 15000);
  await b.sleep(name === 'home' || name === 'enter' ? 700 : 300);
  const file = path.join(out, `${liveUrl ? 'live-' : ''}${light ? 'light-' : ''}${mobile ? 'm-' : ''}${name}.png`);
  await b.screenshot(file);
  const title = await b.evaluate('document.title').catch(() => '');
  const ok = routed && !b.errors.length;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(16)} ${routed ? '' : 'WRONG VIEW '}${title}${b.errors.length ? `\n    ${b.errors.join('\n    ')}` : ''}`);
}
b.close(); local?.close();
process.exit(failures ? 1 : 0);
