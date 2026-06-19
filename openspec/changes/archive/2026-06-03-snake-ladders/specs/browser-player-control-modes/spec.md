## ADDED Requirements

### Requirement: Escape-ladder climbing (rooms 224-226)

The browser SHALL faithfully port the building-2 roof **escape-ladder** sequence (rooms 224-226).
Ladders are not a generic per-tile mechanic: `NormalCtrl` never climbs; the ladder control modes
are entered only via the ladder door (`SetLadderRoomEntry`, `nextroom.asm`), and the climb logic
is room-specific (`ChkExitLadders`/`ChkLadderLimits` key off rooms 224/226). The ladder rooms are
reached via a `?room=224` dev hook (the door is end-game). Specifically:

- Entering a ladder room SHALL put Snake in **ladder-walk** mode (`CONTROL_LADDER_WALK`=6) at the
  floor (`SetLadderRoomEntry`): walk left/right only, normal walk animation.
- On a ladder tile (`0x08`) with **Up** pressed (`ChkStartClimb`), Snake SHALL enter **ladder-climb**
  mode (`CONTROL_LADDER_CLIMB`=7, `PlayerAnimation=5`): vertical-only movement at the ROM climb
  speed (half walk), snapped to the ladder, with the climb animation (`SetSprLadder*`).
- While climbing at floor level, pressing **Left/Right** SHALL step off onto the floor
  (`ChkExitLadders`) back into ladder-walk mode.
- Climbing past the room's top/bottom limit SHALL move to the next/previous ladder room
  (`ChkLadderLimits`/`ChkNextLadderRoom`: up at Y<16, down at Y≥186; room 224 clamps at the
  bottom). Reaching the top of room 226 SHALL trigger the escape ending (`SetLeavedOuterH`).
- Ladders SHALL NOT be climbable in ordinary rooms (the control mode is only entered in the
  ladder rooms; tile `0x08` in other tilesets is unrelated).

#### Scenario: Enter a ladder room in ladder-walk mode

- **WHEN** Snake enters a ladder room (224-226)
- **THEN** he is in ladder-walk mode at the floor, able to move only left/right

#### Scenario: Mount and climb

- **WHEN** Snake is on a ladder tile in a ladder room and presses Up
- **THEN** he enters climb mode, moves only up/down along the ladder (snapped to it), and shows
  the climb animation

#### Scenario: Step off at the floor

- **WHEN** a climbing Snake is at floor level and presses Left/Right
- **THEN** he returns to ladder-walk on the floor

#### Scenario: Climb between ladder rooms

- **WHEN** a climbing Snake passes the top (Y<16) or bottom (Y≥186) limit
- **THEN** he transitions to the room above/below (224↔225↔226), placed on the connecting ladder;
  room 224 clamps at its bottom

#### Scenario: Reaching the top of room 226 escapes

- **WHEN** a climbing Snake passes the top of room 226
- **THEN** the escape ending is triggered (Outer Heaven left)

#### Scenario: Ordinary rooms have no climbable ladders

- **WHEN** Snake is in a non-ladder room
- **THEN** pressing Up never starts a climb (ladder mode is only entered in the ladder rooms)
