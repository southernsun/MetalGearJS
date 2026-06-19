## Why

The browser prototype can walk Snake around one room (room 0) with faithful collision, but
the room is a sealed box — every edge is blocked. Metal Gear is screen-to-screen
exploration: each room connects to up to four neighbors (`data/roomsconnections.asm`), and
walking off an open edge cuts to the adjacent room. Adding traversal turns the single screen
into a navigable map and is the backbone every later feature (guards, items, doors) sits on,
since those all live *inside* rooms. It extends exactly what we already have — the
movement/collision engine and the room/collision export pipeline — with no new runtime
dependencies.

## What Changes

- Extend the asset-export step to export **several connected building rooms** instead of one:
  each room as its own background PNG + 32×24 collision JSON, named per room number, plus a
  small **manifest** of which rooms are available.
- Export the **room connection table** (`RoomConnections`) as JSON — for each room, its
  Up/Down/Left/Right neighbor room number (or none), matching the ROM's `[N, S, W, E]` byte
  order and `255 = no exit` convention.
- Add a **room manager** to the browser game that loads a room's PNG + collision by number
  and swaps the active room at runtime.
- Add **edge-crossing transitions**: when Snake moves past an open room edge that has a valid
  connection in that direction, the game performs a hard screen cut to the neighbor room (as
  the original does — no scrolling) and places Snake at the **matching entry edge** with his
  position mirrored across the crossing axis. Edges with no connection stay blocked exactly
  as today.
- Preserve faithful collision in every room (each room uses its own collision map and the
  same shape-0 two-probe check), and carry Snake's facing/animation state across the cut.
- No changes to the disassembly. Scope is traversal only — **no** enemies, items, doors,
  elevators, or the desert "get lost" rule yet (those are explicitly deferred).

## Capabilities

### New Capabilities

- `room-connection-export`: Extend the offline export to emit a set of connected building
  rooms (per-room background PNG + collision JSON under a per-room naming scheme), a
  `connections.json` derived from `RoomConnections` (Up/Down/Left/Right neighbor per room,
  null for `255`), and a manifest listing the exported rooms and the starting room.
- `browser-room-traversal`: A room manager and edge-crossing logic in the browser game that
  loads rooms by number, performs a hard cut to a connected neighbor when Snake walks off an
  open connected edge, places Snake at the mirrored entry edge, and keeps unconnected edges
  blocked.

### Modified Capabilities

<!-- None in openspec/specs/. This builds on the unarchived change
     `browser-snake-movement-punch` (capabilities rom-asset-export, browser-snake-movement);
     traversal is expressed here as new capabilities that extend that work. -->

## Impact

- **Export tooling**: extend `Tools/RoomViewer`'s `--export-web` to accept a list/range of
  rooms (or a "building cluster" preset) and to additionally emit `connections.json` and a
  `manifest.json`. Reuses the existing `RoomRenderer` + `GameData` (which already parses
  `data/roomsconnections.asm` is *not* yet loaded — add that table to `GameData`).
- **Browser game** (`web/game.js`): add a room-manager module (load/swap room assets by
  number), edge-crossing detection in the movement step, and entry-edge placement; load the
  starting room from the manifest. Asset layout grows a `web/assets/rooms/` folder
  (`<n>.png`, `<n>.collision.json`) plus `connections.json` and `manifest.json`; the current
  single `room.png` / `room-collision.json` are superseded by the per-room set.
- **Source data consumed (read-only)**: `data/roomsconnections.asm` (`RoomConnections`), plus
  the same room/metatile/tileset/palette/collision tables the existing room export already
  reads.
- **Dependencies**: none new — browser runtime (Canvas) only; .NET 8 for the export step.
- **Out of scope** (future changes): enemies/AI and alerts, items/HUD, doors and key-card
  access, elevators, smooth scrolling, and special transition rules (parachute, desert
  compass).
