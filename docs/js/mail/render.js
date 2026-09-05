/**
 * Blocks → email HTML and plain text.
 *
 * Mail clients are not browsers: no external stylesheets, no custom fonts, no
 * flexbox worth trusting. Everything is inline-styled, single-column, and
 * light — a dark editorial template would be unreadable in half the clients
 * that invert it. Instrument Serif is unavailable, so the masthead falls back
 * to Georgia, which is the closest thing every client already has.
 */
import { esc } from '../core/dom.js';
import { stripHtml } from '../data/store.js';
import { fmtDate } from '../core/dates.js';

const PAPER = '#f6f3ec', INK = '#191c1f', MUTED = '#565e66', LINE = '#dcd5c8', BLUE = '#2c6a8c', AMBER = '#8d5f1c';
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

/** Keep only the inline tags mail clients render predictably. */
export function inline(html) {
  return String(html || '')
    .replace(/<(?!\/?(b|strong|i|em|u|s|code|a|br|mark)\b)[^>]*>/gi, '')
    .replace(/<a\b([^>]*)>/gi, (m, attrs) => {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || '';
      return /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}" style="color:${BLUE}">` : '';
    })
    .replace(/<code>/gi, `<code style="font-family:${MONO};font-size:13px;background:#e9e4da;padding:1px 4px;border-radius:2px">`)
    .replace(/<mark>/gi, `<mark style="background:#f3e2c6">`);
}

/** Render a node's block tree as email HTML. `blocks` is store.blockTree(id). */
export function blocksToHtml(tree, { depth = 0 } = {}) {
  let out = '';
  let counter = 0;
  for (const { block, children } of tree) {
    const kids = children.length ? blocksToHtml(children, { depth: depth + 1 }) : '';
    const text = inline(block.text);
    counter = block.type === 'number' ? counter + 1 : 0;
    switch (block.type) {
      case 'h1': out += `<h1 style="margin:28px 0 10px;font-family:${SERIF};font-size:24px;font-weight:400;line-height:1.2;color:${INK}">${text}</h1>`; break;
      case 'h2': out += `<div style="margin:26px 0 8px;font-family:${MONO};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};padding-bottom:6px">${text}</div>`; break;
      case 'h3': out += `<h3 style="margin:20px 0 6px;font-family:${SANS};font-size:16px;font-weight:600;color:${INK}">${text}</h3>`; break;
      case 'bullet': out += `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0"><tr><td style="width:18px;vertical-align:top;color:${MUTED};font-size:15px;line-height:1.6">&bull;</td><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:${INK}">${text}${kids}</td></tr></table>`; break;
      case 'number': out += `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0"><tr><td style="width:22px;vertical-align:top;color:${MUTED};font-family:${MONO};font-size:13px;line-height:1.7">${counter}.</td><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:${INK}">${text}${kids}</td></tr></table>`; break;
      case 'todo': out += `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0"><tr><td style="width:20px;vertical-align:top;color:${MUTED};font-family:${MONO};font-size:13px;line-height:1.7">${block.props?.done ? '&#10003;' : '&#9744;'}</td><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:${block.props?.done ? MUTED : INK}">${text}${kids}</td></tr></table>`; break;
      case 'quote': out += `<blockquote style="margin:16px 0;padding:2px 0 2px 14px;border-left:2px solid ${LINE};font-family:${SERIF};font-size:18px;line-height:1.45;color:${INK}">${text}</blockquote>`; break;
      case 'callout': out += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="padding:12px 14px;border:1px solid ${LINE};border-left:2px solid ${block.props?.tone === 'stellar' ? AMBER : BLUE};background:#fbf9f4;font-family:${SANS};font-size:14px;line-height:1.55;color:${INK}">${text}</td></tr></table>`; break;
      case 'divider': out += `<div style="margin:22px 0;border-top:1px solid ${LINE}"></div>`; break;
      case 'code': out += `<pre style="margin:14px 0;padding:12px 14px;background:#efebe2;border:1px solid ${LINE};border-radius:3px;font-family:${MONO};font-size:13px;line-height:1.5;color:${INK};white-space:pre-wrap;word-break:break-word">${esc(block.text)}</pre>`; break;
      case 'equation': out += `<div style="margin:14px 0;padding:10px;text-align:center;font-family:${MONO};font-size:14px;color:${INK};background:#efebe2;border-radius:3px">${esc(block.text)}</div>`; break;
      case 'image': if (block.props?.url) out += `<div style="margin:16px 0"><img src="${esc(block.props.url)}" alt="${esc(stripHtml(block.text))}" style="max-width:100%;border:1px solid ${LINE};border-radius:3px" /></div>`; break;
      case 'link': case 'file': if (block.props?.url) out += `<div style="margin:10px 0;font-family:${SANS};font-size:15px"><a href="${esc(block.props.url)}" style="color:${BLUE}">${esc(block.props.title || block.props.name || block.props.url)}</a></div>`; break;
      case 'table': out += renderTable(block); break;
      case 'timeline': out += renderRoute(block); break;
      case 'toggle': out += `<div style="margin:10px 0"><div style="font-family:${SANS};font-size:15px;font-weight:600;color:${INK}">${text}</div>${kids}</div>`; break;
      case 'paragraph': default:
        if (stripHtml(block.text).trim() || kids) out += `<p style="margin:12px 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK}">${text}</p>${kids}`;
    }
  }
  return out;
}

function renderTable(block) {
  const rows = block.props?.rows || [];
  if (!rows.length) return '';
  const cells = rows.map((r, i) => `<tr>${r.map(c => `<td style="border:1px solid ${LINE};padding:7px 10px;font-family:${i === 0 ? MONO : SANS};font-size:${i === 0 ? '11px' : '14px'};${i === 0 ? `letter-spacing:.1em;text-transform:uppercase;color:${MUTED};background:#efebe2` : `color:${INK}`}">${inline(c)}</td>`).join('')}</tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;width:100%">${cells}</table>`;
}

function renderRoute(block) {
  const stations = block.props?.stations || [];
  if (!stations.length) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">${stations.map(s => `<tr>
    <td style="width:84px;vertical-align:top;padding:8px 12px 8px 0;font-family:${MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED}">${inline(s.label)}</td>
    <td style="vertical-align:top;padding:8px 0;border-left:1px solid ${LINE};padding-left:14px">
      <div style="font-family:${SANS};font-size:15px;font-weight:600;color:${INK}">${inline(s.title)}</div>
      ${stripHtml(s.text).trim() ? `<div style="font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED};margin-top:3px">${inline(s.text)}</div>` : ''}
    </td></tr>`).join('')}</table>`;
}

/**
 * The full message. `unsubUrl` is per-recipient; when absent (preview) the
 * footer says so rather than showing a link that would not work.
 */
export function emailHtml({ title, kicker = '', intro = '', bodyHtml = '', meta = [], recipientName = '', unsubUrl = '', footerNote = '', workspace = {} }) {
  const metaRows = meta.filter(m => m && m.value).map(m => `<tr>
      <td style="padding:3px 14px 3px 0;font-family:${MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top">${esc(m.label)}</td>
      <td style="padding:3px 0;font-family:${SANS};font-size:14px;color:${INK}">${esc(m.value)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#e9e4da">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e4da;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${PAPER};border:1px solid ${LINE};border-radius:4px">
  <tr><td style="padding:26px 30px 0">
    <div style="font-family:${SERIF};font-size:30px;line-height:1;color:${INK};letter-spacing:.01em">${esc(workspace.name || 'RECAMP')}</div>
    <div style="margin-top:6px;font-family:${MONO};font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${MUTED}">${esc(workspace.descriptor || 'The Physical Science Forum')}</div>
  </td></tr>
  <tr><td style="padding:18px 30px 0"><div style="border-top:1px solid ${LINE}"></div></td></tr>
  <tr><td style="padding:20px 30px 0">
    ${kicker ? `<div style="font-family:${MONO};font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${AMBER};margin-bottom:10px">${esc(kicker)}</div>` : ''}
    <h1 style="margin:0;font-family:${SERIF};font-size:28px;font-weight:400;line-height:1.15;color:${INK}">${esc(title)}</h1>
    ${recipientName ? `<p style="margin:16px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK}">Hello ${esc(recipientName.split(/\s+/)[0])},</p>` : ''}
    ${intro ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK}">${inline(intro)}</p>` : ''}
  </td></tr>
  ${metaRows ? `<tr><td style="padding:18px 30px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};width:100%;padding:8px 0">${metaRows}</table></td></tr>` : ''}
  <tr><td style="padding:4px 30px 26px">${bodyHtml}</td></tr>
  <tr><td style="padding:0 30px 26px">
    <div style="border-top:1px solid ${LINE};padding-top:14px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED}">
      ${footerNote ? `${esc(footerNote)}<br>` : ''}
      You are receiving this because you are listed as a member of ${esc(workspace.name || 'RECAMP')}${workspace.institution ? `, ${esc(workspace.institution)}` : ''}.
      ${unsubUrl ? `<br><a href="${esc(unsubUrl)}" style="color:${MUTED};text-decoration:underline">Unsubscribe from these emails</a>` : '<br><span style="color:#a8afb5">(Each recipient gets their own unsubscribe link.)</span>'}
    </div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

/** Plain-text alternative — some clients and every screen reader prefer it. */
export function emailText({ title, intro = '', tree = [], meta = [], unsubUrl = '', workspace = {} }) {
  const lines = [String(workspace.name || 'RECAMP').toUpperCase(), (workspace.descriptor || '').toUpperCase(), '', title, '='.repeat(Math.min(60, title.length)), ''];
  if (intro) lines.push(stripHtml(intro), '');
  for (const m of meta.filter(m => m && m.value)) lines.push(`${m.label.toUpperCase()}: ${m.value}`);
  if (meta.some(m => m && m.value)) lines.push('');
  const walk = (nodes, indent = '') => {
    let n = 0;
    for (const { block, children } of nodes) {
      const t = stripHtml(block.text).trim();
      n = block.type === 'number' ? n + 1 : 0;
      if (block.type === 'divider') lines.push(indent + '—'.repeat(30));
      else if (block.type === 'h2') lines.push('', indent + t.toUpperCase());
      else if (['h1', 'h3'].includes(block.type)) lines.push('', indent + t);
      else if (block.type === 'bullet') lines.push(`${indent}  - ${t}`);
      else if (block.type === 'number') lines.push(`${indent}  ${n}. ${t}`);
      else if (block.type === 'todo') lines.push(`${indent}  [${block.props?.done ? 'x' : ' '}] ${t}`);
      else if (block.type === 'table') (block.props?.rows || []).forEach(r => lines.push(indent + r.map(c => stripHtml(c)).join(' | ')));
      else if (block.type === 'timeline') (block.props?.stations || []).forEach(s => lines.push(`${indent}  ${stripHtml(s.label)}: ${stripHtml(s.title)} ${stripHtml(s.text)}`.trimEnd()));
      else if (block.props?.url) lines.push(indent + block.props.url);
      else if (t) lines.push(indent + t);
      if (children.length) walk(children, indent + '  ');
    }
  };
  walk(tree);
  lines.push('', '—'.repeat(30), `You are receiving this because you are listed as a member of ${workspace.name || 'RECAMP'}.`);
  if (unsubUrl) lines.push(`Unsubscribe: ${unsubUrl}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Build subject + body for an announcement record (optionally about an event). */
export function composeFromRecord(store, node, { event = null } = {}) {
  const tree = store.blockTree(node.id);
  const meta = [];
  if (event) {
    const dateLabel = event.props.date ? fmtDate(event.props.date) : (event.dateConfidence === 'year' && event.props.year ? `${event.props.year} — exact date to be confirmed` : 'Date to be confirmed');
    meta.push({ label: 'Event', value: event.title || 'Untitled' });
    meta.push({ label: 'Date', value: dateLabel });
    if (event.props.time) meta.push({ label: 'Time', value: event.props.time });
    if (event.props.venue) meta.push({ label: 'Venue', value: event.props.venue });
    if (event.props.type) meta.push({ label: 'Type', value: event.props.type });
    if (event.props.registration) meta.push({ label: 'Register', value: event.props.registration });
  }
  return { subject: node.props?.subject || node.title || 'Untitled', title: node.title || 'Untitled', intro: node.props?.intro || '', tree, meta, bodyHtml: blocksToHtml(tree) };
}
