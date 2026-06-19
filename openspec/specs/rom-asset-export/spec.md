# rom-asset-export Specification

## Purpose
TBD - created by archiving change browser-snake-movement-punch. Update Purpose after archive.
## Requirements
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

### Requirement: Per-tile tile-type data in room export

The room export SHALL emit, in addition to the solid-collision bitmap, a **per-tile tile-number
grid** addressable per tile like the existing collision grid, sufficient for the browser to
classify gameplay tiles — at minimum ladder tiles (`0x08`) and shallow/deep water tiles
(`0x73–0x74` / `0x75–0x76`, with shadow `0x6F–0x72` and brick-in-water `0x6D`).

#### Scenario: Room data exposes tile types

- **WHEN** a room is exported
- **THEN** its data includes a per-tile tile-number grid, so the browser can determine for any
  tile whether it is a ladder, shallow-water, or deep-water tile — not just solid/open

#### Scenario: Existing collision data is unchanged

- **WHEN** the export runs
- **THEN** the existing `solid[]` bitmap (and all other current outputs) are produced as before,
  with the tile-type grid added alongside

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

### Requirement: Export cardboard-box sprites

The Snake spritesheet export SHALL emit the cardboard-box frames (`SetSprBox`, sprites 42/44)
composited in Snake's colours into `snake.png`/`snake.json`, so the box appearance can be drawn.

#### Scenario: Box frames in the atlas

- **WHEN** the Snake export runs
- **THEN** `snake.json` includes the box idle/moving frame(s) and `snake.png` contains their pixels

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

### Requirement: Export weapon and item HUD icons

The export step SHALL produce the weapon and item HUD icon graphics decoded from the ROM equipment
graphics, keyed by `WeaponGfxXY` / `ItemGfxXY` (the icon coordinates `DrawWeaponHUD` / `DrawItemHUD`
copy from), as a PNG (or PNGs) plus a JSON atlas mapping each weapon ID and item ID to its icon
rectangle. Icons SHALL be 16×16, with the "big" weapons (per the `WeaponGfxXY` size flag) emitted as
32×16. At minimum the handgun weapon icon and the selectable item icons (e.g. cardboard box, oxygen
tank) SHALL be present so the HUD can draw what the player has.

#### Scenario: HUD icons are generated

- **WHEN** the export step runs against the ROM equipment graphics and `WeaponGfxXY`/`ItemGfxXY`
- **THEN** it writes the weapon/item icon PNG(s) + atlas to `web/assets/`, with an entry for each
  required weapon and item, at the correct icon size (16×16, or 32×16 for big weapons)

### Requirement: Export Snake's red damage-flash colours

The Snake spritesheet export SHALL provide Snake's frames in the **damage** colour set (`SnakeAttrDamage`,
`data/playersprite.asm` — colour `08h`/`47h`, i.e. red), so the browser can render the post-hit red
flash faithfully (the ROM swaps the sprite colour table to `SnakeAttrDamage`; the browser bakes the
equivalent red-coloured frames or applies the same palette swap). The damage colouring SHALL cover the
walk/idle/armed frames that can be on screen while the i-frame window is open.

#### Scenario: Red-flash frames are available

- **WHEN** the Snake export runs
- **THEN** the browser has access to Snake's frames in the `SnakeAttrDamage` red colour set (a baked
  red variant or an equivalent palette swap), matching the ROM's damage colour

### Requirement: Export the game font

The export step SHALL produce the game font as a glyph atlas (PNG + JSON) decoded from `gfxFont`
(`gfx/font.asm`), so the browser can render HUD text in the original font. The font is 1bpp 8×8 glyphs
loaded white (`LoadFont`, `logic/loadfont.asm`); the atlas SHALL cover at least the digits and the
A–Z letters, and the JSON SHALL give the cell size and the first character code so the browser can
index a glyph by `charCode − first` (faithful to `DrawChar`, where glyph `i` is character `0x30 + i`).

#### Scenario: Font atlas is generated

- **WHEN** the export step runs against `gfx/font.asm`
- **THEN** it writes `font.png` (white 8×8 glyphs) + `font.json` (cell size + first char code) to
  `web/assets/`, with the digits and letters needed for the HUD labels and numbers

### Requirement: Export door lock type

The door export SHALL emit, for each usable door, its **lock type** (DoorsList byte `+2` `LogicOpen`, low
5 bits — the value `ChkOpenDoor` dispatches on: plain, keycard `ChkCard1..8`, elevator, etc.) alongside
the existing render type, so the browser can apply the correct open rule. Elevator and card doors SHALL
no longer be filtered out of the export when they are part of an exported room.

#### Scenario: Doors carry their lock

- **WHEN** a room with a keycard door is exported
- **THEN** each door entry in `doors.json` includes its lock type (e.g. card N) in addition to its
  render type and destination

### Requirement: Export weapon and item name strings

The export step SHALL emit the weapon and item **name strings** (`idxWeaponName` → `data/weaponnames.asm`,
`idxItemName` → `data/itemnames.asm`; ASCII with `0` = space and `0xFF` = terminator) as a JSON mapping
each weapon ID and item ID to its name, so the equipment menus can label entries using the game font
(`font.png`) with no new glyph art.

#### Scenario: Names are available to the menus

- **WHEN** the export step runs against `data/weaponnames.asm` and `data/itemnames.asm`
- **THEN** it writes a JSON (e.g. `names.json`) under `web/assets` mapping weapon IDs and item IDs to
  their decoded names (e.g. weapon 1 → "HAND GUN"), renderable with the font

