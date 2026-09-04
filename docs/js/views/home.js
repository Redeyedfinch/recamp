/**
 * Home — the observatory. Masthead with a plotting surface, then what's
 * happening: the next event, the log, open tasks, active projects, and what
 * was last written. Hierarchy, not three identical cards.
 */
import { h, icon } from '../core/dom.js';
import { greeting, sessionLabel, fmtDate, relative, daysBetween, toDate, MONTHS } from '../core/dates.js';
import { mountStarfield } from '../ui/starfield.js';
import { statusTag, typeTag, catalogueMark, provenanceMark, dateLine, formatValue } from '../ui/props.js';
import { toneOf } from '../data/schema.js';
import { sectionHead, logRow, groupByDay, empty } from './common.js';
import { href } from '../ui/router.js';

export function mount(ctx, host) {
  const { store } = ctx;
  let field = null;
  const view = h('div.view.home');
  host.append(view);

  function render() {
    field?.destroy(); view.replaceChildren();
    const ws = store.meta.workspace || {};
    const now = new Date();
    const upcoming = store.upcomingEvents(now);
    const next = upcoming[0] || null;
    const openTasks = store.records('db_tasks').filter(t => !t.props.done);
    const myTasks = openTasks.filter(t => (t.props.assignee || []).includes('me'));
    const projects = store.activeProjects();
    const events = store.records('db_events');
    const planning = events.filter(e => ['Planning', 'Confirmed'].includes(e.props.status));

    /* masthead */
    const mast = h('div.masthead.grid-surface',
      h('div.marks', h('span.mark.mark--tl', h('b', 'RECAMP OBSERVATORY')), h('span.mark.mark--tr', sessionLabel(now)), h('span.mark.mark--bl', ws.coords || ''), h('span.mark.mark--br', `${fmtDate(now)}`)),
      h('div.masthead__inner',
        h('div',
          h('h1.masthead__name', ws.name || 'RECAMP'),
          h('div.masthead__desc.label.label--ink', (ws.descriptor || 'The Physical Science Forum').toUpperCase()),
          h('div.masthead__inst', h('span.coord', h('b', 'SCHOOL OF SCIENCES')), h('span.coord', 'JAIN (DEEMED-TO-BE UNIVERSITY)'), h('span.coord', 'BENGALURU'))),
        h('div.masthead__side', constellation(ctx, { events: events.length, projects: store.records('db_projects').length, research: store.records('db_research').length, people: store.records('db_members').length, archive: events.filter(e => e.props.status === 'Completed').length, live: events.some(e => e.props.status === 'Live') }))));
    view.append(mast);
    field = mountStarfield(mast, { seed: 'recamp-home', density: 0.00022, grid: false });

    /* title + lead */
    const parts = [];
    parts.push(upcoming.length ? h('b', `${upcoming.length} upcoming event${upcoming.length === 1 ? '' : 's'}`) : 'no dated upcoming events');
    parts.push(h('b', `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}`));
    parts.push(h('b', `${projects.length} active project${projects.length === 1 ? '' : 's'}`));
    const body = h('div.home__body',
      h('div.greeting', greeting(now)),
      h('h2.home__title', "What's happening"),
      h('p.home__lead', 'Across RECAMP right now: ', parts[0], ', ', parts[1], ', ', parts[2], '.', planning.length ? ` ${planning.length} event${planning.length === 1 ? ' is' : 's are'} still being planned.` : ''));
    view.append(body);

    /* next event */
    const sec = h('div.section', sectionHead('Next observation', h('a', { href: href.db('db_events', 'v_cal') }, 'Calendar →')));
    if (next) {
      const d = toDate(next.props.date); const days = daysBetween(now, d);
      sec.append(h('a.next-event', { href: href.page(next.id) },
        datebox(next),
        h('div', h('div.next-event__title', next.title || 'Untitled'),
          h('div.next-event__meta', catalogueMark(store, next), statusTag(store, next), typeTag(store, next), next.props.venue ? h('span.coord', next.props.venue.toUpperCase()) : null, h('span.t-faint', { style: { fontSize: 'var(--fs-small)' } }, days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`))),
        trajectoryArc(upcoming, now)));
    } else {
      const archived = events.filter(e => e.props.status === 'Completed').length;
      sec.append(h('div.next-event.next-event--none', h('span', `No upcoming events have a date yet. ${planning.length ? `${planning.length} in planning — ` : ''}`, h('a', { href: href.db('db_events') }, planning.length ? 'set dates in Events' : 'plan one in Events'), `. The archive holds ${archived} completed event${archived === 1 ? '' : 's'}.`)));
    }
    body.append(sec);

    /* grid: log + tasks */
    const grid = h('div.home__grid');
    const logSec = h('div.section', sectionHead('Observatory log', h('a', { href: href.activity() }, 'Full log →')));
    const groups = groupByDay(store.activity(9), now);
    if (!groups.length) logSec.append(empty('Nothing has happened yet.'));
    for (const g of groups) { logSec.append(h('div.label.log__day', g.label)); g.entries.forEach(e => logSec.append(logRow(ctx, e))); }
    grid.append(logSec);

    const taskSec = h('div.section', sectionHead(myTasks.length ? 'Your tasks' : 'Open tasks', h('a', { href: href.db('db_tasks') }, 'All tasks →')));
    const shown = (myTasks.length ? myTasks : openTasks).slice(0, 7);
    if (!shown.length) taskSec.append(empty('No open tasks. ', h('a', { href: href.db('db_tasks') }, 'Add one'), '.'));
    for (const t of shown) taskSec.append(taskRow(ctx, t));
    if (openTasks.length > shown.length) taskSec.append(h('div.t-faint', { style: { fontSize: 'var(--fs-small)', paddingTop: '8px' } }, `${openTasks.length - shown.length} more in Tasks.`));
    grid.append(taskSec);
    body.append(grid);

    /* projects */
    const projSec = h('div.section', sectionHead('Active trajectories', h('a', { href: href.db('db_projects') }, 'All projects →')));
    if (!projects.length) projSec.append(empty('No active projects. Proposed ones are waiting in Projects.'));
    for (const p of projects) {
      const tasks = store.records('db_tasks').filter(t => (t.props.project || []).includes(p.id));
      const done = tasks.filter(t => t.props.done).length;
      const area = store.property('db_projects', 'area');
      projSec.append(h('a.projrow', { href: href.page(p.id) },
        h('div', h('div.projrow__title', p.title || 'Untitled'), h('div.projrow__sub', [p.props.summary, tasks.length ? `${done}/${tasks.length} tasks` : null].filter(Boolean).join(' · '))),
        p.props.area ? h('span.tag.tag--soft', { 'data-tone': toneOf(area?.options, p.props.area) }, p.props.area) : h('span'),
        progress(tasks.length ? done / tasks.length : 0, 10),
        h('span.projrow__due', p.props.deadline ? `DUE ${fmtDate(p.props.deadline).toUpperCase()}` : p.props.start ? `SINCE ${fmtDate(p.props.start).toUpperCase()}` : '')));
    }
    body.append(projSec);

    /* recent knowledge */
    const recent = store.recentlyEdited(7).filter(n => n.kind !== 'record' || !['db_tasks'].includes(n.databaseId));
    const knowSec = h('div.section', sectionHead('Recently written', h('a', { href: href.search() }, 'Search →')));
    for (const n of recent) knowSec.append(h('a.knowledge__row', { href: href.page(n.id) }, icon(n.icon || 'page'), h('div', h('div.knowledge__title', n.title || 'Untitled'), h('div.knowledge__path', store.path(n.id).slice(0, -1).map(p => p.title).join(' / ') || 'Workspace')), h('span.knowledge__when', relative(n.updatedAt, now).toUpperCase())));
    body.append(knowSec);

    view.querySelectorAll('.section').forEach((s, i) => { s.classList.add('reveal'); s.style.setProperty('--i', i + 1); });
  }

  const unsub = store.on('change', d => { if (d.type !== 'block:update' && d.type !== 'recent' && d.type !== 'noop') render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Home', icon: 'home' }] });
  return { destroy() { unsub(); field?.destroy(); } };
}

export function datebox(node) {
  const d = toDate(node.props?.date);
  if (d) return h('div.datebox', h('div.datebox__day', String(d.getDate()).padStart(2, '0')), h('div.datebox__mon', MONTHS[d.getMonth()]), h('div.datebox__year', String(d.getFullYear())));
  if (node.dateConfidence === 'year' && node.props?.year) return h('div.datebox.datebox--year', h('div.datebox__day', String(node.props.year)), h('div.datebox__mon', 'year'), h('div.datebox__year', 'exact date unrecorded'));
  return h('div.datebox.datebox--unknown', h('div.datebox__day', 'TBD'), h('div.datebox__mon', 'date'), h('div.datebox__year', 'unavailable'));
}

export function progress(ratio, n = 10) {
  const on = Math.round(ratio * n);
  return h('div.progress', { title: `${Math.round(ratio * 100)}%` }, Array.from({ length: n }, (_, i) => h('i', { class: i < on ? 'is-on' : '', 'data-tone': ratio >= 1 ? 'sage' : null })));
}

function taskRow(ctx, t) {
  const { store } = ctx;
  const proj = (t.props.project || []).map(id => store.node(id)?.title).filter(Boolean)[0];
  const evt = (t.props.event || []).map(id => store.node(id)?.title).filter(Boolean)[0];
  const pr = store.property('db_tasks', 'priority');
  return h('div.tasklist__row', { class: t.props.done ? 'is-done' : '' },
    h('button.checkbox', { type: 'button', role: 'checkbox', 'aria-checked': String(!!t.props.done), 'aria-label': `Mark “${t.title}” done`, onclick: () => store.setProp(t.id, 'done', !t.props.done) }, icon('check')),
    h('div.grow', h('a.tasklist__title', { href: href.page(t.id) }, t.title || 'Untitled'),
      h('div.tasklist__meta', t.props.priority ? h('span.tag.tag--soft', { 'data-tone': toneOf(pr?.options, t.props.priority) }, t.props.priority) : null, proj ? h('span', proj) : null, evt ? h('span', evt) : null, t.props.due ? h('span.coord', `DUE ${fmtDate(t.props.due).toUpperCase()}`) : null)));
}

/** A small arc with the upcoming events plotted along it by date. */
function trajectoryArc(events, now) {
  const W = 240, H = 64; const list = events.slice(0, 6);
  const span = Math.max(30, daysBetween(now, toDate(list[list.length - 1].props.date)) + 5);
  const pt = frac => { const a = Math.PI * (1.1 + 0.8 * frac); const cx = W / 2, cy = H + 70, R = 112; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  const [x0, y0] = pt(0), [x1, y1] = pt(1);
  const nodes = list.map((e, i) => { const f = Math.min(1, daysBetween(now, toDate(e.props.date)) / span); const [x, y] = pt(f); return `<circle class="arc__node ${i === 0 ? 'arc__node--now' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 ? 3.2 : 2.4}"/>`; }).join('');
  const [nx, ny] = pt(0);
  return h('svg.arc.next-event__arc', { viewBox: `0 0 ${W} ${H}`, html: `<path class="arc__path" d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A 112 112 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"/><path class="arc__path arc__path--dashed" d="M ${nx.toFixed(1)} ${ny.toFixed(1)} L ${nx.toFixed(1)} ${(ny + 18).toFixed(1)}"/>${nodes}<text class="arc__label" x="${(x0 - 2).toFixed(1)}" y="${H - 2}">now</text><text class="arc__label" x="${(x1 - 26).toFixed(1)}" y="${H - 2}">+${span}d</text>` });
}

/** Five stations, an index of the workspace. Visual layer; the sidebar stays primary. */
export function constellation(ctx, counts) {
  const pts = [
    ['Events', 'db', 'db_events', 30, 86, counts.events], ['Projects', 'db', 'db_projects', 118, 30, counts.projects], ['Research', 'db', 'db_research', 214, 52, counts.research],
    ['People', 'go', '/members', 258, 128, counts.people], ['Archive', 'go', '/archive', 140, 150, counts.archive],
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 4]];
  const svg = h('svg', { viewBox: '0 0 300 180', 'aria-label': 'Workspace index' });
  svg.innerHTML = edges.map(([a, b]) => `<line class="constellation__edge" x1="${pts[a][3]}" y1="${pts[a][4]}" x2="${pts[b][3]}" y2="${pts[b][4]}"/>`).join('');
  pts.forEach(([label, kind, target, x, y, n], i) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'constellation__node'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'link');
    if (i === 0 && counts.live) g.dataset.live = 'true';
    const above = y < 70;
    g.innerHTML = `<circle cx="${x}" cy="${y}" r="${4 + Math.min(4, Math.sqrt(n || 0))}"/><text x="${x}" y="${above ? y - 12 : y + 20}" text-anchor="middle">${label}</text><text class="n" x="${x}" y="${above ? y - 24 : y + 31}" text-anchor="middle">${String(n).padStart(2, '0')}</text>`;
    const go = () => (kind === 'db' ? ctx.router.db(target) : ctx.router.go(target));
    g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    svg.append(g);
  });
  return h('div.constellation', svg);
}
