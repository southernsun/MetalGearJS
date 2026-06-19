## ADDED Requirements

### Requirement: Export water sprites and a water room

The Snake spritesheet export SHALL emit the shallow-water wading frames (`SetSprWater*`) and the
deep-water swimming frames (`SetSprDeepWater`) composited in Snake's colours into
`snake.png`/`snake.json`, and the export SHALL produce at least one **water room** from the ROM
(with its connection) added to the browser's room set so water is reachable.

#### Scenario: Water frames in the atlas

- **WHEN** the Snake export runs
- **THEN** `snake.json` includes the shallow-water and deep-water frames and `snake.png` contains
  their pixels

#### Scenario: A water room is playable

- **WHEN** the assets are exported and the game loads
- **THEN** at least one room from `RoomsWater` is present and enterable (via the `?room=<n>` dev
  hook, as the water rooms aren't in the start cluster — documented divergence), and walking onto
  its water tiles activates wading/swimming
