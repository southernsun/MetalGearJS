# Design — elevators

## Context

The ROM's elevator system, verified in the disassembly:

- **Data** (data/elevatorrooms.asm, read by `GetElevatorRoomDat` Banks0123.asm:980): per
  elevator room (240 = index 0): `dw limitUp,limitDown` then a list of `db prevRoom /
  dw playerY,elevatorY` floor entries. Room 240 (`ElevatorRoom1`): limits 0x38/0xB8;
  floors — room 31 → (0x34, 0x38), room 3 → (0xB4, 0xB8).
- **Entering by door** (`SetDoorDestination` → `SetElevatorPosY`, logic/nextroom.asm:152-193):
  a door destination ≥ 0xF0 looks up the floor entry for `PreviousRoom`: player at
  (X 0xD8, the entry's player Y), cabin at (X 0x70, the entry's elevator Y). Then
  `LocatePlayerEntry` → `SetElevatorCtrl` (:374): control mode 2, facing left, controls
  cleared. Room 3's elevator door: id 2, render type 5, at (X 0x64, Y 0), dest 0xF0
  (data/doors.asm:308); its lock comes from `IdDoorsLogic` (lock 1 = elevator) — the
  `ChkOpenDoor` elevator branch decides how it opens (ported as found).
- **Elevator-room walk** (control mode 2, `ElevatorCtrl` :8541): horizontal movement only;
  `ChkLimitXElevator` (:9448) clamps left at X 104 and exits RIGHT at X ≥ 244 (`ExitRoom`
  DIR_RIGHT) — the `GetNextRoomNum` elevator branch resolves which floor room that is from
  the elevator's current Y (ported exactly; located during implementation at the
  GetNextRoomNum tail, Banks0123.asm:~900-925).
- **Ride start** (`ChkCtrlElevator` :9082): only when the player is inside the cabin
  (X < 0x78); the allowed directions depend on the room (240-242 both, 243-244 up only,
  245-246 down only, ≥ 247 both); holding a valid direction with the cabin off that limit
  sets `ElevatorDir`, `ElevatorStatus = 0`, GameMode 6.
- **The ride** (`ElevatorRoomLogic`, logic/elevatorroom.asm): status 0 — cabin and player Y
  move 1px per iteration; floor stops when the cabin Y hits 0x38/0x78/0xB8 (status → 1;
  express rooms 247-250 skip stops while the direction stays held; a couple of per-room
  quirks ported verbatim); cabin Y < 24 or ≥ 208 → status → 2. Status 1 — GameMode back to
  0, the held left/right becomes the facing. Status 2 — `NextRoomDirect = ElevatorDir`,
  GameMode 1 (room change into the next elevator room of a multi-room shaft; the
  connection-entry path `SetNextRoomElev` then parks the cabin at 0xD0/0x18).
- **Cabin render** (`SetElevatorSpr` + `SprElevatorDat` :178-241): 12 sprites at fixed
  offsets from (ElevatorY, ElevatorX) — a 2-tall × 3-wide cabin block with side rails.

## Goals / Non-Goals

**Goals:**
- Ride the real elevator: room 3 → its north type-5 door → elevator room 240 (cabin parked
  at the bottom), step in, hold up, stop at the top floor, walk right, exit into room 31 —
  and back.
- The full ride machinery ported (floor stops, masks, express skips, shaft exits) so later
  zones only add data.

**Non-Goals:**
- Exporting the rest of building 1's second floor (room 31 is an island like the ladder
  rooms; its non-elevator exits dead-end until a cluster expansion).
- Connection-entered elevators end-to-end (`SetNextRoomElev` placement is ported with the
  shared machinery but nothing in the cluster triggers it; unit-tested only).
- The HUD sprite-mask trick (`SetHUDSprMask`) — a hardware sprite-limit workaround with no
  canvas equivalent.

## Decisions

1. **elevatorrooms.json via a node exporter** (precedent: items/radio/radiocalls): parse
   data/elevatorrooms.asm → `{ "240": { up, down, floors: [{ room, playerY, elevY }] }, … }`.
   The shared `ElevatorRoom9_10` zero-entries export as-is.
2. **Rooms 240 and 31 join the room export.** RoomViewer's `--export-web` takes a start +
   count over connected rooms; elevator room 240 and floor room 31 are added the way the
   ladder/water dev rooms were (explicit extra rooms in the manifest). Their collision
   exports drive the walk clamps only partially — the ROM's explicit X limits (104/244,
   cabin < 0x78) are constants, ported as such.
3. **Doors export includes elevator doors.** WriteDoorsJson stops filtering type-5/6 /
   dest ≥ 0xF0 records; door-gfx gains the type-5 graphic if it isn't already decoded
   (verify visually). game.js door entry branches on `dest >= 240`: elevator entry
   (`SetElevatorPosY` placement + control mode 2) instead of the `PLAYER_IN_DOOR_DAT` path.
   The reverse trip (elevator → room 3) is the already-ported `SetPlayerInDoor` — it just
   needs the door present in doors.json.
4. **Ride state in the ROM's shape**: `elevatorY/X`, `elevatorDir`, `elevatorStatus`,
   `elevatorLimitUp/Down`, control mode `CONTROL_ELEVATOR = 2`, gameState `'elevator'`
   (GameMode 6) — all ticked on ROM iterations like the call/text/radio systems.
5. **Cabin exported as one image**: compose the 12 `SprElevatorDat` sprites (pattern ids
   0x38-0x64 from the elevator sprite gfx — source blob located during implementation)
   into a single PNG anchored at the (ElevatorY, ElevatorX) origin, drawn each frame at the
   cabin position. The per-sprite colours come with the compose.

## Risks / Trade-offs

- [The `GetNextRoomNum` elevator-exit branch is the one routine not yet read end-to-end] →
  task 1.1 reads and documents it before any porting; the floor data already constrains
  what it must produce (Y 0xB8 → room 3, Y 0x38 → room 31).
- [Elevator sprite patterns' gfx source unknown until implementation] → same approach as
  every sprite export so far; if the patterns live in a per-zone sprite bank, the exporter
  cites and decodes that bank.
- [Room 31's collision may not suit walking out of the door area] → check-graph covers
  exported rooms; landing spots validated like the door slice did.

## Open Questions

- None blocking.
