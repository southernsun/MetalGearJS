# Design — the second-floor expansion

## Context (verified)

- **The graph** (data/roomsconnections.asm): 11 →right→ 15 (↓14 ↓13 ↓12 →left→ 8's right
  corridor = the capture zone); the 2F loop 16↑17↑18↑19→21→23→27 / 16→20→22→24↑25↑26↑27;
  the elevator branch 31↓30↓29↓28→32→34→36 and 31→33→35; the basement 57→58→{59,61}→
  {60,62}→63. The loop and the branch DON'T touch by edges — elevator 241 (floors 27 /
  15 / 63, elevatorrooms.json: elevY 0x38/0x78/0xB8) is the only link, and it also lifts
  the basement chain back to the world.
- **Doors**: corridors open into interior offices 139-158 (+17→195), several keycard-locked
  (cards 1-3); 27 and 31 carry the type-5 elevator doors (dest 241/240). All export
  automatically; the elevator/keycard systems need no changes (241's stops are the
  standard 0x38/0x78/0xB8 and ChkCtrlElevator's 240-242 mask already allows both ways).
- **Actors** (data/actorsinrooms.asm via idxActorsRooms — rooms can SHARE blocks, e.g.
  `ActorPrisoner` = one prisoner at (X 0x80, Y 0x60)): guards with patrol paths
  (idxRoomPaths, (Y,X) point lists), prisoners, cameras (already live), bosses (skipped).
- **Items**: rooms 122-217 carry the ROM's real item placements (items.json) — the new
  interiors bring the goggles' real room (139), plastic bombs (142/153), missiles (147),
  mines (140), cards, ammo.

## Decisions

1. **The exporter dedup fix**: extras dedup against `order` (the exported list), not
   `seen` — the BFS marks enqueued neighbours seen without exporting them when the room
   cap hits, which silently dropped room 15.
2. **actors.json replaces the hardcoded REAL_PRISONERS** and extends guards: DEMO entries
   keep priority (room 0's demo guard, the demo prisoners 3/5-9 — check-graph validates
   their reachability); everything else takes the ROM's first guard + real path
   ((Y,X) → (x,y) converted at load) and the real prisoner. The single-guard limit and
   the camera path-slot ordering are documented in the exporter.
3. **No new game.js systems**: the elevator, keycards, lasers, cameras, items and
   prisoner texts all run as shipped — this slice is data + placement.
4. **Rooms 37+/39+/64+/123+ stay unexported**: the floor's outward edges dead-end
   (blocked edges to unexported neighbours), capping the world where the next zones start.

## Risks / Trade-offs

- [~46 new rooms with real guards may surface placement/collision quirks] → check-graph
  validates walkability; playtest will catch visual oddities room by room.
- [Real guards appear in start-cluster rooms that were empty] → MORE faithful (the ROM
  populates them); the demo guard in room 0 stays (its divergence is documented).
- [Path-slot mapping guards-vs-cameras] → ordered as the actor list orders them; rooms
  mixing other path-using actor types would need revisiting (none in this set).
