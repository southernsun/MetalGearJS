## ADDED Requirements

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

When Snake walks into a closed door, the game SHALL open it: play the door sound effect once
and show a brief open transition, after which the door is open.

#### Scenario: Contact opens the door

- **WHEN** Snake moves against a closed door's footprint
- **THEN** the door plays `door.wav` once and becomes open (its appearance changes to open)
- **AND** the sound plays only after audio has been unlocked by a user gesture

#### Scenario: An already-open door does not replay the open

- **WHEN** Snake contacts a door that is already open
- **THEN** the open sound is not replayed and the door stays open

### Requirement: Enter an open door to its destination room

When Snake enters an open door, the game SHALL hard-cut to that door's destination room and
place Snake at the destination room's door with the same ID, using that door type's enter
offsets.

#### Scenario: Entering a door transitions to its destination

- **WHEN** Snake walks into an open door whose `dest` is an exported room
- **THEN** the game makes `dest` the active room (a discrete cut, no scroll)
- **AND** Snake is positioned at the destination room's door whose `id` matches the door he
  entered, offset by that door type's enter offsets, inside the room bounds

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
