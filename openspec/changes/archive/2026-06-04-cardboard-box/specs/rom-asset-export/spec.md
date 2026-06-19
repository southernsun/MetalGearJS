## ADDED Requirements

### Requirement: Export cardboard-box sprites

The Snake spritesheet export SHALL emit the cardboard-box frames (`SetSprBox`, sprites 42/44)
composited in Snake's colours into `snake.png`/`snake.json`, so the box appearance can be drawn.

#### Scenario: Box frames in the atlas

- **WHEN** the Snake export runs
- **THEN** `snake.json` includes the box idle/moving frame(s) and `snake.png` contains their pixels
