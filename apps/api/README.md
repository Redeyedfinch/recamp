# apps/api — RECAMP Observatory backend

An Apps Script web app that stores the workspace snapshot in a Google Sheet
the forum owns. The UI lives on GitHub Pages and calls this over POST.

**Current deployment** (project `1FQ7e47hqaIMq91JkUPfZ0VI1DcPOzhEjgtDSJRYjjmfD7_07gGfQl6e9`):

```
https://script.google.com/macros/s/AKfycby_1eOOY8-o2asQIVJsseln06-BQkyr1YNyoODKNp4rg28uqQ0ka5Q5j7BpffYZRFalUw/exec
```

It answers `ping` already. It refuses `load`/`save` until `setup()` has been
run once in the editor (`clasp open-script`), which creates the data
spreadsheet and prints the access token to paste into **Settings → Storage**.

## Deploy (once)

```powershell
cd apps\api
clasp login                     # the Google account that should OWN the data
clasp create --type webapp --title "RECAMP Observatory API"
clasp push
```

Then in the Apps Script editor (`clasp open-script`):

1. Run **`setup`** once. Authorise when asked. Open *Executions → logs*: it
   prints the spreadsheet URL and an **access token**.
2. **Deploy → New deployment → Web app**, execute as *Me*, access *Anyone*.
   Copy the `/exec` URL.
3. In the workspace: **Settings → Storage**, paste the URL and the token, and
   choose *Connect*. The local workspace is merged into the Sheet and stays in
   sync from then on.

Redeploy after code changes with `clasp push` then
`clasp create-deployment -i <DEPLOYMENT_ID> -d "what changed"` — reusing the
deployment id keeps the `/exec` URL stable.

## Security model

- Without a token from `setup()` the API refuses every call except `ping`.
- `rotateToken()` invalidates the old token; paste the new one into Settings.
- The spreadsheet is a normal Google Sheet in the owner's Drive — share it
  with the committee like any other club document. The token gates the API,
  Drive sharing gates the data.
- The seed contains no personal data. Whatever members type in is stored in
  the Sheet; member details are personal data under India's DPDP Act 2023, so
  collect only what the forum actually needs.

## Email

`Mail.js` sends announcements through the deploying account's Gmail quota
(`MailApp`). The frontend composes the message; this project decides who
actually receives it.

- **Consent is re-checked here.** The client sends a recipient list and every
  address on it is verified against the Sheet again — member exists, address
  matches, `subscribed === true`. A tampered or stale client cannot mail
  someone who opted out.
- **Messages go one at a time**, not as a BCC blast: each recipient is greeted
  by name and gets their own signed unsubscribe link, and a BCC list is one
  mistake away from leaking every member's address.
- **Quota is checked before the first send.** If fewer messages remain than
  there are recipients, nothing is sent at all rather than half a list.
  `MailApp.getRemainingDailyQuota()` reports the real figure (consumer Gmail
  accounts get far fewer per day than Workspace ones).
- **Every send is logged** to the `mail_log` sheet — timestamp, announcement,
  member, address, subject, status, error. Snapshot saves never rewrite it.
- **Unsubscribe** is `GET /exec?unsub=<memberId>&t=<token>`, where the token is
  an HMAC of the member id under a secret in Script Properties. It flips
  `subscribed` to false in the Sheet and shows a plain confirmation page. The
  next sync brings the change back to every client.

Actions: `mail.quota`, `mail.verify` (dry run), `mail.send`, `mail.log`.

**Not built on purpose:** nothing sends automatically. A time-driven trigger
that mails members without anyone reading the message first is a bad trade for
a small club on a small quota. If you want event reminders later, the safe
shape is a daily trigger that *drafts* an announcement for the committee to
review and send.

## Merge semantics

`save` merges the incoming snapshot with what the Sheet holds, record by
record, by `updatedAt` (last write wins). Deletions are tombstones, so an old
client cannot resurrect an emptied page. If the server kept anything the
client did not send, the response carries the merged snapshot and the client
adopts it.
