## ADDED Requirements

### Requirement: Render the starting room at native resolution

The game SHALL render the exported starting-room background on an HTML canvas at the
game's native 256×192 resolution, scaled up by an integer factor with nearest-neighbor
filtering so the pixel art stays crisp.

#### Scenario: Room is displayed on load

- **WHEN** the page loads and assets finish loading
- **THEN** the canvas shows the starting room background scaled up from 256×192 with no
  blurring

### Requirement: Four-direction movement with keyboard input

The game SHALL move Solid Snake in four directions (up, down, left, right) in response to
keyboard input (arrow keys and/or WASD). Snake SHALL face the direction of travel.

#### Scenario: Snake moves in the pressed direction

- **WHEN** the player holds a direction key and the path is not blocked
- **THEN** Snake's position advances in that direction each frame
- **AND** Snake's sprite faces that direction

#### Scenario: Diagonal input resolves to a single facing

- **WHEN** two direction keys are held at once
- **THEN** the game picks one facing deterministically (does not render an undefined
  diagonal frame)

### Requirement: Walk and idle animation

The game SHALL animate Snake while moving by cycling the two walk frames for the current
facing at a steady cadence, and SHALL show the standing/idle frame for the current facing
when Snake is not moving.

#### Scenario: Walk cycle plays while moving

- **WHEN** Snake is moving
- **THEN** the canvas alternates the two walk frames for the current direction over time

#### Scenario: Idle frame when stopped

- **WHEN** no direction key is held
- **THEN** Snake stops and the idle frame for the last-faced direction is shown

### Requirement: Tile collision blocks solid scenery

The game SHALL prevent Snake from moving into solid tiles using the exported collision
map, reproducing the original's check of two probe points per direction offset from
Snake's position (per `ChkTileCollision` / `BoxColliderDat`).

#### Scenario: Walls block movement

- **WHEN** the player pushes Snake toward a tile marked solid in the collision map
- **THEN** Snake does not enter the solid tile and stops at its edge

#### Scenario: Open paths allow movement

- **WHEN** the player pushes Snake toward passable tiles
- **THEN** Snake moves freely through them

#### Scenario: Snake stays within the room bounds

- **WHEN** Snake reaches the edge of the 256×192 room
- **THEN** Snake does not leave the visible room area

### Requirement: Fixed-timestep game loop

The game SHALL run an animation loop that updates input, movement, and animation on a
consistent cadence independent of display refresh rate, so movement speed and animation
timing are stable.

#### Scenario: Consistent speed across machines

- **WHEN** the game runs on displays with different refresh rates
- **THEN** Snake's movement speed and walk-cycle timing remain consistent
