# browser-guard Specification

## Purpose
TBD - created by syncing change browser-guard. Update Purpose after archive.
## Requirements
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
view blocked by collision tiles). Detection SHALL additionally honour `ChkSeePlayer`'s
visibility gates: Snake in **deep water** (the water-shadow animation) SHALL never be seen;
Snake under the **cardboard box** SHALL be seen only while the box is moving — a stationary
box hides him (the ROM's "is the cardboard box moving" check; the movement gate applies only
to the box). Being **touched** discovers Snake regardless of facing (see the touch-alert
requirement).

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

#### Scenario: Deep water hides Snake

- **WHEN** Snake is in the deep-water animation inside the guard's line of sight
- **THEN** the guard does not detect him

#### Scenario: A stationary box hides Snake; a moving one does not

- **WHEN** Snake sits still under the cardboard box in the guard's line of sight
- **THEN** the guard does not detect him — but if he moves while boxed, the guard does

### Requirement: Alert state with icon and music

When the guard detects Snake, the game SHALL raise the **global alarm** (see `browser-guard-alarm`):
briefly flash the "!" alert icon above the guard (a momentary discovery cue, as in the ROM — not a
persistent badge) and play the alert music. In alert, the guard SHALL **actively pursue Snake** —
chasing him and firing at him (see the chase and bullet requirements) — rather than holding position.
The alert SHALL be the game-wide alarm rather than a per-guard latch: it persists across room changes
(a guard in a room entered during the alarm starts alerted), and it SHALL end via the alarm lifecycle
(`ChkAlarmEnd`/`StopAlert`) — when the alert room is cleared/left — returning the guard to its patrol,
rather than remaining latched for the whole slice. A punch KO/kill still drops *that* guard out of the
chase, but the alarm itself ends only through the alarm lifecycle.

#### Scenario: Detection raises the alarm

- **WHEN** the guard detects Snake
- **THEN** the "!" icon flashes above the guard briefly and the alert music plays (after audio
  is unlocked by a user gesture)
- **AND** the guard begins pursuing Snake (it no longer stands still), and the global alarm is raised

#### Scenario: The alert icon is a brief flash, not a permanent badge

- **WHEN** the discovery flash has elapsed while the guard is still alerted and chasing
- **THEN** the "!" icon is no longer drawn (matching the original game), even though the guard
  remains in the alert/chase state

#### Scenario: Alert is not retriggered every frame

- **WHEN** the guard is already in the alert state and still sees Snake
- **THEN** the alert music is not restarted from the top each frame

#### Scenario: Alert persists across rooms and ends via the alarm lifecycle

- **WHEN** the player changes rooms while alerted, or the alert room is later cleared
- **THEN** the alarm stays up across the room change, and ends only when the alarm lifecycle clears it
  (alert room cleared/left) — at which point the music stops, the icon is gone, and guards patrol again

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

### Requirement: An alerted guard chases Snake

While alerted (and not frozen by a punch), the guard SHALL pursue Snake using the ROM's
`GuardAlertLogic` state machine (`guardalert.asm`), not per-frame homing: it picks a direction
toward Snake (`GetDirToPlayer`) and **commits to it for a number of frames** before re-aiming,
moving at the fast alert speed (`DirectionSpeeds2`) and animating the walk. On re-aim it
sometimes **stops to shoot** (see the bullet requirement) rather than firing on the move. When
the direct path is blocked it SHALL **route around the obstacle** (`GuardAvoidObstacle`):
remember the blocked goal direction, detour along the perpendicular axis, and resume toward
Snake only once that goal direction reopens (so it follows the wall instead of jittering). Chase
movement SHALL respect the room collision map.

#### Scenario: Guard pursues Snake in committed segments

- **WHEN** the guard is alerted in open space
- **THEN** it walks toward Snake in a held direction for several frames, then re-aims — rather
  than re-computing its heading every single frame

#### Scenario: Guard stops to shoot

- **WHEN** the guard re-aims and decides to fire
- **THEN** it halts in place, fires a bullet, holds briefly facing Snake, then resumes the chase

#### Scenario: Chase routes around an obstacle

- **WHEN** a wall lies between the guard and Snake on its path
- **THEN** the guard does not pass through it and does not stall — it detours along the
  perpendicular axis and resumes toward Snake once the blocked direction reopens

#### Scenario: A frozen guard does not chase

- **WHEN** the alerted guard is currently stunned from a punch
- **THEN** it does not advance toward Snake until the stun timer reaches zero

### Requirement: An alerted guard fires bullets

While alerted (and not frozen), the guard SHALL fire bullets at Snake as part of its pursuit
rhythm: on a re-aim it has a chance to stop and shoot (`GuardShot`), spawning a bullet aimed
toward Snake (`ID_GUARD_BULLET`, `guardshot.asm` `InitGuardShot` → `CalcShot2` computes a
velocity toward the player) from its torso. A bullet SHALL be a simple moving entity that
travels in a straight line at the ROM bullet speed, and SHALL be removed when it strikes a solid
wall tile or leaves the room. (Bullet damage to Snake is defined by the
`browser-snake-damage` capability.)

#### Scenario: Guard shoots while chasing

- **WHEN** the guard has been alerted for long enough to fire
- **THEN** a bullet spawns at the guard and travels in the guard's facing direction

#### Scenario: Bullets stop at walls and edges

- **WHEN** a bullet reaches a solid wall tile or the edge of the room
- **THEN** the bullet is removed and no longer drawn or updated

#### Scenario: No fire while frozen or gone

- **WHEN** the guard is stunned by a punch, killed, or the room has no guard
- **THEN** no new bullets are fired

### Requirement: The guard has life points and dies to gunfire

The guard SHALL carry the ROM's life points (`idxActorLife`, data/actorspriteattr.asm:
LIFE = 2 for the patrol/alert guard; `TransformAlertGuard` does not reset it). Bullet damage
SHALL decrement life with a clamp at zero (`DecEnemyLife`). When life reaches zero the guard
SHALL be killed on its next logic tick (`RunEnemyLogic` → `KillActor`) — which, as in the ROM
(`EnemiesLogic` skips the logic while `StunnedCnt > 0`), SHALL be deferred while the guard is
stunned: a guard shot mid-stun dies when the stun expires. Death SHALL remove the guard from
the room; it SHALL NOT remove in-flight guard bullets (they are independent actors in the ROM
and keep flying), and the alarm SHALL continue to end only via the alarm lifecycle (the alert
room being cleared counts, exactly as for a punch kill).

#### Scenario: One handgun bullet kills a guard

- **WHEN** a player handgun shot (damage 2) hits a guard with the ROM's spawn life of 2
- **THEN** the guard's life reaches 0 and he is removed from the room on his next logic tick

#### Scenario: A stunned guard's death is deferred

- **WHEN** a guard is shot to 0 life while frozen by a punch stun
- **THEN** he remains (frozen) until the stun timer expires, and is killed at that point

#### Scenario: Death does not erase in-flight bullets

- **WHEN** a guard dies (by gunfire or the third punch) while his bullets are mid-flight
- **THEN** those bullets keep travelling and remain dangerous until they hit a wall, leave the
  room, or strike Snake

#### Scenario: Shooting the alert-room guard ends the alarm

- **WHEN** the alarm was raised in this room and the guard is killed by gunfire
- **THEN** the alarm ends via the existing lifecycle (alert room cleared), as with a punch kill

### Requirement: Touching a guard alerts him

The game SHALL detect Snake touching the guard each frame using the ROM touch shape
(`ActorsShapeTouch[ID_GUARD−1] = 8` → `ImpactAreasInfo` row 8, via `ChkArea`): a touch occurs
iff `|guardY − snakeY| < 8` AND `|guardX − snakeX| < 12` (strict comparisons). A touch SHALL
set the guard's touched flag (`TOUCH_INFO` bit 7). An awake guard whose touched flag is set
SHALL raise the global alarm (`ChkSeePlayer2` → `GuardSetAlarm`); a sleeping guard SHALL wake
and raise the alarm from the same flag (`ListenShotsChkTouch`). A **stunned** guard SHALL
register no touch at all (`ChkTouchEnemy` skips stunned enemies): no flag, no damage, no
alarm.

#### Scenario: Walking into a patrolling guard raises the alarm

- **WHEN** Snake's position enters the guard's touch box while the guard patrols
- **THEN** the global alarm is raised and the guard enters the chase

#### Scenario: Touch box uses the ROM shape

- **WHEN** Snake stands exactly 12px to the side, or exactly 8px above/below, the guard
- **THEN** no touch registers (strict `<`); at 11px / 7px it does

#### Scenario: A stunned guard cannot be touched

- **WHEN** Snake overlaps a guard who is frozen by a punch stun
- **THEN** no touch flag is set, Snake takes no contact damage, and no alarm is raised

### Requirement: Rooms spawn their ROM guards

A room without a DEMO guard entry SHALL spawn its FIRST guard from the ROM's room actor
list (data/actorsinrooms.asm via actors.json) at the listed position, with his real patrol
path (`idxRoomPaths` point list) and speed class (ID_GUARD_FAST at Snake's speed,
ID_GUARD_SLOW at half — DirectionSpeeds). Additional guards in the list stay out until the
multi-actor system lands (the documented single-guard limit).

#### Scenario: A real patrol

- **WHEN** Snake enters room 26 on the second floor
- **THEN** its guard patrols the ROM's path (the row Y 112 between X 56 and 200)

### Requirement: Rooms spawn ALL their guards

A room SHALL spawn EVERY guard in its ROM actor list (the EnemyList holds them all), each
with his own position, patrol path and speed class, each running the full per-guard logic
independently (patrol, sleep, LOS discovery, the alert AI, touch damage, punches, drops).
The alarm SHALL pull every guard into the chase, and the alert room SHALL count as cleared
only when ALL of its guards are down (`ChkAlarmEnd`'s enemy scan). The shared bullet pool
(6) spans all shooters.

#### Scenario: The room-18 gauntlet

- **WHEN** Snake walks into room 18 (five guards)
- **THEN** all five patrol their own paths, and an alarm sends all five after him

#### Scenario: Clearing an alerted room

- **WHEN** the alarm is up in a two-guard room and Snake downs only one
- **THEN** the alarm stays up until the second falls

