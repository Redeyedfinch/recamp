/** Shared view scaffolding. */
import { h, icon } from '../core/dom.js';
import { fmtTime, fmtDate, isoDate } from '../core/dates.js';

export function viewhead({ kicker = [], title, desc, actions = [] }) {
  return h('header.viewhead',
    h('div', kicker.length ? h('div.viewhead__kicker', kicker) : null, h('h1.viewhead__title', title), desc ? h('p.viewhead__desc', desc) : null),
    actions.length ? h('div.viewhead__actions', actions) : null);
}

export function sectionHead(label, right = null) {
  return h('div.section__head', h('span.label', label), right);
}

export function kicker(text, cls = '') { return h('span.label', { class: cls }, text); }

export function coord(...parts) {
  const el = h('span.coord');
  parts.forEach((p, i) => { if (i) el.append(h('span.sep', '/')); el.append(typeof p === 'string' && i === 0 ? h('b', p) : p); });
  return el;
}

/** Group activity entries by calendar day → [{ day, label, entries }] */
export function groupByDay(entries, now = new Date()) {
  const groups = new Map();
  for (const e of entries) {
    const day = isoDate(new Date(e.at));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(e);
  }
  const today = isoDate(now), yest = isoDate(new Date(now.getTime() - 86400000));
  return [...groups.entries()].map(([day, list]) => ({ day, label: day === today ? 'Today' : day === yest ? 'Yesterday' : fmtDate(day), entries: list }));
}

export function logRow(ctx, e) {
  const node = e.nodeId ? ctx.store.node(e.nodeId) : null;
  const tag = node && !node.archived ? 'a' : 'div';
  return h(`${tag}.log__row`, { href: node && !node.archived ? `#/p/${node.id}` : null, class: node && !node.archived ? 'log__row--link' : '' },
    h('div.log__time', fmtTime(e.at)),
    h('div', h('div.label.log__type', e.type), h('div.log__title', e.title || 'Untitled'), e.detail ? h('div.log__detail', e.detail) : null));
}

export function empty(text, action = null) { return h('div.empty', text, action); }

export function btn(label, onclick, { icon: ic = null, primary = false, ghost = false, sm = false, title = null } = {}) {
  return h('button.btn', { type: 'button', class: `${primary ? 'btn--primary' : ''} ${ghost ? 'btn--ghost' : ''} ${sm ? 'btn--sm' : ''}`, onclick, title }, ic ? icon(ic) : null, label);
}
