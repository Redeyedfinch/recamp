/**
 * Visual QA over the Chrome DevTools Protocol (no dependencies — Node's
 * built-in WebSocket). Serves web/ in-process, opens one headless Chrome,
 * and for each route waits until the view has rendered and fonts are ready
 * before capturing. Console errors are collected per route.
 *
 *   node build/qa.mjs            dark, 1440×900
 *   node build/qa.mjs --light    light theme
 *   node build/qa.mjs --mobile   420×900, mobile emulation
 *   node build/qa.mjs --only home,archive
 */
import http from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const out = path.join(root, 'qa');
await mkdir(out, { recursive: true });
const args = process.argv.slice(2);
const light = args.includes('--light'), mobile = args.includes('--mobile');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const [W, H] = mobile ? [420, 900] : [1440, 900];

/* ---- static server ---- */
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  try { const f = path.join(web, p); await stat(f); res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

/* ---- chrome ---- */
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) { console.error('No Chrome/Edge found'); process.exit(1); }
const profile = path.join(out, `.cdp-${light ? 'light' : 'dark'}${mobile ? '-m' : ''}`);
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = ''; const t = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
  proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); resolve(m[1]); } });
});

/* ---- tiny CDP client ---- */
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const pending = new Map(); const listeners = [];
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else if (m.method) listeners.forEach(fn => fn(m)); });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
if (mobile) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
const errors = [];
listeners.push(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' ')); });
const evaluate = async expr => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const routes = [
  ['enter', '#/enter'], ['home', '#/'], ['about', '#/p/p_about'], ['events-table', '#/db/db_events'], ['events-board', '#/db/db_events?v=v_board'],
  ['events-calendar', '#/db/db_events?v=v_cal'], ['events-timeline', '#/db/db_events?v=v_timeline'], ['events-gallery', '#/db/db_events?v=v_gallery'],
  ['gates', '#/p/r_evt_gates_solace'], ['archive', '#/archive'], ['tasks-board', '#/db/db_tasks'], ['members', '#/members'], ['research', '#/db/db_research'],
  ['experiment-log', '#/p/r_rsn_3'], ['activity', '#/activity'], ['inbox', '#/inbox'], ['settings', '#/settings'], ['search', '#/search?q=solace'], ['trash', '#/trash'], ['guide', '#/p/p_guide'],
].filter(([n]) => !only || only.includes(n));

let failures = 0;
for (const [name, hash] of routes) {
  errors.length = 0;
  const q = name === 'enter' ? '' : `?enter=1${light ? '&theme=light' : ''}`;
  await cdp('Page.navigate', { url: `http://localhost:${port}/${q}${hash}` });
  const t0 = Date.now(); let ready = false;
  while (Date.now() - t0 < 15000) { try { ready = await evaluate(`!!document.querySelector('.view, .login') && document.fonts.status === 'loaded' && !!window.recamp`); } catch { ready = false; } if (ready) break; await sleep(100); }
  await sleep(name === 'home' || name === 'enter' ? 700 : 300);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  const file = path.join(out, `${light ? 'light-' : ''}${mobile ? 'm-' : ''}${name}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  const info = await evaluate(`({ title: document.title, view: !!document.querySelector('.view, .login'), h: document.querySelector('.content')?.scrollHeight || 0 })`).catch(() => ({}));
  const ok = ready && !errors.length;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(16)} ${ready ? '' : 'NOT READY '}${info.title || ''}${errors.length ? `\n    ${errors.join('\n    ')}` : ''}`);
}
ws.close(); proc.kill(); server.close();
process.exit(failures ? 1 : 0);
