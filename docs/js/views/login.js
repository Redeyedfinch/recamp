/**
 * Enter — a dark observatory field. No marketing, no illustration.
 * "Enter workspace" opens the local workspace. "Sign in with Google" uses
 * Google Identity Services when a client id is configured, and otherwise
 * explains what to configure — it is never a dead button.
 */
import { h, icon } from '../core/dom.js';
import { sessionLabel, fmtDate } from '../core/dates.js';
import { mountStarfield } from '../ui/starfield.js';
import { mountOrrery } from '../ui/orrery.js';
import { dialog } from '../ui/dialog.js';

export function mount(ctx, host) {
  const { store } = ctx;
  const ws = store.meta.workspace || {};
  const orr = h('div.login__orrery');
  const field = h('div.login__field.grid-surface', h('div.marks', h('span.mark.mark--tl', h('b', 'RECAMP OBSERVATORY')), h('span.mark.mark--tr', sessionLabel())), orr);
  const animate = store.setting('motion', 'on') !== 'off';
  const clientId = store.setting('googleClientId', '');
  const google = h('button.btn.btn--lg.btn--wide', { type: 'button', onclick: () => clientId ? signIn(clientId) : explain() }, icon('user'), 'Sign in with Google');
  const box = h('div.login__box',
    h('h1.login__name', ws.name || 'RECAMP'),
    h('div.login__desc.label.label--ink', (ws.descriptor || 'The Physical Science Forum').toUpperCase()),
    h('div.login__inst.label', 'JAIN SCHOOL OF SCIENCES · BENGALURU'),
    h('div.login__actions', h('button.btn.btn--primary.btn--lg.btn--wide', { type: 'button', onclick: enter }, 'Enter workspace', icon('arrowR')), google));
  const epoch = `EPOCH ${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const root = h('div.login', field, box, h('div.login__foot',
    h('span.coord', 'INTERNAL WORKSPACE · MEMBERS OF THE FORUM'),
    h('span.coord.login__epoch', `ORRERY · ${epoch} · LOG AU · 1 YR = 80 S`),
    h('span.coord', ws.coords || ''),
    h('span.coord', fmtDate(new Date()).toUpperCase())));
  host.append(root);
  const sf = mountStarfield(field, { seed: 'recamp-enter', density: 0.00026, grid: false, arc: false, animate });
  // Labels on the lower-left bearing, where the wordmark is not; the epoch line lives in the footer.
  const orrery = mountOrrery(orr, { seed: 'recamp-enter', labels: window.innerWidth > 560, labelBearing: 0.58, labelFrom: 1, annotation: false, animate });
  setTimeout(() => box.querySelector('.btn--primary')?.focus(), 50);

  function enter() { store.setSetting('entered', true); ctx.router.go('/', { replace: true }); }
  function explain() {
    const input = h('input.input', { id: 'gsi-client-id', type: 'text', placeholder: '1234567890-abc.apps.googleusercontent.com', autocomplete: 'off', spellcheck: 'false' });
    // The origin is the one thing people get wrong: it is scheme + host only,
    // never the path. Show the exact string rather than describing it.
    const origin = location.origin;
    const copy = h('button.btn.btn--sm', { type: 'button', onclick: () => { navigator.clipboard?.writeText(origin); ctx.toast('Origin copied'); } }, icon('copy'), 'Copy');
    dialog({ title: 'Set up Google sign-in', wide: true, body: h('div.stack',
      h('p', 'Sign-in uses Google Identity Services. It needs a free OAuth client id from a Google Cloud project — there is no billing and no app review for this.'),
      h('ol.setup-steps',
        h('li', 'Open ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', rel: 'noopener' }, 'console.cloud.google.com/apis/credentials'), ' and pick or create a project.'),
        h('li', 'Configure the ', h('b', 'OAuth consent screen'), ': type ', h('b', 'External'), ', app name “RECAMP”, and your own address for both support and developer contact. The only scopes needed are name, email and profile, which need no verification — press ', h('b', 'Publish app'), ' so anyone can sign in, or leave it in testing and add each person under ', h('i', 'Test users'), '.'),
        h('li', h('b', 'Credentials → Create credentials → OAuth client ID'), ', application type ', h('b', 'Web application'), '.'),
        h('li', 'Under ', h('b', 'Authorised JavaScript origins'), ' add the origin below. Leave ', h('i', 'Authorised redirect URIs'), ' empty — this flow does not use one.'),
        h('li', 'Copy the client id (it ends in ', h('code', '.apps.googleusercontent.com'), ') and paste it here.')),
      h('div.field', h('span.label', 'Origin to authorise'), h('div.row', h('code.setup-origin', origin), copy),
        h('span.field__hint', 'Scheme and host only, no path. Add ', h('code', 'http://localhost:4180'), ' too if you run the dev server.')),
      h('div.field', h('label.label', { for: 'gsi-client-id' }, 'OAuth client id'), input),
      h('p.t-faint', { style: { fontSize: 'var(--fs-small)' } }, 'The client id is public by design — it lives in the page source, and there is no client secret. Signing in records who is editing: the name and email go on activity entries. It does not control access to the workspace, which is governed by the Apps Script token and by who the Sheet is shared with in Drive.')),
      actions: [{ label: 'Not now' }, { label: 'Save & sign in', primary: true, onClick: () => { const v = input.value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { ctx.toast('That does not look like a client id — it should end in .apps.googleusercontent.com'); return false; } store.setSetting('googleClientId', v); setTimeout(() => signIn(v), 100); return true; } }] });
  }
  function signIn(id) {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => {
      try {
        window.google.accounts.id.initialize({ client_id: id, callback: res => { const p = JSON.parse(atob(res.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); store.setMeta({ user: { id: 'me', name: p.name || '', email: p.email || '', picture: p.picture || '' } }); ctx.toast(`Signed in as ${p.name || p.email}`); enter(); } });
        window.google.accounts.id.prompt(n => { if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) { const holder = h('div', { style: { display: 'grid', placeItems: 'center' } }); google.replaceWith(holder); window.google.accounts.id.renderButton(holder, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', width: 300 }); } });
      } catch (e) { ctx.toast(`Google sign-in failed to start: ${e.message}`); }
    };
    s.onerror = () => ctx.toast('Could not load Google sign-in (offline?)');
    document.head.append(s);
  }
  return { destroy() { sf.destroy(); orrery.destroy(); root.remove(); } };
}
