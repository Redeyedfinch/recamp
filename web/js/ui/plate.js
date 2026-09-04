/**
 * Cover plates — a generated catalogue plate for a node: faint grid, a few
 * seeded stars, one arc, corner marks. Deterministic per id, so the same
 * page always wears the same sky. Pure SVG, no images.
 */
import { seededRandom } from './starfield.js';
import { esc } from '../core/dom.js';

export function plateSvg(node, { width = 800, height = 168, label = '', right = '' } = {}) {
  const rnd = seededRandom(node.id + '|' + (node.cover?.seed || ''));
  const n = Math.round(width * height / 5200);
  let stars = '';
  for (let i = 0; i < n; i++) {
    const r = rnd() < 0.1 ? 1.4 : rnd() < 0.45 ? 0.9 : 0.6;
    stars += `<circle class="plate__star" cx="${(rnd() * width).toFixed(1)}" cy="${(rnd() * height).toFixed(1)}" r="${r}" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  let grid = '';
  for (let x = 48; x < width; x += 96) grid += `<line class="plate__grid" x1="${x}" y1="0" x2="${x}" y2="${height}"/>`;
  for (let y = 48; y < height; y += 96) grid += `<line class="plate__grid" x1="0" y1="${y}" x2="${width}" y2="${y}"/>`;
  const cx = width * (0.3 + rnd() * 0.4), cy = height * (1.2 + rnd() * 0.6), R = Math.hypot(width * 0.55, height * 0.9) * (0.9 + rnd() * 0.2);
  const a0 = Math.PI * (1.05 + rnd() * 0.1), a1 = Math.PI * (1.55 + rnd() * 0.15);
  const arc = `M ${(cx + R * Math.cos(a0)).toFixed(1)} ${(cy + R * Math.sin(a0)).toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${(cx + R * Math.cos(a1)).toFixed(1)} ${(cy + R * Math.sin(a1)).toFixed(1)}`;
  const am = a0 + (a1 - a0) * (0.3 + rnd() * 0.4);
  const marks = label ? `<text class="plate__mark" x="16" y="${height - 14}">${esc(label)}</text>` : '';
  const marksR = right ? `<text class="plate__mark" x="${width - 16}" y="${height - 14}" text-anchor="end">${esc(right)}</text>` : '';
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${grid}${stars}<path class="plate__arc" d="${arc}"/><circle cx="${(cx + R * Math.cos(am)).toFixed(1)}" cy="${(cy + R * Math.sin(am)).toFixed(1)}" r="2.2" fill="var(--stellar)"/>${marks}${marksR}</svg>`;
}

export function plateEl(node, opts = {}) {
  const el = document.createElement('div');
  el.className = `plate ${opts.cls || 'plate--cover'}`;
  el.innerHTML = plateSvg(node, opts);
  return el;
}
