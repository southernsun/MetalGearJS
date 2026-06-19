# browser-player-control-modes Specification

## Purpose
TBD - created by syncing change player-control-modes. Update Purpose after archive.
## Requirements
### Requirement: Player control-mode dispatch

The game SHALL drive Snake through a control-mode state machine faithful to the ROM
(`PlayerControlLogic` dispatching on `PlayerControlMod`; `constants/Enums.asm`). For this change
the implemented modes are 0 = normal walk and 1 = punch (the existing behaviour), with the
dispatch structured so later modes (6 ladder-walk, 7 ladder-climb, …) are added as branches. The
on-screen sprite SHALL be selected from `PlayerAnimation`. Plain walk + collision + doors + punch
behaviour SHALL be unchanged — it simply runs as mode 0/1 of the dispatch.

#### Scenario: Walk and punch run as control modes 0 and 1

- **WHEN** Snake walks, collides, opens/enters doors, traverses rooms, or punches
- **THEN** behaviour is exactly as before, now dispatched as mode 0 (walk) / mode 1 (punch)

#### Scenario: The sprite follows PlayerAnimation

- **WHEN** the player animation value changes
- **THEN** the drawn Snake frame is selected from `PlayerAnimation` (walk/punch/die today)

#### Scenario: Dispatch is extensible

- **WHEN** a later change adds a mode (e.g. ladder-climb = 7)
- **THEN** it plugs in as a new branch of the dispatch without altering modes 0/1

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

### Requirement: Cardboard box

The game SHALL draw Snake under the cardboard box when it is the selected item (`SELECTED_BOX`)
and Snake is in normal control (`PlayerAnimation=7`, `SetSprBox`: sprite 42 idle, alternating
42/44 while moving), with movement unchanged from normal walking (the ROM keeps box movement
identical to walking — a sprite/flag, not a separate control mode). The box appearance SHALL be
dropped when the box is deselected, or when Snake enters water, punches, or dies (those animations
take precedence).

#### Scenario: Equipping the box hides Snake under it

- **WHEN** the box item is selected and Snake is in normal control
- **THEN** Snake is drawn as the box and moves like normal walking (box idle vs moving frames)

#### Scenario: Other states take precedence

- **WHEN** the box is selected but Snake enters water, punches, or dies
- **THEN** the water/punch/death animation is shown instead of the box

#### Scenario: Unequipping restores Snake

- **WHEN** the box item is deselected
- **THEN** the box appearance is dropped and the normal walk animation is shown

### Requirement: Water — shallow and deep

In a water room, the tile under Snake SHALL put him into shallow water (tiles `0x73–0x74`, brick
`0x6D`, shadow `0x6F–0x72`; `PlayerAnimation=2`) or deep water (`0x75–0x76`; `PlayerAnimation=4`),
per `ChkWater`/`ChkWaterTiles`/`SetInWaterMode`/`SetDeepWaterMode`. Movement stays under normal
control; shallow water shows the wading sprite and deep water the swimming sprite. Returning to dry
land SHALL restore the walk animation. **Deep water without the oxygen tank** (`SELECTED_OXYGEN`)
SHALL drain life — 2 every 8 frames, gated by the shared damage-delay timer (`SetInWaterMode3` →
`DecrementLife_C`) — and reaching 0 life is death. The only feedback is the life bar falling: the
ROM's deep-water drain is **silent and does not blink** the sprite (unlike the electric floor,
which has its own SFX). (There is no item system yet, so there is no scuba tank to equip — deep
water always drains; the oxygen item that prevents it arrives with the item system.)

#### Scenario: Enter shallow water

- **WHEN** Snake moves onto a shallow-water tile in a water room
- **THEN** he shows the wading animation and keeps moving under normal control

#### Scenario: Enter deep water

- **WHEN** Snake moves onto a deep-water tile
- **THEN** he shows the swimming animation (deep-water mode)

#### Scenario: Deep water without oxygen drains life

- **WHEN** Snake is in deep water without the oxygen tank
- **THEN** he loses 2 life every 8 frames (life bar falling, no blink, no sound) and dies if his
  life reaches 0

#### Scenario: Leave water

- **WHEN** Snake moves back onto dry land
- **THEN** he returns to the normal walk animation and the drain/blink stops

