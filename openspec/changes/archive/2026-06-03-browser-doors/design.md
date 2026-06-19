## Context

Traversal works for open room edges; walled connections need doors. In the ROM
(`data/doors.asm`): `idxDoors[room]` points at a `DoorsRoomNNN` label (or `NoDoorsRoom`),
whose body is a list of **5-byte door records** `[ID, Type, DrawY, DrawX, DestRoom]`
terminated by `0xFF`. `Type` is a 1-based index into `DoorOpenEnterDat` (8 bytes per type:
`OpenOffY, OpenNY, OpenOffX, OpenNX, EnterOffY, EnterNY, EnterOffX, EnterNX`; the `*Off*`
values are signed). `DrawX/DrawY` are room pixel coordinates (room = 256×192).

Runtime flow (`logic/doors/enterdoor.asm`, `logic/nextroom.asm`): Snake contacting a closed
door switches to "open door" mode (animation + `Sfx_Door`); entering the now-open door sets
`IdDoorEnter = door.ID` and transitions to the door's `DestRoom`; the destination room is
entered at **its** door whose ID matches `IdDoorEnter`, offset by that type's enter offsets.
Key-card gating lives in `ChkOpenDoor`; special cases exist for elevator doors
(`DestRoom ≥ 0xF0`), "fake" lorry-locator doors, and the Metal Gear self-destruct lock.

The browser already has a room manager (`setRoom`, preloaded rooms, `connections`) and a
collision/movement step. Doors slot into that: another reason a move transitions, plus
closed-door collision and a small open/enter state machine.

## Goals / Non-Goals

**Goals:**

- Export per-room door records, the door-type offset table, and the door SFX.
- Render doors, open them on contact (SFX + brief animation), and enter them to the door's
  explicit destination room, placed at the matching door — making walled connections passable.

**Non-Goals:**

- Key cards / inventory and locked doors (all doors open for now), elevators, fake/special
  doors, doors leading outside the exported cluster, and pixel-exact door-tile art (a simple
  faithful door overlay is enough this slice).

## Decisions

### D1 — Parse doors + type table into GameData

Add to `GameData`: `idxDoors` (symbol list), the `DoorsRoomNNN` byte lists, and
`DoorOpenEnterDat`. Expose `Door[] Doors(room)` (records decoded, `0xFF`-terminated) and
`DoorType Type(int type)` (the 8 `DoorOpenEnterDat` bytes, with offsets as signed `sbyte`).
`idxDoors[room] == "NoDoorsRoom"` → no doors.

### D2 — Asset layout

```
web/assets/
  doors.json        # { "6": [ {"id":4,"type":2,"x":192,"y":..,"dest":7}, ... ], ... }
  door-types.json   # { "2": {"openOffX":..,"openOffY":..,"openNX":..,"openNY":..,
                    #         "enterOffX":..,"enterOffY":..,"enterNX":..,"enterNY":..}, ... }
  door.wav          # Sfx_Door
```

`doors.json` is keyed by room number; `x`/`y` are the record's `DrawX`/`DrawY`. Filtering
(D3) is applied at export so the browser only sees usable doors.

### D3 — Filter to usable doors at export

A door is exported only if: `DestRoom < 0xF0` (not an elevator), the door is not a known
fake/special door, **and** `DestRoom` is in the exported room set. Everything else is dropped,
so every door in `doors.json` leads somewhere loadable. (The export logs dropped doors and
their reason.) The exported building cluster contains in-cluster door links — e.g. room 6 ↔ 7
and 7 ↔ 11 — so the feature is demonstrable.

### D4 — Door footprint and collision

A door's footprint rectangle is `x + openOffX, y + openOffY, openNX, openNY` (from its type).
While **closed**, that rectangle is solid: the movement collision check (`blocked`) also
rejects a candidate position whose probes fall inside any closed-door footprint of the active
room — so Snake can't walk through a shut door. While **open**, the footprint is passable.

### D5 — Open / enter state machine

Per door: `open: false`, `openTimer`. In the movement step, after the normal collision/edge
logic:

- If Snake's footprint touches a **closed** door → set it opening: play `door.wav` once, run
  `DOOR_OPEN_TICKS`, then `open = true`. (Closed-door collision keeps him just outside until
  it opens.)
- If Snake's footprint is inside an **open** door's enter zone and he wasn't already inside it
  last tick → enter: `setRoom(dest)`, place Snake at the destination (D6). A per-frame
  "was-in-door" latch prevents immediately re-triggering after arrival.

Door open state is per active room and resets when leaving (doors re-close behind Snake, which
also matches re-entering a room later — simplest faithful-enough behavior).

### D6 — Destination placement

On entering door `D` of room `R` → `setRoom(D.dest)`; find the destination room's door `D2`
with `D2.id == D.id`; place Snake at `(D2.x + enterOffX(D2.type), D2.y + enterOffY(D2.type))`,
clamped inside the room and settled onto open floor (reuse the traversal `freeAt`/edge-settle
helper). Preserve facing. If no door with that ID exists in the destination (filtered or
data gap), place Snake at a safe default (room center / nearest open tile) and log it — never
off-screen. Exact enter-offset semantics are a tunable to verify against the original.

### D7 — Rendering doors

Draw each active-room door as a rectangle at its footprint: a closed-door fill (a dark
door colour) when closed, and an "open" appearance (hole/background-toned) when open, with the
brief open animation interpolating between them. This is intentionally simple; pixel-accurate
door tiles (`DoorClosedTiles`/`DoorOpenTiles` over the tileset) are deferred polish.

### D8 — Door SFX export

Add a generic SFX export to `Tools/ThemeOfTaraPlayer` (or parameterize the existing
punch exporter) to render `Sfx_Door` → `web/assets/door.wav`, reusing the offline PSG render
already used for the punch WAV.

## Risks / Trade-offs

- **[Enter offsets place Snake wrong / re-trigger the door]** → Mitigation: clamp + edge-settle
  the entry point, a "was-in-door" latch, and treat enter offsets as a tunable verified by
  walking a door both ways.
- **[Closed-door collision conflicts with the tile collision at the same spot]** → Mitigation:
  door footprints are checked in addition to tiles; opening removes the door from the solid
  set, so a doorway that is a tile-opening plus a door behaves correctly (blocked closed,
  passable open).
- **[A door's destination has no matching door ID]** → Mitigation: D6 safe-default placement +
  log; never crash or spawn off-screen.
- **[Doors that need a key card would be wrongly walkable]** → Mitigation: explicitly scoped
  out; noted that locked doors arrive with the items/cards feature, at which point `doors.json`
  can carry a required-card field.
- **[Door rectangle art looks rough]** → accepted for this slice; D7 notes the faithful-tiles
  follow-up.

## Migration Plan

Additive: new export outputs (`doors.json`, `door-types.json`, `door.wav`) and new `game.js`
door logic layered on the existing room manager and movement step. Rollback is reverting the
`game.js` door code and the export additions; traversal and the single-room prototype are
untouched. No disassembly or runtime-dependency changes.

## Open Questions

- Exact enter-offset interpretation (sign/scale) — verify by entering a door both ways.
- Whether doors should re-close when leaving a room or latch open for the session (default:
  re-close, simplest).
- `DOOR_OPEN_TICKS` duration and the door colour/appearance for the simple overlay.
- Whether to widen the exported cluster to surface more in-cluster door links.
