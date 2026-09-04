/**
 * LocalAdapter — persists the whole workspace snapshot in localStorage.
 * The default. Works with no setup, no account, no network.
 */
const KEY = 'recamp.workspace.v1';

export class LocalAdapter {
  constructor(key = KEY) { this.key = key; this.kind = 'local'; }

  async load() {
    try { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
    catch (e) { console.warn('local load failed', e); return null; }
  }

  async save(snapshot) {
    try { localStorage.setItem(this.key, JSON.stringify(snapshot)); return { ok: true }; }
    catch (e) { console.warn('local save failed', e); return { ok: false, error: String(e) }; }
  }

  async info() {
    let bytes = 0;
    try { bytes = (localStorage.getItem(this.key) || '').length; } catch { /* private mode */ }
    return { kind: 'local', label: 'This browser', bytes };
  }

  async clear() { try { localStorage.removeItem(this.key); } catch { /* ignore */ } }
}
