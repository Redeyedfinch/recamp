/** Trash — restore, or delete for good. */
import { h, icon } from '../core/dom.js';
import { fmtStamp } from '../core/dates.js';
import { confirm } from '../ui/dialog.js';
import { viewhead, empty } from './common.js';

export function mount(ctx, host) {
  const { store } = ctx;
  const view = h('div.view'); host.append(view);
  function render() {
    view.replaceChildren();
    const items = store.trashed();
    view.append(viewhead({ kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'TRASH'), h('span.label', `${items.length} ITEM${items.length === 1 ? '' : 'S'}`)], title: 'Trash', desc: 'Pages here can be restored with everything inside them. Deleting for good cannot be undone.',
      actions: items.length ? [h('button.btn.btn--danger', { type: 'button', onclick: async () => { if (await confirm({ title: 'Empty trash?', message: `${items.length} item${items.length === 1 ? '' : 's'} and everything inside them will be removed permanently.`, confirmLabel: 'Delete all', danger: true })) store.emptyTrash(); } }, icon('trash'), 'Empty trash')] : [] }));
    if (!items.length) view.append(empty('Trash is empty.'));
    for (const n of items) {
      const inside = store.descendants(n.id).length;
      view.append(h('div.trash__row', icon(n.icon || 'page'),
        h('div', h('div.trash__title', n.title || 'Untitled'), h('div.trash__sub', `${n.kind}${inside ? ` · ${inside} inside` : ''} · trashed ${fmtStamp(n.archivedAt)}`)),
        h('div.trash__actions', h('button.btn.btn--sm', { type: 'button', onclick: () => { store.restoreNode(n.id); ctx.toast(`“${n.title || 'Untitled'}” restored`); } }, icon('restore'), 'Restore'),
          h('button.btn.btn--sm.btn--danger', { type: 'button', onclick: async () => { if (await confirm({ title: `Delete “${n.title || 'Untitled'}” for good?`, message: inside ? `${inside} page${inside === 1 ? '' : 's'} inside will go with it.` : 'This cannot be undone.', confirmLabel: 'Delete forever', danger: true })) store.deleteForever(n.id); } }, 'Delete'))));
    }
  }
  const unsub = store.on('change', d => { if (!['block:update', 'recent', 'noop'].includes(d.type)) render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Trash', icon: 'trash' }] });
  return { destroy: unsub };
}
