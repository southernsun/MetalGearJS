# Cluster expansion: building 1's second floor — one connected world

## Why

Half the shipped systems ran behind `?room=` dev hooks because their rooms were islands.
The map data connects everything: room 11's right edge enters the 12-15 stairwell; room 15
is a floor of ELEVATOR 241, whose other floors are room 27 (the second-floor corridor loop
with the laser corridors and camera rooms) and room 63 (the basement chain 58-63 that the
prison-escape pocket feeds into). One export pass stitches the capture zone, the laser
corridors, the second elevator, and the prison basement into walkable gameplay.

## What Changes

- **Rooms**: + the stairwell 15, the 2F corridors 16-19/21/23/26-30/32-36, the interior
  offices 139-150/152/153/156-158/195 (real item placements: goggles in 139, bombs in
  142/153, missiles in 147, cards/ammo elsewhere), elevator room 241 + floor room 63 + the
  basement links 58-62 → 81 rooms total. (Exporter fix: `--extra` deduped against the BFS
  `seen` set, which contains enqueued-but-never-dequeued neighbours — room 15 was silently
  skipped; extras now dedup against the export order.)
- **Reachability** (check-graph): everything connects on foot/elevator except the
  deliberate islands (water rooms 71-78/105, laser-camera room 111). Room 8's capture
  zone is REACHED THE ROM WAY (12 → 8's right corridor); elevator 241 runs 27 ⇄ 15 ⇄ 63
  on the existing elevator system unchanged; keycard doors gate the interiors (cards 1-3
  among the demo/real pickups).
- **Real actors** (`Tools/export-actors.mjs` → actors.json, from data/actorsinrooms.asm +
  idxRoomPaths): rooms without a DEMO guard now spawn their FIRST ROM guard (single-guard
  port limit) with his real patrol path and speed class; prisoner rooms place their real
  prisoners (most share the `ActorPrisoner` block at X 0x80, Y 0x60) — six new live
  prisoner rooms (144/145/146/148/152/195) with their real PrisonerTexts.

## Capabilities

### Modified Capabilities

- `browser-guard`: real ROM guard placements/paths for rooms without demo entries.
- `browser-rank-progression`: real prisoner placements from the room actor lists.
- `room-connection-export`: the extras dedup fix + the world room set.

## Impact

- RoomViewer Program.cs (the dedup fix), Tools/export-actors.mjs (new), web/assets
  (~46 new rooms + goggles variants + actors.json), game.js (buildGuardRaw/buildPrisoner
  read actors.json).
- All 14 suites stay green; check-graph documents the connected world.
