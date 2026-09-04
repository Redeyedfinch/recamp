/**
 * Minimal Chrome DevTools Protocol harness shared by qa.mjs and e2e.mjs.
 * No dependencies: Node's WebSocket + child_process. Serves web/ in-process.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

export function serve() {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    try { const f = path.join(web, p); await stat(f); res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
    catch { res.writeHead(404); res.end(); }
  }).listen(0);
  return { server, port: server.address().port, close: () => server.close() };
}

export async function launch({ width = 1440, height = 900, mobile = false, profile }) {
  const chrome = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean).find(existsSync);
  if (!chrome) throw new Error('No Chrome/Edge found — set CHROME_PATH to the browser binary');
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''; const t = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); resolve(m[1]); } });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let seq = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else if (m.method) listeners.forEach(fn => fn(m)); });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  await cdp('Page.enable'); await cdp('Runtime.enable');
  // `mobile: true` makes headless Chrome lay out at 2× the window width (it skips
  // viewport-meta handling without a mobile UA), so a 420px capture silently showed
  // an 840px layout. Metrics stay non-mobile for true CSS pixels; touch is emulated
  // separately, which is what actually matters for tap targets and drag.
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (mobile) {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
  }
  const errors = [];
  listeners.push(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const evaluate = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return true; } catch { /* not yet */ } await sleep(80); } return false; };
  const ready = () => waitFor(`!!document.querySelector('.view, .login') && document.fonts.status === 'loaded' && !!window.recamp`, 15000);
  const key = async (k, { ctrl = false, shift = false, alt = false, code, vk, text } = {}) => {
    const mods = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
    const base = { key: k, code: code || (k.length === 1 ? `Key${k.toUpperCase()}` : k), windowsVirtualKeyCode: vk || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ' ': 32, '\\': 220 }[k] || 0), modifiers: mods };
    await cdp('Input.dispatchKeyEvent', { type: text || (k.length === 1 && !ctrl && !alt) ? 'keyDown' : 'rawKeyDown', ...base, text: text ?? (k.length === 1 && !ctrl && !alt ? k : undefined) });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  };
  // Text goes in as text: key events would need real virtual-key codes per character
  // ('.' is VK 46 — Delete). insertText still fires beforeinput/input with data set.
  const type = async text => { for (const ch of text) { await cdp('Input.insertText', { text: ch }); await sleep(8); } };
  const click = async selector => {
    const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) throw new Error(`no element ${selector}`);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(60);
  };
  const screenshot = async file => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); const { writeFile } = await import('node:fs/promises'); await writeFile(file, Buffer.from(data, 'base64')); };
  // Every navigate is a full load: a fragment-only change would be same-document and
  // leave the previous view in the DOM while the router's dynamic import resolves.
  let nav = 0;
  const navigate = async url => { const u = url.includes('?') ? url.replace(/(\?[^#]*)/, `$1&n=${++nav}`) : url.replace(/(#|$)/, `?n=${++nav}$1`); await cdp('Page.navigate', { url: u }); await ready(); };
  const close = () => { try { ws.close(); } catch { /* */ } proc.kill(); };
  return { cdp, evaluate, waitFor, ready, key, type, click, screenshot, navigate, sleep, errors, close, setViewport: (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }) };
}
