## Context

The browser port handles plain push-open doors (`browser-doors`) and edge/door room transitions
(`browser-room-traversal`), and has a card-aware item system (`browser-player-items`). The ROM gates
doors in `ChkOpenDoor` (`logic/doors/opendoor.asm`) on a per-door **lock type** (DoorsList byte `+2`),
dispatching to `ChkCard1..8` (keycards), `ChkElevatorDoor`, and several special locks. Elevators are a
self-contained room mode: `SetNextRoomElev` (`logic/nextroom.asm`) seeds the car and sets
`GAME_MODE_ELEVATOR`; `ElevatorRoomLogic`/`MoveElevator` (`logic/elevatorroom.asm`) drive it; floors are
the elevator room's up/down connections.

Neither mechanic is currently reachable: the cluster's doors are plain, the door export emits only the
render type and **filters out** elevator/special doors, and no elevator rooms (≥240) are exported. So
this change is part asset-export, part logic.

## Goals / Non-Goals

**Goals:**
- Keycard doors: open only with the matching card **selected** and the right facing (`ChkCard`).
- A keycard ownable/selectable; one exported room with a keycard door + its neighbour.
- Elevators: enter → ride (up/down, floor stops, controls constrained) → exit to a connected floor,
  with the car drawn; faithful to `SetNextRoomElev`/`ElevatorRoomLogic`.
- Export: door lock type; one elevator shaft + its floor rooms + connections; the elevator-car gfx.

**Non-Goals:**
- The full set of the game's keycard doors and elevator shafts (broader map export) — one of each.
- Breakable prison/basement walls, lorry/truck doors, compass/BigBoss/desert special doors, parachute.
- A real elevator UI/animation beyond the ROM's car sprite + movement.

## Decisions

- **Door gets a `lock` field; the open path dispatches on it.** Export `LogicOpen` into each `doors.json`
  entry as `lock`. In `game.js`, replace the unconditional open with a dispatch mirroring `ChkOpenDoor`:
  `lock 0/plain` → open on contact (today's behaviour); `lock = cardN` → open iff `selectedItem ===
  SELECTED_CARDn` **and** Snake faces the door (`door.type`/render dir === `snake.dir`); `lock = elevator`
  → direction rule (up = enter, right = exit). A locked door does not open or transition. Rationale:
  one faithful dispatch point, matching the ROM's table.
- **Keycard ownable.** Add `SELECTED_CARD1` to `ownedItems` so it can be selected (the cards already
  exist as constants). The HUD item readout already renders card icons + numbers.
- **Elevator as a distinct game state.** Add `gameState === 'elevator'` (GameMode 6). `enterElevator()`
  (= `SetNextRoomElev` + `SetElevatorCtrl`): seed `elevatorY` at top/bottom from the entry direction,
  read `elevatorLimitUp/Down` from the exported elevator-room data (`GetElevatorRoomDat`/
  `idxElevatorRoom`), set the state, end the alarm. `elevatorRoomLogic()` each tick (= `ElevatorRoomLogic`/
  `MoveElevator`): up/down held → move car + Snake 1px, clamp to limits, **stop at floor Y `0x38`/`0x78`/
  `0xB8`** (shaft rooms 247–250 skip intermediate); left/right set the exit side; at a floor + exit (or a
  shaft boundary) → transition to the connected floor room (`up`/`down` connection) and restore walk
  control. Draw the car from `elevator.png` at `elevatorX/Y`. Rationale: mirrors the ROM's state machine;
  reuses the existing room-transition + entry-placement for the floor exit.
- **Controls remap in the elevator.** While in the elevator state, the normal `normalControl` walk is
  suspended; only up/down (move car) and left/right (exit side) are read, faithful to `ElevatorRoomLogic`/
  `DisableControls`. The fire/punch/box inputs are inert there.
- **Asset export.** RoomViewer: (a) `WriteDoorsJson` emits `lock` (byte +2 & 0x1F) and stops filtering
  elevator/card doors that belong to exported rooms; (b) export one elevator shaft room (≥240) + the
  floor rooms it connects to + connections (extend the BFS or add them explicitly); (c) decode + export
  `SprElevator*` to `elevator.png`. Pick a concrete shaft + a keycard-door room during apply and pin the
  room numbers + card.

## Risks / Trade-offs

- **Picking a self-contained shaft + keycard room** → the cluster is the jungle/building-2 area; the
  chosen elevator and keycard door must connect to exported rooms (or be added with their neighbours).
  Mitigation: choose during apply by inspecting the ROM door/connection data; gate behind a `?room=` dev
  hook if it's not in the natural start cluster, and note it.
- **Elevator floor-stop / limit constants** → must come from `idxElevatorRoom` + the `0x38/0x78/0xB8`
  floor Y's, not guessed; the multi-floor shaft rooms (247–250) need the skip-intermediate rule.
- **Elevator car sprite decode** → `SprElevator*` uses the actor-sprite attr format (offsets/colours);
  decode it like the other actor sprites (guard/Zzz). If the exact colour table is unclear, flag it.
- **`doors.json` shape change** (`lock` field) is backward-compatible if absent defaults to plain.

## Migration Plan

1. RoomViewer: emit door `lock`; export one elevator shaft + floors + connections + `elevator.png`.
2. `game.js`: door open dispatch on `lock` (keycard + elevator rules); add the card to inventory; add
   the elevator game state (enter/ride/exit + car draw + control remap); recognize elevator rooms (≥240)
   in the transition path.
3. Verify headless (keycard open/locked by selection + facing; elevator enter → floor stops → exit to
   connected room; controls constrained) and in-browser. Update `coverage-map.json` (doors lock dispatch,
   `ChkCard*`, `SetNextRoomElev`/`ElevatorRoomLogic`/`GetElevatorRoomDat`) and regenerate the doc.

Rollback: door dispatch falls back to plain-open if no `lock`; the elevator state is additive.

## Open Questions

- Which elevator shaft (240/241/…) and which keycard-door room to export — pin from the ROM door/
  connection data during apply, choosing the smallest self-contained set that exercises both.

## Correction discovered during apply (elevator floor-mapping)

The proposal/design above assumed an elevator's floors come from the elevator room's **up/down
connections**. That is **wrong**: the door audit shows elevator car rooms 240–250 have **no connection
table entries at all** (`up/down/left/right = 255`). Floors are mapped through the **door system**:
- A floor room has a **type-5** "enter elevator" door (`IdDoorsLogic` lock 1) whose `dest` is a car room
  240–250 (e.g. room 3 → car 240).
- The per-floor **exits** live in the shaft rooms 224–235 as **type-6** doors sharing the same door IDs
  (e.g. room 225 id2 → room 3, id34 → room 31). So car room 240's floors = {room 3, room 31} via shaft
  room 225, and the stop position maps to a floor by the type-6 door's Y.
- These shaft rooms (224–226) **overlap the rooms `snake-ladders` already treats as ladder-climb rooms**,
  so the two systems must be reconciled.

**Keycard doors are complete and verified** (the cluster's 6↔7↔11 / 73↔76 are CARD4/CARD5 doors). The
**elevator** is a dedicated subsystem (export car room + a second floor + decode `SprElevator`; port the
`ElevatorRoomLogic` state machine + GameMode 6; implement the door-based floor mapping; reconcile the
224–226 ladder overlap) — paused here so it can be done correctly rather than rushed. Recommend finishing
it as its own focused pass (the keycard half can ship now).
