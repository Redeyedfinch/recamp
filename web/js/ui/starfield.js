/**
 * Star field — a plotting surface, drawn once to a canvas.
 * Points are seeded so a given area always shows the same sky. One slow arc
 * may move (a single requestAnimationFrame at ~12fps), and it stops under
 * prefers-reduced-motion or when the tab is hidden.
 */
export function seededRandom(seed) {
  let s = hash(String(seed)) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function mountStarfield(host, { seed = 'recamp', density = 0.00028, arc = true, grid = true, animate = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'starfield'; canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let raf = 0, w = 0, h = 0, dpr = 1, stars = [], t0 = performance.now(), last = 0;

  const colours = () => {
    const cs = getComputedStyle(document.documentElement);
    return { star: cs.getPropertyValue('--text-secondary').trim() || '#a2a9b0', line: cs.getPropertyValue('--line-faint').trim() || '#14181d', arc: cs.getPropertyValue('--celestial-dim').trim() || '#48697e', amber: cs.getPropertyValue('--stellar').trim() || '#d6a15c' };
  };

  const layout = () => {
    const r = host.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height)); dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const rnd = seededRandom(seed + w + 'x' + h);
    const n = Math.round(w * h * density);
    stars = Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, r: rnd() < 0.08 ? 1.3 : rnd() < 0.4 ? 0.9 : 0.6, a: 0.25 + rnd() * 0.6, tw: rnd() }));
    draw(0);
  };

  const draw = (elapsed) => {
    const c = colours();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (grid) {
      ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0.5 + (w % 96) / 2; x < w; x += 96) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0.5; y < h; y += 96) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      // fine ticks along the bottom edge
      ctx.beginPath(); for (let x = 0.5; x < w; x += 16) { ctx.moveTo(x, h - (x % 80 < 1 ? 8 : 4)); ctx.lineTo(x, h); } ctx.stroke();
    }
    ctx.fillStyle = c.star;
    const still = reduce.matches || !animate;        // WCAG 2.2.2: the user can switch motion off
    for (const s of stars) {
      const tw = still ? 1 : 0.85 + 0.15 * Math.sin(elapsed / 2600 + s.tw * 6.28);
      ctx.globalAlpha = s.a * tw; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (arc) {
      // one great-circle-ish arc across the field, and a body that creeps along it
      const cx = w * 0.62, cy = h * 1.35, R = Math.hypot(w * 0.6, h * 0.95);
      ctx.strokeStyle = c.arc; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
      ctx.setLineDash([2, 6]); ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.93, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      ctx.setLineDash([]);
      const p = still ? 0.38 : ((elapsed / 90000) % 1);
      const a = Math.PI * (1.08 + 0.54 * p);
      ctx.globalAlpha = 1; ctx.fillStyle = c.amber;
      ctx.beginPath(); ctx.arc(cx + R * Math.cos(a), cy + R * Math.sin(a), 2, 0, 6.283); ctx.fill();
      // small tick marks along the arc
      ctx.strokeStyle = c.arc; ctx.globalAlpha = 0.6;
      for (let i = 0; i <= 8; i++) { const aa = Math.PI * (1.08 + 0.54 * i / 8); const x1 = cx + R * Math.cos(aa), y1 = cy + R * Math.sin(aa); const x2 = cx + (R - 5) * Math.cos(aa), y2 = cy + (R - 5) * Math.sin(aa); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  };

  const loop = (now) => {
    raf = 0;
    if (reduce.matches || document.hidden) return;
    if (now - last > 80) { last = now; draw(now - t0); }
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!raf && animate && !reduce.matches && !document.hidden) raf = requestAnimationFrame(loop); };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const ro = new ResizeObserver(() => layout());
  ro.observe(host);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  const mo = new MutationObserver(() => draw(performance.now() - t0));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  layout(); start();

  return { destroy() { stop(); ro.disconnect(); mo.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.remove(); } };
}
