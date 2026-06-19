# Building 2 — the world completes its mainland

## Why

The last unexported mainland: building 2's three floor strips (79-87, 88-92, 93-101),
its elevators (243: 81 ⇄ 72 ⇄ 95; 244: 88 + shaft), the moving-lasers room 72 (already
edge-connected to the water rooms — the dormant DrawMovingLasers cycle goes LIVE), the
gas-gauntlet floor (94/96-98/100/101 — the gas system shipped last slice), the dark rooms
124/125/220 (the dark system likewise), and the interiors 181-191 holding CARD5 (187),
CARD6 (188 — Ellen's gate!), and more prisoners.

## What Changes

- 40 rooms exported (171 total): 72, 79-101, 124/125/220, elevators 243/244, interiors
  181-191. NO new systems — every mechanic these rooms use (elevators, gas, dark rooms,
  moving lasers, pitfalls, prisoners, items, cards, multi-guards) shipped in prior slices.
- check-graph: the WHOLE world — all 171 rooms — is reachable from spawn (the water rooms
  resolve through the courtyard doors; the last island count is zero).
- Madnar's wing exports (182/189) but Dr. Madnar and the Fake Madnar are their OWN actor
  types with bespoke logic — their rooms ship empty until a madnar slice (documented gap).

## Capabilities

### Modified Capabilities

- `room-connection-export`: the world set grows to the full mainland.

## Impact

- web/assets (40 rooms incl. dark variants for 124/125/220); no game.js changes;
  all 15 suites green (398 checks).
