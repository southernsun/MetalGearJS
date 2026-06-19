## ADDED Requirements

### Requirement: A guard patrols a waypoint path

The game SHALL place a guard in a room with a defined patrol path and move it from waypoint to
waypoint at a steady speed, facing its direction of travel with the correct walk animation,
pausing briefly at points (as the ROM's guard does).

#### Scenario: Guard walks its patrol

- **WHEN** the room with the guard is active and no alert is raised
- **THEN** the guard moves along its waypoints, looping, facing the direction it is moving with
  an animated walk

#### Scenario: Guard renders in the active room only

- **WHEN** the active room changes to one without a guard
- **THEN** no guard is drawn or updated; entering the guard's room again resumes its patrol

### Requirement: Line-of-sight detection faithful to the ROM

The guard SHALL detect Snake only when Snake is in front of the guard along its facing
direction, within a narrow perpendicular band, with no solid wall tile between them — matching
`chkdiscover.asm` (band ±8px for up/down facing, ±6px for left/right; player must be in front;
view blocked by collision tiles).

#### Scenario: Snake in the line of sight is detected

- **WHEN** Snake stands in front of the guard, within the perpendicular band, with a clear
  (no-wall) path along the facing axis
- **THEN** the guard detects Snake and the alert is triggered

#### Scenario: Behind the guard is safe

- **WHEN** Snake is behind the guard (opposite its facing) or outside the perpendicular band
- **THEN** the guard does not detect Snake

#### Scenario: Walls block sight

- **WHEN** a solid wall tile lies between the guard and Snake along the facing axis
- **THEN** the guard does not see Snake even if Snake is in front and within the band

### Requirement: Alert state with icon and music

When the guard detects Snake, the game SHALL enter an alert state: draw the "!" alert icon
above the guard and play the alert music. In alert, the guard SHALL stop patrolling and face
Snake (chasing/shooting is out of scope).

#### Scenario: Detection raises the alert

- **WHEN** the guard detects Snake
- **THEN** the "!" icon appears above the guard and the alert music plays (after audio is
  unlocked by a user gesture)
- **AND** the guard stops its patrol and faces Snake

#### Scenario: Alert is not retriggered every frame

- **WHEN** the guard is already in the alert state and still sees Snake
- **THEN** the alert music is not restarted from the top each frame

### Requirement: Punching stuns the guard, and three punches kill him

The game SHALL detect a connecting punch using the ROM's directional punch area
(`logic/punchenemy.asm` ChkArea / PunchEnemies): the guard must lie within a 12px radius
(strict `<` on both axes) of a point offset 12px from Snake in his facing direction. A
connecting punch SHALL freeze the guard for the ROM's stun duration (`StunnedCnt = 0x40`,
counted down at 60Hz); while frozen he SHALL neither patrol nor detect Snake, and SHALL
resume his previous behaviour when the timer reaches zero. A further punch SHALL be ignored
while the stun timer is still in its lockout window (`StunnedCnt >= 0x38`). The third
connecting punch SHALL kill the guard, removing him from the room (`ChkKillPunching`).

#### Scenario: A punch in range freezes the guard

- **WHEN** Snake punches with the guard inside his directional punch area
- **THEN** the guard freezes in place (no patrol, no detection) for the stun duration
- **AND** the punch sound plays

#### Scenario: Stopping lets the guard recover

- **WHEN** the guard has been punched once or twice and is not punched again
- **THEN** the stun timer counts down and the guard resumes patrolling

#### Scenario: Three punches kill the guard

- **WHEN** Snake lands a third connecting punch on the guard
- **THEN** the guard dies and disappears from the room

#### Scenario: A stunned guard cannot raise an alert

- **WHEN** the guard is frozen from a punch (or has been killed)
- **THEN** it does not trigger the alert, even if Snake is in front of it

### Requirement: Guard integrates with movement and collision

The guard SHALL coexist with the existing systems: Snake's movement, room collision, room
transitions, and door logic continue to work unchanged, and the guard updates on the same
fixed-timestep loop.

#### Scenario: Existing systems unaffected

- **WHEN** the guard is present in a room
- **THEN** Snake still moves, collides, traverses rooms, and opens doors exactly as before, and
  the guard updates in step with the game loop
