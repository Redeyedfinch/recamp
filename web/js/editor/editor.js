/**
 * Block editor.
 *
 * One contenteditable per text block. Enter splits, Backspace merges, Tab
 * nests, "/" opens the block menu, markdown shortcuts convert, the handle
 * drags. Rich text is a small sanitised HTML subset (b i u s code a br mark).
 * The editor re-renders from the store on outside changes and keeps the caret.
 */
import { h, icon, clear, esc, caretAtStart, caretAtEnd, caretOffset, setCaret, debounce, placeNear } from '../core/dom.js';
import { BLOCK_TYPES, TEXT_BLOCKS } from '../data/schema.js';
import { stripHtml } from '../data/store.js';
import { showMenu, closeMenu, isMenuOpen } from '../ui/menu.js';
import { prompt } from '../ui/dialog.js';
import { renderMath } from './katex.js';

const ALLOWED = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', CODE: 'code', A: 'a', BR: 'br', MARK: 'mark' };
const LIST_TYPES = new Set(['bullet', 'number', 'todo']);
const PLACEHOLDER = { paragraph: 'Write, or type “/” for blocks', h1: 'Heading', h2: 'Section', h3: 'Subheading', bullet: 'List item', number: 'List item', todo: 'To-do', quote: 'Quote', callout: 'Callout', toggle: 'Toggle heading' };

/** Sanitise an HTML fragment to the allowed inline subset. */
export function clean(html) {
  const tpl = document.createElement('template'); tpl.innerHTML = String(html || '');
  const out = [];
  const walk = (node, depth) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { out.push(esc(c.nodeValue)); continue; }
      if (c.nodeType !== 1) continue;
      const tag = ALLOWED[c.tagName];
      if (c.tagName === 'DIV' || c.tagName === 'P') { if (out.length && depth === 0) out.push('\n'); walk(c, depth + 1); continue; }
      if (!tag) { walk(c, depth + 1); continue; }
      if (tag === 'br') { out.push('\n'); continue; }
      if (tag === 'a') { const href = safeHref(c.getAttribute('href')); if (!href) { walk(c, depth + 1); continue; } out.push(`<a href="${esc(href)}" target="_blank" rel="noopener">`); walk(c, depth + 1); out.push('</a>'); continue; }
      out.push(`<${tag}>`); walk(c, depth + 1); out.push(`</${tag}>`);
    }
  };
  walk(tpl.content, 0);
  return out.join('').replace(/\n+$/, '').replace(/^\n+/, '');
}
function safeHref(v) { v = String(v || '').trim(); if (/^(https?:|mailto:|#)/i.test(v)) return v; if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return 'https://' + v; return ''; }

export class Editor {
  constructor(ctx, host, nodeId, { readonly = false, onEmptyEnter = null } = {}) {
    this.ctx = ctx; this.store = ctx.store; this.host = host; this.nodeId = nodeId; this.readonly = readonly;
    this.muted = false; this.pendingFocus = null; this.slash = null; this.selected = new Set();
    this.root = h('div.editor', { 'data-node': nodeId });
    host.append(this.root);
    this.saveText = debounce((id, html) => this.write(() => this.store.updateBlock(id, { text: html })), 350);
    this.saveProps = debounce((id, props) => this.write(() => this.store.updateBlock(id, { props })), 350);
    this.unsub = this.store.on('change', d => this.onChange(d));
    this.bind();
    this.render();
  }

  destroy() { this.unsub(); this.hideFmt(); closeMenu(); document.removeEventListener('selectionchange', this.onSel); this.root.remove(); }

  write(fn) { this.muted = true; try { return fn(); } finally { this.muted = false; } }

  onChange(d) {
    if (this.muted) return;
    if (d.type === 'hydrate' || d.id === this.nodeId || d.type === 'node:update' || d.type === 'node:create' || d.type === 'node:trash' || d.type === 'node:delete') {
      const active = document.activeElement?.closest?.('.blk__text');
      if (active && this.root.contains(active)) { const blk = active.closest('.blk'); this.pendingFocus = { id: blk.dataset.id, offset: caretOffset(active), sub: active.dataset.sub || null }; }
      this.render();
    }
  }

  /* ------------------------------------------------------------ rendering */

  render() {
    clear(this.root);
    const tree = this.store.blockTree(this.nodeId);
    this.renderList(this.root, tree, 0);
    if (!this.readonly) this.root.append(h('div.editor__tail', { onclick: () => this.focusTail() }));
    if (this.pendingFocus) { const pf = this.pendingFocus; this.pendingFocus = null; this.focusBlock(pf.id, pf.offset, pf.sub); }
    for (const id of [...this.selected]) { const el = this.blockEl(id); if (el) el.classList.add('is-selected'); else this.selected.delete(id); }
  }

  renderList(container, entries, depth) {
    let n = 0;
    for (const { block, children } of entries) {
      n = block.type === 'number' ? n + 1 : 0;
      const el = this.renderBlock(block, children, depth, n);
      container.append(el);
    }
  }

  renderBlock(block, children, depth, n) {
    const el = h('div.blk', { 'data-type': block.type, 'data-id': block.id, 'data-depth': String(depth), 'data-tone': block.props?.tone || null, 'data-open': block.type === 'toggle' ? String(block.props?.open !== false) : null });
    if (!this.readonly) {
      el.append(h('div.blk__gutter', h('button.blk__handle', { type: 'button', draggable: 'true', 'aria-label': 'Block menu', tabindex: '-1', onclick: e => { e.stopPropagation(); this.blockMenu(block, e.currentTarget); } }, icon('grip'))));
    }
    const body = h('div.blk__body');
    el.append(body);
    const kids = h('div.blk__children');

    if (TEXT_BLOCKS.has(block.type)) {
      const row = h('div.blk__row');
      if (block.type === 'todo') row.append(h('button.checkbox', { type: 'button', role: 'checkbox', 'aria-checked': String(!!block.props?.done), disabled: this.readonly, onclick: () => this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, done: !block.props?.done } })) && this.render() }, icon('check')));
      if (block.type === 'bullet' || block.type === 'number') row.append(h('span.blk__marker', { 'data-n': String(n) }));
      if (block.type === 'toggle') row.append(h('button.tree__toggle', { type: 'button', 'aria-expanded': String(block.props?.open !== false), 'aria-label': 'Toggle', onclick: () => { this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, open: block.props?.open === false } }, { touch: false })); this.render(); } }, icon('chevronR')));
      row.append(this.textEl(block, block.text, { placeholder: PLACEHOLDER[block.type] || '', done: block.type === 'todo' && block.props?.done }));
      body.append(row);
      if (block.type === 'callout' && !this.readonly) body.append(h('div.callout__tone', ['celestial', 'stellar', 'sage', 'rust'].map(t => h('button', { type: 'button', 'data-tone': t, 'aria-label': t, 'aria-pressed': String((block.props?.tone || 'celestial') === t), onclick: () => { this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, tone: t } }, { touch: false })); this.render(); } }))));
    } else if (block.type === 'divider') {
      body.onclick = () => this.select(block.id);
    } else if (block.type === 'code') {
      const t = this.textEl(block, null, { plain: true, placeholder: 'Code' }); t.textContent = block.text || '';
      body.append(t, h('div.blk__lang', h('input', { type: 'text', value: block.props?.lang || '', placeholder: 'lang', disabled: this.readonly, onchange: e => this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, lang: e.target.value } }, { touch: false })) })));
    } else if (block.type === 'equation') {
      const view = h('div.eq__render', { tabindex: this.readonly ? null : '0', role: 'button', 'aria-label': 'Edit equation' });
      renderMath(view, block.text || '');
      const src = this.textEl(block, null, { plain: true, placeholder: 'LaTeX, e.g. E = mc^2' }); src.textContent = block.text || '';
      const srcWrap = h('div.eq__src', src);
      if (!this.readonly) {
        view.onclick = () => { el.classList.add('is-editing'); setCaret(src); };
        view.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); view.click(); } };
        src.addEventListener('blur', () => { el.classList.remove('is-editing'); renderMath(view, src.textContent); });
        src.addEventListener('input', debounce(() => renderMath(view, src.textContent), 250));
      }
      body.append(view, srcWrap);
    } else if (block.type === 'image') {
      if (block.props?.url) {
        const cap = this.textEl(block, block.text, { placeholder: 'Caption', sub: 'caption' });
        body.append(h('figure', h('img', { src: block.props.url, alt: stripHtml(block.text) || 'Image', loading: 'lazy' }), h('figcaption.blk__caption', cap)));
      } else body.append(this.embedForm(block, 'image', 'Add an image by URL', 'https://…/photo.jpg'));
    } else if (block.type === 'file') {
      if (block.props?.url) body.append(h('a.filerow', { href: block.props.url, target: '_blank', rel: 'noopener' }, icon('paperclip'), h('span.truncate', block.props.name || block.props.url), h('span.filerow__meta', hostOf(block.props.url))));
      else body.append(this.embedForm(block, 'file', 'Link a file (Drive, PDF, sheet)', 'https://drive.google.com/…', true));
    } else if (block.type === 'link') {
      if (block.props?.url) body.append(h('a.bookmark', { href: block.props.url, target: '_blank', rel: 'noopener' }, h('div.bookmark__body', h('div.bookmark__title', block.props.title || hostOf(block.props.url)), h('div.bookmark__url', block.props.url)), h('div.bookmark__icon', icon('arrowUR'))));
      else body.append(this.embedForm(block, 'link', 'Add a web bookmark', 'https://', true));
    } else if (block.type === 'table') {
      body.append(this.tableEl(block));
    } else if (block.type === 'page' || block.type === 'database' || block.type === 'event') {
      const target = this.store.node(block.props?.pageId || block.props?.dbId || block.props?.recordId);
      if (target) {
        body.append(h('a.pagelink', { href: `#/p/${target.id}` }, icon(target.icon || 'page'), h('span', target.title || 'Untitled'), block.type === 'event' ? h('span.pagelink__meta', [target.props?.date || '', target.props?.status || ''].filter(Boolean).join(' · ')) : null));
        if (block.type === 'database') {
          const rows = this.store.records(target.id).slice(0, 5);
          body.append(h('div.inline-db', rows.map(r => h('a.inline-db__row', { href: `#/p/${r.id}` }, icon(r.icon || 'page'), h('span.grow.truncate', r.title || 'Untitled'), r.props?.status ? h('span.tag.tag--soft', r.props.status) : null)), h('a.inline-db__row', { href: `#/db/${target.id}` }, h('span.grow.t-faint', `Open ${target.title} →`))));
        }
      } else body.append(h('div.blk__embed-empty', icon('page'), 'This page was removed.'));
    } else if (block.type === 'timeline') {
      body.append(this.routeEl(block));
    } else {
      body.append(this.textEl(block, block.text, { placeholder: '' }));
    }

    if (children.length || block.type === 'toggle') { this.renderList(kids, children, depth + 1); body.append(kids); }
    return el;
  }

  textEl(block, html, { placeholder = '', plain = false, done = false, sub = null } = {}) {
    const t = h('div.blk__text', { contenteditable: this.readonly ? 'false' : (plain ? 'plaintext-only' : 'true'), spellcheck: plain ? 'false' : 'true', 'data-placeholder': placeholder, 'data-done': done ? 'true' : null, 'data-sub': sub });
    if (html != null) t.innerHTML = clean(html);
    t.dataset.empty = String(!t.textContent.length);
    return t;
  }

  embedForm(block, kind, label, placeholder, withName = false) {
    const wrap = h('div');
    const empty = h('div.blk__embed-empty', { tabindex: '0', role: 'button' }, icon(kind === 'image' ? 'image' : kind === 'file' ? 'paperclip' : 'link'), label);
    const url = h('input.input', { type: 'url', placeholder, 'aria-label': 'URL' });
    const name = withName ? h('input.input', { type: 'text', placeholder: kind === 'file' ? 'Name' : 'Title', 'aria-label': 'Name' }) : null;
    const form = h('div.blk__embed-form', { hidden: true }, url, name, h('button.btn.btn--sm', { type: 'button', onclick: () => commit() }, 'Add'));
    const commit = () => { const u = safeHref(url.value); if (!u) { url.focus(); return; } this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, url: u, [kind === 'file' ? 'name' : 'title']: name?.value.trim() || '' } })); this.render(); };
    const open = () => { empty.hidden = true; form.hidden = false; url.focus(); };
    empty.onclick = open; empty.onkeydown = e => { if (e.key === 'Enter') open(); };
    url.onkeydown = name ? null : e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } e.stopPropagation(); };
    if (name) { name.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } e.stopPropagation(); }; url.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); name.focus(); } e.stopPropagation(); }; }
    wrap.append(empty, form);
    if (block.props?.fresh) { this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, fresh: false } }, { touch: false })); setTimeout(open, 0); }
    return wrap;
  }

  tableEl(block) {
    const rows = block.props?.rows?.length ? block.props.rows : [['', ''], ['', '']];
    const table = h('table.btable', h('tbody', rows.map((r, ri) => h('tr', r.map((c, ci) => {
      const cell = this.textEl(block, c, { placeholder: ri === 0 ? 'Header' : '', sub: `${ri}:${ci}` });
      cell.dataset.r = ri; cell.dataset.c = ci;
      return h('td', cell);
    })))));
    const wrap = h('div', table);
    const save = () => { const next = [...table.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('.blk__text')].map(c => clean(c.innerHTML))); this.saveProps(block.id, { ...block.props, rows: next }); };
    table.addEventListener('input', save);
    if (!this.readonly) {
      const mut = fn => { const next = rows.map(r => [...r]); fn(next); this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, rows: next } })); this.render(); };
      wrap.append(h('div.btable__tools',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => mut(n => n.push(n[0].map(() => ''))) }, icon('plus'), 'Row'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => mut(n => n.forEach(r => r.push(''))) }, icon('plus'), 'Column'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', disabled: rows.length < 2, onclick: () => mut(n => n.pop()) }, icon('minus'), 'Row'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', disabled: rows[0].length < 2, onclick: () => mut(n => n.forEach(r => r.pop())) }, icon('minus'), 'Column')));
    }
    return wrap;
  }

  routeEl(block) {
    const stations = block.props?.stations?.length ? block.props.stations : [{ label: 'I', title: '', text: '' }];
    const route = h('div.route', h('div.route__line'));
    stations.forEach((s, i) => {
      const st = h('div.route__station', h('div.route__node'),
        h('div.route__label', this.textEl(block, s.label, { placeholder: `Stage ${i + 1}`, sub: `label:${i}` })),
        h('div', h('div.route__title', this.textEl(block, s.title, { placeholder: 'Title', sub: `title:${i}` })), h('div.route__text', this.textEl(block, s.text, { placeholder: 'What happens here', sub: `text:${i}` }))),
        this.readonly || stations.length < 2 ? null : h('button.iconbtn.iconbtn--sm.route__remove', { type: 'button', 'aria-label': 'Remove station', onclick: () => { const next = stations.filter((_, j) => j !== i); this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, stations: next } })); this.render(); } }, icon('close')));
      route.append(st);
    });
    const read = () => [...route.querySelectorAll('.route__station')].map(st => ({ label: clean(st.querySelector('.route__label .blk__text').innerHTML), title: clean(st.querySelector('.route__title .blk__text').innerHTML), text: clean(st.querySelector('.route__text .blk__text').innerHTML) }));
    route.addEventListener('input', () => this.saveProps(block.id, { ...block.props, stations: read() }));
    const wrap = h('div', route);
    if (!this.readonly) wrap.append(h('div.route__tools', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { const next = [...read(), { label: roman(stations.length + 1), title: '', text: '' }]; this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, stations: next } })); this.render(); } }, icon('plus'), 'Station')));
    return wrap;
  }

  /* -------------------------------------------------------------- helpers */

  blockEl(id) { return this.root.querySelector(`.blk[data-id="${id}"]`); }
  textOf(id, sub = null) { const el = this.blockEl(id); if (!el) return null; if (sub) return el.querySelector(`.blk__text[data-sub="${sub}"]`); return el.querySelector(':scope > .blk__body > .blk__row > .blk__text, :scope > .blk__body > .blk__text, :scope > .blk__body > .eq__src > .blk__text'); }
  focusBlock(id, offset = Infinity, sub = null) { const t = this.textOf(id, sub); if (t) { if (t.closest('.eq__src')) this.blockEl(id).classList.add('is-editing'); setCaret(t, offset); t.scrollIntoView({ block: 'nearest' }); return true; } const el = this.blockEl(id); if (el) this.select(id); return false; }
  focusTail() {
    const list = this.store.blockList(this.nodeId);
    const last = list[list.length - 1]?.block;
    if (last && last.type === 'paragraph' && !stripHtml(last.text).trim() && last.parentId === this.nodeId) return this.focusBlock(last.id);
    const nb = this.write(() => this.store.createBlock({ nodeId: this.nodeId }));
    this.pendingFocus = { id: nb.id }; this.render();
  }
  focusFirst() { const first = this.store.blockList(this.nodeId)[0]?.block; if (first) this.focusBlock(first.id, 0); else this.focusTail(); }
  select(id) { this.clearSelection(); this.selected.add(id); this.blockEl(id)?.classList.add('is-selected'); document.activeElement?.blur?.(); this.root.focus?.(); }
  clearSelection() { for (const id of this.selected) this.blockEl(id)?.classList.remove('is-selected'); this.selected.clear(); }
  currentText(el) { return clean(el.innerHTML); }

  /* -------------------------------------------------------------- events */

  bind() {
    const r = this.root;
    r.tabIndex = -1;
    r.addEventListener('input', e => this.onInput(e));
    r.addEventListener('keydown', e => this.onKeyDown(e));
    r.addEventListener('paste', e => this.onPaste(e));
    r.addEventListener('focusin', e => { if (e.target.closest('.blk__text')) this.clearSelection(); });
    r.addEventListener('mousedown', e => { if (!e.target.closest('.blk__text, button, input, a')) { /* click in gutter/whitespace */ } });
    r.addEventListener('dragstart', e => this.onDragStart(e));
    r.addEventListener('dragover', e => this.onDragOver(e));
    r.addEventListener('dragleave', e => { if (!r.contains(e.relatedTarget)) this.clearDragMarks(); });
    r.addEventListener('drop', e => this.onDrop(e));
    r.addEventListener('dragend', () => { this.clearDragMarks(); r.querySelector('.is-dragging')?.classList.remove('is-dragging'); });
    this.onSel = () => this.onSelectionChange();
    document.addEventListener('selectionchange', this.onSel);
  }

  onInput(e) {
    const t = e.target.closest?.('.blk__text'); if (!t) return;
    const blk = t.closest('.blk'); const id = blk.dataset.id; const block = this.store.block(id); if (!block) return;
    t.dataset.empty = String(!t.textContent.length);
    if (t.dataset.sub) return;                     // table cells, route fields, captions save via their own listeners
    if (t.closest('.btable, .route')) return;
    if (blk.dataset.type === 'image') { this.saveText(id, this.currentText(t)); return; }
    if (blk.dataset.type === 'code' || blk.dataset.type === 'equation') { this.saveText(id, t.textContent); return; }

    // slash menu tracking
    if (this.slash && this.slash.id === id) { const txt = t.textContent; const i = txt.lastIndexOf('/', caretOffset(t)); if (i < 0 || /\s/.test(txt.slice(i + 1, caretOffset(t)))) this.closeSlash(); else this.openSlash(block, t, txt.slice(i + 1, caretOffset(t))); }
    else if (e.data === '/' || (e.inputType === 'insertText' && t.textContent.slice(caretOffset(t) - 1, caretOffset(t)) === '/')) { const off = caretOffset(t); const before = t.textContent.slice(0, off - 1); if (!before || /\s$/.test(before)) this.openSlash(block, t, ''); }

    // markdown shortcuts at the start of a paragraph
    if (block.type === 'paragraph' || LIST_TYPES.has(block.type)) {
      const txt = t.textContent; const m = /^(#{1,3}|[-*]|1[.)]|\[\s?\]|>|---|```)\s$/.exec(txt) || (/^(---|```)$/.exec(txt));
      if (m && caretOffset(t) === txt.length) {
        const k = m[1]; const type = k === '#' ? 'h1' : k === '##' ? 'h2' : k === '###' ? 'h3' : (k === '-' || k === '*') ? 'bullet' : /^1/.test(k) ? 'number' : /^\[/.test(k) ? 'todo' : k === '>' ? 'quote' : k === '---' ? 'divider' : 'code';
        if (type === 'divider') { this.write(() => { this.store.updateBlock(id, { type: 'divider', text: '' }); const nb = this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, after: id }); this.pendingFocus = { id: nb.id }; }); this.render(); return; }
        this.write(() => this.store.updateBlock(id, { type, text: '', props: type === 'todo' ? { done: false } : block.props }));
        this.pendingFocus = { id, offset: 0 }; this.render(); return;
      }
    }
    this.saveText(id, this.currentText(t));
  }

  onKeyDown(e) {
    const t = e.target.closest?.('.blk__text');
    if (!t) {
      if (this.selected.size && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); const ids = [...this.selected]; this.clearSelection(); this.write(() => ids.forEach(id => this.store.deleteBlock(id))); this.render(); }
      if (e.key === 'Escape') this.clearSelection();
      return;
    }
    const blk = t.closest('.blk'); const id = blk.dataset.id; const block = this.store.block(id); if (!block) return;
    const type = blk.dataset.type;

    if (t.closest('.btable')) { return this.tableKeys(e, t, block); }
    if (t.dataset.sub) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); t.blur(); } if (e.key === 'Escape') t.blur(); return; }
    if (type === 'code') { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } if (e.key === 'Escape') t.blur(); if ((e.key === 'ArrowDown' && caretAtEnd(t)) || (e.key === 'ArrowUp' && caretAtStart(t))) this.travel(block, e.key === 'ArrowDown' ? 1 : -1, e); return; }
    if (type === 'equation') { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); t.blur(); } return; }

    if (this.slash && isMenuOpen()) { if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') return; if (e.key === ' ') this.closeSlash(); }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.splitBlock(block, t); return; }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\n'); return; }
    if (e.key === 'Backspace' && caretAtStart(t) && window.getSelection().isCollapsed) { e.preventDefault(); this.backspaceAtStart(block, t); return; }
    if (e.key === 'Delete' && caretAtEnd(t) && window.getSelection().isCollapsed) { const next = this.store.siblingInDocument(this.nodeId, id, 1); if (next && TEXT_BLOCKS.has(next.type)) { e.preventDefault(); this.merge(block, next, t); } return; }
    if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) this.outdent(block, t); else this.indent(block, t); return; }
    if (e.key === 'ArrowUp' && this.onEdgeLine(t, 'top')) { this.travel(block, -1, e); return; }
    if (e.key === 'ArrowDown' && this.onEdgeLine(t, 'bottom')) { this.travel(block, 1, e); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.closeSlash(); t.blur(); this.select(id); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); document.execCommand('bold'); this.saveText(id, this.currentText(t)); }
      else if (k === 'i') { e.preventDefault(); document.execCommand('italic'); this.saveText(id, this.currentText(t)); }
      else if (k === 'u') { e.preventDefault(); document.execCommand('underline'); this.saveText(id, this.currentText(t)); }
      else if (k === 'e') { e.preventDefault(); this.toggleInline('code'); this.saveText(id, this.currentText(t)); }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); document.execCommand('strikeThrough'); this.saveText(id, this.currentText(t)); }
  }

  tableKeys(e, cell, block) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const cells = [...cell.closest('.btable').querySelectorAll('.blk__text')]; const i = cells.indexOf(cell);
      const next = cells[i + (e.shiftKey ? -1 : 1)];
      if (next) setCaret(next); else if (!e.shiftKey) { const rows = block.props.rows.map(r => [...r]); rows.push(rows[0].map(() => '')); this.write(() => this.store.updateBlock(block.id, { props: { ...block.props, rows } })); this.pendingFocus = { id: block.id, offset: 0, sub: `${rows.length - 1}:0` }; this.render(); }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c); const next = cell.closest('.btable').querySelector(`.blk__text[data-r="${r + 1}"][data-c="${c}"]`);
      if (next) setCaret(next); else this.travel(block, 1, e);
    } else if (e.key === 'Escape') cell.blur();
  }

  onEdgeLine(t, edge) {
    const sel = window.getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0); let rect = range.getClientRects()[0] || range.getBoundingClientRect();
    if (!rect || (!rect.height && !t.textContent.length)) return true;
    const box = t.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(t).lineHeight) || 24;
    return edge === 'top' ? rect.top - box.top < lh * 0.6 : box.bottom - rect.bottom < lh * 0.6;
  }

  travel(block, dir, e) {
    const target = this.store.siblingInDocument(this.nodeId, block.id, dir);
    if (!target) { if (dir === 1) { e.preventDefault(); this.focusTail(); } return; }
    e.preventDefault();
    this.focusBlock(target.id, dir === 1 ? 0 : Infinity);
  }

  /* ------------------------------------------------------------ structure */

  splitBlock(block, t) {
    this.closeSlash();
    const total = t.textContent.length; const off = caretOffset(t);
    let before, after;
    if (off >= total) { before = t.innerHTML; after = ''; }
    else if (off <= 0) { before = ''; after = t.innerHTML; }
    else { const r = rangeFrom(t, off); r.setEndAfter(t.lastChild); const frag = r.extractContents(); const tmp = document.createElement('div'); tmp.append(frag); after = tmp.innerHTML; before = t.innerHTML; }
    const empty = !stripHtml(before).trim() && !stripHtml(after).trim();
    if (empty && (LIST_TYPES.has(block.type) || block.type === 'quote' || block.type === 'callout')) {
      // Enter on an empty list item ends the list
      if (this.store.block(block.parentId)) return this.outdent(block, t);
      this.write(() => this.store.updateBlock(block.id, { type: 'paragraph', text: '', props: {} })); this.pendingFocus = { id: block.id, offset: 0 }; this.render(); return;
    }
    const type = LIST_TYPES.has(block.type) ? block.type : 'paragraph';
    const nb = this.write(() => {
      this.store.updateBlock(block.id, { text: clean(before) });
      const hasKids = block.type === 'toggle' && this.store.childBlocks(this.nodeId, block.id).length && block.props?.open !== false;
      return this.store.createBlock({ nodeId: this.nodeId, parentId: hasKids ? block.id : block.parentId, type, text: clean(after), props: type === 'todo' ? { done: false } : {}, before: hasKids ? this.store.childBlocks(this.nodeId, block.id)[0]?.id : null, after: hasKids ? null : block.id });
    });
    this.pendingFocus = { id: nb.id, offset: 0 }; this.render();
  }

  backspaceAtStart(block, t) {
    this.closeSlash();
    if (block.type !== 'paragraph') { this.write(() => this.store.updateBlock(block.id, { type: 'paragraph', props: {} })); this.pendingFocus = { id: block.id, offset: 0 }; this.render(); return; }
    const prev = this.store.siblingInDocument(this.nodeId, block.id, -1);
    const text = this.currentText(t);
    if (!prev) { if (this.store.block(block.parentId)) return this.outdent(block, t); return; }
    if (TEXT_BLOCKS.has(prev.type)) return this.merge(prev, block, t, true);
    if (!stripHtml(text).trim()) { this.write(() => { this.liftChildren(block); this.store.deleteBlock(block.id); }); this.render(); this.select(prev.id); }
  }

  merge(into, from, t, fromIsCurrent = false) {
    const joinAt = stripHtml(into.text).length;
    const fromText = fromIsCurrent ? this.currentText(t) : from.text;
    const intoText = fromIsCurrent ? into.text : this.currentText(t);
    this.write(() => { this.store.updateBlock(into.id, { text: intoText + fromText }); this.liftChildren(from); this.store.deleteBlock(from.id); });
    this.pendingFocus = { id: into.id, offset: joinAt }; this.render();
  }

  liftChildren(block) { let after = block.id; for (const c of this.store.childBlocks(this.nodeId, block.id)) { this.store.moveBlock(c.id, { parentId: block.parentId, after }); after = c.id; } }

  indent(block, t) {
    const sibs = this.store.childBlocks(this.nodeId, block.parentId); const i = sibs.findIndex(s => s.id === block.id);
    const prev = sibs[i - 1]; if (!prev) return;
    const off = caretOffset(t);
    this.write(() => { this.store.updateBlock(block.id, { text: this.currentText(t) }, { touch: false }); this.store.moveBlock(block.id, { parentId: prev.id }); if (prev.type === 'toggle' && prev.props?.open === false) this.store.updateBlock(prev.id, { props: { ...prev.props, open: true } }, { touch: false }); });
    this.pendingFocus = { id: block.id, offset: off }; this.render();
  }

  outdent(block, t) {
    const parent = this.store.block(block.parentId); if (!parent) return;
    const off = caretOffset(t);
    this.write(() => { this.store.updateBlock(block.id, { text: this.currentText(t) }, { touch: false }); this.store.moveBlock(block.id, { parentId: parent.parentId, after: parent.id }); });
    this.pendingFocus = { id: block.id, offset: off }; this.render();
  }

  /* --------------------------------------------------------------- slash */

  openSlash(block, t, query) {
    const q = query.toLowerCase();
    const types = Object.entries(BLOCK_TYPES).filter(([, def]) => !q || def.label.toLowerCase().includes(q) || def.slash.some(s => s.startsWith(q)));
    this.slash = { id: block.id, query };
    if (!types.length && q.length > 1) { this.closeSlash(); return; }
    const rect = caretRect() || t.getBoundingClientRect();
    showMenu(rect, types.map(([type, def]) => ({ label: def.label, desc: def.desc, icon: def.icon, keywords: def.slash.join(' '), onSelect: () => this.applySlash(block.id, type) })), { head: 'Blocks', cls: 'slash', width: 280, onClose: () => { this.slash = null; } });
    this.slash = { id: block.id, query };
    setCaret(t, caretOffset(t)); // keep typing in the block
  }
  closeSlash() { if (this.slash) { this.slash = null; closeMenu(); } }

  applySlash(id, type) {
    const block = this.store.block(id); const t = this.textOf(id); if (!block || !t) return;
    // strip the "/query" the user typed
    const off = caretOffset(t); const txt = t.textContent; const i = txt.lastIndexOf('/', off);
    if (i >= 0) { const r = rangeFrom(t, i); r.setEnd(...pointAt(t, off)); r.deleteContents(); }
    const remaining = clean(t.innerHTML); const isEmpty = !stripHtml(remaining).trim();
    this.slash = null;
    this.write(() => {
      const props = type === 'todo' ? { done: false } : type === 'table' ? { rows: [['', '', ''], ['', '', '']] } : type === 'timeline' ? { stations: [{ label: 'I', title: '', text: '' }, { label: 'II', title: '', text: '' }] } : ['image', 'file', 'link'].includes(type) ? { fresh: true } : type === 'callout' ? { tone: 'celestial' } : {};
      if (type === 'page' || type === 'database' || type === 'event') {
        const child = type === 'page' ? this.store.createNode({ kind: 'page', parentId: this.nodeId, title: '' })
          : type === 'database' ? this.store.createNode({ kind: 'database', parentId: this.nodeId, title: 'New database' })
          : this.store.createNode({ kind: 'record', databaseId: 'db_events', parentId: this.nodeId, title: '', props: { status: 'Planning' } });
        const p = type === 'page' ? { pageId: child.id } : type === 'database' ? { dbId: child.id } : { recordId: child.id };
        if (isEmpty) this.store.updateBlock(id, { type, text: '', props: p }); else { this.store.updateBlock(id, { text: remaining }); this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, type, props: p, after: id }); }
        setTimeout(() => this.ctx.openNode(child.id), 0);
        return;
      }
      if (TEXT_BLOCKS.has(type)) {
        if (isEmpty || TEXT_BLOCKS.has(block.type)) { this.store.updateBlock(id, { type, text: remaining, props: { ...props } }); this.pendingFocus = { id, offset: stripHtml(remaining).length }; }
        else { const nb = this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, type, props, after: id }); this.pendingFocus = { id: nb.id }; }
        return;
      }
      if (isEmpty) { this.store.updateBlock(id, { type, text: '', props }); this.pendingFocus = ['code', 'equation', 'table', 'timeline'].includes(type) ? { id, offset: 0, sub: type === 'table' ? '0:0' : type === 'timeline' ? 'title:0' : null } : null; if (type === 'divider') { const nb = this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, after: id }); this.pendingFocus = { id: nb.id }; } }
      else { this.store.updateBlock(id, { text: remaining }); const nb = this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, type, props, after: id }); this.pendingFocus = ['code', 'equation', 'table', 'timeline'].includes(type) ? { id: nb.id, offset: 0, sub: type === 'table' ? '0:0' : type === 'timeline' ? 'title:0' : null } : null; if (type === 'divider') { const nb2 = this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, after: nb.id }); this.pendingFocus = { id: nb2.id }; } }
    });
    this.render();
  }

  /* ------------------------------------------------------------ block menu */

  blockMenu(block, anchor) {
    const el = this.blockEl(block.id); el?.classList.add('is-menu-open');
    const turnInto = Object.entries(BLOCK_TYPES).filter(([k]) => TEXT_BLOCKS.has(k) || k === 'code' || k === 'divider').map(([k, def]) => ({ label: def.label, icon: def.icon, selected: block.type === k, onSelect: () => { this.write(() => this.store.updateBlock(block.id, { type: k, props: k === 'todo' ? { done: false } : k === 'callout' ? { tone: 'celestial' } : {} })); this.render(); } }));
    showMenu(anchor, [
      { label: 'Turn into…', icon: 'text', onSelect: () => { setTimeout(() => showMenu(anchor, turnInto, { head: 'Turn into', searchable: true }), 0); } },
      { label: 'Duplicate', icon: 'copy', kbd: '', onSelect: () => { this.write(() => this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, type: block.type, text: block.text, props: JSON.parse(JSON.stringify(block.props || {})), after: block.id })); this.render(); } },
      { label: 'Move up', icon: 'chevronD', onSelect: () => this.nudge(block, -1) },
      { label: 'Move down', icon: 'chevronD', onSelect: () => this.nudge(block, 1) },
      'sep',
      { label: 'Delete', icon: 'trash', danger: true, onSelect: () => { this.write(() => this.store.deleteBlock(block.id)); this.render(); } },
    ], { onClose: () => el?.classList.remove('is-menu-open') });
  }

  nudge(block, dir) {
    const sibs = this.store.childBlocks(this.nodeId, block.parentId); const i = sibs.findIndex(s => s.id === block.id);
    const other = sibs[i + dir]; if (!other) return;
    this.write(() => this.store.moveBlock(block.id, dir < 0 ? { parentId: block.parentId, before: other.id } : { parentId: block.parentId, after: other.id }));
    this.render();
  }

  /* ---------------------------------------------------------------- paste */

  onPaste(e) {
    const t = e.target.closest?.('.blk__text'); if (!t) return;
    const blk = t.closest('.blk'); const block = this.store.block(blk.dataset.id); if (!block) return;
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain') || '';
    const html = e.clipboardData.getData('text/html') || '';
    if (blk.dataset.type === 'code' || t.dataset.sub || t.closest('.btable, .route')) { document.execCommand('insertText', false, plain); return; }
    const lines = plain.replace(/\r/g, '').split('\n');
    if (lines.length > 1 && TEXT_BLOCKS.has(block.type)) {
      const off = caretOffset(t); const before = t.textContent.slice(0, off); const after = t.textContent.slice(off);
      this.write(() => {
        this.store.updateBlock(block.id, { text: clean(esc(before + lines[0])) });
        let prev = block.id, last = null;
        lines.slice(1).forEach((line, i) => {
          const isLast = i === lines.length - 2;
          const m = /^([-*]|\d+[.)])\s+(.*)$/.exec(line);
          const nb = this.store.createBlock({ nodeId: this.nodeId, parentId: block.parentId, type: m ? (/^\d/.test(m[1]) ? 'number' : 'bullet') : 'paragraph', text: esc(m ? m[2] : line) + (isLast ? esc(after) : ''), after: prev });
          prev = nb.id; last = nb;
        });
        if (last) this.pendingFocus = { id: last.id, offset: lines[lines.length - 1].length };
      });
      this.render(); return;
    }
    const insert = html ? clean(html).replace(/\n/g, '<br>') : esc(plain);
    document.execCommand('insertHTML', false, insert);
    this.saveText(block.id, this.currentText(t));
  }

  /* ---------------------------------------------------------------- drag */

  onDragStart(e) {
    const handle = e.target.closest?.('.blk__handle'); if (!handle) return;
    const blk = handle.closest('.blk'); e.dataTransfer.setData('text/recamp-block', blk.dataset.id); e.dataTransfer.effectAllowed = 'move';
    blk.classList.add('is-dragging'); this.dragId = blk.dataset.id;
    try { e.dataTransfer.setDragImage(blk.querySelector('.blk__body'), 0, 12); } catch { /* ok */ }
  }
  onDragOver(e) {
    if (!this.dragId) return;
    const blk = e.target.closest?.('.blk'); if (!blk || blk.dataset.id === this.dragId) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    this.clearDragMarks();
    const r = blk.querySelector(':scope > .blk__body').getBoundingClientRect();
    blk.dataset.dragover = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
  }
  onDrop(e) {
    const id = e.dataTransfer.getData('text/recamp-block') || this.dragId; const blk = e.target.closest?.('.blk');
    this.clearDragMarks(); this.dragId = null;
    if (!id || !blk || blk.dataset.id === id) return;
    e.preventDefault();
    const target = this.store.block(blk.dataset.id); if (!target) return;
    const pos = e.clientY < blk.querySelector(':scope > .blk__body').getBoundingClientRect().top + blk.querySelector(':scope > .blk__body').offsetHeight / 2 ? 'before' : 'after';
    this.write(() => this.store.moveBlock(id, { parentId: target.parentId, [pos]: target.id }));
    this.render();
  }
  clearDragMarks() { this.root.querySelectorAll('[data-dragover]').forEach(el => delete el.dataset.dragover); }

  /* -------------------------------------------------------- inline toolbar */

  onSelectionChange() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return this.hideFmt();
    const anchor = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    const t = anchor?.closest?.('.blk__text'); if (!t || !this.root.contains(t) || t.closest('[data-type="code"], .eq__src') || this.readonly) return this.hideFmt();
    const rect = sel.getRangeAt(0).getBoundingClientRect(); if (!rect.width) return this.hideFmt();
    if (!this.fmt) {
      const b = (label, cmd, title) => h('button', { type: 'button', title, onmousedown: e => e.preventDefault(), onclick: () => { this.toggleInline(cmd); this.saveText(t.closest('.blk').dataset.id, this.currentText(t)); this.onSelectionChange(); }, html: label });
      this.fmt = h('div.fmt', { role: 'toolbar' }, b('<b>B</b>', 'bold', 'Bold  Ctrl+B'), b('<i>I</i>', 'italic', 'Italic  Ctrl+I'), b('<u>U</u>', 'underline', 'Underline  Ctrl+U'), b('<s>S</s>', 'strikeThrough', 'Strikethrough'), h('span.fmt__sep'), b('&lt;/&gt;', 'code', 'Code  Ctrl+E'), b('Link', 'link', 'Link'));
      document.body.append(this.fmt);
    }
    for (const btn of this.fmt.querySelectorAll('button')) { const cmd = btn.title.split(' ')[0].toLowerCase(); btn.setAttribute('aria-pressed', String(['bold', 'italic', 'underline', 'strikethrough'].includes(cmd) ? document.queryCommandState(cmd === 'strikethrough' ? 'strikeThrough' : cmd) : cmd === 'code' ? !!anchor.closest('code') : cmd === 'link' ? !!anchor.closest('a') : false)); }
    this.fmt.hidden = false;
    placeNear(this.fmt, { left: rect.left, right: rect.right, top: rect.top - 44, bottom: rect.top - 6 });
  }
  hideFmt() { if (this.fmt) this.fmt.hidden = true; }

  toggleInline(cmd) {
    if (cmd === 'code') {
      const sel = window.getSelection(); if (!sel.rangeCount) return;
      const anchor = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      const code = anchor.closest('code');
      if (code && code.closest('.blk__text')) { const parent = code.parentNode; while (code.firstChild) parent.insertBefore(code.firstChild, code); parent.removeChild(code); return; }
      const range = sel.getRangeAt(0); const el = document.createElement('code');
      try { range.surroundContents(el); } catch { el.append(range.extractContents()); range.insertNode(el); }
      return;
    }
    if (cmd === 'link') {
      const sel = window.getSelection(); if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0).cloneRange();
      const anchor = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      const existing = anchor.closest('a');
      prompt({ title: existing ? 'Edit link' : 'Add link', label: 'URL', value: existing?.getAttribute('href') || '', placeholder: 'https://' }).then(v => {
        if (v === null) return;
        sel.removeAllRanges(); sel.addRange(range);
        if (!v) { document.execCommand('unlink'); }
        else { document.execCommand('createLink', false, safeHref(v) || v); const t = anchor.closest('.blk__text'); t?.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; }); }
        const t = anchor.closest('.blk__text'); if (t) this.saveText(t.closest('.blk').dataset.id, this.currentText(t));
      });
      return;
    }
    document.execCommand(cmd);
  }
}

/* ------------------------------------------------------------------ utils */

function rangeFrom(el, offset) { const r = document.createRange(); const [n, o] = pointAt(el, offset); r.setStart(n, o); r.collapse(true); return r; }
function pointAt(el, offset) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node, remaining = offset, last = null;
  while ((node = walker.nextNode())) { last = node; if (remaining <= node.length) return [node, remaining]; remaining -= node.length; }
  return last ? [last, last.length] : [el, el.childNodes.length];
}
function caretRect() { const s = window.getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0).getClientRects()[0] || s.getRangeAt(0).getBoundingClientRect(); return r && (r.width || r.height) ? r : null; }
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function roman(n) { const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; }

export function mountEditor(ctx, host, nodeId, opts) { return new Editor(ctx, host, nodeId, opts); }
