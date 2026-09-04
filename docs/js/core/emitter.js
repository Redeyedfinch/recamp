/** Minimal event emitter. `on` returns an unsubscribe function. */
export class Emitter {
  constructor() { this._h = new Map(); }
  on(evt, fn) {
    if (!this._h.has(evt)) this._h.set(evt, new Set());
    this._h.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this._h.get(evt)?.delete(fn); }
  emit(evt, ...args) {
    this._h.get(evt)?.forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } });
    this._h.get('*')?.forEach(fn => { try { fn(evt, ...args); } catch (e) { console.error(e); } });
  }
}
