# browser-title delta — starting enters the intro

## MODIFIED Requirements

### Requirement: Start gating follows ChkAnykeyStart

While the Konami logo or the swoop is playing, ANY control SHALL skip to the finished title — the logo parked instantly with SFX 0x4A ("Menu logo stops") and the texts shown (`GoToMenu`/`DrawMenuNow`). On the finished title, only Fire 1 / Fire 2 (Space or M — `ChkAnykeyStart` bits 0x30, Banks0123.asm:10632) SHALL start the game — entering the INTRO scene in room 121 (browser-intro-scene), not play directly; other keys do nothing. The attract demo the ROM would run after idling is NOT ported (no demo-input system) — the title idles instead, a documented divergence.

#### Scenario: Skipping the logo

- **WHEN** a key is pressed during the Konami reveal
- **THEN** the finished title appears at once (logo parked, texts, the stop SFX)

#### Scenario: Starting

- **WHEN** Space (or M) is pressed on the finished title
- **THEN** the intro scene begins in room 121 (the scripted swim)

#### Scenario: Non-fire keys on the title

- **WHEN** an arrow key is pressed on the finished title
- **THEN** nothing happens
