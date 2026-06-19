# Wire the prisoner and item-pickup texts

## Why

texts.json holds all 90 decoded ROM texts, but only the radio messages and the generic
rescue (131) are wired to triggers. The ROM gives each prisoner room its own rescue dialogue
(`PrisonerTexts`, logic/actors/prisoner.asm:271 — 19 room→text pairs plus the Ellen and
Jennifer's-brother specials), and has an item-pickup description path (`ItemTakeText`,
data/itemtaketextid.asm → SetText, logic/items.asm:403-414) — which the **Western ROM
deliberately gates to text 62 only** (the post-capture equipment recovery; the disassembly
marks this as a BUG/LIMITATION vs the Japanese version, where all descriptions show).
Faithfulness means wiring the prisoner variety AND porting the pickup path with its Western
gate — i.e., pickups stay silent until the capture flow exists.

## What Changes

- **Per-room prisoner rescue texts**: rescue runs the ROM lookup — Ellen's room 167 → text
  129; Coward Duck's room 193 → text 140 (Jennifer's brother, by his Y) or 131; otherwise
  `PrisonerTexts[room]`. The table is ported verbatim with its citation. Because our DEMO
  prisoners live in cluster rooms 3/5-9 (already a documented divergence — the ROM's
  prisoner rooms are 129-203), each demo room is mapped to a REAL table text so the actual
  dialogue variety shows (e.g. "I'M SAVED!", the Diane-frequency tip, the Grey Fox line),
  with the mapping cited as part of the same demo divergence.
- **Item-pickup text path ported with the Western gate**: after the last-item-in-room check,
  look up `ItemTakeText[id]`; 0 → nothing; **non-Japanese gate: only text 62 may show**
  (logic/items.asm:409-413). With no capture flow in this slice the path is a faithful
  no-op — ported so the structure (and text 62) light up when capture lands, and so the
  Western "silent pickups" behaviour is explicit and documented rather than missing.
- No new exports: texts.json already contains every referenced text; the two tables are
  small cited constants.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `browser-rank-progression`: the rescue text requirement changes from the generic text 131
  to the ROM's per-room `PrisonerTexts` lookup (with the demo-room mapping divergence).
- `browser-item-pickups`: adds the pickup-description requirement — the `ItemTakeText`
  lookup with the Western text-62-only gate (faithful silence for normal pickups).

## Impact

- `web/game.js`: prisoner rescue text lookup (replacing the flat `setText(131)`), the
  pickup-text gate in the take-item path.
- `web/rank.headless.mjs` / `web/items.headless.mjs`: updated + new checks.
- `docs/SESSION-STATE.md` (gap list updated; the texts-wiring gap narrows to the capture
  flow), `docs/rom-coverage.md` regenerated.
