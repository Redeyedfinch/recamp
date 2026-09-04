/**
 * Dialogs: focus-trapped, Escape closes, scrim click closes unless `modal`.
 * Returns a promise that resolves with the action value (or null).
 */
import { h, icon } from '../core/dom.js';

let openDialog = null;

export function dialog({ title, body, actions = [], wide = false, modal = false, initialFocus = null, onOpen = null }) {
  closeDialog(null);
  return new Promise(resolve => {
    const previouslyFocused = document.activeElement;
    const box = h('div.dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title', class: wide ? 'dialog--wide' : '' });
    const close = value => { scrim.remove(); document.removeEventListener('keydown', onKey, true); openDialog = null; previouslyFocused?.focus?.(); resolve(value); };
    const scrim = h('div.dialog-scrim', { onclick: e => { if (e.target === scrim && !modal) close(null); } }, box);

    box.append(h('div.dialog__head',
      h('h2.dialog__title#dlg-title', title),
      h('button.iconbtn', { type: 'button', 'aria-label': 'Close', onclick: () => close(null) }, icon('close'))));
    const bodyEl = h('div.dialog__body');
    if (typeof body === 'string') bodyEl.append(h('p', body)); else if (body) bodyEl.append(body);
    box.append(bodyEl);
    if (actions.length) {
      box.append(h('div.dialog__foot', actions.map(a => h('button.btn', {
        type: 'button', class: `${a.primary ? 'btn--primary' : ''} ${a.danger ? 'btn--danger' : ''}`,
        onclick: async () => { if (a.onClick) { const r = await a.onClick(bodyEl); if (r === false) return; close(r === undefined ? a.value : r); } else close(a.value); },
      }, a.label))));
    }
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      if (e.key === 'Tab') trap(e, box);
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && actions.some(a => a.primary)) { e.preventDefault(); box.querySelector('.dialog__foot .btn--primary')?.click(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(scrim);
    openDialog = { close };
    setTimeout(() => { (initialFocus ? box.querySelector(initialFocus) : box.querySelector('input, textarea, select, [contenteditable], .btn--primary, button'))?.focus(); onOpen?.(bodyEl); }, 0);
  });
}

function trap(e, box) {
  const f = [...box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable]')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function closeDialog(value) { openDialog?.close(value); }

export function confirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return dialog({ title, body: message, actions: [{ label: 'Cancel', value: false }, { label: confirmLabel, value: true, primary: !danger, danger }] }).then(v => v === true);
}

export function prompt({ title, label = '', value = '', placeholder = '', confirmLabel = 'Save', hint = '' }) {
  const input = h('input.input', { type: 'text', value, placeholder });
  const body = h('div.field', label ? h('span.label', label) : null, input, hint ? h('span.field__hint', hint) : null);
  return dialog({ title, body, actions: [{ label: 'Cancel', value: null }, { label: confirmLabel, primary: true, onClick: () => input.value.trim() || false }] });
}
