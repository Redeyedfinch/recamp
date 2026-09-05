/**
 * Mail: consent, audience resolution, and rendering.
 * The consent rules here are the ones that keep the workspace lawful — they
 * are duplicated in apps/api/Mail.js, and both must stay strict.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../web/js/data/store.js';
import { buildSeed } from '../web/js/data/seed.js';
import { recipients, resolveAudience, describeAudience, isEmail } from '../web/js/mail/audience.js';
import { blocksToHtml, emailHtml, emailText, inline } from '../web/js/mail/render.js';

class MemAdapter {
  constructor() { this.data = null; this.kind = 'local'; }
  async load() { return this.data; } async save(s) { this.data = s; return { ok: true }; }
  async info() { return {}; } async clear() { this.data = null; }
}
async function fresh() { const s = new Store(new MemAdapter()); await s.init(); return s; }

/** Give a placeholder member an address and (optionally) consent. */
function subscribe(s, id, email, consent = true) {
  s.setProp(id, 'email', email);
  s.setProp(id, 'subscribed', consent);
}

test('seed ships members with no address and no consent', async () => {
  const s = await fresh();
  for (const m of s.records('db_members')) {
    assert.equal(m.props.email, '', `${m.title} should have no address`);
    assert.equal(m.props.subscribed, false, `${m.title} must not be pre-subscribed`);
  }
});

test('a member is mailable only with BOTH an address and consent', async () => {
  const s = await fresh();
  const [a, b, c, d] = s.records('db_members');
  subscribe(s, a.id, 'a@example.com', true);      // ok
  subscribe(s, b.id, 'b@example.com', false);     // address, no consent
  s.setProp(c.id, 'subscribed', true);            // consent, no address
  subscribe(s, d.id, 'not-an-email', true);       // malformed

  const { to, skipped } = recipients(s, { audience: 'all' });
  assert.deepEqual(to.map(r => r.email), ['a@example.com']);
  const reasons = Object.fromEntries(skipped.map(x => [x.name, x.reason]));
  assert.equal(reasons[s.node(b.id).title], 'not subscribed');
  assert.equal(reasons[s.node(c.id).title], 'no address');
  assert.equal(reasons[s.node(d.id).title], 'address looks wrong');
});

test('duplicate addresses are sent to once', async () => {
  const s = await fresh();
  const [a, b] = s.records('db_members');
  subscribe(s, a.id, 'same@example.com');
  subscribe(s, b.id, 'SAME@example.com');          // case-insensitive
  const { to, skipped } = recipients(s, { audience: 'all' });
  assert.equal(to.length, 1);
  assert.equal(skipped.find(x => x.reason === 'duplicate') !== undefined, true);
});

test('audiences resolve by role, team and explicit selection', async () => {
  const s = await fresh();
  const ms = s.records('db_members');
  s.setProp(ms[0].id, 'role', 'Core Committee');
  s.setProp(ms[1].id, 'role', 'Coordinator');
  s.setProp(ms[2].id, 'role', 'Faculty Coordinator');
  const team = s.records('db_teams')[0];
  s.setProp(ms[3].id, 'team', [team.id]);

  assert.deepEqual(resolveAudience(s, { audience: 'committee' }).map(m => m.id), [ms[0].id]);
  assert.deepEqual(resolveAudience(s, { audience: 'coordinators' }).map(m => m.id).sort(), [ms[1].id, ms[2].id].sort());
  assert.deepEqual(resolveAudience(s, { audience: 'team', team: [team.id] }).map(m => m.id), [ms[3].id]);
  assert.deepEqual(resolveAudience(s, { audience: 'people', people: [ms[4].id] }).map(m => m.id), [ms[4].id]);
  assert.equal(resolveAudience(s, { audience: 'all' }).length, ms.length);
  assert.match(describeAudience(s, { audience: 'team', team: [team.id] }), /^Team: /);
  assert.equal(describeAudience(s, { audience: 'people', people: [ms[0].id, ms[1].id] }), '2 selected people');
});

test('email validation accepts real addresses and rejects the usual mistakes', () => {
  for (const good of ['a@b.co', 'first.last@sub.example.in', 'x+tag@example.org']) assert.ok(isEmail(good), good);
  for (const bad of ['', 'plain', 'a@b', 'a b@c.com', 'a@b.com, c@d.com', '@b.com', 'a@.com']) assert.ok(!isEmail(bad), bad);
});

test('rendering strips scripts and unknown tags but keeps safe inline markup', () => {
  const dirty = 'Hello <b>bold</b> <script>alert(1)</script><img src=x onerror=y> <i>it</i> <a href="javascript:evil()">bad</a> <a href="https://ok.example">good</a>';
  const out = inline(dirty);
  assert.ok(!/script|onerror|<img/i.test(out), out);
  assert.ok(out.includes('<b>bold</b>') && out.includes('<i>it</i>'));
  assert.ok(!out.includes('javascript:'), 'javascript: href must be dropped');
  assert.ok(out.includes('href="https://ok.example"'));
});

test('blocks render to email HTML with no external assets', async () => {
  const s = await fresh();
  const html = blocksToHtml(s.blockTree('r_evt_gates_solace'));
  assert.ok(html.includes('Round I'), 'route stations should render');
  assert.ok(html.includes('Overview'), 'headings should render');
  assert.ok(!/<link|@import|class=/.test(html), 'email HTML must be inline-styled only');
});

test('the message carries per-recipient placeholders and an unsubscribe line', async () => {
  const s = await fresh();
  const html = emailHtml({ title: 'Gates of Solace', bodyHtml: '<p>Body</p>', recipientName: '{{FIRST_NAME}}', unsubUrl: '{{UNSUB_URL}}', workspace: s.meta.workspace });
  assert.ok(html.includes('{{FIRST_NAME}}'), 'greeting placeholder missing');
  assert.ok(html.includes('{{UNSUB_URL}}'), 'unsubscribe placeholder missing');
  assert.ok(/receiving this because/i.test(html), 'no explanation of why they got it');
  const text = emailText({ title: 'Gates of Solace', tree: s.blockTree('r_evt_gates_solace'), unsubUrl: '{{UNSUB_URL}}', workspace: s.meta.workspace });
  assert.ok(text.includes('Unsubscribe: {{UNSUB_URL}}'));
  assert.ok(!text.includes('<'), 'plain text must not contain markup');
});

test('a preview shows no unsubscribe link it cannot honour', async () => {
  const s = await fresh();
  const preview = emailHtml({ title: 'X', bodyHtml: '', recipientName: 'Member', unsubUrl: '', workspace: s.meta.workspace });
  assert.ok(!preview.includes('{{UNSUB_URL}}'));
  assert.ok(preview.includes('own unsubscribe link'), 'preview should say the link is per-recipient');
});

test('upgrading an older workspace adds Email and Subscribed to Members', async () => {
  const { mergeSeed } = await import('../web/js/data/store.js');
  const seed = buildSeed();
  const old = JSON.parse(JSON.stringify(seed));
  old.meta.seedVersion = 3;
  old.nodes.db_members.schema = old.nodes.db_members.schema.filter(p => !['email', 'subscribed'].includes(p.id));
  delete old.nodes.db_announcements;
  old.nodes.db_members.title = 'Our People';                    // a user rename must survive
  const out = mergeSeed(old, seed);
  assert.ok(out.nodes.db_members.schema.some(p => p.id === 'email'));
  assert.ok(out.nodes.db_members.schema.some(p => p.id === 'subscribed'));
  assert.equal(out.nodes.db_members.title, 'Our People');
  assert.ok(out.nodes.db_announcements, 'Announcements database should be added');
});
