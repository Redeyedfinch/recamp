/**
 * Archive — what RECAMP has built, year by year. Each entry opens its event.
 */
import { h, icon } from '../core/dom.js';
import { fmtDate } from '../core/dates.js';
import { catalogueMark, provenanceMark, statusTag, typeTag, dateLine } from '../ui/props.js';
import { viewhead, empty } from './common.js';
import { href } from '../ui/router.js';

export function mount(ctx, host) {
  const { store } = ctx;
  const view = h('div.view.archive'); host.append(view);

  function render() {
    view.replaceChildren();
    const events = store.records('db_events');
    const done = events.filter(e => ['Completed', 'Archived'].includes(e.props.status) || (e.props.date && e.props.date < new Date().toISOString().slice(0, 10)));
    const byYear = new Map(); const unknown = [];
    for (const e of done) { const y = e.props.date ? Number(e.props.date.slice(0, 4)) : e.props.year; if (y) { if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(e); } else unknown.push(e); }
    const years = [...byYear.keys()].sort((a, b) => b - a);
    const sourced = done.filter(e => e.provenance === 'sourced').length;

    view.append(viewhead({
      kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'EVENT ARCHIVE'), h('span.label', `${done.length} OBSERVATION${done.length === 1 ? '' : 'S'}`), h('span.label', `${years[years.length - 1] || ''}–${years[0] || ''}`)],
      title: 'Archive of student-led activities',
      desc: `What the forum has built, year by year. ${sourced} of these entries come from RECAMP's public record; dates marked "exact date unrecorded" are waiting on the committee.`,
      actions: [h('a.btn', { href: href.db('db_events') }, icon('calendar'), 'Events database'), h('button.btn.btn--primary', { type: 'button', onclick: () => ctx.createRecord('db_events', { status: 'Planning' }) }, icon('plus'), 'New event')],
    }));

    if (!done.length) view.append(empty('Nothing has been archived yet.'));
    for (const y of years) {
      const list = byYear.get(y).sort((a, b) => (b.props.date || '').localeCompare(a.props.date || '') || a.title.localeCompare(b.title));
      const sec = h('section.archive__year', h('div.archive__yearnum', String(y), h('small.label', `${list.length} EVENT${list.length === 1 ? '' : 'S'}`)), h('div.archive__entries', list.map((e, i) => entry(e, i, list.length))));
      view.append(sec);
    }
    if (unknown.length) view.append(h('section.archive__year.archive__unknown', h('div.archive__yearnum', { style: { fontSize: '1.6rem', color: 'var(--text-faint)' } }, 'Date', h('small.label', 'UNAVAILABLE')), h('div.archive__entries', unknown.map((e, i) => entry(e, i, unknown.length)))));
  }

  function entry(e, i, n) {
    const children = store.children(e.id);
    return h('a.archive__entry', { href: href.page(e.id) },
      h('div', catalogueMark(store, e)),
      h('div', h('div.archive__etitle', e.title || 'Untitled'), e.props.description ? h('div.archive__edesc', e.props.description) : null,
        h('div.archive__etags', typeTag(store, e) || h('span.tag.tag--soft', { 'data-tone': 'faint' }, 'type unrecorded'), statusTag(store, e), provenanceMark(e), children.length ? h('span.coord', `${children.length} PAGE${children.length === 1 ? '' : 'S'} INSIDE`) : null)),
      h('div.archive__eside', h('span.coord', dateLine(e).toUpperCase()), arc(i, n, e.dateConfidence === 'exact')));
  }

  const unsub = store.on('change', d => { if (!['block:update', 'recent', 'noop', 'node:touch'].includes(d.type)) render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Past Events', icon: 'archive' }] });
  return { destroy: unsub };
}

/** A small arc segment; the event's position along the year's arc. */
function arc(i, n, exact) {
  const W = 104, H = 44; const f = n === 1 ? 0.5 : i / (n - 1);
  const pt = t => { const a = Math.PI * (1.12 + 0.76 * t); const cx = W / 2, cy = H + 52, R = 84; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  const [x0, y0] = pt(0), [x1, y1] = pt(1), [px, py] = pt(f);
  return h('svg.arc.archive__arc', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', html: `<path class="arc__path" d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A 84 84 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"/><circle class="arc__node ${exact ? '' : 'arc__node--past'}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/>` });
}
