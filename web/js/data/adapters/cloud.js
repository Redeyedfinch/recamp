/**
 * CloudAdapter — talks to the RECAMP Apps Script backend (apps/api).
 *
 * Requests are POSTed as text/plain JSON. That keeps them "simple requests"
 * in CORS terms, so the browser sends no preflight — Apps Script cannot
 * answer preflights, and it 302-redirects every response, which fetch
 * follows. Same wire format as the hash OS backend.
 */
export class CloudAdapter {
  constructor({ url, token = '', workspace = 'recamp' }) {
    this.url = url; this.token = token; this.workspace = workspace; this.kind = 'cloud';
  }

  async call(action, payload = {}) {
    const body = JSON.stringify({ action, token: this.token, workspace: this.workspace, ...payload });
    const res = await fetch(this.url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`api ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'api error');
    return json;
  }

  async load() {
    const r = await this.call('load');
    return r.snapshot || null;
  }

  async save(snapshot) {
    try { const r = await this.call('save', { snapshot }); return { ok: true, savedAt: r.savedAt }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  async info() {
    try { const r = await this.call('info'); return { kind: 'cloud', label: r.label || 'Google Sheets', ...r }; }
    catch (e) { return { kind: 'cloud', label: 'Google Sheets', error: String(e.message || e) }; }
  }

  async ping() {
    try { const r = await this.call('ping'); return !!r.ok; } catch { return false; }
  }

  async clear() { /* never remotely */ }
}
