# RECAMP Observatory

The internal workspace of **RECAMP — The Physical Science Forum**,
School of Sciences, JAIN (Deemed-to-be University), Bengaluru.

A Notion-style knowledge system for a student science forum: nested pages, a
block editor, databases whose rows are pages, events, projects, tasks, a
research notebook, meeting notes, a member directory, an observatory-style
activity log, and an archive of what the forum has built.

A student club project, run from a personal GitHub account. Not affiliated
with any employer's systems or data.

---

## Run it

```
npm test            # unit tests: ordering, store tree ops, seed provenance
npm run serve       # http://localhost:4180  (no build step, no dependencies)
npm run build       # web/ → docs/  (GitHub Pages root)
node build/qa.mjs   # headless screenshots of every route into qa/
node build/e2e.mjs  # end-to-end checklist through the real UI
```

Requires Node ≥ 20 and, for the QA scripts, Chrome or Edge.

## Layout

```
web/            the application — static ES modules, hand-written CSS
  css/          tokens → base → layout → components → editor → views → celestial
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

## Design

Dark graphite ground, warm ivory text, one instrument blue, amber only for
things happening now. Instrument Serif for mastheads and titles, IBM Plex Sans
for reading, IBM Plex Mono for coordinates, catalogue numbers and labels. No
utility framework, no component library, no gradients. Light mode is a
laboratory notebook, not a white dashboard.
