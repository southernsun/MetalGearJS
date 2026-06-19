## Why

The browser game can now walk Snake between rooms whose edges are open, but most
building-room connections are **walled** — in Metal Gear you cross those through **doors**.
Doors are also where the game's explicit room links and (eventually) key-card progression
live: each door names the exact room it leads to, independent of the geometric edge. Adding
doors turns the ~22 currently-blocked connections into real passages and makes the building
properly navigable, building directly on the traversal slice we just shipped.

## What Changes

- Extend the asset export to emit, per room, its **door records** — each door's ID, type,
  draw position, and destination room — derived from `data/doors.asm` (`idxDoors` →
  `DoorsRoomNNN`, 5-byte records `[ID, Type, DrawY, DrawX, DestRoom]`).
- Export the **door type table** (`DoorOpenEnterDat`) — the per-type open footprint and the
  enter-placement offsets the game uses to size/open a door and to position Snake when he
  arrives through the matching door in the destination room.
- Export the **door sound effect** (`Sfx_Door`) to a WAV.
- In the browser game: **render** each room's doors, **open** a door (with the door SFX and a
  short open animation) when Snake walks into it while closed, and on entering an open door
  **transition to that door's destination room**, placing Snake at the matching door (same
  ID) using the type's enter offsets.
- Integrate with traversal: doors are an additional way to leave a room (using the door's
  explicit `DestRoom`), complementing the open-edge crossings already implemented. Open-edge
  crossing and unconnected-edge blocking are unchanged.
- **Out of scope (deferred):** key-card locking (we have no inventory/cards yet — all doors
  open for now), elevator doors (`DestRoom ≥ 0xF0`), and "fake"/special doors (lorry-exit
  locators, the Metal Gear self-destruct lock). No disassembly changes.

## Capabilities

### New Capabilities

- `door-data-export`: Extend the offline export to emit `doors.json` (each exported room →
  its list of normal doors with `id`, `type`, `x`, `y`, `dest`), `door-types.json` (the
  `DoorOpenEnterDat` table: per type, the open footprint offsets/sizes and the enter-placement
  offsets), and `door.wav` (the `Sfx_Door` sound), filtering out elevator/fake/special doors.
- `browser-doors`: Render doors in the active room; open a closed door (door SFX + brief
  animation) when Snake contacts it; on entering an open door, hard-cut to its destination
  room and place Snake at the matching door (same ID) via the type's enter offsets — keeping
  the existing open-edge traversal and collision intact.

### Modified Capabilities

<!-- None in openspec/specs/. Builds on the unarchived changes
     browser-snake-movement-punch and browser-room-traversal; doors are expressed here as
     new capabilities that extend that work (door transitions complement edge crossings). -->

## Impact

- **Export tooling**: add door parsing to `Tools/RoomViewer` `GameData` (`idxDoors`,
  `DoorsRoomNNN`, `DoorOpenEnterDat`) and emit `doors.json` + `door-types.json` from the
  `--export-web` cluster pass; add a `Sfx_Door` render mode to `Tools/ThemeOfTaraPlayer`
  (mirroring the existing punch-WAV export) → `web/assets/door.wav`.
- **Browser game** (`web/game.js`): load `doors.json`/`door-types.json`; draw doors for the
  active room; add door open/enter state to the movement step; on enter, reuse the room
  manager's `setRoom` to switch to `dest` and place Snake at the matching door. Asset layout
  gains `web/assets/doors.json`, `door-types.json`, and `door.wav`.
- **Source data consumed (read-only)**: `data/doors.asm` (`idxDoors`, `DoorsRoom*`,
  `DoorOpenEnterDat`, `DoorClosedTiles`/`DoorOpenTiles`), `sound/sfx/SfxDoors.asm`
  (`Sfx_Door`).
- **Dependencies**: none new — Canvas + Web Audio at runtime; .NET 8 for export.
- **Out of scope** (future): key cards/inventory and locked doors, elevators, doors that lead
  to rooms outside the exported cluster, pixel-exact door-tile graphics (a simple faithful
  door overlay is acceptable for this slice), and enemies/items.
