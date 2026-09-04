/**
 * Dates. The house style is DD MMM YYYY (09 Feb 2026) and 24-hour time.
 * Everything here works on ISO date strings (YYYY-MM-DD) or Date objects.
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function toDate(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

const pad = n => String(n).padStart(2, '0');

export function isoDate(d = new Date()) {
  d = toDate(d); if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fmtDate(v) {            // 09 Feb 2026
  const d = toDate(v); if (!d) return '';
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateLong(v) {        // 9 February 2026
  const d = toDate(v); if (!d) return '';
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDay(v) {             // Mon 09 Feb
  const d = toDate(v); if (!d) return '';
  return `${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
}
export function fmtTime(v) {            // 18:42
  const d = v instanceof Date ? v : new Date(v); if (isNaN(d)) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtStamp(v) {           // 09 Feb 2026 · 18:42
  return `${fmtDate(v)} · ${fmtTime(v)}`;
}
export function monthLabel(y, m) { return `${MONTHS_LONG[m]} ${y}`; }
export { MONTHS, MONTHS_LONG, DAYS };

/** Calendar-day difference b - a, ignoring time of day. */
export function daysBetween(a, b) {
  a = toDate(a); b = toDate(b);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** "yesterday", "in 3 days", "12 Feb". Always specific, never "a while ago". */
export function relative(v, now = new Date()) {
  const d = toDate(v); if (!d) return '';
  const days = daysBetween(now, d);
  if (days === 0) {
    const mins = Math.round((d - now) / 60000);
    if (Math.abs(mins) < 1) return 'just now';
    if (Math.abs(mins) < 60) return mins < 0 ? `${-mins} min ago` : `in ${mins} min`;
    return `today · ${fmtTime(d)}`;
  }
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  if (days < 0 && days > -7) return `${-days} days ago`;
  if (days > 0 && days < 7) return `in ${days} days`;
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
  return fmtDate(d);
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Still up.';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}

/** SESSION 2026.09 — the observatory's session stamp */
export function sessionLabel(now = new Date()) {
  return `SESSION ${now.getFullYear()}.${pad(now.getMonth() + 1)}`;
}

export function startOfWeek(d) { d = new Date(toDate(d)); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; }
export function addDays(d, n) { d = new Date(toDate(d)); d.setDate(d.getDate() + n); return d; }
export function sameDay(a, b) { a = toDate(a); b = toDate(b); return !!a && !!b && isoDate(a) === isoDate(b); }
