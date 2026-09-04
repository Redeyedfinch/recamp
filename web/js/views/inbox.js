/** Inbox — what needs attention. Computed from the data, never invented. */
import { h, icon } from '../core/dom.js';
import { fmtDate, daysBetween, toDate } from '../core/dates.js';
import { viewhead, sectionHead, empty } from './common.js';
import { href } from '../ui/router.js';

export function inboxItems(store) {
  const now = new Date(); const iso = now.toISOString().slice(0, 10);
  const items = [];
  const tasks = store.records('db_tasks').filter(t => !t.props.done);
  for (const t of tasks.filter(t => (t.props.assignee || []).includes('me'))) items.push({ section: 'Assigned to you', icon: 'task', title: t.title, sub: t.props.due ? `Due ${fmtDate(t.props.due)}` : 'No due date', href: href.page(t.id), urgent: t.props.due && t.props.due < iso });
  for (const t of tasks.filter(t => t.props.due && t.props.due < iso && !(t.props.assignee || []).includes('me'))) items.push({ section: 'Overdue', icon: 'task', title: t.title, sub: `Was due ${fmtDate(t.props.due)}`, href: href.page(t.id), urgent: true });
  for (const t of tasks.filter(t => t.props.priority === 'High' && !(t.props.assignee || []).length)) items.push({ section: 'Unassigned, high priority', icon: 'task', title: t.title, sub: 'Nobody owns this yet', href: href.page(t.id) });
  for (const e of store.records('db_events').filter(e => ['Planning', 'Confirmed', 'Upcoming'].includes(e.props.status) && !e.props.date)) items.push({ section: 'Events without a date', icon: 'event', title: e.title, sub: `${e.props.status} — set a date so it appears on the calendar`, href: href.page(e.id) });
  for (const e of store.upcomingEvents(now).filter(e => daysBetween(now, toDate(e.props.date)) <= 14)) items.push({ section: 'In the next two weeks', icon: 'event', title: e.title, sub: `${fmtDate(e.props.date)} · ${e.props.status}`, href: href.page(e.id) });
  const demo = store.allNodes().filter(n => n.provenance === 'demo');
  if (demo.length) { const by = {}; for (const d of demo) by[d.databaseId] = (by[d.databaseId] || 0) + 1; for (const [dbId, n] of Object.entries(by)) items.push({ section: 'Placeholders to replace', icon: store.db(dbId)?.icon || 'page', title: `${n} demo record${n === 1 ? '' : 's'} in ${store.db(dbId)?.title}`, sub: 'Replace with real information, or delete', href: href.db(dbId), soft: true }); }
  return items;
}

export function mount(ctx, host) {
  const { store } = ctx;
  const view = h('div.view'); host.append(view);
  function render() {
    view.replaceChildren();
    const items = inboxItems(store);
    const hard = items.filter(i => !i.soft).length;
    view.append(viewhead({ kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'INBOX'), h('span.label', `${hard} NEED ATTENTION`)], title: hard ? `${hard} thing${hard === 1 ? '' : 's'} need${hard === 1 ? 's' : ''} attention.` : 'Nothing needs attention.', desc: 'Tasks assigned to you, overdue or unowned work, events missing dates, and placeholders still to replace.' }));
    const sections = [...new Set(items.map(i => i.section))];
    if (!sections.length) view.append(empty('All clear. New work shows up here as it appears.'));
    for (const s of sections) {
      const sec = h('div.section', sectionHead(s));
      for (const it of items.filter(i => i.section === s)) sec.append(h('a.inbox__row', { href: it.href }, icon(it.icon), h('div', h('div.inbox__title', it.title || 'Untitled'), h('div.inbox__sub', it.sub)), it.urgent ? h('span.node', { 'data-tone': 'rust' }) : h('span')));
      view.append(sec);
    }
  }
  const unsub = store.on('change', d => { if (!['block:update', 'recent', 'noop', 'node:touch'].includes(d.type)) render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Inbox', icon: 'inbox' }] });
  return { destroy: unsub };
}
