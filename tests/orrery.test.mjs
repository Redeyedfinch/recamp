import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, layoutOrbits, pointOnEllipse, orrerySvg } from '../web/js/ui/orrery.js';

test('the six classical planets carry real periods and increase outward', () => {
  assert.equal(PLANETS.length, 6);
  for (let i = 1; i < PLANETS.length; i++) {
    assert.ok(PLANETS[i].au > PLANETS[i - 1].au, `${PLANETS[i].name} should be farther out`);
    assert.ok(PLANETS[i].period > PLANETS[i - 1].period, `${PLANETS[i].name} should take longer`);
  }
  const earth = PLANETS.find(p => p.name === 'Earth');
  assert.equal(earth.au, 1); assert.equal(earth.period, 1);
  assert.ok(Math.abs(PLANETS.find(p => p.name === 'Saturn').period - 29.457) < 0.01, 'Saturn ≈ 29.46 yr');
});

test('orbits are laid out on a log scale, nested, and fit the plate', () => {
  const W = 800, H = 400;
  const o = layoutOrbits(W, H, { tilt: 0.42 });
  for (let i = 1; i < o.length; i++) assert.ok(o[i].rx > o[i - 1].rx, 'orbits nest outward');
  const outer = o[o.length - 1], inner = o[0];
  assert.ok(outer.rx <= W / 2 && outer.ry <= H / 2, 'outermost orbit stays inside the plate');
  assert.ok(inner.rx > 10, 'innermost orbit is not on top of the Sun');
  // log scale: the Mercury→Mars spread is not swamped by Jupiter/Saturn
  const inner4 = o[3].rx - o[0].rx, outer2 = o[5].rx - o[3].rx;
  assert.ok(inner4 > outer2 * 0.35, `inner planets keep visible spacing (${inner4.toFixed(0)} vs ${outer2.toFixed(0)})`);
  for (const x of o) assert.ok(Math.abs(x.ry / x.rx - 0.42) < 1e-9, 'oblique tilt applied uniformly');
});

test('pointOnEllipse traces the orbit and t=0.25 is the top', () => {
  const o = { cx: 100, cy: 50, rx: 40, ry: 16 };
  const p0 = pointOnEllipse(o, 0), pQ = pointOnEllipse(o, 0.25), pH = pointOnEllipse(o, 0.5);
  assert.deepEqual([Math.round(p0.x), Math.round(p0.y)], [140, 50]);
  assert.deepEqual([Math.round(pQ.x), Math.round(pQ.y)], [100, 34]);
  assert.deepEqual([Math.round(pH.x), Math.round(pH.y)], [60, 50]);
  for (let t = 0; t < 1; t += 0.05) { const p = pointOnEllipse(o, t); assert.ok(Math.abs(((p.x - 100) / 40) ** 2 + ((p.y - 50) / 16) ** 2 - 1) < 1e-9); }
});

test('static markup is deterministic for a seed and free of scripts', () => {
  const a = orrerySvg(600, 300, { seed: 'recamp-enter' }), b = orrerySvg(600, 300, { seed: 'recamp-enter' }), c = orrerySvg(600, 300, { seed: 'other' });
  assert.equal(a, b); assert.notEqual(a, c);
  assert.equal((a.match(/orrery__planet--/g) || []).length, 6);
  assert.ok(!/<script|on\w+=/i.test(a));
});
