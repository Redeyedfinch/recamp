/** Settings — profile, appearance, storage (local ↔ Google Sheets), data. */
import { h, icon } from '../core/dom.js';
import { fmtStamp } from '../core/dates.js';
import { confirm } from '../ui/dialog.js';
import { CloudAdapter } from '../data/adapters/cloud.js';
import { viewhead } from './common.js';

export function mount(ctx, host) {
  const { store } = ctx;
  const view = h('div.view'); host.append(view);
  let status = null;

  function section(title, desc, ...body) { return h('section.settings__section', h('div', h('h2', title), h('p', desc)), h('div.settings__body', ...body)); }

  function render() {
    view.replaceChildren();
    const user = store.meta.user || {}; const cloud = store.setting('cloud', null); const sync = ctx.syncState();
    view.append(viewhead({ kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'SETTINGS')], title: 'Settings', desc: 'Who you are here, how it looks, and where the workspace lives.' }));

    /* profile */
    const name = h('input.input', { type: 'text', value: user.name || '', placeholder: 'Your name, as it should appear in the log', onchange: () => store.setMeta({ user: { ...user, name: name.value.trim() } }) });
    view.append(section('Profile', 'Your name is stamped on activity entries. Nothing else is collected.', h('div.field', h('span.label', 'Display name'), name),
      user.email ? h('div.settings__row', h('span.t-secondary', `Signed in with Google as ${user.email}`), h('button.btn.btn--sm', { type: 'button', onclick: () => store.setMeta({ user: { id: 'me', name: user.name } }) }, icon('logout'), 'Sign out')) : null));

    /* appearance */
    const theme = store.setting('theme', 'dark');
    view.append(section('Appearance', 'Dark is the observatory; light is the laboratory notebook. System follows your device.',
      h('div.theme-swatches', [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']].map(([k, l]) => h('button.swatch', { type: 'button', class: `swatch--${k}`, 'aria-pressed': String(theme === k), 'aria-label': `${l} theme`, onclick: () => ctx.theme.set(k) }, l))),
      h('div.settings__row', h('span', 'Reduced motion'), h('span.t-faint', { style: { fontSize: 'var(--fs-small)' } }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 'On — following your system setting' : 'Following your system setting'))));

    /* storage */
    const url = h('input.input', { type: 'url', value: cloud?.url || '', placeholder: 'https://script.google.com/macros/s/…/exec' });
    const token = h('input.input', { type: 'password', value: cloud?.token || '', placeholder: 'Access token printed by setup()', autocomplete: 'off' });
    const statusEl = h('div.settings__status',
      h('div.status', h('span.node', { 'data-tone': sync.kind === 'cloud' ? (sync.ok === false ? 'rust' : 'sage') : 'celestial' }), sync.kind === 'cloud' ? (sync.ok === false ? `Sync error — ${sync.error || 'unreachable'}` : `Synced to Google Sheets${sync.at ? ` · ${fmtStamp(sync.at)}` : ''}`) : 'Stored in this browser only'),
      h('span', sync.kind === 'cloud' ? 'Changes save here first, then merge into the Sheet a few seconds later. Other devices with the same URL and token see them on their next load.' : 'Nothing leaves this device. Connect a backend to share the workspace with the committee.'),
      status ? h('span', status) : null);
    const connect = h('button.btn.btn--primary', { type: 'button', onclick: async () => {
      const u = url.value.trim(), t = token.value.trim(); if (!/^https:\/\/script\.google\.com\//.test(u)) { status = 'The URL should be an Apps Script /exec address.'; render(); return; }
      status = 'Connecting…'; render();
      const adapter = new CloudAdapter({ url: u, token: t });
      const ok = await adapter.ping();
      if (!ok) { status = 'No answer from that URL. Is the web app deployed with access set to Anyone?'; render(); return; }
      store.setSetting('cloud', { url: u, token: t });
      const r = await store.attachCloud(adapter);
      status = r?.ok === false ? `Connected, but the first save failed: ${r.error}` : 'Connected. The workspace is now shared through the Sheet.';
      ctx.toast(status); render();
    } }, icon('cloud'), cloud ? 'Reconnect' : 'Connect');
    const disconnect = cloud ? h('button.btn', { type: 'button', onclick: async () => { if (await confirm({ title: 'Disconnect from Google Sheets?', message: 'This device keeps its copy; the Sheet keeps what was synced. Reconnect any time.', confirmLabel: 'Disconnect' })) { store.setSetting('cloud', null); store.detachCloud(); status = null; render(); } } }, 'Disconnect') : null;
    view.append(section('Storage', 'The workspace is a single document. It lives in this browser, and optionally in a Google Sheet the forum owns through the Apps Script backend in apps/api.',
      statusEl,
      h('div.field', h('span.label', 'Apps Script web app URL'), url),
      h('div.field', h('span.label', 'Access token'), token, h('span.field__hint', 'Deploy apps/api, run setup() once, copy the token from the log. See apps/api/README.md.')),
      h('div.row', connect, disconnect)));

    /* mail */
    const members = store.records('db_members');
    const mailable = members.filter(m => String(m.props.email || '').trim() && m.props.subscribed === true).length;
    const withAddress = members.filter(m => String(m.props.email || '').trim()).length;
    const fromName = h('input.input', { type: 'text', value: store.setting('mailFromName', store.meta.workspace?.name || 'RECAMP'), placeholder: 'RECAMP', onchange: () => store.setSetting('mailFromName', fromName.value.trim()) });
    const replyTo = h('input.input', { type: 'email', value: store.setting('mailReplyTo', ''), placeholder: 'committee@example.com', onchange: () => store.setSetting('mailReplyTo', replyTo.value.trim()) });
    const footer = h('input.input', { type: 'text', value: store.setting('mailFooter', ''), placeholder: 'e.g. RECAMP · School of Sciences, Jain (Deemed-to-be University)', onchange: () => store.setSetting('mailFooter', footer.value.trim()) });
    const mailStatus = h('div.settings__status',
      h('div.status', h('span.node', { 'data-tone': mailable ? 'sage' : 'stellar' }), `${mailable} of ${members.length} members can be emailed`),
      h('span', withAddress > mailable
        ? `${withAddress - mailable} ${withAddress - mailable === 1 ? 'has an address but has' : 'have addresses but have'} not ticked Subscribed, so they are never mailed.`
        : 'A member is mailable only with an address and Subscribed ticked.'),
      cloud ? null : h('span', 'Sending needs the Apps Script backend — connect it above.'));
    view.append(section('Email', 'Announcements go out through the Apps Script deployment, using the Google account that owns it. Consent is checked again on the server, and every send is logged to the Sheet.',
      mailStatus,
      h('div.field', h('span.label', 'Sender name'), fromName),
      h('div.field', h('span.label', 'Reply-to address'), replyTo, h('span.field__hint', 'Where replies land. Leave blank to use the sending account.')),
      h('div.field', h('span.label', 'Footer line'), footer, h('span.field__hint', 'Appears above the unsubscribe link in every message.')),
      h('div.row', { style: { flexWrap: 'wrap' } },
        h('a.btn', { href: '#/db/db_announcements' }, icon('signal'), 'Announcements'),
        h('button.btn', { type: 'button', disabled: !cloud, onclick: async () => {
          try { const q = await store.cloud.mailQuota(); ctx.toast(`${q.remaining} messages left in today's quota.`); }
          catch (e) { ctx.toast(`Could not read the quota — ${e.message}`); }
        } }, icon('signal'), 'Check quota'),
        h('button.btn', { type: 'button', disabled: !cloud, onclick: async () => {
          try {
            const r = await store.cloud.mailLog(50);
            const list = r.entries || [];
            const { dialog: dlg } = await import('../ui/dialog.js');
            dlg({ title: 'Sending log', wide: true, body: list.length
              ? h('div.list', list.map(e => h('div.list__row', { style: { gridTemplateColumns: '1fr auto' } },
                  h('div', h('div.list__title', e.subject || '(no subject)'), h('div.list__sub', `${e.email} · ${e.status}${e.error ? ` — ${e.error}` : ''}`)),
                  h('span.coord', fmtStamp(e.at).toUpperCase()))))
              : 'Nothing has been sent yet.', actions: [{ label: 'Close', primary: true }] });
          } catch (e) { ctx.toast(`Could not read the log — ${e.message}`); }
        } }, icon('archive'), 'Sending log')),
      h('p.t-faint', { style: { fontSize: 'var(--fs-small)' } }, 'Addresses are personal data under the DPDP Act 2023. Collect them with consent, keep them only while the member is in the forum, and remove anyone who asks — the unsubscribe link in every message does it automatically.')));

    /* data */
    const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => { const f = file.files[0]; if (!f) return; try { const snap = JSON.parse(await f.text()); if (!snap.nodes) throw new Error('not a workspace file'); if (await confirm({ title: 'Import workspace?', message: 'Records in the file merge with what is here; the newer version of each record wins.', confirmLabel: 'Import' })) { const { mergeSnapshots } = await import('../data/store.js'); store.hydrate(mergeSnapshots(store.snapshot(), snap)); store.persist(); ctx.toast('Workspace imported'); } } catch (e) { ctx.toast(`Could not import: ${e.message}`); } file.value = ''; } });
    const counts = { nodes: store.allNodes().length, blocks: Object.values(store.state.blocks).filter(b => !b.deleted).length, activity: store.state.activity.length };
    view.append(section('Data', `${counts.nodes} pages and records, ${counts.blocks} blocks, ${counts.activity} log entries.`,
      h('div.row', { style: { flexWrap: 'wrap' } },
        h('button.btn', { type: 'button', onclick: () => { const blob = new Blob([JSON.stringify(store.snapshot(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `recamp-workspace-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); } }, icon('download'), 'Export JSON'),
        h('button.btn', { type: 'button', onclick: () => file.click() }, icon('upload'), 'Import JSON'), file,
        h('button.btn.btn--danger', { type: 'button', onclick: async () => { if (await confirm({ title: 'Reset this browser\'s copy?', message: 'Everything stored here is replaced with the original seed. A connected Sheet is not touched. Export first if in doubt.', confirmLabel: 'Reset', danger: true })) { await store.adapter.clear(); location.reload(); } } }, 'Reset to seed')),
      h('p.t-faint', { style: { fontSize: 'var(--fs-small)' } }, 'Keep an export somewhere the next committee can find it at handover.')));

    /* about */
    const build = document.querySelector('meta[name="recamp-build"]')?.content || 'development';
    view.append(section('About', 'RECAMP Observatory — the workspace of the Physical Science Forum.',
      h('div.stack', { style: { '--stack': '6px', fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' } },
        h('div', h('span.label', 'BUILD '), h('code', build)), h('div', h('span.label', 'SOURCE '), h('a', { href: 'https://github.com/Redeyedfinch/recamp', target: '_blank', rel: 'noopener' }, 'github.com/Redeyedfinch/recamp')),
        h('div', h('span.label', 'TYPE '), 'Instrument Serif · IBM Plex Sans · IBM Plex Mono'), h('div', h('span.label', 'STACK '), 'Static ES modules · Google Apps Script · Google Sheets'))));
  }
  const unsub = store.on('change', d => { if (['setting', 'meta', 'hydrate'].includes(d.type)) render(); });
  const unsub2 = store.on('sync', () => render());
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Settings', icon: 'settings' }] });
  return { destroy() { unsub(); unsub2(); } };
}
