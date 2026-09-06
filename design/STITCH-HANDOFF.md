# RECAMP Observatory → Google Stitch — design transfer

Purpose: let Stitch (stitch.withgoogle.com) redesign or refine RECAMP screens **inside the
existing system** instead of inventing a generic dashboard. Everything Stitch needs is here:
the tokens, the type, the layout grammar, the screen inventory, reference screenshots, and
paste-ready prompts. Bring results back by mapping them onto `web/css/tokens.css`, never by
pasting Stitch's Tailwind/CSS output into the repo.

Reference screenshots live in `design/stitch-refs/` (32 PNGs; desktop 1440×900, phone 420×900,
`light-*` = paper theme). Upload the matching one with every screen prompt — Stitch follows an
image far better than a paragraph.

---

## 0. Paste first — the system prompt (use in every Stitch session)

> Design for **RECAMP Observatory**, an internal Notion-style knowledge workspace for a
> university physics forum (RECAMP — The Physical Science Forum, Jain (Deemed-to-be
> University), Bengaluru). Concept: **science observatory × celestial archive × editorial
> knowledge workspace**. It is a working tool, not a landing page.
>
> **Mood:** an instrument plate at night. Cold graphite ground, warm ivory ink, hairline rules,
> one restrained instrument blue, amber only for things happening *now*. Editorial serif for
> titles, humanist sans for UI, monospace uppercase micro-labels with wide tracking for
> technical marks (catalogue numbers, coordinates, dates, section kickers).
>
> **Colours (dark, primary):** ground #0b0d10 · surface #101317 · raised #151a1f · overlay
> #1a2026 · sidebar #08090b · hairline #1d2329 · strong line #2a3239 · text #e9e6e0 /
> #a2a9b0 / #7f878f / #636b73 · blue #6fa6c6 (hi #a3cde4) · amber #d6a15c · sage #86a17f
> (done) · rust #c07a63 (overdue/destructive) · violet #8279a0 (research area only).
> **Light theme** is warm paper, not white: desk #e9e4da · sheet #f5f2eb · raised #fbf9f4 ·
> ink #191c1f / #565e66 · rules #dcd5c8 · blue #2c6a8c · amber #8d5f1c.
>
> **Type:** Instrument Serif (display/titles, regular weight only) · IBM Plex Sans (UI, body
> 15px, chrome 13.5px) · IBM Plex Mono (labels 10.5px uppercase, letter-spacing 0.15em).
> Body line-height 1.65, titles 1.14.
>
> **Geometry:** 4px spacing scale (4 8 12 16 20 24 32 40 56 80). Radii: 3px controls, 6px
> dialogs/menus, 0 for technical elements, 50% for avatars/status nodes. Sidebar 248px,
> topbar 44px, reading column 46rem, wide column 72rem. Shadows only on overlays. Flat
> surfaces separated by 1px hairlines, never by drop shadows or cards-within-cards.
>
> **Celestial layer:** a sparse seeded starfield (1–2px points), thin constellation lines
> joining related items, and a small orrery drawn as hairline ellipses with 2–6px planet
> nodes. It is background instrumentation, faint and precise. **Never** large planets,
> nebula gradients, glows, or space illustrations.
>
> **Hard rules — reject any output that has them:** purple/blue gradients · glassmorphism or
> frosted panels · Inter or Roboto · rounded 12–16px card grids · giant hero + CTA · fake
> statistics, testimonials, sponsors, avatars of people · emoji as icons · stock imagery ·
> more than one accent competing · centred marketing layouts. Icons are 16px, 1.5px stroke,
> monochrome. Empty states are one quiet sentence, not an illustration.
>
> **Content rules:** use only these real events — Chandrayaan-3 Model Exhibition · Cosmic
> Conversations (AXIOM-4) · Freshers' Orientation 2025 · Mini Olympics 2.0 · The Code of
> Conflict · Gates of Solace (NEXUS 2026, 09 Feb 2026) · NEXUS 2026 participation · Higher
> Education Guest Lecture. Where a date is unknown write "Date unavailable". Members are
> placeholders like "[Name]" — no invented names, counts, roles or emails.

---

## 1. Layout grammar (what every screen shares)

```
┌─ sidebar 248 ─┬─ topbar 44 ───────────────────────────────────────────┐
│ RECAMP        │ crumbs › crumbs › current           meta · actions ⌘K │
│ THE PHYSICAL  ├───────────────────────────────────────────────────────┤
│ SCIENCE FORUM │                                                       │
│               │   .view  (padding 40 / 56, column 46rem or 72rem)     │
│ Home          │                                                       │
│ Inbox    3    │   kicker (mono label) ─────────────────────────────    │
│ Search   ⌘K   │   Title in Instrument Serif                           │
│ ── WORKSPACE  │   properties as a 2-col hairline table                │
│ Events        │   blocks / database view                              │
│ Projects      │                                                       │
│ Tasks         │                                             ┌ peek ─┐ │
│ Members       │                                             │ record│ │
│ Research      │                                             │ opens │ │
│ Archive       │                                             │ beside│ │
│ ── PAGES      │                                             └───────┘ │
│  ▸ tree…      │                                                       │
│ settings ◐ ⋯  │                                                       │
└───────────────┴───────────────────────────────────────────────────────┘
```

- **Sidebar** is the quietest surface (#08090b). Active item: 2px blue bar on the left,
  not a filled pill.
- **Peek** opens a record beside a database (600px / 62%), never as a modal.
- **Phone (≤640):** sidebar becomes a drawer; a 52px bottom bar (Home · Search · New ·
  Inbox · Menu); crumbs collapse to ‹ back + current; tables become labelled cards;
  calendar becomes an agenda list; board becomes a swipe deck; properties collapse behind
  "Show all". Text entry is 16px so iOS does not zoom.

## 2. Component vocabulary (names Stitch should keep)

| Component | Spec |
|---|---|
| Button | 13.5px Plex Sans, 3px radius, 1px `--line-strong` border; primary = ivory fill, dark text; ghost = no border. 44px hit area on touch. |
| Icon button | 28×28, 16px stroke icon, hover `#ffffff08` |
| Input / Select | raised surface, 1px hairline, 3px radius, focus ring `0 0 0 1px ground, 0 0 0 3px blue@27%` |
| Label / kicker | Plex Mono 10.5px uppercase, tracking 0.15em, colour `--text-faint` |
| Tag / status | 1px border, tinted fill (`accent @ 11%`), no radius >3px. Status colours: blue planned · amber live/now · sage done · rust overdue |
| Database table | hairline rows, 36px, sticky mono header, first column serif-weighted title, catalogue `#0007` in mono |
| Board column | plain header + count, cards are hairline rectangles, 8px gap |
| Calendar | 7-col grid, hairlines only, today marked by amber dot, events as 1-line chips |
| Timeline | horizontal hairline axis with mono tick labels, events as bars |
| Gallery | 3–4 col, cover "plate" (starfield/orrery panel) with serif title below |
| Block editor | 46rem column, 15px body, `/` menu, drag handle in 24px gutter on desktop, ⋯ button on phone |
| Command palette | overlay #1a2026, 6px radius, mono section heads, ↑↓ hints |
| Dialog | bottom sheet on phone, centred 6px card on desktop, footer actions right-aligned |
| Toast | bottom-left, one line, optional action |
| Activity log | "observatory log": mono timestamp · actor · verb · object, hairline separated |

## 3. Screen inventory + prompts

Each row: upload the reference PNG, paste the system prompt (§0), then the screen prompt.

| Screen | Reference | Screen prompt (append to §0) |
|---|---|---|
| Enter | `enter.png`, `light-enter.png`*, `m-enter.png` | Full-bleed dark field with a faint orrery (hairline ellipses, tiny planet nodes, mono labels on the lower-left bearing). Centre: "RECAMP" in Instrument Serif ~96px, below it mono kickers "THE PHYSICAL SCIENCE FORUM" and "JAIN SCHOOL OF SCIENCES · BENGALURU". Two stacked buttons: primary "Enter workspace →", secondary "Sign in with Google". Footer: four mono coordinates incl. "ORRERY · EPOCH 2026.09 · LOG AU · 1 YR = 80 S". No illustration, no gradient. |
| Home | `home.png`, `light-home.png`, `m-home.png` | Masthead: sparse starfield, wordmark, faint orrery between wordmark and a "constellation index" of sections (small nodes joined by hairlines). Below: three editorial columns — Upcoming (event rows with mono dates), Recent activity (observatory log), Pinned pages. Right rail: "Now" card in amber only if something is live. |
| Events — table | `events-table.png`, `light-events-table.png`, `m-events-table.png` | Database header with title, description, view tabs (Table · Board · Calendar · Timeline · Gallery), filter/sort as ghost buttons. Table of the 8 real events; columns: # · Title · Date · Status · Venue · Team. Unknown dates read "Date unavailable" in `--text-ghost`. |
| Events — board | `events-board.png`, `m-events-board.png` | Columns Planned · Live · Done · Archived; cards = title + mono date + tag. Phone: single-column swipe deck with dots. |
| Events — calendar | `events-calendar.png`, `m-events-calendar.png` | Month grid, hairlines, amber today dot, event chips. Phone: agenda list grouped by day with a sticky mono date. |
| Events — timeline | `events-timeline.png` | Horizontal axis with month ticks, event bars in blue, today as amber hairline. |
| Events — gallery | `events-gallery.png` | 3-col cards with celestial "plate" covers, serif title, mono date. |
| Record page (Gates of Solace) | `gates.png`, `light-gates.png`, `m-gates.png` | Cover plate, kicker "EVENT · #0006", serif title, 2-col property table (Date 09 Feb 2026, Status, Venue, Team, Related), block editor content, "Children" and "Backlinks" sections. Actions: Send…, Email members, ⋯. |
| Archive | `archive.png`, `light-archive.png`, `m-archive.png` | "Celestial archive": records by year as a vertical catalogue; each year a mono heading, items as hairline rows with catalogue numbers; faint arc/tick ornament on desktop only. |
| Tasks board | `tasks-board.png`, `light-tasks-board.png`, `m-tasks-board.png` | Same board pattern; overdue in rust, done in sage. Assignee avatars = initials in a 20px circle, no photos. |
| Members / People | `members.png`, `light-members.png`, `m-members.png` | Hairline list: name, role, team, mono "SUBSCRIBED" tick; placeholders only. |
| Research | `research.png`, `m-research.png` | Only place violet appears (kicker + tag). Table of research notes with an "Experiment log" record. |
| Experiment log | `experiment-log.png`, `m-experiment-log.png` | Record page with numbered steps, inline math rendered (KaTeX look), code block, callout. |
| Activity | `activity.png`, `m-activity.png` | Observatory log: mono timestamps left, actor · verb · object right, day separators. |
| Inbox | `inbox.png`, `m-inbox.png` | Grouped list: mentions, assignments, reminders; soft items dimmed. |
| Settings | `settings.png`, `light-settings.png`, `m-settings.png` | Sections: Profile · Appearance (theme radio, Celestial motion switch, reduced-motion note) · Storage (Apps Script URL + token, Connect) · Email (from-name, footer) · Data. Real labelled fields, switches with visible state. |
| Search | `search.png`, `m-search.png` | Search box at top, results grouped by kind with mono kickers, matched text underlined in blue. |
| Announcements + draft | `announcements.png`, `announce-draft.png`, `m-announcements.png` | Database of announcements; draft record shows audience count "N subscribed of M members", Preview, Send. |
| Compose email | `compose.png` | Dialog: To (chips, subscribed only, skipped list), Subject, body preview in ivory-on-graphite email plate, quota line, Send. |
| Sign-in setup | `signin-setup.png` | Dialog with numbered setup steps, origin string + Copy, one labelled input. |

\*Some `light-*` refs may be absent — the light prompt is the same screen with the paper palette.

## 4. What to ask Stitch to improve (the actual brief)

Prioritised; the first three matter most.

1. **Home density.** The masthead is beautiful but the working area under it is thin. Explore a
   tighter three-column "observatory desk": Upcoming · Log · Pinned, each with a mono kicker
   and 5–6 hairline rows, no cards.
2. **Record page hierarchy.** Property table vs body needs a firmer rhythm; try a 2-col header
   (title + props left, cover plate right at ≥1100px) and stronger section kickers.
3. **Board cards.** Currently plain rectangles; explore a 2-line card with a mono catalogue
   number on the top-right and a 2px status edge on the left, still hairline-bordered.
4. **Phone bottom bar & drawer** — check label sizes (9.5px mono is at the limit) and the
   drawer's page tree indentation.
5. **Empty states** for Inbox, Trash, Search — one sentence + one quiet action.
6. **Light theme** — verify the paper palette keeps the "notebook" feel on the database views.

Ask Stitch for **variants**, not a redesign: "keep the system prompt exactly; change only the
component named".

## 5. Bringing it back

- Stitch exports HTML/CSS and Figma. Treat both as **sketches**. Do not paste generated CSS.
- Map every colour to a token in `web/css/tokens.css`; if a colour has no token, decide
  whether it deserves one (usually no).
- Type sizes must land on the existing `--fs-*` scale; spacing on the 4px scale.
- Anything animated goes through the existing motion tokens and respects the Settings
  "Celestial motion" switch and `prefers-reduced-motion`.
- Re-run `node build/qa.mjs` (dark, `--mobile`, `--light`) and `node build/e2e.mjs`; the
  contrast test in `tests/tokens.test.mjs` will fail if a new token drops below 4.5:1.
- Provenance stays intact: if Stitch invents an event, member, statistic or date, delete it.

## 6. Machine-readable tokens (for Stitch "design system" import or another AI)

```json
{
  "name": "RECAMP Observatory",
  "themes": {
    "dark": { "bg": { "deep": "#0b0d10", "surface": "#101317", "raised": "#151a1f", "overlay": "#1a2026", "sunken": "#08090b" },
              "text": { "primary": "#e9e6e0", "secondary": "#a2a9b0", "faint": "#7f878f", "ghost": "#636b73" },
              "line": { "default": "#1d2329", "strong": "#2a3239", "faint": "#14181d" },
              "accent": { "celestial": "#6fa6c6", "celestialHi": "#a3cde4", "stellar": "#d6a15c", "sage": "#86a17f", "rust": "#c07a63", "violet": "#8279a0" } },
    "light": { "bg": { "deep": "#e9e4da", "surface": "#f5f2eb", "raised": "#fbf9f4", "overlay": "#fdfcf8", "sunken": "#efebe2" },
               "text": { "primary": "#191c1f", "secondary": "#565e66", "faint": "#63676b", "ghost": "#7f8387" },
               "line": { "default": "#dcd5c8", "strong": "#c1b8a6", "faint": "#e6e0d4" },
               "accent": { "celestial": "#2c6a8c", "celestialHi": "#1b4e6b", "stellar": "#8d5f1c", "sage": "#4f6b49", "rust": "#96442c", "violet": "#5b5278" } }
  },
  "type": { "display": "Instrument Serif", "sans": "IBM Plex Sans", "mono": "IBM Plex Mono",
            "sizes": { "masthead": "clamp(3.4rem,8.5vw,6.5rem)", "display": "clamp(2.1rem,4.2vw,3.1rem)", "title": 28, "h1": 25.6, "h2": 20.5, "h3": 17, "body": 15, "ui": 13.5, "small": 12.5, "label": 10.5 },
            "lineHeight": { "tight": 1.14, "snug": 1.35, "body": 1.65 }, "labelTracking": "0.15em" },
  "space": [4, 8, 12, 16, 20, 24, 32, 40, 56, 80],
  "radius": { "control": 3, "surface": 6, "sharp": 0, "round": "50%" },
  "layout": { "sidebar": 248, "topbar": 44, "column": "46rem", "columnWide": "72rem", "phoneBreakpoint": 640, "drawerBreakpoint": 880, "bottomBar": 52 },
  "motion": { "fast": 110, "base": 190, "slow": 420, "ease": "cubic-bezier(0.2,0.6,0.25,1)" },
  "forbidden": ["gradients", "glassmorphism", "Inter", "Roboto", "emoji icons", "large planets", "hero+CTA", "fake stats", "testimonials", "photos of people", "card grids >6px radius"]
}
```
