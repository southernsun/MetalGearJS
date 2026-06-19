## ADDED Requirements

### Requirement: Snake sprite spritesheet and atlas

The export step SHALL produce a single PNG spritesheet containing Solid Snake's movement
and punch sprite frames, decoded from the disassembly with the game's true sprite colors,
together with a JSON atlas describing each frame.

The spritesheet SHALL include, at minimum, the four facing directions (down, left, up,
right) for: the standing/idle frame, the two walk frames, and the punch frame — sourced
from `gfx/sprites.asm` labels `SprSnake{Down,Left,Up,Right}`, `SprSnake{...}1`,
`SprSnake{...}2`, and `SprSnakePunch{D,L,U,R}` respectively.

The atlas SHALL, for each frame, give a stable key (e.g. `down-walk1`), the frame's pixel
rectangle in the sheet, and the frame's dimensions (16×16 per hardware sprite; 16×32 for a
composited Snake).

#### Scenario: Spritesheet and atlas are generated

- **WHEN** the export step runs against the repository's `gfx/sprites.asm` and
  `data/playersprite.asm`
- **THEN** it writes a PNG spritesheet and a JSON atlas to `web/assets/`
- **AND** the atlas contains an entry for every required direction/state combination
  (idle, walk1, walk2, punch × 4 directions)

#### Scenario: Frames use the game's true colors

- **WHEN** a Snake frame is decoded
- **THEN** it is composited using the original CC-bit sprite pairing and Snake's palette
  indices (e.g. colors 7 and 10) so the pixels match the in-game character, not a flat
  monochrome silhouette

### Requirement: Starting room background

The export step SHALL render one chosen starting room to a PNG at the game's native
256×192 resolution, reproducing the original tile/metatile/palette pipeline.

#### Scenario: Room background is rendered

- **WHEN** the export step runs for the chosen starting room number
- **THEN** it writes a 256×192 PNG of that room's background to `web/assets/`
- **AND** the image matches the room as the original renderer composites it (tiles,
  metatiles, and the room's palette)

### Requirement: Room collision map

The export step SHALL produce a per-tile collision map for the chosen starting room as
JSON, derived from the room's solid-tile bitmap (`CollTiles*`) applied to the room's
unpacked 32×24 tile grid.

#### Scenario: Collision map is generated

- **WHEN** the export step runs for the chosen starting room
- **THEN** it writes a JSON file describing a 32×24 grid where each cell is solid or
  passable
- **AND** a tile is marked solid exactly when its tile number's bit in the room's
  `CollisionTiles` bitmap is set, matching the ROM's collision data

### Requirement: Punch sound effect audio file

The export step SHALL render the punch sound effect to a WAV file that a browser can play
directly, produced by running the punch SFX byte stream through a reproduction of the
game's PSG/BGM driver.

#### Scenario: Punch SFX WAV is generated

- **WHEN** the export step runs against `sound/sfx/SfxPunch.asm`
- **THEN** it writes a WAV file of the punch sound effect to `web/assets/`
- **AND** the rendered audio reproduces the SFX as the game's sound driver would play it
  (same notes/envelope as the original byte stream)

### Requirement: Assets are self-contained and runtime-decode-free

All exported assets SHALL be written under `web/assets/` in formats the browser loads
natively (PNG, JSON, WAV), so the browser game performs no RLE decoding or PSG emulation
of its own.

#### Scenario: Browser loads only static assets

- **WHEN** the browser game starts
- **THEN** every asset it needs (spritesheet, atlas, room background, collision map, punch
  WAV) exists under `web/assets/` as a PNG, JSON, or WAV
- **AND** the game requires no disassembly file or ROM byte stream at runtime
