## ADDED Requirements

### Requirement: Snake has life that depletes when damaged

The game SHALL track Snake's life as a numeric value with a maximum, initialized to the ROM's
starting life of 24 (`InitPlayerVars`; `MaxLife` also 24 in this slice — rank-based scaling is
out of scope). Taking damage SHALL decrement life by the damage amount, clamped at zero
(`logic/hud.asm` `DecrementLife_B`, which never goes negative).

#### Scenario: Life starts full

- **WHEN** a new run begins (game start or after a game-over restart)
- **THEN** Snake's life equals the maximum (24) and the guard's patrol is reset

#### Scenario: Damage reduces life

- **WHEN** Snake takes N points of damage and is not invulnerable
- **THEN** life decreases by N, never dropping below zero

### Requirement: Damage from guard bullets and contact, with an invulnerability window

A guard **bullet** striking Snake SHALL deal 2 damage and the bullet SHALL be consumed; direct
**contact** with the guard's body SHALL likewise deal 2 damage (`data/shapes.asm`
`ActorTouchDamage` = 2 for the guard and `ID_GUARD_BULLET`). After any enemy hit, Snake SHALL
become invulnerable for 32 frames (`logic/touchenemy.asm` `DamageDelayTimer = 0x20`), during
which further enemy damage (bullets or contact) is ignored. (The armor item's damage halving is
out of scope.)

#### Scenario: A bullet hit costs 2 life

- **WHEN** a guard bullet overlaps Snake while he is not invulnerable
- **THEN** Snake loses 2 life, the bullet is removed, and Snake becomes invulnerable for 32
  frames

#### Scenario: Touching a guard costs 2 life

- **WHEN** Snake's body overlaps the alerted guard while he is not invulnerable
- **THEN** Snake loses 2 life and becomes invulnerable for 32 frames

#### Scenario: Invulnerability blocks rapid repeat damage

- **WHEN** Snake is hit again (by a bullet or contact) while still inside the 32-frame window
- **THEN** no additional life is lost for that hit

### Requirement: Game over and restart when life reaches zero

When Snake's life reaches zero the game SHALL enter a dead state faithful to `SetDead`: player
control is locked, a death beat plays, and a death timer counts down (`DeadTimer = 0x80`,
~128 frames). Active guard bullets SHALL be cleared on death. When the timer expires the slice
SHALL restart — Snake respawns in the start room at full life and the guard's patrol is rebuilt.
(The ROM's checkpoint/continue restore is out of scope; the slice restarts from the start room.)

#### Scenario: Zero life triggers death

- **WHEN** a hit brings Snake's life to zero
- **THEN** the game enters the dead state: player input no longer moves Snake, any active
  bullets are cleared, and the death timer begins counting down

#### Scenario: Restart after the death timer

- **WHEN** the death timer reaches zero
- **THEN** the slice restarts: Snake is back in the start room at full life, the guard patrols
  again, and the alert is cleared

#### Scenario: Death plays Snake's death animation

- **WHEN** Snake is in the dead state
- **THEN** Snake's death animation plays (leaned-back, then spin, then the dead pose, per
  `SetSprDead`) for the duration of the death timer

### Requirement: A minimal on-screen life indicator

Because there is no full HUD yet, the game SHALL draw a simplified life bar showing Snake's
current life as a fraction of maximum, so damage is legible. Snake SHALL also flicker briefly
during his post-hit invulnerability window. (The full HUD — rank, weapon, status — is a later
change; the ROM has no invulnerability blink, so the flicker is an added legibility aid.)

#### Scenario: Life bar reflects current life

- **WHEN** Snake's life changes (takes damage, or is restored on restart)
- **THEN** the on-screen life bar's filled width changes to match life / max life

#### Scenario: Snake flickers while invulnerable

- **WHEN** Snake is within his post-hit invulnerability window
- **THEN** Snake's sprite flickers, indicating the hit and the brief invulnerability
