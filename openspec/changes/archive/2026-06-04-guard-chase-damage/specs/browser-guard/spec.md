## MODIFIED Requirements

### Requirement: Alert state with icon and music

When the guard detects Snake, the game SHALL enter an alert state: briefly flash the "!" alert
icon above the guard (a momentary discovery cue, as in the ROM — not a persistent badge) and
play the alert music. In alert, the guard SHALL **actively pursue Snake** — chasing him and
firing at him (see the chase and bullet requirements) — rather than holding position. The alert
remains latched for the slice (cleared only on KO/kill or room change); there is no calm-down /
search / return-to-patrol.

#### Scenario: Detection raises the alert

- **WHEN** the guard detects Snake
- **THEN** the "!" icon flashes above the guard briefly and the alert music plays (after audio
  is unlocked by a user gesture)
- **AND** the guard begins pursuing Snake (it no longer stands still)

#### Scenario: The alert icon is a brief flash, not a permanent badge

- **WHEN** the discovery flash has elapsed while the guard is still alerted and chasing
- **THEN** the "!" icon is no longer drawn (matching the original game), even though the guard
  remains in the alert/chase state

#### Scenario: Alert is not retriggered every frame

- **WHEN** the guard is already in the alert state and still sees Snake
- **THEN** the alert music is not restarted from the top each frame

#### Scenario: Alert ends on KO or room change

- **WHEN** the alerted guard is stunned/killed by a punch, or the active room changes
- **THEN** the alert music stops and the icon is no longer drawn

## ADDED Requirements

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
