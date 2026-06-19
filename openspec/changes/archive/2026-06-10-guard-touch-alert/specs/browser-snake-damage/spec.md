# browser-snake-damage — delta (guard-touch-alert)

## MODIFIED Requirements

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
