# RECAMP Observatory

The internal workspace of **RECAMP — The Physical Science Forum**,
School of Sciences, JAIN (Deemed-to-be University), Bengaluru.

A Notion-style knowledge system for a student science forum: nested pages, a
block editor, databases whose rows are pages, events, projects, tasks, a
research notebook, meeting notes, a member directory, an observatory-style
activity log, and an archive of what the forum has built.

A student club project, run from a personal GitHub account. Not affiliated
with any employer's systems or data.

**Live:** https://redeyedfinch.github.io/recamp/ · **Source:** https://github.com/Redeyedfinch/recamp

---

## Run it

```
npm test            # unit tests: ordering, store tree ops, seed provenance
npm run serve       # http://localhost:4180  (no build step, no dependencies)
npm run build       # web/ → docs/  (GitHub Pages root)
node build/qa.mjs   # screenshots of every route into qa/ (--light --mobile --url)
node build/e2e.mjs  # end-to-end checklist through the real UI
```

Requires Node ≥ 20 and, for the QA scripts, Chrome or Edge.

## Layout

```
web/            the application — static ES modules, hand-written CSS
  css/          tokens → base → layout → components → editor → views → celestial → mobile
  js/core       ids, fractional ordering, dates, icons, DOM helpers
  js/data       schema, seed (with provenance), store, storage adapters
  js/editor     block editor, KaTeX loader
  js/ui         shell, sidebar, palette, menus, dialogs, starfield, plates
  js/views      home, page, database, archive, activity, inbox, …
apps/api/       Apps Script backend: snapshot ⇄ Google Sheet (see its README)
build/          build, dev server, QA harness
tests/          node:test suites
notes/          ARCHITECTURE.md — the decisions and why
docs/           generated GitHub Pages output
```

## Working from another device

The **code** travels through git. The **workspace content** does not — until a
Sheet is connected it lives in `localStorage`, which is per-browser and
per-device. Two devices on the same URL still hold two separate workspaces.

```bash
git clone https://github.com/Redeyedfinch/recamp.git
cd recamp
npm test            # no npm install — the project has zero dependencies
npm run serve
```

To bring the content across, either:

- **Connect the Sheet** (permanent, and how the committee should work) — run
  `setup()` once in the Apps Script editor, then paste the `/exec` URL and
  token into **Settings → Storage** on *every* device. Each one merges into the
  same Sheet and pulls others' changes on focus and every 90 s.
- **Move a file once** — **Settings → Data → Export JSON** on the old device,
  **Import JSON** on the new one. The import merges rather than overwrites:
  the newer version of each record wins.

For `clasp push` from a new machine, run `clasp login` with the account that
owns the script; the script id is already in `apps/api/.clasp.json`. Only the
credentials (`~/.clasprc.json`) are machine-local, and they are never
committed.

## How it stores things

Local-first. The workspace lives in the browser until **Settings → Storage**
is pointed at a deployed copy of `apps/api`, after which it merges into a
Google Sheet the forum owns and stays in sync. Records merge by
last-write-wins per record; deletions are tombstones. See
`notes/ARCHITECTURE.md`.

## Facts vs. placeholders

Every seeded record carries a provenance mark. **SOURCED** content comes from
RECAMP's public description of itself (the eight documented activities, the
Instagram handle, the forum's stated purpose). **DEMO** content is placeholder
— no member names, statistics, sponsors, awards or testimonials are invented,
and where a date is not known the record says *Date unavailable*. The seed
tests in `tests/seed.test.mjs` enforce this.

## Mobile

Phones (≤640px) get a recomposed layout, not the desktop stacked: the database
table becomes labelled record cards with empty properties dropped, the calendar
becomes an agenda, the board a swipeable deck that opens on the first column
holding records, breadcrumbs collapse to one step back plus where you are, and
a record shows the properties it has filled with the rest one tap away. The
block drag handle is replaced by a menu button, since HTML5 drag never fires on
touch. `node build/qa.mjs --mobile` and the mobile steps in `build/e2e.mjs`
cover it.

## Google sign-in (optional)

The entry screen can sign people in with Google. It uses Google Identity
Services, needs a free OAuth client id, and involves no billing and no app
review — the only scopes are name, email and profile.

1. <https://console.cloud.google.com/apis/credentials> → pick or create a project.
2. **OAuth consent screen** → type **External**, app name, your address for
   support and developer contact. **Publish app** so anyone can sign in;
   leaving it in testing limits it to addresses you add as *Test users*.
3. **Create credentials → OAuth client ID → Web application**.
4. **Authorised JavaScript origins** — add `https://redeyedfinch.github.io`
   (and `http://localhost:4180` for the dev server). Scheme and host only, no
   path. Leave **redirect URIs empty**: the ID-token flow does not use one.
5. Paste the client id into the dialog behind *Sign in with Google*.

The client id is public by design and there is no client secret.

**What it does and does not do.** Signing in records *who is editing* — the
name and email land on activity entries. It is not access control: the
workspace is local-first, and the data in the Sheet is governed by the Apps
Script token and by who the Sheet is shared with in Drive. Turning sign-in
into real authorisation would mean verifying the ID token inside `apps/api`
and checking the address against the Members list; that is not built.

## Email

The forum can announce events and news to its members. Announcements are
records like anything else, so every message stays in the archive with who it
went to and when.

A member receives email only if they have an address **and** have ticked
*Subscribed* — consent is checked in the browser and again on the server, so
an edited client cannot mail someone who opted out. Each message is sent
individually, greets the person by name, and carries its own signed
unsubscribe link that works without logging in. Every send is written to a
`mail_log` sheet.

Sending needs the Apps Script backend (`apps/api`), which uses the deploying
account's Gmail quota; the compose dialog shows how many messages are left and
refuses to send a partial list. Nothing sends automatically — see
`apps/api/README.md` for why.

Addresses are personal data under the DPDP Act 2023: collect them with
consent, keep them only while someone is in the forum, and honour removal
requests. The unsubscribe link does that last part on its own.

## Design

Dark graphite ground, warm ivory text, one instrument blue, amber only for
things happening now. Instrument Serif for mastheads and titles, IBM Plex Sans
for reading, IBM Plex Mono for coordinates, catalogue numbers and labels. No
utility framework, no component library, no gradients. Light mode is a
laboratory notebook, not a white dashboard.
