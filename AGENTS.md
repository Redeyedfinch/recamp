# Agent instructions

See **[CLAUDE.md](CLAUDE.md)** — it is the orientation brief for this repo and
applies to any coding agent, not only Claude. Read it before exploring the
tree; it carries the project's invariants, layout, commands and known traps.

The two rules never to break, repeated here in case this is all you read:

1. **Never invent facts about RECAMP** — events, dates, member names, numbers,
   sponsors, awards. Seeded content is marked `sourced` or `demo`, and
   `tests/seed.test.mjs` enforces it.
2. **No utility framework, component library, or Inter.** Styling goes through
   `web/css/tokens.css`.
