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
output folder. To change the underlying data, re-run `--export-web` / `--export-doors` /
`--export-mapzones` first.

It reads `mapzones.json` (the ROM's `idxMapZones` area table) to decide which map a room belongs
to — see [How the world is split](#how-the-world-is-split--one-map-per-building-floor).

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

## How the world is split — one map per building floor

The split comes from the ROM's own area table, **`idxMapZones`** (`data/musicradioconfig.asm`,
read at `Banks0123.asm:1063`), exported to
[`web/assets/mapzones.json`](../../web/assets/mapzones.json) by
`--export-mapzones`. `MapZone` is what gates radio reception ("values of 5 or more need the
antenna"), but the table is simply **which area a room is in** — 11 contiguous zones that line up
exactly with the walk-connected regions once the elevator shafts are cut, and that carry each
door-only interior room along with the floor it opens off. One zone = one map.

Elevator rooms (**240–250**) are the cut points between floors and get a map of their own.

| PNG | Rooms laid out on the grid | Door-only rooms in the strip |
|-----|---------------------------|------------------------------|
| `map-01-building1-b1-basement-…` | 54–63, 123–125, 220–221 (16) | 122, 164–172 (10) |
| `map-02-building1-1f-…` | 0–15, 64–69, 120–121, 209–210 (26) | 126–138, 154, 173–175, 199, 204 (19) |
| `map-03-building1-2f-…` | 16–27 (12) | 139–145, 195 (8) |
| `map-04-building1-3f-…` | 28–39 (12) | 146–153, 156–159 (12) |
| `map-05-building1-4f-…` | 40–53, 117 (15) | 160–163 (4) |
| `map-06-outside-desert-water-…` | 70–78, 102–103, 105–107, 208, 211–212 (17) | 104, 176–180, 206, 213–219 (14) |
| `map-07-building2-b1-gas-…` | 93–101 (9) | 188–191, 196–197, 203, 207 (8) |
| `map-08-building2-1f-…` | 79–87 (9) | 181–185, 198, 202, 205 (8) |
| `map-09-building2-2f-…` | 88–92 (5) | 186–187 (2) |
| `map-10-underground-to-building3-…` | 108–110 (3) | 192–193, 201 (3) |
| `map-11-building3-…` | 111–116, 118–119, 224–226 (11) | 194, 200 (2) |
| `map-12-elevators-240-250.png` | 240–250 (11, one column per shaft) | — |

All **235** rooms in `manifest.json` are placed; none are isolated or unplaceable.

### Where the floor numbers come from

The zone → floor mapping is not guesswork. The **vertical order** is fixed by which room each
elevator car opens onto (`doors.json` dest 240–250, cars chained through `connections.json`), and
three floor numbers are stated outright by the game's own radio script:

| Evidence | Room | Zone | Reads as |
|---|---|---|---|
| "ENEMY'S UNIFORM IS AVAILABLE IN THE **BASEMENT OF BUILDING NO.1**" | uniform in 122 | 4 | Building 1 B1 |
| "GO TO THE SOUTH PART OF THE **1ST FLOOR** TO GET YOUR MASK" | a mask in 174 | 0 | Building 1 1F |
| "The Parachute is on **floor 2**" | parachute in 139 | 1 | Building 1 2F |
| "METAL GEAR IS IN 100TH **BASEMENT OF BUILDING NO.3**" | Metal Gear in 118 | 10 | Building 3, deep |

and the shafts stack the rest:

- **Building 1** — lower car `241` opens on room 63 (zone 4), room 15 (zone 0), room 27 (zone 1);
  upper car `242` on room 39 (zone 2), room 53 (zone 3). So **B1 → 1F → 2F → 3F → 4F** =
  zones 4 → 0 → 1 → 2 → 3, agreeing with all three text anchors above.
- **Building 2** — lower car `243` opens on room 95 (zone 8, the gas basement), room 81 (zone 6),
  room 72 (zone 5); upper car `244` on room 88 (zone 7). So **B1 → 1F → 2F** = zones 8 → 6 → 7.
- **Building 3** — the long car `247–250` runs from room 109 (zone 9) at the top down to room 115
  (zone 10) at the bottom.

One radio line disagrees: *"The Flashlight is on Floor 1"*, while the `LIGHT` item sits in room 151
(zone 2 = 3F). The three anchors and the shaft order all agree with each other, so the ladder above
follows them and this line is left as the outlier.

## Navigating between the maps

Every hop between two maps is a door. The elevator shafts (map 12) do most of the work; the
`ELEV N` caption on a tile tells you which shaft you are stepping into.

| Shaft | Cars (top → bottom on map 12) | Connects |
|-------|------------------------------|----------|
| 240 | 240 (single car) | 1F room 3 ⇄ 3F room 31 |
| 241/242 | 242 → 241 | 241: 1F room 15 ⇄ 2F room 27 ⇄ B1 room 63 · 242: 3F room 39 ⇄ 4F room 53 |
| 243/244 | 244 → 243 | 243: outside room 72 ⇄ B2 1F room 81 ⇄ B2 B1 room 95 · 244: B2 2F room 88 |
| 245/246 | 246 → 245 | 245: rooms 205/206/207 · 246: room 154 (the secret passage back to Building 1 1F) |
| 247–250 | 247 → 248 → 249 → 250 | 247: room 109 (underground) · 250: room 115 (Building 3) |

Two non-elevator doors also cross maps:

- Building 3 room **119** ⇄ room **224** — the Big Boss door onto the escape ladders (both are
  zone 10, so they now share map 11).
- Room **204** (a door-only room off room 5, drawn in map 02's strip) → rooms **117**, **46**,
  **45** on map 05.

## Notes

- Rooms 107–110 form a loop the BFS reaches from two directions, so an edge or two may be drawn
  dashed rather than grid-adjacent. Those connections are real; only the drawing is compromised.
- There are no walk connections that cross a map boundary except zone 0 ⇄ 5 ⇄ 9 and zone 4 ⇄ 8,
  which are genuinely walkable between areas (the ground level, and the basement passage the radio
  describes as "a secret passage leads from the southwest of the basement to building 1").
