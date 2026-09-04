/**
 * Visual QA: serve web/ in-process and screenshot each route with headless
 * Chrome (or Edge) into qa/. Usage: node build/qa.mjs [--light] [--mobile]
 */
import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const out = path.join(root, 'qa');
await mkdir(out, { recursive: true });
const light = process.argv.includes('--light');
const mobile = process.argv.includes('--mobile');
const size = mobile ? '420,900' : '1440,900';

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  try { const f = path.join(web, p); await stat(f); res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) { console.error('No Chrome/Edge found'); process.exit(1); }

const routes = [
  ['enter', '#/enter'], ['home', '#/'], ['about', '#/p/p_about'], ['events-table', '#/db/db_events'], ['events-board', '#/db/db_events?v=v_board'],
  ['events-calendar', '#/db/db_events?v=v_cal'], ['events-timeline', '#/db/db_events?v=v_timeline'], ['events-gallery', '#/db/db_events?v=v_gallery'],
  ['gates', '#/p/r_evt_gates_solace'], ['archive', '#/archive'], ['tasks-board', '#/db/db_tasks'], ['members', '#/members'], ['research', '#/db/db_research'],
  ['experiment-log', '#/p/r_rsn_3'], ['activity', '#/activity'], ['inbox', '#/inbox'], ['settings', '#/settings'], ['search', '#/search?q=solace'], ['trash', '#/trash'],
];
const profile = path.join(out, `.profile-${light ? 'light' : 'dark'}${mobile ? '-m' : ''}`);
for (const [name, hash] of routes) {
  const enter = name === 'enter' ? '' : '?enter=1' + (light ? '&theme=light' : '');
  const url = `http://localhost:${port}/${enter}${hash}`;
  const file = path.join(out, `${light ? 'light-' : ''}${mobile ? 'm-' : ''}${name}.png`);
  try {
    execFileSync(chrome, [`--headless=new`, '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, `--window-size=${size}`, `--screenshot=${file}`, '--virtual-time-budget=6000', '--run-all-compositor-stages-before-draw', url], { stdio: 'ignore', timeout: 40000 });
    console.log('✓', name);
  } catch (e) { console.log('✗', name, e.message.split('\n')[0]); }
}
server.close();
