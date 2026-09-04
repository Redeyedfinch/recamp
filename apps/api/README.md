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

## Merge semantics

`save` merges the incoming snapshot with what the Sheet holds, record by
record, by `updatedAt` (last write wins). Deletions are tombstones, so an old
client cannot resurrect an emptied page. If the server kept anything the
client did not send, the response carries the merged snapshot and the client
adopts it.
