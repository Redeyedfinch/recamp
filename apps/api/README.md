# apps/api — RECAMP Observatory backend

An Apps Script web app that stores the workspace snapshot in a Google Sheet
the forum owns. The UI lives on GitHub Pages and calls this over POST.

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
- The spreadsheet is a normal Google Sheet — share it with the committee
  through Drive as you would any Foundation document. The token gates the API,
  Drive sharing gates the data.
- No personal data is written by the seed. Whatever members type in is stored
  in the Sheet; treat it under the DPDP Act 2023 like any other member record.

## Merge semantics

`save` merges the incoming snapshot with what the Sheet holds, record by
record, by `updatedAt` (last write wins). Deletions are tombstones, so an old
client cannot resurrect an emptied page. If the server kept anything the
client did not send, the response carries the merged snapshot and the client
adopts it.
