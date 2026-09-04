/**
 * Build: copy web/ → docs/ (the GitHub Pages root) and stamp the version.
 * No bundling, no transpiling. The step exists so docs/ can carry a build
 * stamp and a 404.html that redirects deep links back to the app shell.
 */
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'web');
const out = path.join(root, 'docs');

let rev = 'dev';
try { rev = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not committed yet */ }
const stamp = `${new Date().toISOString().slice(0, 10)} · ${rev}`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(src, out, { recursive: true });

let html = await readFile(path.join(out, 'index.html'), 'utf8');
html = html.replace('<meta name="color-scheme"', `<meta name="recamp-build" content="${stamp}">\n  <meta name="color-scheme"`);
await writeFile(path.join(out, 'index.html'), html);
await writeFile(path.join(out, '404.html'), html);            // GitHub Pages serves this for unknown paths
await writeFile(path.join(out, '.nojekyll'), '');
await writeFile(path.join(out, 'build.txt'), stamp + '\n');

console.log(`built docs/ (${stamp})`);
