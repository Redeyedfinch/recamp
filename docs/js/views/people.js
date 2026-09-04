/** Members and Committee — the Members database, framed. */
import { h } from '../core/dom.js';
import { mountDatabase } from './database.js';

export function mountMembers(ctx, host) {
  return mountDatabase(ctx, host, 'db_members', { viewId: 'v_gallery', kicker: h('span.prov', { 'data-prov': 'demo' }, 'placeholders until real profiles are added') });
}

export function mountCommittee(ctx, host) {
  const { store } = ctx;
  const db = store.db('db_members');
  if (db && !db.views.some(v => v.id === 'v_committee')) db.views.push({ id: 'v_committee', name: 'Committee', type: 'gallery', filters: [], sorts: [], hidden: [] });
  return mountDatabase(ctx, host, 'db_members', {
    viewId: 'v_committee', lockedView: 'v_committee', title: 'Committee',
    fixedFilters: [{ prop: 'role', op: 'in', value: ['Core Committee', 'Coordinator', 'Faculty Coordinator'] }],
    kicker: h('span.label', 'ROLE · CORE COMMITTEE, COORDINATOR, FACULTY COORDINATOR'),
  });
}
