/**
 * Context menus. One open at a time. Keyboard: ↑ ↓ Enter Esc, type to filter
 * when `searchable`. Items: { label, desc, icon, kbd, danger, sep, tone,
 * selected, onSelect(item) } — or a string 'sep'.
 */
import { h, icon, placeNear, clear } from '../core/dom.js';

let open = null;

export function closeMenu() {
  if (!open) return;
  open.el.remove(); open.cleanup(); open = null;
}

export function showMenu(anchor, items, { searchable = false, placeholder = 'Filter…', align = 'start', head = null, cls = '', onClose = null, width = null } = {}) {
  closeMenu();
  const rect = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect?.() || anchor;
  const el = h('div.menu', { role: 'menu', class: cls, style: width ? { minWidth: width + 'px' } : null });
  if (head) el.append(h('div.menu__head', h('span.label', head)));
  let input = null;
  if (searchable) { input = h('input.input.menu__input', { type: 'text', placeholder, autocomplete: 'off', spellcheck: false }); el.append(input); }
  const list = h('div.menu__list');
  el.append(list);
  document.body.append(el);

  let filtered = items; let index = -1;
  const render = () => {
    clear(list); index = -1;
    let shown = 0;
    filtered.forEach((it) => {
      if (it === 'sep' || it.sep) { if (shown) list.append(h('div.menu__sep')); return; }
      const btn = h('button.menu__item', { type: 'button', role: 'menuitem', 'data-danger': it.danger || null, 'aria-selected': 'false' },
        it.icon ? icon(it.icon) : (it.node ? h('span.node', { 'data-tone': it.tone || 'faint' }) : (it.check !== undefined ? h('span.checkbox', { 'aria-checked': String(!!it.check) }, it.check ? icon('check') : null) : null)),
        h('span.menu__item__text', it.label, it.desc ? h('span.menu__item__desc', it.desc) : null),
        it.kbd ? h('span.menu__item__kbd', it.kbd) : null,
        it.selected ? icon('check') : null,
      );
      btn.addEventListener('click', e => { e.stopPropagation(); const keep = it.onSelect?.(it, e); if (keep !== true) closeMenu(); });
      btn.addEventListener('mousemove', () => select(items_().indexOf(btn)));
      list.append(btn); shown++;
    });
    if (!shown) list.append(h('div.menu__empty', 'Nothing matches.'));
    if (items_().length) select(0, false);
  };
  const items_ = () => [...list.querySelectorAll('.menu__item')];
  const select = (i, scroll = true) => {
    const all = items_(); if (!all.length) return;
    index = (i + all.length) % all.length;
    all.forEach((b, j) => b.setAttribute('aria-selected', String(j === index)));
    if (scroll) all[index].scrollIntoView({ block: 'nearest' });
  };
  render();
  placeNear(el, rect, { align });

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); select(index + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); select(index - 1); }
    else if (e.key === 'Enter') { if (items_().length) { e.preventDefault(); e.stopPropagation(); items_()[index]?.click(); } }
    else if (e.key === 'Tab') { closeMenu(); }
  };
  const onDown = e => { if (!el.contains(e.target)) closeMenu(); };
  const onScroll = e => { if (!el.contains(e.target)) closeMenu(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', closeMenu);
  if (input) {
    input.addEventListener('input', () => { const q = input.value.trim().toLowerCase(); filtered = q ? items.filter(it => it !== 'sep' && !it.sep && (it.label + ' ' + (it.desc || '') + ' ' + (it.keywords || '')).toLowerCase().includes(q)) : items; render(); });
    setTimeout(() => input.focus(), 0);
  } else { setTimeout(() => items_()[0]?.focus(), 0); }

  open = { el, cleanup() { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', closeMenu); onClose?.(); } };
  return el;
}

export function isMenuOpen() { return !!open; }
