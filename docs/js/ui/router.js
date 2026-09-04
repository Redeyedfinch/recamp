/**
 * Hash router. Routes:
 *   #/                 home        #/p/:id           page or record
 *   #/db/:id?v=view    database    #/archive         past events
 *   #/activity  #/inbox  #/trash  #/settings  #/search?q=  #/media  #/documents
 *   #/members  #/committee  #/enter
 */
import { Emitter } from '../core/emitter.js';

export class Router extends Emitter {
  constructor() {
    super();
    this.current = this.parse(location.hash);
    window.addEventListener('hashchange', () => { this.current = this.parse(location.hash); this.emit('change', this.current); });
  }
  parse(hash) {
    const raw = (hash || '#/').replace(/^#/, '') || '/';
    const [pathPart, queryPart = ''] = raw.split('?');
    const segs = pathPart.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(queryPart));
    const name = segs[0] || 'home';
    return { raw, name, id: segs[1] || null, segs, query, path: pathPart };
  }
  go(path, { replace = false } = {}) {
    const target = '#' + (path.startsWith('/') ? path : '/' + path);
    if (replace) history.replaceState(null, '', target); else location.hash = target;
    if (replace) { this.current = this.parse(target); this.emit('change', this.current); }
  }
  page(id) { this.go(`/p/${id}`); }
  db(id, view) { this.go(`/db/${id}${view ? `?v=${view}` : ''}`); }
  start() { this.emit('change', this.current); }
}

/** URL helpers for links inside rendered markup */
export const href = {
  home: () => '#/', page: id => `#/p/${id}`, db: (id, v) => `#/db/${id}${v ? `?v=${v}` : ''}`,
  archive: () => '#/archive', activity: () => '#/activity', inbox: () => '#/inbox', trash: () => '#/trash',
  settings: () => '#/settings', search: q => `#/search${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  media: () => '#/media', documents: () => '#/documents', members: () => '#/members', committee: () => '#/committee', enter: () => '#/enter',
};
