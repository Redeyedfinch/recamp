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
3. **Member email addresses are personal data** (DPDP Act 2023). A member is
   mailable only with an address AND `subscribed === true`, enforced in
   `web/js/mail/audience.js` *and* again in `apps/api/Mail.js` because the
   client cannot be trusted. Every message carries a signed unsubscribe link;
   every send is logged to the Sheet. Never seed a real address, and never
   pre-tick consent. `tests/mail.test.mjs` guards this.
4. **Personal student project.** Commit as `Redeyedfinch
   <adwaithca0@gmail.com>` (already the repo's local git config). No employer
   conventions, document-control IDs, or org policy language anywhere.
5. **`docs/` is generated** by `node build/build.mjs` from `web/`. Never edit it
   by hand; rebuild before committing if `web/` changed.

## Stack

Zero npm dependencies. Static ES modules loaded natively + hand-written CSS.
Node ≥20 is needed only for tests and the build/QA scripts; there is no bundler,
so the file you read is the file that runs. Two libraries load lazily from a CDN
and degrade gracefully offline: KaTeX (equation blocks render as source) and
anime.js 4 via `https://cdn.jsdelivr.net/npm/animejs@4.5.0/+esm` (the orrery
stays at its epoch). Do not add a third without the same fallback.

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
web/css/     tokens → base → layout → components → editor → views → celestial → mobile
web/js/core  id, order (fractional), dates, icons, dom (h()), viewport (isPhone)
web/js/data  schema, seed (provenance!), store, adapters/
web/js/editor  block editor, katex loader
web/js/mail  audience (consent), render (blocks → email HTML/text)
web/js/ui    shell, sidebar, palette, menu, dialog, toast, starfield, orrery, plate, props
web/js/views home, page, database, archive, activity, inbox, trash, settings, …
apps/api/    Apps Script backend — Main.js (snapshot ⇄ Sheet), Mail.js (sending)
build/       build.mjs (→docs/), serve.mjs, cdp.mjs (harness), qa.mjs, e2e.mjs
```

## Commands

```bash
npm test               # 49 unit tests: ordering, store, seed provenance, mail consent, tokens contrast, orrery
npm run serve          # dev server on :4180
npm run build          # web/ → docs/
node build/qa.mjs      # screenshot all 20 routes; --light --mobile --only a,b --url <live>
node build/e2e.mjs     # 28-step checklist through the real UI (5 mobile, 3 mail, celestial, a11y names)
```

Run `npm test` and `node build/e2e.mjs` before committing UI changes.

## Celestial layer and motion

The star field (canvas) and the orrery (SVG, six classical planets on a log-AU
plate, honest periods with one Earth year = 80 s, driven by anime.js) are
decorative and `aria-hidden`. They stop under `prefers-reduced-motion` and under
the user's **Settings → Appearance → Celestial motion** switch (WCAG 2.2.2 needs
a pause control for auto-playing motion). Planets are 2–6px; the brief forbids
giant planets and nebula wallpaper — keep it an instrument plate.

## Accessibility bar

`tests/tokens.test.mjs` fails the build if `--text-faint` drops under 4.5:1 or
`--text-ghost` under 3:1 on any surface in either theme (they were 3.98 and 2.34
once — the eye did not notice). Icon-only controls need `aria-label`; the e2e
a11y step scans for unnamed ones. Form controls use `field()` from
`views/common.js` for a real `<label for>`. Coarse pointers get 44px hit areas
via `::after` in components.css; phones get 16px text entry so iOS stops zooming.

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
- **CDP `mobile: true` lays out at 2× the window width** (it skips viewport-meta
  handling without a mobile UA), so mobile screenshots silently showed an 840px
  layout in a 420px frame. `build/cdp.mjs` keeps metrics non-mobile and emulates
  touch separately; `window.innerWidth` must equal the requested width.
- **A transform still creates scroll overflow.** The closed peek panel sits at
  `translateX(100%)`, which gave every page a phantom sideways scroll until
  `.main` got `overflow: hidden`.
- **`celestial.css` loads after `views.css`**, so an equal-specificity rule there
  (`.arc { display: block }`) beats one in views.css. `mobile.css` is last.
- **`svg.append(el)` returns undefined** — `svg.append(x).textContent = …` throws
  and silently aborts a whole render. Set text first, then append.
- **`?enter=1` / `?enter=0`** enter or leave the Enter screen for QA; the Enter
  screen's title equals Home's, so check for `.login`, not the title.
- **The Apps Script API refuses everything but `ping`** until someone runs
  `setup()` in the editor, which mints the access token. That is a manual step
  and is still outstanding.
