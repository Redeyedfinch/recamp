import { h } from '../core/dom.js';

export function toast(message, { action = null, onAction = null, duration = 4200 } = {}) {
  const host = document.getElementById('toasts'); if (!host) return;
  const el = h('div.toast', { role: 'status' }, h('span', message),
    action ? h('button.btn', { type: 'button', onclick: () => { onAction?.(); remove(); } }, action) : null);
  const remove = () => { el.style.transition = `opacity var(--dur) var(--ease)`; el.style.opacity = '0'; setTimeout(() => el.remove(), 200); };
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(remove, duration);
  return remove;
}
