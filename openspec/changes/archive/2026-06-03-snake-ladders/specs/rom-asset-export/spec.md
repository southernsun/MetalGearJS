## ADDED Requirements

### Requirement: Export ladder sprites and the escape-ladder rooms

The Snake spritesheet export SHALL emit the ladder-climb frames (`SetSprLadder*`) composited in
Snake's colours into `snake.png`/`snake.json`. The export SHALL also produce the building-2
escape-ladder rooms **224, 225, and 226** (PNG + collision/tile data) added to the browser's room
set. Because the ROM does not link these rooms through the normal connection table (the ladder
code transitions between them by sequence), their vertical links (224↔225↔226) SHALL be wired so
the browser can perform the climb transitions.

#### Scenario: Climb frames in the atlas

- **WHEN** the Snake export runs
- **THEN** `snake.json` includes the ladder-climb frame(s) and `snake.png` contains their pixels

#### Scenario: Ladder rooms are available with vertical links

- **WHEN** the assets are exported and the game loads
- **THEN** rooms 224, 225, 226 are present (PNG + tile data), and the browser has the
  224↔225↔226 up/down links the ladder transitions need (reachable via the `?room=224` dev hook)
