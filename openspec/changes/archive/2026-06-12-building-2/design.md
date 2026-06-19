# Design — building 2

## Context

Pure data: components 79-87 / 88-92 / 93-101+124/125/220 linked by elevators 243
(floors 81 ⇄ 72 ⇄ 95) and 244 (88 + shaft); room 72 edges to the water rooms 71/75;
the interiors hang off the floors by doors (89 → 187 CARD5, 98 → 188 CARD6 + 189 Fake
Madnar, 81 → 182 Madnar, 88 → 186, 101 → 190/191...). Every mechanic involved shipped
already; the slice is the export plus actors.json regeneration.

## Decisions

1. Madnar (182) / Fake Madnar (189) are bespoke actor types — their rooms export with no
   actor until a madnar slice (the exporter classifies only guards/prisoners/pitfalls/
   helpme; documented).
2. The far interiors behind the floors (196-198, 202/203/205/207 — dogs live there) and
   the desert/roof stay capped for their own slices.
3. Elevator 244's shaft rides beyond its single listed floor through the connection-row
   chaining the elevator system already implements; where the chain leaves the exported
   set, the ride dead-ends like other capped edges.

## Risks

- [40 rooms unplaytested at once] → the user's chosen batch-test strategy; check-graph +
  the suites gate regressions mechanically.
