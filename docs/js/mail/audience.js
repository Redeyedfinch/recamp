/**
 * Who receives a message.
 *
 * Consent is not a UI concern: a member is mailable only if they have an
 * address AND `subscribed === true`. The same rule is enforced again in
 * apps/api/Mail.js, because a client can be edited and the backend cannot
 * trust it. Nothing here invents an address.
 */
import { arr } from '../data/store.js';

export const AUDIENCES = [
  { id: 'all', name: 'All subscribed members' },
  { id: 'committee', name: 'Core Committee' },
  { id: 'coordinators', name: 'Coordinators' },
  { id: 'team', name: 'A team' },
  { id: 'people', name: 'Selected people' },
];

/** RFC-ish enough to catch typos without rejecting valid addresses. */
export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;
export const isEmail = v => EMAIL_RE.test(String(v || '').trim());

/**
 * Resolve a record's audience to member nodes, before consent is applied.
 * `audience` / `team` / `people` come from the announcement's own properties.
 */
export function resolveAudience(store, { audience = 'all', team = [], people = [] } = {}) {
  const members = store.records('db_members');
  switch (audience) {
    case 'committee': return members.filter(m => m.props.role === 'Core Committee');
    case 'coordinators': return members.filter(m => ['Coordinator', 'Faculty Coordinator'].includes(m.props.role));
    case 'team': { const ids = arr(team); return members.filter(m => arr(m.props.team).some(t => ids.includes(t))); }
    case 'people': { const ids = arr(people); return members.filter(m => ids.includes(m.id)); }
    default: return members;
  }
}

/**
 * Split an audience into who can be mailed and who cannot, with the reason.
 * The UI shows both — a silent drop is how people quietly stop being told things.
 */
export function recipients(store, props) {
  const audience = resolveAudience(store, props);
  const to = [], skipped = [];
  const seen = new Set();
  for (const m of audience) {
    const email = String(m.props.email || '').trim().toLowerCase();
    const name = m.title || '';
    if (!email) { skipped.push({ id: m.id, name, reason: 'no address' }); continue; }
    if (!isEmail(email)) { skipped.push({ id: m.id, name, email, reason: 'address looks wrong' }); continue; }
    if (m.props.subscribed !== true) { skipped.push({ id: m.id, name, email, reason: 'not subscribed' }); continue; }
    if (seen.has(email)) { skipped.push({ id: m.id, name, email, reason: 'duplicate' }); continue; }
    seen.add(email);
    to.push({ id: m.id, name, email });
  }
  return { to, skipped };
}

/** One-line description of who a message goes to, for the record and the log. */
export function describeAudience(store, props) {
  const a = AUDIENCES.find(x => x.id === (props.audience || 'all'))?.name || 'All subscribed members';
  if (props.audience === 'team') { const names = arr(props.team).map(id => store.node(id)?.title).filter(Boolean); return names.length ? `Team: ${names.join(', ')}` : 'A team (none chosen)'; }
  if (props.audience === 'people') { const n = arr(props.people).length; return `${n} selected ${n === 1 ? 'person' : 'people'}`; }
  return a;
}
