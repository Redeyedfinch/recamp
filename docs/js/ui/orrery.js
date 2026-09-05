/**
 * Orrery — a clockwork model of the six classical planets, drawn as an
 * instrument plate: oblique orbits as hairlines, planets as small nodes,
 * labels along the orbits, an annotation in the corner. Motion is driven by
 * anime.js (loaded on demand) at an honest, compressed timescale: one Earth
 * year is `earthYearMs`, so Mercury visibly turns while Saturn barely moves.
 *
 * Restraint is the point. Nothing here is a giant sphere; the planets are
 * 2–6px. Under prefers-reduced-motion the plate is drawn at its seeded epoch
 * and stays still, and it pauses when the tab is hidden.
 */
import { seededRandom } from './starfield.js';
import { esc } from '../core/dom.js';

const ANIME_URL = 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/+esm';
let animePromise = null;
export function loadAnime() {
  if (!animePromise) animePromise = import(/* @vite-ignore */ ANIME_URL).catch(e => { animePromise = null; throw e; });
  return animePromise;
}

/** Semi-major axis in AU, sidereal period in years, drawn radius in px. */
export const PLANETS = [
  { name: 'Mercury', au: 0.387, period: 0.2408, r: 2.2 },
  { name: 'Venus',   au: 0.723, period: 0.6152, r: 3.3 },
  { name: 'Earth',   au: 1.000, period: 1.0000, r: 3.4, moon: { au: 0.09, period: 0.0748, r: 1.2 } },
  { name: 'Mars',    au: 1.524, period: 1.8808, r: 2.6 },
  { name: 'Jupiter', au: 5.203, period: 11.862, r: 6.0 },
  { name: 'Saturn',  au: 9.537, period: 29.457, r: 5.2, ring: 1.9 },
];

/** Orbit radii on a log(AU) scale so Saturn fits and Mercury is not on the Sun. */
export function layoutOrbits(width, height, { tilt = 0.42, inset = 0.06, cx = width / 2, cy = height / 2 } = {}) {
  const maxR = Math.min(width / 2, height / (2 * tilt)) * (1 - inset);
  const lo = Math.log(PLANETS[0].au) - 0.25, hi = Math.log(PLANETS[PLANETS.length - 1].au);
  const minR = maxR * 0.16;
  return PLANETS.map(p => {
    const f = (Math.log(p.au) - lo) / (hi - lo);
    const rx = minR + f * (maxR - minR);
    return { ...p, cx, cy, rx, ry: rx * tilt };
  });
}

/** Position on an oblique orbit for phase t ∈ [0,1). Counter-clockwise from the right. */
export function pointOnEllipse(o, t) {
  const a = t * Math.PI * 2;
  return { x: o.cx + o.rx * Math.cos(a), y: o.cy - o.ry * Math.sin(a) };
}

export function mountOrrery(host, { seed = 'recamp', earthYearMs = 80000, tilt = 0.42, labels = true, labelBearing = 0.13, labelFrom = 0, annotation = true, epoch = null, className = '', animate = true } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `orrery ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  host.append(svg);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const rnd = seededRandom(seed);
  const phases = PLANETS.map(() => rnd());
  const moonPhase = rnd();
  let orbits = [], anims = [], destroyed = false, nodes = [];

  const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

  function build() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const r = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    orbits = layoutOrbits(W, H, { tilt });
    const cx = W / 2, cy = H / 2;

    // reference crosshair + ecliptic line — the plotting surface
    svg.append(el('line', { class: 'orrery__axis', x1: cx - orbits[5].rx * 1.06, y1: cy, x2: cx + orbits[5].rx * 1.06, y2: cy }));
    svg.append(el('line', { class: 'orrery__axis', x1: cx, y1: cy - orbits[5].ry * 1.25, x2: cx, y2: cy + orbits[5].ry * 1.25 }));

    orbits.forEach((o, i) => {
      svg.append(el('ellipse', { class: `orrery__orbit ${i % 2 ? 'orrery__orbit--dashed' : ''}`, cx: o.cx, cy: o.cy, rx: o.rx, ry: o.ry }));
      // degree ticks on the outermost orbit, every 30°
      if (i === orbits.length - 1) for (let k = 0; k < 12; k++) {
        const p1 = pointOnEllipse(o, k / 12), o2 = { ...o, rx: o.rx + 5, ry: o.ry + 5 * tilt }, p2 = pointOnEllipse(o2, k / 12);
        svg.append(el('line', { class: 'orrery__tick', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
      }
    });

    // the Sun
    svg.append(el('circle', { class: 'orrery__sun-halo', cx, cy, r: 9 }));
    svg.append(el('circle', { class: 'orrery__sun', cx, cy, r: 3.2 }));

    nodes = orbits.map((o, i) => {
      const g = el('g', { class: `orrery__planet-g orrery__planet-g--${o.name.toLowerCase()}` });
      if (o.ring) g.append(el('ellipse', { class: 'orrery__ring', rx: o.r * o.ring, ry: o.r * o.ring * 0.38, transform: 'rotate(-18)' }));
      g.append(el('circle', { class: `orrery__planet orrery__planet--${o.name.toLowerCase()}`, r: o.r }));
      let moon = null;
      if (o.moon) { moon = el('circle', { class: 'orrery__moon', r: o.moon.r }); g.append(el('circle', { class: 'orrery__moon-orbit', r: o.r + 5 })); g.append(moon); }
      svg.append(g);
      return { g, moon, orbit: o, state: { t: phases[i], m: moonPhase } };
    });

    if (labels) {
      // Labels sit on each orbit at a fixed bearing, like an ephemeris plate — they do not
      // chase the planets. On a small plate the inner orbits are a few px apart, so the
      // labels are spread to at least one line-height, walking outward from the Sun.
      const side = Math.cos(labelBearing * Math.PI * 2) >= 0 ? 1 : -1;
      // `labelFrom` skips the innermost orbits when something sits over the centre
      // (the Enter wordmark): Mercury's orbit is smaller than the word, so its label
      // could never clear it.
      const pts = orbits.slice(labelFrom).map((o, i) => { const p = pointOnEllipse(o, labelBearing + (i + labelFrom) * 0.012 * side); return { name: o.name, x: p.x + 6 * side, y: p.y - 4 }; });
      const dir = side === 1 ? -1 : 1;                 // right-hand bearings rise outward, left-hand ones fall
      for (let i = 1; i < pts.length; i++) {
        const gap = (pts[i].y - pts[i - 1].y) * dir;
        if (gap < 11) pts[i].y = pts[i - 1].y + 11 * dir;
      }
      for (const p of pts) {
        const label = el('text', { class: 'orrery__label', x: p.x, y: p.y, 'text-anchor': side === 1 ? 'start' : 'end' });
        label.textContent = p.name.toUpperCase();
        svg.append(label);
      }
    }

    if (annotation) {
      const stamp = epoch || `EPOCH ${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const a = el('text', { class: 'orrery__note', x: 14, y: H - 14 });
      a.textContent = `ORRERY · ${stamp} · LOG AU · 1 YR = ${Math.round(earthYearMs / 1000)} S`;
      svg.append(a);
    }
    nodes.forEach(place);
  }

  function place(n) {
    const p = pointOnEllipse(n.orbit, n.state.t % 1);
    n.g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    if (n.moon) { const a = (n.state.m % 1) * Math.PI * 2; const rr = n.orbit.r + 5; n.moon.setAttribute('cx', (rr * Math.cos(a)).toFixed(2)); n.moon.setAttribute('cy', (-rr * 0.55 * Math.sin(a)).toFixed(2)); }
  }

  async function start() {
    stop();
    if (!animate || reduce.matches || destroyed) return;   // user setting or OS preference: the plate stays at its epoch
    let anime;
    try { anime = await loadAnime(); } catch { return; }   // offline: the plate stays at its epoch
    if (destroyed || reduce.matches) return;
    anims = nodes.map(n => {
      const dur = n.orbit.period * earthYearMs;
      const a = anime.animate(n.state, { t: n.state.t + 1, duration: dur, ease: 'linear', loop: true, onUpdate: () => place(n) });
      let m = null;
      if (n.moon) m = anime.animate(n.state, { m: n.state.m + 1, duration: n.orbit.moon.period * earthYearMs, ease: 'linear', loop: true });
      return [a, m].filter(Boolean);
    }).flat();
    if (document.hidden) anims.forEach(a => a.pause());
  }
  function stop() { anims.forEach(a => { try { a.pause(); a.cancel?.(); } catch { /* */ } }); anims = []; }

  const ro = new ResizeObserver(() => { const running = anims.length > 0; build(); if (running) start(); });
  ro.observe(host);
  const onVis = () => anims.forEach(a => (document.hidden ? a.pause() : a.resume?.() ?? a.play()));
  document.addEventListener('visibilitychange', onVis);
  const onReduce = () => (reduce.matches ? stop() : start());
  reduce.addEventListener('change', onReduce);

  build(); start();

  return {
    destroy() { destroyed = true; stop(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); reduce.removeEventListener('change', onReduce); svg.remove(); },
    setAnimate(v) { animate = !!v; v ? start() : stop(); },
    get animating() { return anims.length > 0; },
    svg,
  };
}

/** Static markup version, for places that never animate (email, plates). */
export function orrerySvg(width, height, { seed = 'recamp', tilt = 0.42 } = {}) {
  const rnd = seededRandom(seed);
  const orbits = layoutOrbits(width, height, { tilt });
  let s = '';
  orbits.forEach((o, i) => { s += `<ellipse class="orrery__orbit ${i % 2 ? 'orrery__orbit--dashed' : ''}" cx="${o.cx}" cy="${o.cy}" rx="${o.rx.toFixed(1)}" ry="${o.ry.toFixed(1)}"/>`; });
  s += `<circle class="orrery__sun" cx="${width / 2}" cy="${height / 2}" r="3"/>`;
  orbits.forEach(o => { const p = pointOnEllipse(o, rnd()); s += `<circle class="orrery__planet orrery__planet--${esc(o.name.toLowerCase())}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${o.r}"/>`; });
  return `<svg class="orrery" viewBox="0 0 ${width} ${height}" aria-hidden="true">${s}</svg>`;
}
