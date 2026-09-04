/**
 * DOM helpers. `h()` is a small hyperscript: h('div.cls#id', {attrs}, ...kids).
 * No virtual DOM — views rebuild their own subtree when the store changes,
 * which is plenty for a workspace this size and keeps every file readable.
 */
import { iconSvg } from './icons.js';

export function h(tag, attrs, ...children) {
  if (attrs && (attrs instanceof Node || Array.isArray(attrs) || typeof attrs !== 'object')) {
    children.unshift(attrs); attrs = null;
  }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').match(/[.#][\w-]+/g)?.forEach(t => t[0] === '.' ? el.classList.add(t.slice(1)) : (el.id = t.slice(1)));

  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') { String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c)); }
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'ref') v(el);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string' && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function frag(...children) { const f = document.createDocumentFragment(); append(f, children); return f; }

export function icon(name, cls) {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, cls);
  return t.content.firstChild;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Delegated listener: on(root, 'click', '[data-act]', (e, match) => ...) */
export function on(root, evt, sel, fn, opts) {
  if (typeof sel === 'function') { root.addEventListener(evt, sel, fn); return () => root.removeEventListener(evt, sel, fn); }
  const handler = e => { const t = e.target.closest?.(sel); if (t && root.contains(t)) fn(e, t); };
  root.addEventListener(evt, handler, opts);
  return () => root.removeEventListener(evt, handler, opts);
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Place a fixed element near an anchor rect, staying inside the viewport. */
export function placeNear(el, rect, { gap = 4, align = 'start' } = {}) {
  const vw = window.innerWidth, vh = window.innerHeight;
  el.style.visibility = 'hidden'; el.style.top = '0px'; el.style.left = '0px';
  const w = el.offsetWidth, hgt = el.offsetHeight;
  let left = align === 'end' ? rect.right - w : rect.left;
  let top = rect.bottom + gap;
  if (top + hgt > vh - 8) top = Math.max(8, rect.top - gap - hgt);
  if (left + w > vw - 8) left = Math.max(8, vw - 8 - w);
  if (left < 8) left = 8;
  el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.visibility = '';
}

/** Caret helpers for contenteditable blocks */
export function caretAtStart(el) {
  const s = window.getSelection(); if (!s.rangeCount) return false;
  const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().length === 0;
}
export function caretAtEnd(el) {
  const s = window.getSelection(); if (!s.rangeCount) return false;
  const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setStart(s.focusNode, s.focusOffset);
  return r.toString().length === 0;
}
export function caretOffset(el) {
  const s = window.getSelection(); if (!s.rangeCount) return 0;
  const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().length;
}
export function setCaret(el, offset = Infinity) {
  el.focus();
  const s = window.getSelection(); const r = document.createRange();
  if (offset === Infinity) { r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r); return; }
  let remaining = offset; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (remaining <= node.length) { r.setStart(node, remaining); r.collapse(true); s.removeAllRanges(); s.addRange(r); return; }
    remaining -= node.length;
  }
  r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r);
}
