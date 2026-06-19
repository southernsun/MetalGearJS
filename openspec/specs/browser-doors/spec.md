# browser-doors Specification

## Purpose
TBD - created by archiving change browser-doors. Update Purpose after archive.
## Requirements
### Requirement: Render the active room's doors

The game SHALL load `doors.json` and `door-types.json` and draw each door of the active room
at its position and footprint, with a distinct closed appearance, so doors are visible in the
room.

#### Scenario: Doors appear in a room that has them

- **WHEN** the active room has one or more (non-filtered) doors
- **THEN** each door is drawn at its `x`/`y` with the open footprint size from its type, in a
  recognizable closed-door appearance

#### Scenario: Doors update on room change

- **WHEN** the active room changes (by edge crossing or by entering a door)
- **THEN** the doors drawn are those of the now-active room

### Requirement: Open a door on contact

When Snake walks into a closed door, the game SHALL open it **only if its lock allows** (faithful to
`ChkOpenDoor`, `logic/doors/opendoor.asm`, which dispatches on the door's lock type, DoorsList byte `+2`
`LogicOpen`): a plain door (lock 0) opens on contact as before; a **keycard** door opens only when the
matching card is the selected item and Snake faces it (see below). On a successful open the game SHALL
play the door sound effect once and show the open transition; a locked door SHALL stay closed (and not
transition). Snake cannot open any door while under the cardboard box (`PlayerAnimation == 7`). (Elevator
doors are deferred to the elevator change — they do not push-open here.)

#### Scenario: Contact opens an unlocked door

- **WHEN** Snake moves against a closed, unlocked door's footprint
- **THEN** the door plays `door.wav` once and becomes open (its appearance changes to open)
- **AND** the sound plays only after audio has been unlocked by a user gesture

#### Scenario: A locked door stays closed

- **WHEN** Snake contacts a door whose lock is not satisfied (wrong/again no card, wrong direction)
- **THEN** the door does not open and Snake does not transition through it

#### Scenario: An already-open door does not replay the open

- **WHEN** Snake contacts a door that is already open
- **THEN** the open sound is not replayed and the door stays open

#### Scenario: No door opening under the box

- **WHEN** Snake is under the cardboard box and contacts a door
- **THEN** the door does not open

### Requirement: Enter an open door to its destination room

When Snake enters an open door, the game SHALL hard-cut to that door's destination room and place
Snake at the destination room's door with the same ID using the ROM's door-entry placement
(`SetPlayerInDoor2..4` + `PlayerInDoorDat`, logic/nextroom.asm:397-481): Snake's position is the
destination door's draw XY plus that door **render type's** table offsets as **8-bit adds**
(`Y = (drawY + offY) & 0xFF`, `X = (drawX + offX) & 0xFF`; offsets like `0xF8` act as negative),
and Snake's **facing is set from the same table entry** (1=up, 2=down, 3=left, 4=right). The
placement SHALL be exact and deterministic — no free-tile relocation scan, no clamping — so
repeated in-and-out transits through the same doors land on identical pixels every time.

#### Scenario: Entering a door transitions to its destination

- **WHEN** Snake walks into an open door whose `dest` is an exported room
- **THEN** the game makes `dest` the active room (a discrete cut, no scroll)
- **AND** Snake is positioned at the matching door's draw XY plus the `PlayerInDoorDat` offsets
  for its type, facing the table's direction for that type

#### Scenario: Door round trips do not drift

- **WHEN** Snake enters a door, returns through the destination room's matching door, and repeats
  the round trip several times
- **THEN** his landing position in each room is pixel-identical on every transit and every door
  on the path keeps working

#### Scenario: Destination has no matching door

- **WHEN** the destination room has no door with the entered door's ID
- **THEN** the game places Snake at a safe default position inside the destination room rather
  than off-screen, and does not crash

### Requirement: Doors coexist with edge traversal and collision

Door behavior SHALL integrate with the existing movement: open-edge crossings and
unconnected-edge blocking are unchanged, and door footprints participate in collision so a
closed door is not walked through before it opens.

#### Scenario: Open-edge crossing still works

- **WHEN** Snake walks off an open connected edge (no door involved)
- **THEN** the edge transition behaves exactly as before doors were added

#### Scenario: A closed door blocks until opened

- **WHEN** Snake pushes into a closed door
- **THEN** he does not pass through it until it has opened

### Requirement: Keycard-locked doors

A door with a keycard lock (`ChkCard1..8`) SHALL open only when the player's **selected item** is the
matching card (`SelectedItem == SELECTED_CARDn`) **and** Snake is facing the door (the door's render
direction equals `PlayerDirection`). Holding the card without selecting it, selecting the wrong card, or
facing the wrong way SHALL leave the door locked. When both conditions hold the door opens like any
unlocked door (transition into its destination).

#### Scenario: Right card opens the door

- **WHEN** Snake faces a keycard door with the matching card selected and walks into it
- **THEN** the door opens and behaves like a normal open door

#### Scenario: Wrong or unselected card keeps it locked

- **WHEN** Snake contacts a keycard door without the matching card selected
- **THEN** the door stays locked

### Requirement: Elevator doors are exported and enterable

The doors export SHALL include the elevator doors (render types 5/6, destinations ≥ 0xF0,
lock 1) — room 3's north door (id 2, type 5, dest 240, data/doors.asm:308) and the elevator
rooms' own type-6 floor exits — with the type-5 graphic decoded (`GfxDoorElevator`) and
type 6 invisible (`DrawDoorDummy`). Lock-1 behaviour follows `ChkElevatorDoor`
(logic/doors/opendoor.asm:51): type 5 opens pushing UP, type 6 pushing RIGHT; both play the
dedicated elevator-door SFX 0x1B (`DoorOpenSfxs`, erasedoor.asm:83 — NOT the regular door
sound). The type-5 open animation is the sliding double door (`EraseDoorElevator`: erased
from the centre outward); type 6 opens instantly (`EraseDoorDummy` — no animation). Type 6
SHALL keep the ROM's DISTINCT zones (`DoorOpenEnterDat` row 6): touch/open at X−8..X+8 and
ENTER at X+8..X+24 — entry never fires from the touch zone. A door destination ≥ 0xF0 hands
entry to the elevator system (see browser-elevators); entering a floor room FROM an elevator
uses the existing `SetPlayerInDoor` path through the paired door.

#### Scenario: The elevator door appears and works in room 3

- **WHEN** Snake pushes UP into room 3's elevator door
- **THEN** it slides open from the centre with the elevator-door sound, and entry lands in
  elevator room 240 at the bottom floor (not at a PlayerInDoorDat offset)

#### Scenario: The floor exit enters at the ROM zone

- **WHEN** Snake walks right through an elevator room's invisible floor exit
- **THEN** it opens instantly with the elevator-door sound and the room cut happens only in
  the enter zone (X+8..X+24), not on first touch

#### Scenario: Returning from the elevator

- **WHEN** Snake exits the elevator room at the bottom floor
- **THEN** he enters room 3 through that same door, placed by the type-5 PlayerInDoorDat
  entry as with any door

### Requirement: Prison-wall doors open per ChkPrisonWalls

The prison-wall door types (12-15, lock 15) SHALL open per `ChkPrisonWalls`
(logic/doors/opendoor.asm:286): facing `PunchWallDirs[type-7]` (:380) while PUNCHING
(PlayerControlMod 1) inside the door's ChkTouchDoor open area decrements the wall's life
every qualifying frame — door ID 0x0C uses `PrisonWall2Life` (Grey Fox), everything else
`PrisonWall1Life`, both starting at 0x28 (Banks0123.asm:11798) — with SFX 0x0A per hit
(through SetSoundEntryChk: no restart while playing) and SFX 0x1E when the wall breaks
open. The walls draw as their `DrawWallPrison*` tile blocks and BLOCK MOVEMENT by their
drawn tiles' collision bits, not their footprint: Snake's cell wall's right column (tile
0x35) is walkable — he steps 8px into the drawn wall to punch (the only position whose
touch area passes). Punch doors (lock 10, `ChkPunchDoor` :143) open on ONE punch facing
them.

#### Scenario: Punching out of the cell

- **WHEN** Snake stands inside the cell wall's touch area facing left, punching
- **THEN** each punch thuds once; the 40th breaks the wall open to room 164

#### Scenario: The walls block like their tiles

- **WHEN** Snake pushes left into the closed cell wall
- **THEN** he stops 8px inside the drawn wall (the solid columns), not at its edge and
  not through it

### Requirement: Lock-16 walls yield only to plastic bombs

A lock-16 wall SHALL open when a PLASTIC BOMB explodes inside its open-area zone (`ChkBombLocation`), and punching it SHALL play the breakable-wall SFX and nothing more (`ChkPunchBaseWall`). The bomb walls are LOCK 16 (`ChkOpenDoor`'s dispatch: 14 = ChkBigBossDoor, 15 = ChkPrisonWalls, 16 = ChkBasementWall — the weapons slice had keyed the hook on 14). The one lock-16 wall in the game data: 166 ⇄ 167 (Ellen's cell); 114 ⇄ 116 turned out to be a CARD1 door.

#### Scenario: Bombing through to Ellen

- **WHEN** a plastic bomb explodes against room 166's east wall
- **THEN** the wall opens into Ellen's cell; any number of punches only thuds

