/**
 * Short, sortable-ish ids: a base36 timestamp prefix keeps ids created in
 * the same session roughly chronological (useful when eyeballing the Sheet),
 * a random suffix keeps them unique across devices.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function rand(n) {
  let out = '';
  const buf = new Uint8Array(n);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < n; i++) out += ALPHABET[buf[i] % 36];
  return out;
}

export function uid(prefix = '') {
  const t = Date.now().toString(36).slice(-6);
  return (prefix ? prefix + '_' : '') + t + rand(6);
}

/** Stable ids for seeded content, so re-seeding never duplicates. */
export function seedId(kind, slug) {
  return `${kind}_${slug}`;
}
