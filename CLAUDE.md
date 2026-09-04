# RECAMP Observatory — agent brief

Read this instead of exploring the tree. `notes/ARCHITECTURE.md` is the long
version — open it only when changing the data model or storage.

Internal workspace for **RECAMP**, the Physical Science Forum of the School of
Sciences, Jain (Deemed-to-be University), Bengaluru. Notion-style: nested
pages, a block editor, databases whose rows *are* pages, events / projects /
tasks / research notes / meeting notes / members, and an archive of the
forum's past events.

Live: https://redeyedfinch.github.io/recamp/ · Repo: `Redeyedfinch/recamp`

## Hard rules

1. **Never invent facts about RECAMP.** Only these are established: the eight
   documented events (Chandrayaan-3 Model Exhibition · Cosmic Conversations /
   AXIOM-4 · Freshers' Orientation 2025 · Mini Olympics 2.0 · The Code of
   Conflict · NEXUS 2026 · Gates of Solace, 09 Feb 2026 · Higher Education
   Guest Lecture), the handle `@recamp_jgi`, and the forum's description of
   itself. Everything else is `provenance: 'demo'` or `null`. No member names,
   counts, sponsors, awards or testimonials. Dates are never guessed —
   `dateConfidence: 'exact' | 'year' | 'unavailable'`. `tests/seed.test.mjs`
   enforces all of this; if a change makes it fail, the change is wrong.
2. **No utility framework, component library, or Inter.** All styling goes
   through the tokens in `web/css/tokens.css`; components never contain raw
   hex. Type is Instrument Serif (display) / IBM Plex Sans (UI) / IBM Plex Mono
   (labels, coordinates, IDs). No gradients, no glassmorphism, minimal radii
   (3px controls, 6px surfaces), cards only where containment means something —
   otherwise typography + hairline + whitespace.
3. **Personal student project.** Commit as `Redeyedfinch
   <adwaithca0@gmail.com>` (already the repo's local git config). No employer
   conventions, document-control IDs, or org policy language anywhere.
4. **`docs/` is generated** by `node build/build.mjs` from `web/`. Never edit it
   by hand; rebuild before committing if `web/` changed.

## Stack

Zero dependencies. Static ES modules loaded natively + hand-written CSS. Node
≥20 is needed only for tests and the build/QA scripts; there is no bundler, so
the file you read is the file that runs.

## Data model

One node table, three kinds — `page`, `database`, `record`. A **record is a
node**, so an event row has a title, icon, children and its own blocks; that is
the load-bearing decision. Blocks are a flat list with `parentId` pointing at a
node or another block. Sibling order is a fractional index string
(`core/order.js`): reordering rewrites one field, never renumbers siblings.

Storage is local-first behind an adapter (`load/save/info/clear`):
`LocalAdapter` → `localStorage` (default, no setup), `CloudAdapter` → Apps
Script → Google Sheet. Saves are whole-snapshot and debounced; merges are
per-record last-write-wins by `updatedAt`; deletions are tombstones so a stale
client can't resurrect an emptied page.

## Layout

```
web/css/     tokens → base → layout → components → editor → views → celestial
web/js/core  id, order (fractional), dates, icons, dom (h() hyperscript)
web/js/data  schema, seed (provenance!), store, adapters/
web/js/editor  block editor, katex loader
web/js/ui    shell, sidebar, palette, menu, dialog, toast, starfield, plate, props
web/js/views home, page, database, archive, activity, inbox, trash, settings, …
apps/api/    Apps Script backend (Main.js) — snapshot ⇄ Sheet
build/       build.mjs (→docs/), serve.mjs, cdp.mjs (harness), qa.mjs, e2e.mjs
```

## Commands

```bash
npm test               # 26 unit tests: ordering, store tree ops, seed provenance
npm run serve          # dev server on :4180
npm run build          # web/ → docs/
node build/qa.mjs      # screenshot all 20 routes; --light --mobile --only a,b --url <live>
node build/e2e.mjs     # 19-step checklist driven through the real UI
```

Run `npm test` and `node build/e2e.mjs` before committing UI changes.

## Gotchas (all cost real debugging time)

- **`h()` needs the SVG namespace** for SVG tags — already handled in
  `core/dom.js`; don't build SVG with `createElement`.
- **Editor re-render vs. caret.** `Editor.write()` mutes store-driven
  re-renders; `pendingFocus` restores the caret afterwards. The editor ignores
  `node:touch` for its own node, or it would rebuild while you type.
- **`updateNode` no-ops** when nothing actually changed — a title blur
  re-saving identical text used to re-render mid-focus.
- **The slash menu passes `focus: false`** so typing continues in the block;
  nested menus check `open === mine` before closing.
- **CDP typing must use `Input.insertText`**, not key events: `.` is virtual
  key 46 (Delete) and silently eats characters.
- **CDP navigation appends `?n=`** — a fragment-only change is same-document,
  so the previous view is still mounted while the router's dynamic import
  resolves, and assertions race.
- **`localStorage` is per-origin and per-device.** Two devices on the same URL
  hold two separate workspaces; only a connected Sheet syncs them.
- **The Apps Script API refuses everything but `ping`** until someone runs
  `setup()` in the editor, which mints the access token. That is a manual step
  and is still outstanding.
