# browser-room-traversal Specification

## Purpose
TBD - created by archiving change browser-room-traversal. Update Purpose after archive.
## Requirements
### Requirement: Load and display a room by number

The game SHALL load any exported room by its number — fetching that room's background PNG
and collision JSON — and render it as the active room, starting from the manifest's starting
room.

#### Scenario: Starting room loads from the manifest

- **WHEN** the game starts
- **THEN** it reads `manifest.json`, loads the designated starting room's PNG and collision
  map, and displays that room

#### Scenario: Active room can change at runtime

- **WHEN** the game switches the active room to another exported room number
- **THEN** the displayed background and the collision map used for movement both become that
  room's

### Requirement: Cross an open connected edge to the neighbor room

The game SHALL perform a hard cut (no scrolling) to the connected room when Snake moves past
a room edge at a point that is not blocked by collision and the active room has a connection
in that direction.

#### Scenario: Walking off an open connected edge transitions

- **WHEN** Snake moves beyond the room boundary (x < 0, x ≥ 256, y < 0, or y ≥ 192) in a
  direction where the active room's connection is not null and the edge tile is passable
- **THEN** the game loads the connected room and makes it active
- **AND** the transition is a discrete screen change, not a scroll

#### Scenario: Unconnected or blocked edges stay solid

- **WHEN** Snake pushes against a room edge that has no connection in that direction (null),
  or against a solid edge tile
- **THEN** Snake does not leave the room and is stopped exactly as in the single-room game

### Requirement: Place Snake at the matching entry edge

After a transition, the game SHALL place Snake at the edge of the new room opposite to the
direction of travel, preserving his coordinate along the shared axis (mirrored across the
crossing axis), and preserve his facing.

#### Scenario: Exit right enters from the left

- **WHEN** Snake exits the active room through the right edge at vertical position `y`
- **THEN** in the new room he appears just inside the left edge at the same `y`, still facing
  right

#### Scenario: Exit up enters from the bottom

- **WHEN** Snake exits through the top edge at horizontal position `x`
- **THEN** in the new room he appears just inside the bottom edge at the same `x`, still
  facing up

#### Scenario: Snake spawns clear of the entry edge

- **WHEN** Snake is placed at an entry edge
- **THEN** his position is inside the room bounds (not off-screen), so the very next movement
  step does not immediately re-trigger a transition back

### Requirement: Collision remains faithful per room

After a transition, movement collision SHALL use the new room's own collision map with the
same shape-0 two-probe check used in the single-room game.

#### Scenario: New room's walls block correctly

- **WHEN** Snake moves within a room entered by transition
- **THEN** that room's solid tiles block him and its open tiles let him pass, using its own
  `collision.json`

### Requirement: Animation and state survive transitions

A room transition SHALL NOT corrupt Snake's state machine: his facing, and walk/idle/punch
state, SHALL carry across the cut, and the fixed-timestep loop SHALL continue uninterrupted.

#### Scenario: Continuous movement across a transition

- **WHEN** Snake is walking when he crosses into a new room
- **THEN** after the cut he continues in the same facing with the walk animation, with no
  stuck state or dropped input

