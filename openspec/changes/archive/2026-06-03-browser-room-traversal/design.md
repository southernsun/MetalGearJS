## Context

The browser prototype (`web/`) renders one room and moves Snake with a fixed-timestep loop,
a `down/up/left/right × idle/walk1/walk2/punch` atlas, and tile collision ported from
`logic/collisions.asm` (shape-0, two probes per direction). Off-room probe pixels currently
count as **solid**, so every edge is a wall.

The ROM connects rooms via `RoomConnections` (`data/roomsconnections.asm`): one row of four
bytes per room in order **`[Up, Down, Left, Right]`** (north, south, west, east), with `255`
meaning "no exit". Room 0's row `1, 121, 255, 4` = up→1, down→121, left→none, right→4.
Transitions are **hard screen cuts** (Metal Gear does not scroll); `logic/nextroom.asm`
sets the next room from the connection table by the direction Snake left in
(`NextRoomDirect`, 1=Up…4=Right) and the engine repositions the player at the opposite edge.

The room/collision export already exists (`Tools/RoomViewer --export-web <room>`), and
`GameData` resolves per-room tileset/palette/collision by room number — so exporting more
rooms is mostly "loop over a room list". `GameData` does not yet load `RoomConnections`.

## Goals / Non-Goals

**Goals:**

- Export a connected set of building rooms (PNG + collision each), the connection table, and
  a manifest.
- Let the browser game load rooms by number and hard-cut to a connected neighbor when Snake
  walks off an open connected edge, placing him at the mirrored entry edge with state intact.
- Keep each room's collision faithful (its own map, same shape-0 probe check).

**Non-Goals:**

- Smooth scrolling, enemies/items/doors/elevators, the parachute/desert special transition
  rules, and any room outside the chosen building cluster.
- Animated transition effects (a plain cut is fine for this slice).

## Decisions

### D1 — Asset layout: per-room files + connections + manifest

```
web/assets/
  rooms/
    0.png   0.collision.json
    4.png   4.collision.json
    ...
  connections.json   # { "0": {"up":1,"down":121,"left":null,"right":4}, ... }
  manifest.json      # { "rooms": [0,1,2,3,4,...], "start": 0 }
  snake.png snake.json punch.wav   # unchanged
```

The single `room.png` / `room-collision.json` are superseded by `rooms/<n>.*`. `connections`
is keyed by room number; values are neighbor room numbers or `null`. The manifest decouples
the game from a hardcoded room list.

### D2 — Which rooms to export: BFS cluster from the start room

The exporter takes a start room and a max count, and does a breadth-first walk over
`connections`, keeping only **defined** rooms (`GameData.RoomDefined`) and staying within a
cap (default the first building cluster, ~rooms 0–15). This guarantees the exported set is
internally connected and bounded, and avoids wandering into far areas (room 0's `down→121`
neighbor is exported only if it falls within the cap/cluster; otherwise that edge becomes a
dead end in `connections` for this slice — see D5). The exact room set is a parameter, not
hardcoded logic.

### D3 — Preload all manifest rooms at startup → instant, synchronous cuts

The building set is small, so the game fetches **every** room's PNG + collision listed in the
manifest during the initial load screen and keeps them in memory. Transitions then swap
already-decoded assets with no async gap, keeping the hard cut frame-accurate and the update
loop synchronous.

### D4 — Edge crossing in the movement step

Movement stays per-direction at `SPEED`. The collision/transition rule for a step in the
facing direction `dir`:

1. Compute candidate `(nx, ny)`.
2. If `(nx, ny)` is still inside `[0,256)×[0,192)`: run the normal shape-0 probe check
   against the **current** room's map; commit or block as today.
3. If the step would cross the boundary on `dir`'s axis:
   - If `connections[room][dir]` is not `null` **and** Snake is at an open edge (the in-room
     probes for `dir` are not solid — i.e. he's in a doorway, not pushing a wall): **trigger a
     transition** to that neighbor.
   - Else: block (treat off-room as solid, as today).

To let Snake actually reach the boundary at a doorway, off-room probe pixels are treated as
**open** for the exiting direction when a connection exists on that side (otherwise off-room
stays solid). In-room solids always block, so you still can't cut a corner through a wall.

### D5 — Entry placement: mirror across the crossing axis, then settle onto open floor

On a transition in direction `dir`, the shared-axis coordinate is preserved and the crossing
coordinate is set just inside the opposite edge:

| Exit dir | New x | New y |
|----------|-------|-------|
| right | `ENTER_MARGIN` (left edge) | keep `y` |
| left  | `256 - ENTER_MARGIN` | keep `y` |
| down  | keep `x` | `ENTER_MARGIN` (top edge) |
| up    | keep `x` | `192 - ENTER_MARGIN` |

`ENTER_MARGIN` is a few pixels so Snake is fully inside (prevents immediately re-triggering a
back-transition). If the mirrored point lands on a solid tile in the new room, search along
the entry edge (nearest open tile to the preserved coordinate) so Snake spawns clear. Facing
and walk/idle/punch state are untouched.

### D6 — Connections table loaded into GameData

Add `RoomConnections` parsing to `GameData` (it already parses several `data/*.asm`; add
`data/roomsconnections.asm`) and expose `int[] Connections(room)` returning `[up,down,left,
right]` with `255` preserved; the exporter maps `255 → null` when writing JSON.

## Risks / Trade-offs

- **[Off-room probe handling could let Snake leak through a non-doorway edge]** → Mitigation:
  only suppress off-room "solid" for the exact exit direction when a connection exists; keep
  in-room solids authoritative, so a connected edge that is walled at Snake's position still
  blocks until he finds the open doorway tile.
- **[A connected neighbor outside the exported cluster]** → Mitigation: the game treats a
  connection whose room is absent from the manifest as `null` (dead end) and logs it, so a
  partial cluster never tries to load a missing room.
- **[Entry point lands in a wall after a cut]** → Mitigation: the edge-settle search in D5;
  verified by walking every exported connection both ways during the verification step.
- **[Preloading all rooms scales poorly if the set grows large]** → Mitigation: fine for the
  building cluster (tens of rooms); if the set grows, switch to load-on-demand with neighbor
  prefetch (noted, not built now).
- **[Coordinate semantics across rooms must match the sprite anchor]** → Mitigation: reuse
  the same logical `(x,y)` = sprite-anchor convention already used for collision, so entry
  placement and collision stay consistent room to room.

## Migration Plan

Additive. The export gains a multi-room mode and two new JSON files; `game.js` gains a room
manager and edge-crossing logic but keeps the same loop, atlas, and collision routine.
Rollback is reverting `game.js` and the exporter flag and falling back to the single
`room.png`/`room-collision.json`. No disassembly or runtime-dependency changes.

## Open Questions

- Exact building cluster to ship first (rooms 0–15 vs a BFS cap of N) and the starting room
  (default 0).
- `ENTER_MARGIN` value and whether to add a brief fade on the cut later (not now).
- Whether to keep the legacy single-room files for backward compatibility or remove them once
  the per-room set exists (default: remove, the game reads the manifest).
