# Room maps — which room is which number, and how they connect

Overview PNGs that tile the exported room screenshots (`web/assets/rooms/<n>.png`), label each
one with its room number, and lay them out from the ROM's own room graph so you can see at a
glance which room is where and what it borders.

## Regenerating

```
dotnet run --project Tools/RoomViewer -- --export-map
```

(optional: `-- --export-map <assetsDir> <outDir>`; defaults are `web/assets` and
`docs/room-maps`). The composer is
[`Tools/RoomViewer/MapExport.cs`](../../Tools/RoomViewer/MapExport.cs). It reads **only exported
assets** — `manifest.json` (the authoritative room list), `connections.json` (the ROM's per-room
up/down/left/right table) and `doors.json` (the door table) — never the `.asm`, so it runs
without the sibling disassembly checkout. It deletes and rewrites every `map-*.png` in the
output folder. To change the underlying data, re-run `--export-web` / `--export-doors` first.

## Reading a map

| Element | Meaning |
|---------|---------|
| number badge (top-left) | the room number |
| solid green line | a walk connection from `connections.json` (you can walk between the two rooms) |
| orange dashed line | the two rooms *are* connected, but the grid could not place them adjacent (see the notes below) |
| `-> N` (blue, bottom of tile) | this room has a **door** to room `N` |
| `ELEV N` (yellow, bottom of tile) | this room has an **elevator door** to elevator room `N` — that is the jump to another map |
| `<->` / `v^` (orange, top-right) | the room's own `left`/`right` (or `up`/`down`) connection points back at itself — a 1-wide corridor that wraps |
| red border + red number | the cell collided with another room and was nudged; the exact nudge is listed under Notes |
| "Interior / door-only rooms" strip | rooms with **no** walk connection at all — they are only reachable through a door. The caption under each is `<- from <rooms that have a door into it>`. |

**The layout is a graph drawing, not world coordinates.** The ROM stores per-room neighbour ids,
not a map; cells are assigned by BFS (`up` = row−1, `down` = row+1, `left` = col−1,
`right` = col+1) from the lowest-numbered room of each component. The result is spatially correct
locally, but long 1-wide corridors from different parts of a building end up stacked in the same
column, and the graph is not guaranteed planar.

## How the world is split

Elevator rooms (**240–250**) are cut points: the composer never traverses through one, so every
elevator shaft splits the world. The nine walk-connected components each get a PNG, the elevator
rooms get one of their own (map 10), and each door-only room is drawn with the area whose door
leads to it.

| PNG | Size | Rooms laid out on the grid | Door-only rooms in the strip |
|-----|------|----------------------------|------------------------------|
| `map-01-building1-1f-courtyard-water-0-15+64-78+102-110+120-121+208-212.png` | 1148×4600, 694 KB | 0–15, 64–78, 102–110, 120–121, 208–212 (47) | 126–138, 173–180, 192–193, 199, 201, 204, 206, 213–219 (34) |
| `map-02-basement-dark-building2-gas-54-63+93-101+123-125+220-221.png` | 1148×2284, 294 KB | 54–63, 93–101, 123–125, 220–221 (24) | 122, 164–172, 188–191, 196–197, 203, 207 (18) |
| `map-03-building1-upper-40-53+117.png` | 870×888, 135 KB | 40–53, 117 (15) | 160–163 (4) |
| `map-04-building1-2f-laser-loop-16-27.png` | 1148×1068, 172 KB | 16–27 (12) | 139–145, 195 (8) |
| `map-05-building1-2f-branch-28-39.png` | 1148×1068, 182 KB | 28–39 (12) | 146–153, 156–159 (12) |
| `map-06-building2-main-79-87.png` | 1148×920, 138 KB | 79–87 (9) | 181–185, 198, 202, 205 (8) |
| `map-07-building3-111-116+118-119.png` | 870×1184, 104 KB | 111–116, 118–119 (8) | 194, 200 (2) |
| `map-08-building2-upper-88-92.png` | 870×740, 81 KB | 88–92 (5) | 154, 186–187 (3) |
| `map-09-escape-ladders-224-226.png` | 870×514, 27 KB | 224–226 (3) | — |
| `map-10-elevators-240-250.png` | 1712×662, 127 KB | 240–250 (11, one column per shaft) | — |

All **235** rooms in `manifest.json` are placed; none are isolated or unplaceable.

Area names come from the room groupings in [`../SESSION-STATE.md`](../SESSION-STATE.md)
("The connected world", "THE 2026-06-12 FULL-GAME RUN"); they are labels for navigation, not ROM
data. The room ranges in the filenames are the grid rooms only — the door-only rooms in the strip
are listed above.

## Navigating between the maps

Every hop between two maps is a door. The elevator shafts (map 10) do most of the work; the
`ELEV N` caption on a tile tells you which shaft you are stepping into.

| Shaft | Cars (top → bottom on map 10) | Connects |
|-------|------------------------------|----------|
| 240 | 240 (single car) | map 01 room 3 ⇄ map 05 room 31 |
| 241/242 | 242 → 241 | 241: map 01 room 15 ⇄ map 04 room 27 ⇄ map 02 room 63 · 242: map 05 room 39 ⇄ map 03 room 53 |
| 243/244 | 244 → 243 | 243: map 01 room 72 ⇄ map 06 room 81 ⇄ map 02 room 95 · 244: map 08 room 88 |
| 245/246 | 246 → 245 | 245: map 01 room 206 ⇄ map 06 room 205 ⇄ map 02 room 207 · 246: map 08 room 154 |
| 247–250 | 247 → 248 → 249 → 250 | 247: map 01 room 109 · 250: map 07 room 115 |

Two non-elevator doors also cross maps:

- map 07 room **119** ⇄ map 09 room **224** — the Big Boss door onto the escape ladders.
- map 01 room **204** (a door-only room off room 5) → map 03 rooms **117**, **46**, **45**.
  Room 204 is drawn in map 01's interior strip because its inbound door comes from room 5, but
  its own doors lead into map 03.

## Notes from the last run

- `map-01`: rooms 107/108/109/110 form a 2×2 loop that the BFS reaches from two directions
  (via 104 and via 212), so two of its edges could not be drawn grid-adjacent and are shown
  dashed: `107 left -> 108` and `110 left -> 109`. Both connections are real; only the drawing
  is compromised.
- No cell collisions occurred, so no room is drawn with the red "nudged" border.
- There are no walk connections that cross a map boundary — by construction, the only
  cross-map links are doors.
