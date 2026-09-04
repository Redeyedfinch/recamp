import { test } from 'node:test';
import assert from 'node:assert/strict';
import { between, after, before, initialKeys } from '../web/js/core/order.js';

test('between(null, null) yields a mid key', () => {
  assert.equal(between(null, null), 'V');
});

test('keys stay strictly ordered under repeated append and prepend', () => {
  let keys = [between(null, null)];
  for (let i = 0; i < 200; i++) keys.push(between(keys[keys.length - 1], null));
  for (let i = 0; i < 200; i++) keys.unshift(between(null, keys[0]));
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i - 1] < keys[i], `${keys[i - 1]} < ${keys[i]}`);
});

test('repeated insertion between two neighbours converges without collision', () => {
  let a = 'V', b = 'k';
  const seen = new Set([a, b]);
  for (let i = 0; i < 300; i++) {
    const m = between(a, b);
    assert.ok(a < m && m < b, `${a} < ${m} < ${b}`);
    assert.ok(!seen.has(m)); seen.add(m);
    if (i % 2) a = m; else b = m;
  }
});

test('keys never end in the zero digit', () => {
  let a = null;
  for (let i = 0; i < 100; i++) { a = between(a, null); assert.notEqual(a.slice(-1), '0'); }
  let b = null;
  for (let i = 0; i < 100; i++) { b = between(null, b); assert.notEqual(b.slice(-1), '0'); }
});

test('after/before/initialKeys helpers', () => {
  const ks = initialKeys(5);
  for (let i = 1; i < ks.length; i++) assert.ok(ks[i - 1] < ks[i]);
  assert.ok(after(ks) > ks[4]);
  assert.ok(before(ks) < ks[0]);
  assert.ok(after([]) && before([]));
});
