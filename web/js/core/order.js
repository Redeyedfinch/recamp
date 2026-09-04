/**
 * Fractional ordering.
 *
 * Every sibling carries an `order` string. To put X between A and B we compute
 * a key strictly between A.order and B.order and write it to X alone — the
 * other siblings are never touched. Keys are base-62 fractions in (0, 1) with
 * no trailing zero digit, so plain string comparison is the sort order.
 *
 * Derived from the midpoint construction in rocicorp/fractional-indexing.
 */
export const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function midpoint(a, b) {
  const zero = DIGITS[0];
  if (b !== undefined && a >= b) throw new Error(`order: ${a} >= ${b}`);
  if (a.slice(-1) === zero || (b && b.slice(-1) === zero)) throw new Error('order: trailing zero');

  if (b) {
    let n = 0;
    while ((a[n] || zero) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== undefined ? DIGITS.indexOf(b[0]) : DIGITS.length;

  if (db - da > 1) return DIGITS[Math.round(0.5 * (da + db))];
  if (b && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), undefined);
}

/** A key strictly between `a` and `b`; either may be null for open ends. */
export function between(a, b) {
  return midpoint(a || '', b == null ? undefined : b);
}

/** A key after every element of `keys` (or the first key if none). */
export function after(keys) {
  const sorted = [...keys].filter(Boolean).sort();
  return between(sorted[sorted.length - 1] || null, null);
}

/** A key before every element of `keys`. */
export function before(keys) {
  const sorted = [...keys].filter(Boolean).sort();
  return between(null, sorted[0] || null);
}

/** Evenly spaced initial keys for a list of n items. */
export function initialKeys(n) {
  const out = [];
  let prev = null;
  for (let i = 0; i < n; i++) { prev = between(prev, null); out.push(prev); }
  return out;
}

export const byOrder = (a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);
