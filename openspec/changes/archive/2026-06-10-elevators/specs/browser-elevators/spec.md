# browser-elevators — riding the elevators

## ADDED Requirements

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

### Requirement: The elevator room walk and exit

In the elevator room the player SHALL move horizontally only (`ElevatorCtrl`,
Banks0123.asm:8541), clamped at X 104 on the left; reaching X ≥ 244 SHALL exit right into
the floor room matching the cabin's current Y (`ChkLimitXElevator` :9448 + the
`GetNextRoomNum` elevator branch), entering that room through its elevator door
(`SetPlayerInDoor`).

#### Scenario: Walking out at the top floor

- **WHEN** the cabin sits at Y 0x38 (room 240's top) and Snake walks right past X 244
- **THEN** the game cuts to room 31 with Snake placed at its elevator door

#### Scenario: The left wall

- **WHEN** Snake walks left in the elevator room
- **THEN** he stops at X 104

### Requirement: Riding follows ChkCtrlElevator and ElevatorRoomLogic

Standing inside the cabin (X < 0x78) and holding a direction allowed for the room
(240-242 both, 243-244 up only, 245-246 down only, ≥ 247 both — `ChkCtrlElevator`,
Banks0123.asm:9082) SHALL start the ride toward the matching limit unless already there:
GameMode 6, where cabin and player move 1px per ROM iteration (`ElevatorRoomLogic`,
logic/elevatorroom.asm). The cabin SHALL stop at floor Ys 0x38/0x78/0xB8 (the express
rooms 247-250 skip stops while the direction stays held, per-room quirks ported verbatim),
returning control with the held left/right as the new facing; cabin Y < 24 or ≥ 208 SHALL
leave the shaft into the adjacent elevator room (`NextRoomDirect` = the ride direction).

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
(`SprElevatorDat`/`SetElevatorSpr`, logic/elevatorroom.asm:178-241) anchored at
(ElevatorX, ElevatorY), in the elevator room and throughout the ride.

#### Scenario: The cabin tracks the ride

- **WHEN** the elevator moves
- **THEN** the cabin image moves with ElevatorY, with Snake riding inside it
