# room-connection-export Specification

## Purpose
TBD - created by archiving change browser-room-traversal. Update Purpose after archive.
## Requirements
### Requirement: Export a set of connected rooms

The export step SHALL emit, for each room in a configured set of connected building rooms,
a background PNG and a 32×24 collision JSON, named per room number, using the same
tile/metatile/palette pipeline and collision-bitmap expansion as the single-room export.

#### Scenario: Multiple rooms are exported

- **WHEN** the export step runs for a set of room numbers (e.g. the building cluster
  including room 0 and its reachable neighbors)
- **THEN** it writes one background PNG and one collision JSON per room under
  `web/assets/rooms/` (e.g. `0.png` + `0.collision.json`, `4.png` + `4.collision.json`, …)
- **AND** each room's collision JSON is a 32×24 row-major solid map produced exactly as the
  existing single-room export produces it

#### Scenario: Each room uses its own tileset and palette

- **WHEN** a room in the set uses a different palette or collision tileset than room 0
- **THEN** that room's PNG and collision map reflect its own per-room selectors (the export
  resolves tileset/palette/collision per room number, not from a fixed room)

### Requirement: Export the room connection table

The export step SHALL emit a `connections.json` derived from `RoomConnections`
(`data/roomsconnections.asm`), giving for each exported room its neighbor in each of the
four directions, using `null` where the ROM byte is `255` (no exit).

#### Scenario: Connections JSON is generated

- **WHEN** the export step runs
- **THEN** it writes `web/assets/connections.json` mapping each exported room number to an
  object with `up`, `down`, `left`, `right` keys
- **AND** each value is the connected room number, or `null` when the corresponding
  `RoomConnections` byte is `255`

#### Scenario: Connection direction order matches the ROM

- **WHEN** a room's `RoomConnections` row is read
- **THEN** the four bytes are interpreted in the ROM's order `[Up, Down, Left, Right]`
  (north, south, west, east) so the exported `up/down/left/right` neighbors match how the
  game connects rooms

### Requirement: Export a room manifest

The export step SHALL emit a `manifest.json` listing the exported room numbers and the
starting room, so the browser game can discover the available rooms without hardcoding them.

#### Scenario: Manifest lists exported rooms

- **WHEN** the export step finishes
- **THEN** `web/assets/manifest.json` contains the list of exported room numbers and a
  designated starting room number
- **AND** every room number in the manifest has a corresponding PNG and collision JSON under
  `web/assets/rooms/`

### Requirement: Extras export even when the BFS has seen them

`--extra` rooms SHALL be deduplicated against the EXPORTED room list, not the BFS `seen`
set — the BFS marks enqueued neighbours as seen without exporting them when the room-count
cap hits (room 15 was silently dropped this way).

#### Scenario: A neighbour beyond the cap

- **WHEN** a room adjacent to the BFS cluster is requested via `--extra`
- **THEN** it exports, with its connections to the cluster intact

### Requirement: The world set spans the connected map

The canonical export SHALL cover EVERY defined ROM room (235 of the 251 indexed — 155/222/223/227 are RoomUndefined): the full mainland plus the roof (37-53), the desert (208-219), the dogs wing (192-207, including the lorry-ride destinations 199-201 and the parachute wall 204), the prison annex (151/154/159-163), the building-1 stragglers (104/107-110/117), the dark room 221, and the elevators 242/245-250 — with check-graph confirming every exported room reachable from spawn except room 204, which the ROM enters only by the parachute jump.

#### Scenario: No islands

- **WHEN** check-graph walks from spawn
- **THEN** every exported room except the parachute wall 204 is reached on foot, by door,
  by elevator, or by water

