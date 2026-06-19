## ADDED Requirements

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
