/**
 * Colour tokens must meet WCAG contrast on every surface they are used over,
 * in both themes. This is the guard that stopped a 3.98:1 label colour from
 * shipping as "fine" because it looked fine on one background.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/css/tokens.css', import.meta.url), 'utf8');
const block = sel => { const i = css.indexOf(sel); return css.slice(i, css.indexOf('}', i)); };
const parse = t => Object.fromEntries([...t.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2].toLowerCase()]));
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + .05) / (l2 + .05); };
const SURFACES = ['bg-surface', 'bg-raised', 'bg-sunken', 'bg-deep', 'bg-overlay'];
const themes = { dark: parse(block(':root {')), light: parse(block("[data-theme='light']")) };

for (const [name, t] of Object.entries(themes)) {
  test(`${name}: primary, secondary and faint text reach 4.5:1 on every surface`, () => {
    for (const fg of ['text-primary', 'text-secondary', 'text-faint']) for (const bg of SURFACES) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  });
  test(`${name}: ghost text (tertiary marks) reaches 3:1 on every surface`, () => {
    for (const bg of SURFACES) { const r = ratio(t['text-ghost'], t[bg]); assert.ok(r >= 3, `text-ghost on ${bg} is ${r.toFixed(2)}:1`); }
  });
  test(`${name}: accents used as text reach 4.5:1 on the working surface`, () => {
    for (const fg of ['celestial', 'stellar', 'sage', 'rust', 'violet']) {
      const r = ratio(t[fg], t['bg-surface']); assert.ok(r >= 4.5, `${fg} on bg-surface is ${r.toFixed(2)}:1`);
    }
  });
  test(`${name}: the hierarchy still reads — primary > secondary > faint > ghost`, () => {
    const bg = t['bg-surface'];
    const rs = ['text-primary', 'text-secondary', 'text-faint', 'text-ghost'].map(k => ratio(t[k], bg));
    for (let i = 1; i < rs.length; i++) assert.ok(rs[i - 1] > rs[i], `${rs.map(x => x.toFixed(1)).join(' > ')}`);
  });
}

test('the two themes define the same token names', () => {
  const a = Object.keys(themes.dark).sort(), b = Object.keys(themes.light).sort();
  for (const k of b) assert.ok(a.includes(k), `light defines ${k} which dark does not`);
});
