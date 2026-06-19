## ADDED Requirements

### Requirement: Export weapon and item name strings

The export step SHALL emit the weapon and item **name strings** (`idxWeaponName` → `data/weaponnames.asm`,
`idxItemName` → `data/itemnames.asm`; ASCII with `0` = space and `0xFF` = terminator) as a JSON mapping
each weapon ID and item ID to its name, so the equipment menus can label entries using the game font
(`font.png`) with no new glyph art.

#### Scenario: Names are available to the menus

- **WHEN** the export step runs against `data/weaponnames.asm` and `data/itemnames.asm`
- **THEN** it writes a JSON (e.g. `names.json`) under `web/assets` mapping weapon IDs and item IDs to
  their decoded names (e.g. weapon 1 → "HAND GUN"), renderable with the font
