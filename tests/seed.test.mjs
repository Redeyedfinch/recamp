/**
 * Provenance invariants. These tests are the guard against invented facts:
 * a sourced record may only say what the brief said.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../web/js/data/seed.js';
import { DATABASES } from '../web/js/data/schema.js';

const seed = buildSeed();
const nodes = Object.values(seed.nodes);
const records = nodes.filter(n => n.kind === 'record');

// The only facts the brief supplies. Anything else about RECAMP must be demo.
const SOURCED_EVENTS = {
  'Chandrayaan-3 Model Exhibition': { year: 2023, exact: null },
  'Cosmic Conversations · AXIOM-4 Round Table': { year: 2025, exact: null },
  "Freshers' Orientation 2025": { year: 2025, exact: null },
  'Mini Olympics 2.0': { year: 2025, exact: null },
  'The Code of Conflict': { year: 2025, exact: null },
  'NEXUS 2026': { year: 2026, exact: null },
  'Gates of Solace': { year: 2026, exact: '2026-02-09' },
  'Higher Education Guest Lecture': { year: null, exact: null },
};

test('every seeded event is one of the eight documented activities, and no more', () => {
  const events = records.filter(r => r.databaseId === 'db_events');
  assert.deepEqual(events.map(e => e.title).sort(), Object.keys(SOURCED_EVENTS).sort());
  for (const e of events) assert.equal(e.provenance, 'sourced', e.title);
});

test('sourced events never carry a date more precise than the brief gave', () => {
  for (const e of records.filter(r => r.databaseId === 'db_events')) {
    const want = SOURCED_EVENTS[e.title];
    if (want.exact) { assert.equal(e.props.date, want.exact); assert.equal(e.dateConfidence, 'exact'); }
    else {
      assert.equal(e.props.date, '', `${e.title} must not have an exact date`);
      assert.equal(e.dateConfidence, want.year ? 'year' : 'unavailable');
      if (want.year) assert.equal(e.props.year, want.year); else assert.equal(e.props.year, undefined);
    }
  }
});

test('no real people: every member is a labelled placeholder', () => {
  const members = records.filter(r => r.databaseId === 'db_members');
  assert.ok(members.length > 0);
  for (const m of members) {
    assert.equal(m.provenance, 'demo');
    assert.match(m.title, /placeholder/i);
    assert.equal(m.props.profile_image, undefined);
  }
});

test('teams, resources, research and meeting notes are all marked demo', () => {
  for (const dbId of ['db_teams', 'db_resources', 'db_research', 'db_meetings']) {
    const rs = records.filter(r => r.databaseId === dbId);
    assert.ok(rs.length > 0, dbId);
    for (const r of rs) assert.equal(r.provenance, 'demo', `${dbId}: ${r.title}`);
  }
});

test('nothing in the seed asserts statistics, sponsors, awards or testimonials', () => {
  const text = JSON.stringify(seed).toLowerCase();
  for (const banned of ['sponsor', 'award', 'testimonial', 'followers', 'participants attended', 'winner']) {
    assert.ok(!text.includes(banned), `seed mentions "${banned}"`);
  }
});

test('every record points at a real database and every block at a real node', () => {
  for (const r of records) assert.ok(seed.nodes[r.databaseId]?.kind === 'database', r.title);
  for (const b of Object.values(seed.blocks)) assert.ok(seed.nodes[b.nodeId], b.id);
  for (const n of nodes) if (n.parentId !== 'root') assert.ok(seed.nodes[n.parentId], `${n.title} parent`);
});

test('database schemas match their definitions and select values are valid options', () => {
  for (const [id, def] of Object.entries(DATABASES)) {
    const db = seed.nodes[id];
    assert.deepEqual(db.schema.map(p => p.id), def.schema.map(p => p.id));
    for (const r of records.filter(r => r.databaseId === id)) {
      for (const p of db.schema.filter(p => p.type === 'select')) {
        const v = r.props[p.id];
        if (v) assert.ok(p.options.some(o => o.name === v), `${r.title}.${p.id} = ${v}`);
      }
    }
  }
});

test('all catalogue numbers are unique within a database', () => {
  for (const id of Object.keys(DATABASES)) {
    const seqs = records.filter(r => r.databaseId === id).map(r => r.seq);
    assert.equal(new Set(seqs).size, seqs.length, id);
  }
});
