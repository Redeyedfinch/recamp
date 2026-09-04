/** Activity — the full observatory log, grouped by day, filterable by kind. */
import { h, icon } from '../core/dom.js';
import { viewhead, groupByDay, logRow, empty } from './common.js';

const FILTERS = [['all', 'All'], ['pages', 'Pages'], ['records', 'Records'], ['status', 'Status'], ['system', 'System']];

export function mount(ctx, host) {
  const { store } = ctx;
  const view = h('div.view'); host.append(view);
  let filter = 'all';

  function render() {
    view.replaceChildren();
    const all = store.activity(400);
    const list = all.filter(e => filter === 'all' ? true : filter === 'pages' ? /^PAGE|DATABASE/.test(e.type) : filter === 'records' ? /^RECORD|TASK/.test(e.type) : filter === 'status' ? /STATUS|COMPLETED/.test(e.type) : /WORKSPACE|ARCHIVE|FAVORITE|SYNC/.test(e.type));
    view.append(viewhead({
      kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'OBSERVATORY LOG'), h('span.label', `${all.length} ENTRIES`)],
      title: 'Activity', desc: 'Every change, recorded as it happened. Edits to one page within ten minutes fold into a single line.',
      actions: [h('div.segmented', FILTERS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; render(); } }, l)))],
    }));
    const groups = groupByDay(list);
    if (!groups.length) view.append(empty('Nothing in the log for this filter.'));
    for (const g of groups) { view.append(h('div.label.log__day', { style: { marginTop: 'var(--s6)' } }, g.label)); g.entries.forEach(e => view.append(logRow(ctx, e))); }
  }
  const unsub = store.on('change', d => { if (!['block:update', 'recent', 'noop'].includes(d.type)) render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Activity', icon: 'signal' }] });
  return { destroy: unsub };
}
