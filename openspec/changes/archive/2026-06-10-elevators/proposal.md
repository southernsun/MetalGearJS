# Elevators

## Why

Elevators are the biggest remaining traversal system, and one is reachable in our cluster
today: room 3's north door is a **type-5 elevator door to elevator room 240**
(data/doors.asm:308 — `db 2, 5, 0, 0x64, 0xF0`), which our doors export currently filters
out. The disassembly specifies the whole system: per-elevator floor data
(data/elevatorrooms.asm — room 240 serves room 3 at the bottom and room 31 at the top),
entry placement (`SetElevatorPosY`/`SetElevatorCtrl`, logic/nextroom.asm), the elevator-room
walk (control mode 2, `ElevatorCtrl` Banks0123.asm:8541), ride start (`ChkCtrlElevator`
:9082), the ride itself (GameMode 6, `ElevatorRoomLogic` logic/elevatorroom.asm — 1px/
iteration, floor stops at Y 0x38/0x78/0xB8, express shafts that skip floors while held,
multi-room shafts that exit into the next elevator room), and exiting right back onto a
floor (`ChkLimitXElevator` :9448 → the floor room for the current elevator Y).

## What Changes

- **Elevator doors join the door system**: the doors export includes type-5/6 doors and
  destinations ≥ 0xF0; entering one runs the ROM's elevator entry — player at X 0xD8 and
  the per-floor Y, the cabin parked at that floor (`SetElevatorPosY` + `GetElevatorPosY`),
  control mode 2 with the ROM's left-facing start (`SetElevatorCtrl`). The lock-1 entry
  condition is ported from `ChkOpenDoor`'s elevator branch.
- **The elevator room**: room 240 (and the top floor, room 31) exported like any room;
  inside, Snake walks horizontally only (left clamp at X 104), X ≥ 244 exits right to the
  floor room matching the elevator's Y (the `GetNextRoomNum` elevator branch ported
  exactly), and stepping into the cabin (X < 0x78) and holding up/down starts the ride
  toward `ElevatorLimitUp/Down` (per-room movement masks: 240-242 both ways, 243-244 up
  only, 245-246 down only).
- **The ride** (GameMode 6): cabin and Snake move 1px per ROM iteration; the cabin stops at
  floor Ys 0x38/0x78/0xB8 (express rooms 247-250 skip stops while the direction is held);
  reaching Y 24/208 exits the shaft into the adjacent elevator room (multi-room shafts —
  ported, though no cluster shaft spans rooms); on stopping, control returns with the held
  left/right becoming the facing.
- **The cabin drawn from the ROM sprites**: the 12-sprite elevator
  (`SprElevatorDat`/`SetElevatorSpr`, logic/elevatorroom.asm:178-241) exported as a cabin
  image positioned by ElevatorY/X.
- **Data export**: `elevatorrooms.json` from data/elevatorrooms.asm (per elevator room:
  up/down limits + the (previous room → player Y, elevator Y) floor list).
- **Out of scope**: the rooms beyond room 31's other exits (it exports as an island like
  the ladder rooms; `?room=` reaches it), the HUD sprite-mask trick (irrelevant on canvas),
  elevators entered by edge connections (`SetNextRoomElev` — no cluster room uses one;
  the logic is ported only as far as the shared ride machinery).

## Capabilities

### New Capabilities

- `browser-elevators`: elevator entry/exit placement, the elevator-room control mode, the
  ride state machine with floor stops and express shafts, and the cabin rendering.

### Modified Capabilities

- `browser-doors`: type-5/6 elevator doors are exported and enterable; a door destination
  ≥ 0xF0 places the player via the elevator entry (not `PlayerInDoorDat`), and returning
  from an elevator into a floor room uses `SetPlayerInDoor` as already ported.

## Impact

- `web/game.js`: elevator state + control mode 2 + GameMode-6 ride + cabin render + door
  entry branch for dest ≥ 0xF0.
- `Tools/RoomViewer`: doors export unfiltered for type 5/6 (doors.json), rooms 240 + 31
  added to the exported set, the type-5 door graphic verified in door-gfx, the cabin
  sprite export.
- New `Tools/export-elevators.mjs` → `web/assets/elevatorrooms.json`.
- New `web/elevator.headless.mjs`; SESSION-STATE (cluster map note: room 3 ⇄ 240 ⇄ 31),
  rom-coverage.
