/**
 * RECAMP Observatory — Apps Script backend.
 * -------------------------------------------------------------------------
 * Its own Apps Script project, its own data spreadsheet. It stores the
 * workspace snapshot the frontend sends and hands it back; the UI itself is
 * served from GitHub Pages (Apps Script cannot be framed on iOS Safari).
 *
 * Wire format: POST body is JSON as text/plain (a CORS "simple request", so
 * no preflight). Response is JSON.
 *
 *   { action: 'ping' }                      → { ok, now }
 *   { action: 'info',  token }              → { ok, label, nodes, blocks, savedAt }
 *   { action: 'load',  token }              → { ok, snapshot }
 *   { action: 'save',  token, snapshot }    → { ok, savedAt, merged?, snapshot? }
 *
 * One-time setup, run from the editor:  setup()
 *   creates the spreadsheet, stores its id, and mints an access token that
 *   the frontend must present (Settings → Storage). Rotate with rotateToken().
 * -------------------------------------------------------------------------
 */

var SPREADSHEET_NM = 'RECAMP Observatory — Data';
var PROP_SHEET_ID  = 'RECAMP_SHEET_ID';
var PROP_TOKEN     = 'RECAMP_TOKEN';

/* ============================== web entry ============================== */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  // The one GET that does something: an unsubscribe link from an email. It is
  // signed per member, so it needs no session and cannot be pointed at anyone else.
  if (p.unsub) return handleUnsubscribe_(p.unsub, p.t);
  return json_({ ok: true, service: 'recamp-observatory', now: new Date().toISOString() });
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'Bad JSON' }); }
  var action = String(req.action || '');

  if (action === 'ping') return json_({ ok: true, now: new Date().toISOString() });

  if (!authorised_(req.token)) return json_({ ok: false, error: 'Not authorised' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (action === 'info') return json_(info_());
    if (action === 'load') return json_({ ok: true, snapshot: readSnapshot_() });
    if (action === 'save') return json_(save_(req.snapshot));
    if (action.lastIndexOf('mail.', 0) === 0) return json_(mailApi_(action.substring(5), req));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorised_(token) {
  var want = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  if (!want) return false;                       // setup() not run: refuse everything
  return String(token || '') === want;
}

/* ================================ setup ================================ */

/** Run once from the Apps Script editor. Prints the token to paste into Settings → Storage. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SHEET_ID);
  if (!id) {
    var ss = SpreadsheetApp.create(SPREADSHEET_NM);
    props.setProperty(PROP_SHEET_ID, ss.getId());
    id = ss.getId();
  }
  ensureSheets_(SpreadsheetApp.openById(id));
  var token = props.getProperty(PROP_TOKEN) || rotateToken();
  Logger.log('Spreadsheet: https://docs.google.com/spreadsheets/d/' + id);
  Logger.log('Access token: ' + token);
  return { sheetId: id, token: token };
}

function rotateToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty(PROP_TOKEN, token);
  Logger.log('New access token: ' + token);
  return token;
}

/* ============================== spreadsheet ============================== */

var SHEETS = {
  nodes:    ['id', 'kind', 'parentId', 'databaseId', 'title', 'icon', 'order', 'seq', 'provenance', 'dateConfidence', 'archived', 'deleted', 'createdAt', 'updatedAt', 'json'],
  blocks:   ['id', 'nodeId', 'parentId', 'type', 'order', 'archived', 'deleted', 'createdAt', 'updatedAt', 'json'],
  activity: ['id', 'at', 'type', 'nodeId', 'title', 'detail', 'actor'],
  meta:     ['key', 'json'],
  mail_log: ['at', 'announcementId', 'memberId', 'email', 'subject', 'status', 'error'],
};

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) throw new Error('Run setup() first');
  return SpreadsheetApp.openById(id);
}

function ensureSheets_(ss) {
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(SHEETS[name]); sh.setFrozenRows(1); }
  });
  var def = ss.getSheetByName('Sheet1'); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function readTable_(ss, name) {
  var sh = ss.getSheetByName(name); if (!sh) return [];
  var values = sh.getDataRange().getValues(); if (values.length < 2) return [];
  var head = values[0]; var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = {}; for (var c = 0; c < head.length; c++) row[head[c]] = values[r][c];
    if (row.id === '' && row.key === '') continue;
    out.push(row);
  }
  return out;
}

function writeTable_(ss, name, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = SHEETS[name];
  sh.clearContents();
  var data = [head].concat(rows.map(function (row) { return head.map(function (k) { var v = row[k]; return v == null ? '' : v; }); }));
  sh.getRange(1, 1, data.length, head.length).setValues(data);
  sh.setFrozenRows(1);
}

/* ----- snapshot ⇄ rows ----- */

function readSnapshot_() {
  var ss = ss_(); ensureSheets_(ss);
  var nodes = {}, blocks = {};
  readTable_(ss, 'nodes').forEach(function (r) {
    var n = parse_(r.json) || {};
    n.id = String(r.id); n.kind = r.kind; n.parentId = r.parentId; n.databaseId = r.databaseId || null; n.title = String(r.title || '');
    n.icon = r.icon || null; n.order = String(r.order); n.archived = r.archived === true || r.archived === 'TRUE'; n.deleted = r.deleted === true || r.deleted === 'TRUE';
    n.createdAt = String(r.createdAt); n.updatedAt = String(r.updatedAt); n.provenance = r.provenance || null;
    if (r.seq !== '') n.seq = Number(r.seq); if (r.dateConfidence) n.dateConfidence = r.dateConfidence;
    nodes[n.id] = n;
  });
  readTable_(ss, 'blocks').forEach(function (r) {
    var b = parse_(r.json) || {};
    b.id = String(r.id); b.nodeId = r.nodeId; b.parentId = r.parentId; b.type = r.type; b.order = String(r.order);
    b.archived = r.archived === true || r.archived === 'TRUE'; b.deleted = r.deleted === true || r.deleted === 'TRUE';
    b.createdAt = String(r.createdAt); b.updatedAt = String(r.updatedAt);
    blocks[b.id] = b;
  });
  var activity = readTable_(ss, 'activity').map(function (r) { return { id: String(r.id), at: String(r.at), type: r.type, nodeId: r.nodeId || null, title: String(r.title || ''), detail: String(r.detail || ''), actor: String(r.actor || '') }; });
  var meta = {}; readTable_(ss, 'meta').forEach(function (r) { meta[r.key] = parse_(r.json); });
  if (!Object.keys(nodes).length) return null;
  return { v: 1, savedAt: meta.savedAt || '', meta: meta.meta || {}, settings: meta.settings || {}, nodes: nodes, blocks: blocks, activity: activity, favorites: meta.favorites || [], recent: meta.recent || [] };
}

function writeSnapshot_(snap) {
  var ss = ss_(); ensureSheets_(ss);
  var nodeRows = Object.keys(snap.nodes).map(function (id) {
    var n = snap.nodes[id]; var rest = {};
    Object.keys(n).forEach(function (k) { if (SHEETS.nodes.indexOf(k) < 0) rest[k] = n[k]; });
    return { id: n.id, kind: n.kind, parentId: n.parentId, databaseId: n.databaseId || '', title: n.title || '', icon: n.icon || '', order: n.order, seq: n.seq == null ? '' : n.seq, provenance: n.provenance || '', dateConfidence: n.dateConfidence || '', archived: !!n.archived, deleted: !!n.deleted, createdAt: n.createdAt, updatedAt: n.updatedAt, json: JSON.stringify(rest) };
  });
  var blockRows = Object.keys(snap.blocks).map(function (id) {
    var b = snap.blocks[id]; var rest = {};
    Object.keys(b).forEach(function (k) { if (SHEETS.blocks.indexOf(k) < 0) rest[k] = b[k]; });
    return { id: b.id, nodeId: b.nodeId, parentId: b.parentId, type: b.type, order: b.order, archived: !!b.archived, deleted: !!b.deleted, createdAt: b.createdAt, updatedAt: b.updatedAt, json: JSON.stringify(rest) };
  });
  writeTable_(ss, 'nodes', nodeRows);
  writeTable_(ss, 'blocks', blockRows);
  writeTable_(ss, 'activity', (snap.activity || []).slice(0, 600));
  // mail_log is append-only and owned by Mail.js — a snapshot write must never
  // rewrite it, or the record of who was mailed would be lost on every save.
  writeTable_(ss, 'meta', [
    { key: 'savedAt', json: JSON.stringify(snap.savedAt) }, { key: 'meta', json: JSON.stringify(snap.meta || {}) },
    { key: 'settings', json: JSON.stringify(snap.settings || {}) }, { key: 'favorites', json: JSON.stringify(snap.favorites || []) },
    { key: 'recent', json: JSON.stringify(snap.recent || []) },
  ]);
}

/* ----- save with per-record last-write-wins ----- */

function save_(incoming) {
  if (!incoming || !incoming.nodes) return { ok: false, error: 'No snapshot' };
  var current = readSnapshot_();
  var merged = current ? merge_(incoming, current) : incoming;
  merged.savedAt = new Date().toISOString();
  writeSnapshot_(merged);
  var changed = current ? differs_(incoming, merged) : false;
  var out = { ok: true, savedAt: merged.savedAt, merged: changed };
  if (changed) out.snapshot = merged;      // client adopts what the server kept
  return out;
}

function merge_(a, b) {
  var pick = function (x, y) { return !x ? y : !y ? x : ((y.updatedAt || '') > (x.updatedAt || '') ? y : x); };
  var nodes = {}, blocks = {}, id;
  var ids = {}; Object.keys(a.nodes || {}).concat(Object.keys(b.nodes || {})).forEach(function (k) { ids[k] = 1; });
  for (id in ids) nodes[id] = pick(a.nodes[id], b.nodes[id]);
  var bids = {}; Object.keys(a.blocks || {}).concat(Object.keys(b.blocks || {})).forEach(function (k) { bids[k] = 1; });
  for (id in bids) blocks[id] = pick(a.blocks[id], b.blocks[id]);
  var seen = {}; var activity = (a.activity || []).concat(b.activity || []).filter(function (e) { if (seen[e.id]) return false; seen[e.id] = 1; return true; });
  activity.sort(function (x, y) { return y.at < x.at ? -1 : y.at > x.at ? 1 : 0; });
  var newer = (b.savedAt || '') > (a.savedAt || '') ? b : a; var older = newer === a ? b : a;
  var favs = {}; var favorites = (newer.favorites || []).concat(older.favorites || []).filter(function (f) { if (favs[f]) return false; favs[f] = 1; return true; });
  return { v: 1, savedAt: newer.savedAt, meta: merge2_(older.meta, newer.meta), settings: merge2_(older.settings, newer.settings), nodes: nodes, blocks: blocks, activity: activity.slice(0, 600), favorites: favorites, recent: newer.recent || older.recent || [] };
}
function merge2_(x, y) { var o = {}; Object.keys(x || {}).forEach(function (k) { o[k] = x[k]; }); Object.keys(y || {}).forEach(function (k) { o[k] = y[k]; }); return o; }

function differs_(a, b) {
  var k;
  for (k in b.nodes) if (!a.nodes[k] || a.nodes[k].updatedAt !== b.nodes[k].updatedAt) return true;
  for (k in b.blocks) if (!a.blocks[k] || a.blocks[k].updatedAt !== b.blocks[k].updatedAt) return true;
  return false;
}

function info_() {
  var ss = ss_(); ensureSheets_(ss);
  var meta = {}; readTable_(ss, 'meta').forEach(function (r) { meta[r.key] = parse_(r.json); });
  return { ok: true, label: ss.getName(), url: ss.getUrl(), nodes: Math.max(0, ss.getSheetByName('nodes').getLastRow() - 1), blocks: Math.max(0, ss.getSheetByName('blocks').getLastRow() - 1), savedAt: meta.savedAt || '' };
}

function parse_(s) { try { return s === '' || s == null ? null : JSON.parse(s); } catch (e) { return null; } }
