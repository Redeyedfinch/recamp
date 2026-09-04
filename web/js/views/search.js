/** Search — grouped by kind, keyboard-navigable. */
import { h, icon, esc } from '../core/dom.js';
import { viewhead, empty } from './common.js';
import { kindOf, pathOf } from '../ui/palette.js';
import { href } from '../ui/router.js';

export function mount(ctx, host, route) {
  const { store } = ctx;
  const view = h('div.view'); host.append(view);
  let q = route.query.q || '';
  const input = h('input', { type: 'search', value: q, placeholder: 'Search pages, events, tasks, projects, resources, members, notes…', 'aria-label': 'Search', autofocus: true });
  const results = h('div');
  view.append(viewhead({ kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'SEARCH')], title: 'Search' }), h('div.searchbox', icon('search'), input), results);

  function render() {
    results.replaceChildren();
    if (!q.trim()) { results.append(empty('Type to search. Results group by kind; ↑↓ then Enter opens one.')); return; }
    const found = store.search(q, { limit: 60 });
    history.replaceState(null, '', href.search(q));
    if (!found.length) { results.append(empty(`Nothing matches “${q}”.`)); return; }
    const groups = new Map();
    for (const r of found) { const k = kindOf(store, r.node); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, list] of groups) {
      const g = h('div.results__group', h('div.section__head', h('span.label', `${k.toUpperCase()}S`), h('span.label', `${list.length}`)));
      for (const { node, snippet } of list) g.append(h('a.result', { href: href.page(node.id), tabindex: '0' }, icon(node.icon || 'page'), h('div', h('div.result__title', { html: highlight(node.title || 'Untitled', q) }), h('div.result__path', pathOf(store, node)), snippet ? h('div.result__snippet', { html: highlight(snippet, q) }) : null)));
      results.append(g);
    }
  }
  input.addEventListener('input', () => { q = input.value; render(); });
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); results.querySelector('.result')?.focus(); } });
  results.addEventListener('keydown', e => {
    const all = [...results.querySelectorAll('.result')]; const i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (all[i + 1] || all[0])?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else all[i - 1].focus(); }
  });
  render(); setTimeout(() => input.focus(), 30);
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Search', icon: 'search' }] });
  return {};
}

function highlight(text, q) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let out = esc(text);
  for (const t of terms) out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
  return out;
}
