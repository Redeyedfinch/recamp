# RECAMP Observatory — architecture

**RECAMP** — The Physical Science Forum, School of Sciences,
JAIN (Deemed-to-be University), Bengaluru.

A Notion-inspired internal workspace: pages, blocks, databases, events,
projects, tasks, research notes, and an archive of what the forum has built.

---

## 1. Shape of the system

Same split as the `hash` repo, for the same reasons:

```
web/            static frontend — no build step, no framework, no Tailwind
apps/api/       Apps Script project — Google Sheets as the store
docs/           GitHub Pages output (generated from web/ by build/build.mjs)
```

Apps Script cannot be framed reliably (iOS Safari drops its cookies), so the UI
is served first-party from GitHub Pages and talks to the Apps Script `/exec`
endpoint over POST. The backend serves data, never HTML.

## 2. Local-first, sync-second

The frontend owns a complete in-memory document graph and persists it through a
**storage adapter**:

| adapter        | where it writes            | when                          |
| -------------- | -------------------------- | ----------------------------- |
| `LocalAdapter` | `localStorage`             | default; no setup, works offline |
| `CloudAdapter` | Apps Script → Sheets       | once a deployment URL is set  |

Both implement the same four methods — `load()`, `save(snapshot)`, `info()`,
`clear()` — so the app never branches on which one is live. The workspace is
fully usable before anyone authorises a Google account, which matters: the
`hash` OS stalled for weeks waiting on a one-time `setup()` run.

Writes are debounced and snapshot-based. A student workspace is small
(thousands of blocks, not millions); a whole-document snapshot is simpler and
far more robust than an operation log, and it survives a half-failed sync.

## 3. Document model

Everything addressable is a **node**. Three kinds, one table:

```js
Node {
  id, kind: 'page' | 'database' | 'record',
  parentId,            // node id, or 'root'
  title, icon, cover,
  order,               // fractional index — reorder touches one row
  props: {},           // records only: values keyed by property id
  schema: [Property],  // databases only
  views: [View],       // databases only
  createdAt, updatedAt, archived, provenance
}

Block {
  id, nodeId, parentId,   // parentId = node id, or another block (toggles, lists)
  type, text, props, order, archived
}
```

A database **record is a node**, so it has a title, an icon, children, and its
own block content — opening an event row opens a real page. That is the single
most important structural decision in the product (§15 of the brief).

`order` is a fractional index (`between(a, b)` returns a string strictly
between two keys). Dragging one row rewrites one field instead of renumbering
its siblings.

## 4. Domain databases

Seeded as real databases, not hardcoded screens — so a member can add a
property to Events without a code change:

`Events` · `Projects` · `Tasks` · `Teams` · `Members` · `Resources` ·
`Meeting Notes` · `Research`

Views: `table`, `board`, `calendar`, `gallery`, `timeline`.

## 5. Provenance — no invented facts

Every seeded record carries:

```js
provenance: 'sourced' | 'demo'
dateConfidence: 'exact' | 'year' | 'unavailable'
```

`sourced` means the fact came from the project brief. `demo` means it is
placeholder content to make the workspace legible, and the UI labels it as
such. No member names, counts, sponsors, awards, or testimonials are invented;
member records are explicitly demo placeholders. Where a date is not known the
record says `Date unavailable` instead of guessing.

## 6. Design system

Hand-written CSS with a token layer (`css/tokens.css`). No utility framework,
no component library, no Inter, no purple gradient.

- **Display** Instrument Serif — masthead and editorial titles
- **UI** IBM Plex Sans — everything read at length
- **Technical** IBM Plex Mono — coordinates, IDs, timestamps, labels

Dark is primary (graphite / ivory / cold blue, amber only for attention).
Light is a paper-and-graphite laboratory notebook, not a white SaaS dashboard.

## 7. Frontend layout

```
js/core/     id, events, dom helpers, dates, fractional order, keys
js/data/     schema, seed, store, adapters/
js/ui/       shell, sidebar, topbar, palette, menus, dialogs, toasts, starfield
js/editor/   block editor, slash menu, rich text
js/views/    home, page, database, event, archive, activity, members, settings, trash
```

ES modules, loaded natively. No bundler, so a file you read is the file that
runs — which is the point of a codebase a student committee inherits.

## 8. Tests

`node --test tests/` covers the pure core: fractional ordering, the store's
tree operations (create / nest / move / archive / restore), search ranking,
database filtering and grouping, and the seed's provenance invariants (a
`sourced` record may never carry a date the brief did not give).
