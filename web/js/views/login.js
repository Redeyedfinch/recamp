/**
 * Enter — a dark observatory field. No marketing, no illustration.
 * "Enter workspace" opens the local workspace. "Sign in with Google" uses
 * Google Identity Services when a client id is configured, and otherwise
 * explains what to configure — it is never a dead button.
 */
import { h, icon } from '../core/dom.js';
import { sessionLabel, fmtDate } from '../core/dates.js';
import { mountStarfield } from '../ui/starfield.js';
import { dialog } from '../ui/dialog.js';

export function mount(ctx, host) {
  const { store } = ctx;
  const ws = store.meta.workspace || {};
  const field = h('div.login__field.grid-surface', h('div.marks', h('span.mark.mark--tl', h('b', 'RECAMP OBSERVATORY')), h('span.mark.mark--tr', sessionLabel()), h('span.mark.mark--bl', ws.coords || ''), h('span.mark.mark--br', fmtDate(new Date()))));
  const clientId = store.setting('googleClientId', '');
  const google = h('button.btn.btn--lg.btn--wide', { type: 'button', onclick: () => clientId ? signIn(clientId) : explain() }, icon('user'), 'Sign in with Google');
  const box = h('div.login__box',
    h('h1.login__name', ws.name || 'RECAMP'),
    h('div.login__desc.label.label--ink', (ws.descriptor || 'The Physical Science Forum').toUpperCase()),
    h('div.login__inst.label', 'JAIN SCHOOL OF SCIENCES · BENGALURU'),
    h('div.login__actions', h('button.btn.btn--primary.btn--lg.btn--wide', { type: 'button', onclick: enter }, 'Enter workspace', icon('arrowR')), google));
  const root = h('div.login', field, box, h('div.login__foot', h('span.coord', 'INTERNAL WORKSPACE · MEMBERS OF THE FORUM'), h('span.coord', 'STORED IN THIS BROWSER UNTIL CONNECTED')));
  host.append(root);
  const sf = mountStarfield(field, { seed: 'recamp-enter', density: 0.00026, grid: false });
  setTimeout(() => box.querySelector('.btn--primary')?.focus(), 50);

  function enter() { store.setSetting('entered', true); ctx.router.go('/', { replace: true }); }
  function explain() {
    const input = h('input.input', { type: 'text', placeholder: '1234567890-abc.apps.googleusercontent.com' });
    dialog({ title: 'Google sign-in is not configured yet', body: h('div.stack',
      h('p', 'Sign-in uses Google Identity Services and needs an OAuth client id from the forum\'s Google Cloud project (APIs & Services → Credentials → OAuth client, type Web, with this site\'s origin allowed).'),
      h('p', 'It identifies who is editing — the name and email go on activity entries. Access to the data is still governed by the Apps Script token and Drive sharing.'),
      h('div.field', h('span.label', 'OAuth client id'), input)),
      actions: [{ label: 'Not now' }, { label: 'Save & sign in', primary: true, onClick: () => { const v = input.value.trim(); if (!v) return false; store.setSetting('googleClientId', v); setTimeout(() => signIn(v), 100); return true; } }] });
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
  return { destroy() { sf.destroy(); root.remove(); } };
}
