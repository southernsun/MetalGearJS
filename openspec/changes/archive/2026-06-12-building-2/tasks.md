## 1. Survey + export

- [x] 1.1 Components mapped: 79-87 (elevator 243 floor 81), 88-92 (elevator 244 floor 88),
      93-101 + dark 124/125/220 (elevator 243 floor 95); room 72 (moving lasers) edges to
      the water rooms; interiors 181-191 by door (CARD5 in 187 via 89, CARD6 in 188 via
      98, Madnar 182 / Fake Madnar 189 — bespoke actors, rooms ship empty, documented)
- [x] 1.2 40 rooms exported (171 total; dark variants for 124/125/220 auto); actors.json
      regenerated; no game.js changes — elevators/gas/dark/lasers/pitfalls/prisoners/
      cards/multi-guards all shipped previously

## 2. Checks

- [x] 2.1 check-graph: ZERO unreachable rooms — the whole 171-room world chains from
      spawn; all 15 suites green (398 checks)

## 3. Playtest

- [x] 3.1 USER PLAYTEST CONFIRMED (2026-06-12): elevator 243 bottom-to-top from room 95
      (floor stops 72/81, the up-only shaft chain into 244 � fixed during the test: the
      connection-table remap rows 146-155), room 72's moving-laser cycle, the CARD5/6
      interiors; plus the F-key room gate (no inventory/radio/pause in rooms >= 224)

