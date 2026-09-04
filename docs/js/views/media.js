/** Media and Documents — everything attached anywhere, gathered. */
import { h, icon } from '../core/dom.js';
import { stripHtml } from '../data/store.js';
import { viewhead, empty, sectionHead } from './common.js';
import { href } from '../ui/router.js';

export function mountMedia(ctx, host) {
  const { store } = ctx;
  const view = h('div.view.view--wide'); host.append(view);
  function render() {
    view.replaceChildren();
    const images = [];
    for (const n of store.allNodes()) for (const b of store.blocks(n.id)) if (b.type === 'image' && b.props?.url) images.push({ node: n, block: b });
    const videos = store.records('db_resources').filter(r => r.props.type === 'Video' && r.props.url);
    view.append(viewhead({ kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'MEDIA')], title: 'Media', desc: `${images.length} image${images.length === 1 ? '' : 's'} across the workspace${videos.length ? `, ${videos.length} video link${videos.length === 1 ? '' : 's'}` : ''}. Add photographs to any page with /image and they gather here.` }));
    if (!images.length && !videos.length) view.append(empty('No media yet. Open an event and add an /image block with a Drive or web URL.'));
    if (images.length) view.append(h('div.mediagrid', images.map(({ node, block }) => h('a.media', { href: href.page(node.id) }, h('img', { src: block.props.url, alt: stripHtml(block.text) || node.title, loading: 'lazy' }), h('div.media__cap', stripHtml(block.text) || node.title, h('span.coord', node.title.toUpperCase()))))));
    if (videos.length) { view.append(h('div.section', sectionHead('Video links'), videos.map(v => h('a.children__row', { href: v.props.url, target: '_blank', rel: 'noopener' }, icon('play'), h('span.truncate', v.title), h('span.children__meta', v.props.source?.toUpperCase() || ''))))); }
  }
  const unsub = store.on('change', d => { if (!['block:update', 'recent', 'noop'].includes(d.type)) render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Media', icon: 'image' }] });
  return { destroy: unsub };
}

export function mountDocuments(ctx, host) {
  const { store } = ctx;
  const view = h('div.view'); host.append(view);
  function render() {
    view.replaceChildren();
    const files = [];
    for (const n of store.allNodes()) {
      for (const b of store.blocks(n.id)) if ((b.type === 'file' || b.type === 'link') && b.props?.url) files.push({ node: n, title: b.props.name || b.props.title || b.props.url, url: b.props.url, kind: b.type });
      if (n.kind === 'record') for (const p of (store.db(n.databaseId)?.schema || [])) if (p.type === 'files') for (const f of (Array.isArray(n.props[p.id]) ? n.props[p.id] : [])) if (f?.url) files.push({ node: n, title: f.name || f.url, url: f.url, kind: 'attachment' });
    }
    const docs = store.records('db_resources').filter(r => ['Paper', 'Slides', 'Book', 'Dataset'].includes(r.props.type));
    view.append(viewhead({ kicker: [h('span.coord', h('b', 'RECAMP'), h('span.sep', '/'), 'DOCUMENTS')], title: 'Documents', desc: `${files.length} file${files.length === 1 ? '' : 's'} attached to pages and records, and ${docs.length} document${docs.length === 1 ? '' : 's'} in Resources.` }));
    if (files.length) { const sec = h('div.section', sectionHead('Attached to pages')); for (const f of files) sec.append(h('a.children__row', { href: f.url, target: '_blank', rel: 'noopener' }, icon(f.kind === 'link' ? 'link' : 'paperclip'), h('span.truncate', f.title), h('span.children__meta', f.node.title.toUpperCase()))); view.append(sec); }
    if (docs.length) { const sec = h('div.section', sectionHead('In Resources', h('a', { href: href.db('db_resources') }, 'All resources →'))); for (const d of docs) sec.append(h('a.children__row', { href: href.page(d.id) }, icon('document'), h('span.truncate', d.title), h('span.children__meta', `${d.props.type.toUpperCase()}${d.provenance === 'demo' ? ' · DEMO' : ''}`))); view.append(sec); }
    if (!files.length && !docs.length) view.append(empty('No documents yet. Attach files to records, or add /file blocks to pages.'));
  }
  const unsub = store.on('change', d => { if (!['block:update', 'recent', 'noop'].includes(d.type)) render(); });
  render();
  ctx.shell.setTopbar({ crumbs: [{ title: 'Workspace', href: '#/', icon: 'home' }, { title: 'Documents', icon: 'document' }] });
  return { destroy: unsub };
}
