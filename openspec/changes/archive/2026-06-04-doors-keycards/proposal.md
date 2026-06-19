> **Scope note (re-scoped during apply):** this change ships **keycard-locked doors** only. The
> elevator half was split into its own future change — during apply the door audit showed elevator
> floors are mapped through the type-5/type-6 **door system** (not the elevator room's connections, which
> are empty), overlapping the ladder rooms; that's a dedicated subsystem. The mechanism is recorded for
> the follow-up. Keycards needed no new rooms — the existing cluster already has card-locked doors.

## Why

The browser port can walk through plain push-open doors, but the building isn't really navigable: there
are no **keycard-locked doors** (gating progression) and no **elevators** (vertical movement between
floors). These are the ROM's core map-progression mechanics. The door open path (`ChkOpenDoor`,
`logic/doors/opendoor.asm`) already dispatches on a per-door lock type — including `ChkCard1..8` and the
elevator door — and the elevator is a self-contained room mode (`ElevatorRoomLogic`,
`logic/elevatorroom.asm`; `SetNextRoomElev`, `logic/nextroom.asm`). Porting them turns the slice into an
explorable, gated building.

## What Changes

- **Keycard-locked doors** — port `ChkCard1..8` (`opendoor.asm`): a door whose lock type (DoorsList byte
  `+2` `LogicOpen`, low 5 bits) is a card type opens only when the matching card is the **selected item**
  (`SelectedItem == SELECTED_CARDn`) **and** Snake faces the door (render type = `PlayerDirection`);
  otherwise it stays locked. Faithful to the ROM, the card must be *equipped*, not merely owned.
- **A card is ownable/selectable** — extend the item inventory so at least one keycard (`SELECTED_CARD1`)
  is held and selectable, so a keycard door can be opened (the card items already exist as constants in
  `player-item-system`).
- **Elevators** — port the elevator room mode (`GAME_MODE_ELEVATOR` = 6): entering an elevator door
  (`ChkElevatorDoor` / `SetElevatorCtrl`) puts Snake in the elevator with **controls disabled** except
  up/down (which move the car) and left/right (which set the exit side); `SetNextRoomElev` seeds the car
  at the top/bottom and `GetElevatorRoomDat` its up/down limits; `ElevatorRoomLogic`/`MoveElevator` move
  the car (and Snake) by 1px, **stopping at floor Y's `0x38`/`0x78`/`0xB8`** (multi-floor shaft rooms
  247–250 skip intermediate stops); reaching a floor and pressing left/right (or the shaft boundary)
  transitions to the connected floor room (`NextRoomDirect = ElevatorDir`). The elevator car is drawn
  from its sprite (`SprElevator*`). `ChkAlarmEnd` already ends the alarm on entering an elevator — kept
  consistent.
- **Elevator + exit doors** — port `ChkElevatorDoor`: an elevator *entry* door opens going **up**; an
  elevator *exit* door (inside the shaft) opens going **right** (all elevator rooms exit on the right).
- **Assets** — export: the door **lock type** (`LogicOpen`) into `doors.json` (currently only the render
  type is emitted, and elevator/special doors are filtered out — both change); at least one room with a
  **keycard door** + its locked neighbour; one **elevator shaft room** (240/241) + the **floor rooms** it
  connects to + their connections; the **elevator-car graphic** (`SprElevator`) and the shaft-room
  background.

## Capabilities

### New Capabilities
(none — the `browser-elevator` capability was split into the follow-up elevator change.)

### Modified Capabilities
- `browser-doors`: doors carry a **lock type**; keycard doors (`ChkCard1..8`) open only with the matching
  card selected and the right facing. (Elevator doors are deferred to the elevator change.)
- `browser-player-items`: keycards are ownable/selectable so keycard doors are usable.
- `rom-asset-export`: emit the door lock type into `doors.json`.

## Impact

- **Code:** `web/game.js` — door open path consults a per-door lock (`lock`) field: keycard doors gate on
  `selectedItem === card` + facing; elevator/exit doors on direction. New elevator module: `GameState`
  `'elevator'` (GameMode 6), `enterElevator`/`elevatorRoomLogic`/`moveElevator` (floor-stop Y's, limits),
  controls remap (up/down move the car), the floor transition, and drawing the car. Add a keycard to
  `ownedItems`. `setRoom`/the transition path recognizes elevator rooms (≥240).
- **Assets:** `doors.json` gains a `lock` per door; new elevator + floor room PNGs/collision + connections;
  `elevator.png` (car) under `web/assets`; RoomViewer `WriteDoorsJson`/`ExportWeb` changes.
- **Specs:** new `browser-elevator`; deltas to `browser-doors`, `browser-room-traversal`,
  `browser-player-items`, `rom-asset-export`.
- **Scope / divergences (flagged):** only **one** keycard door and **one** elevator (with a couple of
  floors) are exported — enough to exercise the systems; the full set of the game's keycard doors and
  elevator shafts is out of scope (broader map export). Breakable prison/basement walls, lorry/truck
  doors, the compass/BigBoss/desert special doors, and the parachute intro are out of scope.
- **ROM sources:** `logic/doors/opendoor.asm` (`ChkOpenDoor`/`ChkCard*`/`ChkElevatorDoor`),
  `logic/elevatorroom.asm` (`ElevatorRoomLogic`/`MoveElevator`/`SetElevatorSpr`), `logic/nextroom.asm`
  (`SetNextRoomElev`/`SetElevatorCtrl`), `Banks0123.asm` (`GetElevatorRoomDat`/`idxElevatorRoom`),
  `constants/Enums.asm` (`SELECTED_CARD*`, `GAME_MODE_ELEVATOR`, elevator rooms 240–250).
