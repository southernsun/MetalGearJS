# browser-snake-damage Specification

## Purpose
TBD - created by archiving change guard-chase-damage. Update Purpose after archive.
## Requirements
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
**contact** with the body of ANY non-stunned guard — patrolling, alerted, or sleeping — SHALL
likewise deal 2 damage (`data/shapes.asm` `ActorTouchDamage` = 2 for the guard and
`ID_GUARD_BULLET`; `logic/touchenemy.asm` `ChkTouchEnemy`/`TouchPlayer` has no alert-state
gate, and skips only **stunned** enemies). Contact SHALL use the ROM touch shape
(`ActorsShapeTouch` shape 8 → `|guardY − snakeY| < 8` AND `|guardX − snakeX| < 12`, strict).
After any enemy hit, Snake SHALL become invulnerable for 32 frames (`logic/touchenemy.asm`
`DamageDelayTimer = 0x20`), during which further enemy damage (bullets or contact) is ignored.
(The armor item's damage halving is out of scope.)

#### Scenario: A bullet hit costs 2 life

- **WHEN** a guard bullet overlaps Snake while he is not invulnerable
- **THEN** Snake loses 2 life, the bullet is removed, and Snake becomes invulnerable for 32
  frames

#### Scenario: Touching any guard costs 2 life

- **WHEN** Snake's body overlaps a patrolling, alerted, or sleeping guard (not a stunned one)
  while he is not invulnerable
- **THEN** Snake loses 2 life and becomes invulnerable for 32 frames

#### Scenario: A stunned guard deals no contact damage

- **WHEN** Snake overlaps a guard who is frozen by a punch stun
- **THEN** Snake takes no damage

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

The game SHALL show Snake's life via the HUD's LIFE bar (now provided by `browser-player-hud`,
faithful to `DrawLife`), so damage is legible. During his post-hit invulnerability window Snake SHALL
**flash red** — faithful to the `SetSnakeSprCol` damage path (`Banks0123.asm:5489`): while the
damage-delay/i-frame timer is non-zero, his sprite colours swap to `SnakeAttrDamage` (red, colour
`08h`) on alternating frames (`TickCounter` bit 0 — one frame red, one frame normal), reverting to
normal colours when the timer reaches zero. This replaces the earlier placeholder blink (which hid the
sprite and was an added legibility aid, not ROM behaviour). The red flash SHALL apply to all damage
that opens the i-frame window (guard contact, guard bullets, and the deep-water drain).

#### Scenario: Life bar reflects current life

- **WHEN** Snake's life changes (takes damage, or is restored on restart)
- **THEN** the HUD LIFE bar's filled width changes to match life against the bar's full scale

#### Scenario: Snake flashes red while invulnerable

- **WHEN** Snake is within his post-hit invulnerability window
- **THEN** Snake's sprite alternates between its red damage colours and its normal colours each frame

#### Scenario: Red flash covers every damage source

- **WHEN** the i-frame window is opened by a guard hit, a bullet, or the deep-water drain
- **THEN** Snake flashes red for the duration of that window

#### Scenario: Normal colours when not damaged

- **WHEN** the damage-delay/i-frame timer is zero
- **THEN** Snake is drawn in his normal colours (no red)

