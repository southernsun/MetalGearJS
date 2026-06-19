## MODIFIED Requirements

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
