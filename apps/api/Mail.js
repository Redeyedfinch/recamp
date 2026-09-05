/**
 * RECAMP Observatory — outgoing mail.
 * -------------------------------------------------------------------------
 * Sends announcements to members through the deploying account's Gmail quota.
 *
 * Three rules this file exists to enforce, none of which the browser can be
 * trusted with:
 *
 *   1. CONSENT IS RE-CHECKED HERE. The client sends a recipient list; every
 *      address on it is verified against the Sheet again (member exists, the
 *      address matches, `subscribed` is true). A tampered or stale client
 *      cannot mail someone who opted out.
 *   2. EVERY RECIPIENT GETS AN UNSUBSCRIBE LINK, signed so it cannot be forged
 *      and cannot be used to unsubscribe anyone else.
 *   3. EVERY SEND IS LOGGED to the mail_log sheet, so the committee can always
 *      answer "who was told what, and when".
 *
 * Messages go one at a time rather than as one BCC blast: personalisation and
 * per-person unsubscribe are worth more than the quota saving, and a BCC list
 * is one misconfiguration away from leaking every member's address.
 * -------------------------------------------------------------------------
 */

var PROP_SECRET = 'RECAMP_UNSUB_SECRET';
var MAIL_LOG = 'mail_log';

/* ============================== dispatcher ============================== */

function mailApi_(fn, p) {
  if (fn === 'quota')  return { ok: true, remaining: MailApp.getRemainingDailyQuota() };
  if (fn === 'verify') return mailVerify_(p);
  if (fn === 'send')   return mailSend_(p);
  if (fn === 'log')    return mailLog_(p);
  return { ok: false, error: 'Unknown mail function' };
}

/* ------------------------------------------------------------ recipients */

/** The Sheet's own view of who may be mailed. */
function mailableMembers_() {
  var snap = readSnapshot_();
  var out = {};
  if (!snap) return out;
  for (var id in snap.nodes) {
    var n = snap.nodes[id];
    if (!n || n.deleted || n.archived || n.databaseId !== 'db_members') continue;
    var props = n.props || {};
    var email = String(props.email || '').trim().toLowerCase();
    if (!email || props.subscribed !== true) continue;
    if (!/^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(email)) continue;
    out[id] = { id: id, name: String(n.title || ''), email: email };
  }
  return out;
}

/** Dry run: what would actually go out, and what the quota allows. */
function mailVerify_(p) {
  var allowed = mailableMembers_();
  var asked = (p && p.recipients) || [];
  var ok = [], refused = [];
  for (var i = 0; i < asked.length; i++) {
    var r = asked[i];
    var m = allowed[r.id];
    if (!m) refused.push({ id: r.id, name: r.name || '', reason: 'not subscribed, or no address on the Sheet' });
    else if (m.email !== String(r.email || '').trim().toLowerCase()) refused.push({ id: r.id, name: m.name, reason: 'address differs from the Sheet' });
    else ok.push(m);
  }
  return { ok: true, recipients: ok, refused: refused, remaining: MailApp.getRemainingDailyQuota() };
}

/* ----------------------------------------------------------------- send */

function mailSend_(p) {
  p = p || {};
  var subject = String(p.subject || '').trim();
  var html = String(p.html || '');
  var text = String(p.text || '');
  if (!subject) return { ok: false, error: 'The message needs a subject line.' };
  if (!html) return { ok: false, error: 'The message has no body.' };

  var check = mailVerify_(p);
  var list = check.recipients;
  if (!list.length) return { ok: false, error: 'Nobody on this list can be mailed. Members need an address and Subscribed ticked.', refused: check.refused };

  var remaining = MailApp.getRemainingDailyQuota();
  if (remaining < list.length) {
    return { ok: false, error: 'Not enough daily quota left: ' + remaining + ' remaining, ' + list.length + ' needed. Nothing was sent — try again tomorrow or send to a smaller group.', refused: check.refused, remaining: remaining };
  }

  var fromName = String(p.fromName || 'RECAMP').slice(0, 80);
  var replyTo = String(p.replyTo || '').trim();
  var annId = String(p.announcementId || '');
  var base = deploymentUrl_();
  var sent = [], failed = [], rows = [], now = new Date();

  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    var unsub = base ? base + '?unsub=' + encodeURIComponent(m.id) + '&t=' + unsubToken_(m.id) : '';
    var first = (m.name || '').split(/\s+/)[0] || 'there';
    var opts = {
      htmlBody: personalise_(html, first, m.name, unsub),
      name: fromName,
      body: personalise_(text, first, m.name, unsub),
    };
    if (replyTo) opts.replyTo = replyTo;
    try {
      MailApp.sendEmail(m.email, subject, opts.body, opts);
      sent.push({ id: m.id, email: m.email });
      rows.push([now.toISOString(), annId, m.id, m.email, subject, 'sent', '']);
    } catch (err) {
      var msg = String(err && err.message || err);
      failed.push({ id: m.id, email: m.email, error: msg });
      rows.push([now.toISOString(), annId, m.id, m.email, subject, 'failed', msg]);
    }
  }
  appendLog_(rows);
  return { ok: true, sent: sent.length, failed: failed, refused: check.refused, sentAt: now.toISOString(), remaining: MailApp.getRemainingDailyQuota() };
}

function personalise_(s, first, full, unsub) {
  return String(s)
    .replace(/\{\{FIRST_NAME\}\}/g, first)
    .replace(/\{\{NAME\}\}/g, full || first)
    .replace(/\{\{UNSUB_URL\}\}/g, unsub);
}

/* ------------------------------------------------------------ unsubscribe */

function unsubSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty(PROP_SECRET);
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty(PROP_SECRET, s); }
  return s;
}

function unsubToken_(memberId) {
  var raw = Utilities.computeHmacSha256Signature(String(memberId), unsubSecret_());
  var hex = '';
  for (var i = 0; i < raw.length; i++) { var b = (raw[i] + 256) % 256; hex += (b < 16 ? '0' : '') + b.toString(16); }
  return hex.slice(0, 32);
}

/** Called from doGet. Flips `subscribed` to false and returns a small page. */
function handleUnsubscribe_(memberId, token) {
  if (!memberId || unsubToken_(memberId) !== String(token || '')) return unsubPage_('That link is not valid.', 'It may have been altered. Ask the committee to remove you and they will do it by hand.');
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var ss = ss_(); ensureSheets_(ss);
    var sh = ss.getSheetByName('nodes');
    var values = sh.getDataRange().getValues();
    var head = values[0], idCol = head.indexOf('id'), jsonCol = head.indexOf('json'), updCol = head.indexOf('updatedAt');
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(memberId)) continue;
      var rest = parse_(values[r][jsonCol]) || {};
      rest.props = rest.props || {};
      if (rest.props.subscribed === false) return unsubPage_('You are already unsubscribed.', 'No further emails will be sent to you.');
      rest.props.subscribed = false;
      var stamp = new Date().toISOString();
      sh.getRange(r + 1, jsonCol + 1).setValue(JSON.stringify(rest));
      if (updCol >= 0) sh.getRange(r + 1, updCol + 1).setValue(stamp);
      appendLog_([[stamp, '', memberId, String(rest.props.email || ''), '', 'unsubscribed', '']]);
      return unsubPage_('You have been unsubscribed.', 'RECAMP will not email you again. If this was a mistake, tell the committee and they can add you back.');
    }
    return unsubPage_('We could not find that record.', 'You may already have been removed.');
  } catch (err) {
    return unsubPage_('Something went wrong.', 'Please tell the committee so they can remove you by hand.');
  } finally { try { lock.releaseLock(); } catch (ignore) {} }
}

function unsubPage_(headline, detail) {
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RECAMP</title></head>'
    + '<body style="margin:0;background:#e9e4da;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
    + '<div style="max-width:520px;margin:12vh auto;padding:32px;background:#f6f3ec;border:1px solid #dcd5c8;border-radius:4px">'
    + '<div style="font-family:Georgia,serif;font-size:30px;color:#191c1f">RECAMP</div>'
    + '<div style="margin-top:6px;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#565e66">The Physical Science Forum</div>'
    + '<div style="margin:22px 0 0;border-top:1px solid #dcd5c8;padding-top:20px">'
    + '<h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#191c1f">' + headline + '</h1>'
    + '<p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#565e66">' + detail + '</p></div></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('RECAMP');
}

/* -------------------------------------------------------------------- log */

function appendLog_(rows) {
  if (!rows || !rows.length) return;
  var ss = ss_();
  var sh = ss.getSheetByName(MAIL_LOG);
  if (!sh) { sh = ss.insertSheet(MAIL_LOG); sh.appendRow(['at', 'announcementId', 'memberId', 'email', 'subject', 'status', 'error']); sh.setFrozenRows(1); }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function mailLog_(p) {
  var limit = Math.min(Number((p && p.limit) || 100), 500);
  var ss = ss_();
  var sh = ss.getSheetByName(MAIL_LOG);
  if (!sh || sh.getLastRow() < 2) return { ok: true, entries: [] };
  var n = Math.min(limit, sh.getLastRow() - 1);
  var values = sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getValues();
  var out = values.map(function (r) {
    return { at: String(r[0]), announcementId: String(r[1]), memberId: String(r[2]), email: String(r[3]), subject: String(r[4]), status: String(r[5]), error: String(r[6]) };
  }).reverse();
  return { ok: true, entries: out };
}

/** The /exec URL of this deployment, used to build unsubscribe links. */
function deploymentUrl_() {
  try { var u = ScriptApp.getService().getUrl(); return u ? String(u) : ''; } catch (e) { return ''; }
}
