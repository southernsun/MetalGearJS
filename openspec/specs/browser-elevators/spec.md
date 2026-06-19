# browser-elevators Specification

## Purpose
The elevator system: entry/exit placement via the paired type-5/6 doors, the elevator-room
control mode, the GameMode-6 ride with floor stops and express shafts, and the cabin
rendering. Floor mapping is DOOR-based (see docs/rom-data-formats.md "Elevators").
## Requirements
### Requirement: Entering an elevator parks the player and cabin at the entry floor

Entering a door whose destination is an elevator room (≥ 0xF0) SHALL place the player at
X 0xD8 with the floor's player Y and the cabin at X 0x70 with the floor's elevator Y, from
the elevator data for the room being left (`SetElevatorPosY`/`GetElevatorPosY`,
logic/nextroom.asm:179 / Banks0123.asm:938; data exported from data/elevatorrooms.asm), and
SHALL enter the elevator-room control mode facing left with controls cleared
(`SetElevatorCtrl`, logic/nextroom.asm:374). The per-elevator movement limits
(`ElevatorLimitUp/Down`) SHALL be loaded on entry (`GetElevatorRoomDat`).

#### Scenario: Room 3's north door enters elevator 240 at the bottom

- **WHEN** Snake enters room 3's type-5 door (dest 240)
- **THEN** he stands at (0xD8, 0xB4) facing left with the cabin parked at (0x70, 0xB8)

### Requirement: The elevator room walk and floor exits

In the elevator room the player SHALL move horizontally only (`ElevatorCtrl`,
Banks0123.asm:8541), clamped at X 104 on the left. The floor exits are the room's own
invisible **type-6 doors** at X 0xE0, one per floor Y, paired by door ID with the floor
rooms' type-5 doors (data/doors.asm:848 — room 240: id 2 → room 3 at Y 0x98, id 34 →
room 31 at Y 0x18); walking right at the current floor opens and enters the matching door,
landing in the floor room through `SetPlayerInDoor` and returning to normal control. (The
ROM's X ≥ 244 `ExitRoom` is connection-based and undefined for room 240 — the doors
intercept first; the port clamps there, a cited stand-in for the undefined exit.)

#### Scenario: Walking out at the top floor

- **WHEN** the cabin sits at Y 0x38 (room 240's top) and Snake walks right through the floor
  opening
- **THEN** the game cuts to room 31 with Snake placed at its elevator door (type-5
  PlayerInDoorDat offsets, control mode 0)

#### Scenario: The left wall

- **WHEN** Snake walks left in the elevator room
- **THEN** he stops at X 104

### Requirement: Riding follows ChkCtrlElevator and ElevatorRoomLogic

The ride SHALL start only standing inside the cabin (X < 0x78), holding a direction allowed for the room
(240-242 both, 243-244 up only, 245-246 down only, ≥ 247 both — `ChkCtrlElevator`,
Banks0123.asm:9082) SHALL start the ride toward the matching limit unless already there:
GameMode 6, where cabin and player move 1px per ROM iteration (`ElevatorRoomLogic`,
logic/elevatorroom.asm). The cabin SHALL stop at floor Ys 0x38/0x78/0xB8 (the express
rooms 247-250 skip stops while the direction stays held, per-room quirks ported verbatim),
returning control with the held left/right as the new facing; cabin Y < 24 or ≥ 208 SHALL
leave the shaft into the adjacent elevator room (`NextRoomDirect` = the ride direction,
with the `SetNextRoomElev` cabin parking at 0xD0 going up / 0x18 going down). A shaft
neighbour that isn't exported SHALL stop the ride in place (cited divergence — the ROM's
shafts are fully populated).

#### Scenario: Riding up one floor

- **WHEN** Snake stands in room 240's cabin at the bottom (Y 0xB8) and holds up
- **THEN** the cabin and Snake rise 1px per iteration and stop at Y 0x78, then at 0x38 on
  the next ride, control returning after each stop

#### Scenario: No ride outside the cabin

- **WHEN** Snake holds up while outside the cabin (X ≥ 0x78)
- **THEN** nothing happens

#### Scenario: Already at the limit

- **WHEN** the cabin sits at the up limit and Snake holds up
- **THEN** no ride starts

### Requirement: The cabin renders from the ROM sprites at the elevator position

The cabin SHALL be drawn from the decoded 12-sprite elevator block
(`SprElevatorDat`/`SetElevatorSpr`, logic/elevatorroom.asm:178-241; `SprElevator` at
pattern base 0x38) anchored at (ElevatorX, ElevatorY), in the elevator room and throughout
the ride, with the REAL in-game colours — spriteset 0's `SprsetPal0`
(data/palettes.asm:214): blue body (index 2) and greys, black OR-overlap.

#### Scenario: The cabin tracks the ride

- **WHEN** the elevator moves
- **THEN** the cabin image moves with ElevatorY, with Snake riding inside it
