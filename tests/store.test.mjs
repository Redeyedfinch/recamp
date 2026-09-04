import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, mergeSnapshots, mergeSeed } from '../web/js/data/store.js';
import { buildSeed } from '../web/js/data/seed.js';

class MemAdapter {
  constructor(initial = null) { this.data = initial; this.kind = 'local'; this.saves = 0; }
  async load() { return this.data ? JSON.parse(JSON.stringify(this.data)) : null; }
  async save(s) { this.data = JSON.parse(JSON.stringify(s)); this.saves++; return { ok: true }; }
  async info() { return { kind: 'local' }; }
  async clear() { this.data = null; }
}

async function fresh() { const s = new Store(new MemAdapter()); await s.init(); return s; }

test('seeds an empty adapter with the RECAMP workspace', async () => {
  const s = await fresh();
  assert.ok(s.node('p_about'));
  assert.equal(s.databases().length, 8);
  assert.equal(s.records('db_events').length, 8);
  assert.ok(s.blocks('r_evt_gates_solace').length > 5);
});

test('create → nest → move → reorder pages', async () => {
  const s = await fresh();
  const a = s.createNode({ title: 'Alpha' });
  const b = s.createNode({ title: 'Beta' });
  const c = s.createNode({ title: 'Gamma', parentId: a.id });
  assert.deepEqual(s.children(a.id).map(n => n.id), [c.id]);
  assert.deepEqual(s.path(c.id).map(n => n.title), ['Alpha', 'Gamma']);

  // move Gamma to root before Alpha
  assert.ok(s.moveNode(c.id, { parentId: 'root', before: a.id }));
  const roots = s.children('root').map(n => n.id);
  assert.ok(roots.indexOf(c.id) < roots.indexOf(a.id));

  // cannot move a page into its own descendant
  const d = s.createNode({ title: 'Delta', parentId: b.id });
  assert.equal(s.moveNode(b.id, { parentId: d.id }), false);
  assert.equal(s.moveNode(b.id, { parentId: b.id }), false);

  // a new page always gets one empty paragraph
  assert.equal(s.blocks(a.id).length, 1);
  assert.equal(s.blocks(a.id)[0].type, 'paragraph');
});

test('trash archives the subtree, restore brings it back, delete leaves a tombstone', async () => {
  const s = await fresh();
  const a = s.createNode({ title: 'Parent' });
  const c = s.createNode({ title: 'Child', parentId: a.id });
  s.toggleFavorite(a.id);
  s.trashNode(a.id);
  assert.equal(s.node(a.id).archived, true);
  assert.equal(s.node(c.id).archived, true);
  assert.equal(s.trashed().length, 1, 'only the root of the trashed subtree is listed');
  assert.equal(s.isFavorite(a.id), false);
  assert.equal(s.children('root').some(n => n.id === a.id), false);

  s.restoreNode(a.id);
  assert.equal(s.node(a.id).archived, false);
  assert.equal(s.node(c.id).archived, false);

  s.trashNode(a.id); s.deleteForever(a.id);
  assert.equal(s.node(a.id), null);
  assert.equal(s.state.nodes[a.id].deleted, true, 'tombstone kept for merge safety');
  assert.equal(s.blocks(c.id).length, 0);
});

test('restoring a page whose parent is still in trash re-homes it at root', async () => {
  const s = await fresh();
  const a = s.createNode({ title: 'Parent' });
  const c = s.createNode({ title: 'Child', parentId: a.id });
  s.trashNode(c.id);            // child trashed on its own …
  s.trashNode(a.id);            // … then the parent
  s.restoreNode(c.id);
  assert.equal(s.node(c.id).parentId, 'root');
  assert.equal(s.node(a.id).archived, true, 'parent stays in trash');
  assert.ok(!s.children('root').some(n => n.id === a.id));

  // deleting a parent forever takes separately-trashed children with it
  s.deleteForever(a.id);
  assert.equal(s.state.nodes[a.id].deleted, true);
});

test('records belong to a database wherever they sit in the tree', async () => {
  const s = await fresh();
  const gates = s.node('r_evt_gates_solace');
  assert.equal(gates.parentId, 'r_evt_nexus_2026');
  assert.ok(s.records('db_events').some(r => r.id === gates.id));
  const r = s.createNode({ kind: 'record', databaseId: 'db_events', title: 'Test event', props: { status: 'Planning' } });
  assert.equal(r.parentId, 'db_events');
  assert.ok(r.seq > 8);
  s.setProp(r.id, 'status', 'Confirmed');
  assert.equal(s.activity(1)[0].type, 'STATUS CHANGED');
});

test('tasks keep done and status in step', async () => {
  const s = await fresh();
  const t = s.records('db_tasks')[0];
  s.setProp(t.id, 'done', true);
  assert.equal(s.node(t.id).props.status, 'Done');
  s.setProp(t.id, 'status', 'In progress');
  assert.equal(s.node(t.id).props.done, false);
  assert.ok(s.activity(5).some(a => a.type === 'TASK COMPLETED'));
});

test('blocks: create after, nest, move, delete cascades', async () => {
  const s = await fresh();
  const p = s.createNode({ title: 'Doc' });
  const [first] = s.blocks(p.id);
  const b2 = s.createBlock({ nodeId: p.id, type: 'h2', text: 'Section', after: first.id });
  const b3 = s.createBlock({ nodeId: p.id, type: 'bullet', text: 'one', after: b2.id });
  const b4 = s.createBlock({ nodeId: p.id, type: 'bullet', text: 'two', after: b3.id });
  assert.deepEqual(s.childBlocks(p.id, p.id).map(b => b.id), [first.id, b2.id, b3.id, b4.id]);

  s.moveBlock(b4.id, { parentId: b3.id });           // indent under b3
  assert.deepEqual(s.blockList(p.id).map(x => x.depth), [0, 0, 0, 1]);
  assert.equal(s.moveBlock(b3.id, { parentId: b4.id }), false, 'no cycles');

  s.moveBlock(b2.id, { parentId: p.id, before: first.id });
  assert.equal(s.childBlocks(p.id, p.id)[0].id, b2.id);

  s.deleteBlock(b3.id);
  assert.equal(s.block(b4.id), null, 'children go with their parent');
  assert.equal(s.siblingInDocument(p.id, b2.id, 1).id, first.id);
});

test('search ranks title matches above body matches and groups by kind', async () => {
  const s = await fresh();
  const r = s.search('gates');
  assert.equal(r[0].node.id, 'r_evt_gates_solace');
  const body = s.search('treasure hunt');
  assert.ok(body.some(x => x.node.id === 'r_evt_gates_solace' && x.snippet.toLowerCase().includes('treasure')));
  assert.equal(s.search('').length, 0);
  assert.equal(s.search('zzzzqqq').length, 0);
});

test('activity coalesces repeated edits to one page', async () => {
  const s = await fresh();
  const p = s.createNode({ title: 'Notes' });
  const n0 = s.state.activity.length;
  const [b] = s.blocks(p.id);
  s.updateBlock(b.id, { text: 'a' }); s.updateBlock(b.id, { text: 'ab' }); s.updateBlock(b.id, { text: 'abc' });
  assert.equal(s.state.activity.length, n0 + 1);
});

test('favorites and recent', async () => {
  const s = await fresh();
  s.toggleFavorite('p_guide');
  assert.ok(s.favorites().some(n => n.id === 'p_guide'));
  s.toggleFavorite('p_guide');
  assert.ok(!s.favorites().some(n => n.id === 'p_guide'));
  s.touchRecent('p_guide'); s.touchRecent('p_about'); s.touchRecent('p_guide');
  assert.deepEqual(s.recent().slice(0, 2).map(n => n.id), ['p_guide', 'p_about']);
});

test('snapshot round-trips through the adapter', async () => {
  const mem = new MemAdapter();
  const s = new Store(mem); await s.init();
  const p = s.createNode({ title: 'Persisted' });
  await s.flushNow();
  const s2 = new Store(mem); await s2.init();
  assert.equal(s2.node(p.id).title, 'Persisted');
});

test('mergeSnapshots: last write wins per record, tombstones survive, activity unions', async () => {
  const seed = buildSeed();
  const a = JSON.parse(JSON.stringify(seed)), b = JSON.parse(JSON.stringify(seed));
  a.nodes.p_about.title = 'A edit'; a.nodes.p_about.updatedAt = '2026-09-02T00:00:00.000Z'; a.savedAt = '2026-09-02T00:00:01.000Z';
  b.nodes.p_about.title = 'B edit'; b.nodes.p_about.updatedAt = '2026-09-03T00:00:00.000Z'; b.savedAt = '2026-09-03T00:00:01.000Z';
  b.nodes.p_guide.deleted = true; b.nodes.p_guide.updatedAt = '2026-09-03T00:00:00.000Z';
  a.activity.unshift({ id: 'a_x', at: '2026-09-02T00:00:00.000Z', type: 'PAGE UPDATED', nodeId: 'p_about', title: 'A', detail: '' });
  const m = mergeSnapshots(a, b);
  assert.equal(m.nodes.p_about.title, 'B edit');
  assert.equal(m.nodes.p_guide.deleted, true);
  assert.ok(m.activity.some(e => e.id === 'a_x'));
  assert.equal(m.savedAt, b.savedAt);
});

test('mergeSeed adds new seed nodes without touching user edits', async () => {
  const seed = buildSeed();
  const snap = JSON.parse(JSON.stringify(seed));
  snap.nodes.p_about.title = 'Renamed by user';
  delete snap.nodes.p_guide;
  snap.meta.seedVersion = 1;
  const out = mergeSeed(snap, seed);
  assert.equal(out.nodes.p_about.title, 'Renamed by user');
  assert.ok(out.nodes.p_guide);
  assert.equal(out.meta.seedVersion, seed.meta.seedVersion);
});
