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

## Authorise it (once) — the only manual step

The project is already created, pushed and deployed. What remains is granting
it permission to touch your Drive and send mail as you. Google will not let a
script do either until you agree in person, which is why this one step cannot
be scripted.

**1. Open the editor**

```powershell
cd apps\api
clasp open-script
```

Or go straight there:
<https://script.google.com/d/1FQ7e47hqaIMq91JkUPfZ0VI1DcPOzhEjgtDSJRYjjmfD7_07gGfQl6e9/edit>

Check the account chip in the top right is the one that should **own the
forum's data** — whatever the script creates lives in that account's Drive.

**2. Run `setup`**

In the toolbar there is a function dropdown (it will show `doGet` or similar).
Choose **`setup`**, then press **Run**.

**3. Get past the consent screens**

- *"Authorization required"* → **Review permissions**, then choose your account.
- *"Google hasn't verified this app"* → expected, not a problem. The script is
  yours and unpublished, so it has no verified consent screen. Click
  **Advanced**, then **Go to RECAMP Observatory API (unsafe)**. It is your own
  code; "unsafe" here only means Google has not reviewed it.
- **Allow**. You are granting:
  - *see, edit, create and delete your spreadsheets* — it creates and maintains
    the data Sheet
  - *send email as you* — announcements go out from your address
  - *manage this script's deployment* — it reads its own `/exec` URL to build
    unsubscribe links

If you would rather not grant Gmail access at all, delete `Mail.js`, run
`clasp push`, and re-run `setup`. Everything except announcements still works.

**4. Copy the token**

When it finishes, the **Execution log** panel at the bottom prints:

```
Spreadsheet: https://docs.google.com/spreadsheets/d/…
Access token: 3f9c…
```

That token is the API key for this backend — treat it like a password. Anyone
with it *and* the `/exec` URL can read and write the whole workspace.

**5. Connect the workspace**

In RECAMP → **Settings → Storage**, paste:

- **URL** — the `/exec` address at the top of this file
- **Access token** — the one from the log

then press **Connect**. Your local workspace merges into the Sheet and the
status line changes from *Stored in this browser only* to *Synced*.

Use the same two values on any other device and they share one workspace.

### If it goes wrong

| What you see | What it means |
| --- | --- |
| `Run setup() first` | `setup` did not complete — re-run it and look for a red error in the log |
| `Not authorised` | Wrong or missing token. Re-run `setup`; it reprints the existing token rather than minting a new one |
| A sign-in page instead of JSON | Deployment access is not *Anyone*: **Deploy → Manage deployments → edit → Who has access → Anyone** |
| Mail fails with a permission error | `Mail.js` arrived after you authorised. Re-run `setup` to trigger the new consent prompt |

`rotateToken()` issues a new token and invalidates the old one — run it if the
token ever leaks, then update Settings on every device.

### Redeploying after code changes

```powershell
clasp push
clasp create-deployment -i AKfycby_1eOOY8-o2asQIVJsseln06-BQkyr1YNyoODKNp4rg28uqQ0ka5Q5j7BpffYZRFalUw -d "what changed"
```

Reusing that deployment id keeps the `/exec` URL stable, so nobody has to
re-paste anything.

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
