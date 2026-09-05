/**
 * Compose and send an announcement.
 *
 * Sending mail is irreversible and leaves the workspace, so the dialog is the
 * confirmation: it names the audience, counts the recipients, shows who is
 * being left out and why, reports the remaining daily quota, and puts the
 * number in the button. Nothing is sent by a single stray click.
 */
import { h, icon, clear } from '../core/dom.js';
import { fmtDate } from '../core/dates.js';
import { dialog, confirm } from './dialog.js';
import { toast } from './toast.js';
import { recipients, describeAudience } from '../mail/audience.js';
import { composeFromRecord, emailHtml, emailText } from '../mail/render.js';
import { arr } from '../data/store.js';

/** Build the message for a record, with per-recipient placeholders left in. */
export function buildMessage(store, node) {
  const event = arr(node.props?.event).map(id => store.node(id))[0] || null;
  const { subject, title, intro, tree, meta, bodyHtml } = composeFromRecord(store, node, { event });
  const workspace = store.meta.workspace || {};
  const footerNote = store.setting('mailFooter', '');
  const kicker = node.props?.kind === 'Reminder' ? 'Reminder' : event ? 'Event' : 'Announcement';
  return {
    subject: subject || title,
    html: emailHtml({ title, kicker, intro, bodyHtml, meta, recipientName: '{{FIRST_NAME}}', unsubUrl: '{{UNSUB_URL}}', footerNote, workspace }),
    text: emailText({ title, intro, tree, meta, unsubUrl: '{{UNSUB_URL}}', workspace }),
    previewHtml: emailHtml({ title, kicker, intro, bodyHtml, meta, recipientName: 'Member', unsubUrl: '', footerNote, workspace }),
  };
}

export async function openCompose(ctx, nodeId) {
  const { store } = ctx;
  const node = store.node(nodeId);
  if (!node) return;
  const cloud = store.cloud;
  const msg = buildMessage(store, node);
  const { to, skipped } = recipients(store, node.props || {});
  const audience = describeAudience(store, node.props || {});

  let quota = null;
  if (cloud) { try { const q = await cloud.mailQuota(); quota = q.remaining; } catch { quota = null; } }

  const body = h('div.compose');

  /* who it goes to */
  const count = to.length;
  body.append(h('div.compose__to',
    h('div.row.row--between', h('span.label', 'Audience'), h('span.coord', audience.toUpperCase())),
    h('div.compose__count', count ? `${count} recipient${count === 1 ? '' : 's'}` : 'Nobody can be mailed yet',
      h('span.compose__countsub', count ? ' with an address and consent' : '')),
    to.length ? h('div.compose__chips', to.slice(0, 8).map(r => h('span.tag.tag--soft', r.name || r.email)), to.length > 8 ? h('span.pv__more', `+${to.length - 8} more`) : null) : null));

  if (skipped.length) {
    const reasons = {};
    for (const s of skipped) reasons[s.reason] = (reasons[s.reason] || 0) + 1;
    body.append(h('details.compose__skipped',
      h('summary', `${skipped.length} member${skipped.length === 1 ? '' : 's'} will not receive this — ${Object.entries(reasons).map(([r, n]) => `${n} ${r}`).join(', ')}`),
      h('ul.compose__skiplist', skipped.map(s => h('li', h('span', s.name || 'Untitled'), h('span.t-faint', ` — ${s.reason}`))))));
  }

  /* subject */
  const subjectInput = h('input.input', { id: 'compose-subject', type: 'text', value: msg.subject, placeholder: 'Subject line', 'aria-describedby': 'compose-subject-hint' });
  body.append(h('div.field', h('label.label', { for: 'compose-subject' }, 'Subject'), subjectInput,
    h('span.field__hint#compose-subject-hint', 'Shown in the inbox. The page title is used if you leave it as is.')));

  /* quota / backend state */
  if (!cloud) {
    body.append(h('div.compose__warn', icon('cloud'),
      h('div', h('b', 'No backend connected.'), ' Mail is sent by the Apps Script deployment, not the browser. Connect a Google Sheet under Settings → Storage, then run ', h('code', 'setup()'), ' once, and this becomes live.')));
  } else if (quota !== null) {
    const short = quota < count;
    body.append(h('div.compose__quota', { class: short ? 'compose__warn' : '' }, icon(short ? 'info' : 'signal'),
      h('div', short
        ? h('span', h('b', `Only ${quota} messages left in today's quota`), ` — ${count} are needed. Nothing will be sent; try a smaller group, or tomorrow.`)
        : h('span', `${quota} messages left in today's sending quota.`))));
  }

  /* preview */
  const frame = h('iframe.compose__preview', { title: 'Email preview', sandbox: '', srcdoc: msg.previewHtml, loading: 'lazy' });
  body.append(h('div.field', h('span.label', 'Preview'), frame,
    h('span.field__hint', 'Each recipient is greeted by name and gets their own unsubscribe link.')));

  const canSend = !!cloud && count > 0 && (quota === null || quota >= count);
  const result = await dialog({
    title: `Send to ${audience.toLowerCase()}`,
    body, wide: true,
    actions: [
      { label: 'Cancel', value: null },
      !cloud ? { label: 'Open Settings', value: 'settings' } : null,
      { label: count ? `Send to ${count}` : 'Send', primary: true, onClick: async () => {
        if (!canSend) { toast(!cloud ? 'Connect a backend first (Settings → Storage).' : count ? 'Not enough sending quota left today.' : 'No recipient has both an address and consent.'); return false; }
        const subject = subjectInput.value.trim();
        if (!subject) { subjectInput.focus(); toast('Add a subject line.'); return false; }
        if (!(await confirm({ title: `Send “${subject}” to ${count} ${count === 1 ? 'person' : 'people'}?`, message: 'Email cannot be recalled once it leaves. Everyone listed will receive it immediately.', confirmLabel: `Send to ${count}` }))) return false;
        return { subject };
      } },
    ].filter(Boolean),
  });

  if (result === 'settings') { ctx.router.go('/settings'); return; }
  if (!result) return;

  await send(ctx, node, { ...msg, subject: result.subject }, to);
}

async function send(ctx, node, msg, to) {
  const { store } = ctx;
  store.setProp(node.id, 'status', 'Sending');
  const dismiss = toast(`Sending to ${to.length}…`, { duration: 60000 });
  try {
    const r = await store.cloud.mailSend({
      announcementId: node.id, subject: msg.subject, html: msg.html, text: msg.text,
      recipients: to.map(x => ({ id: x.id, name: x.name, email: x.email })),
      fromName: store.setting('mailFromName', store.meta.workspace?.name || 'RECAMP'),
      replyTo: store.setting('mailReplyTo', ''),
    });
    dismiss?.();
    if (!r.ok) { store.setProp(node.id, 'status', 'Failed'); toast(`Not sent — ${r.error}`, { duration: 9000 }); return; }
    store.updateNode(node.id, { props: { ...node.props, status: r.failed?.length ? 'Failed' : 'Sent', subject: msg.subject, sent_at: new Date().toISOString().slice(0, 10), sent_count: r.sent } });
    store.log('ANNOUNCEMENT SENT', { nodeId: node.id, title: node.title || msg.subject, detail: `${r.sent} recipient${r.sent === 1 ? '' : 's'}${r.failed?.length ? `, ${r.failed.length} failed` : ''}` });
    store.persist();
    toast(r.failed?.length ? `Sent to ${r.sent}; ${r.failed.length} failed.` : `Sent to ${r.sent}.`, { duration: 7000 });
  } catch (e) {
    dismiss?.();
    store.setProp(node.id, 'status', 'Failed');
    toast(`Could not reach the backend — ${e.message}`, { duration: 9000 });
  }
}

/** "Email members" on an event: make a linked draft and open it. */
export function announceEvent(ctx, event) {
  const { store } = ctx;
  const dateLabel = event.props.date ? fmtDate(event.props.date) : (event.dateConfidence === 'year' && event.props.year ? `${event.props.year}` : 'date to be confirmed');
  const draft = store.createNode({
    kind: 'record', databaseId: 'db_announcements', title: event.title || 'Untitled event', icon: 'signal',
    props: { status: 'Draft', kind: 'Event', subject: `${event.title || 'RECAMP event'} — ${dateLabel}`, intro: '', audience: 'All subscribed members', team: [], people: [], event: [event.id], sent_at: '', sent_count: '' },
    blocks: [
      { type: 'paragraph', text: event.props.description || '' },
      { type: 'h2', text: 'What to expect' },
      { type: 'paragraph', text: '' },
      { type: 'h2', text: 'How to take part' },
      { type: 'paragraph', text: event.props.registration ? `Register here: <a href="${event.props.registration}">${event.props.registration}</a>` : '' },
    ],
  });
  ctx.openNode(draft.id, { focusTitle: false });
  toast('Draft created. Write the message, then press Send.', { duration: 6000 });
  return draft;
}
