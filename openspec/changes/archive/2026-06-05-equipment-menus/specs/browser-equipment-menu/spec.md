## ADDED Requirements

### Requirement: Open and close the weapon and item menus, pausing play

The game SHALL provide two full-screen menus — a **weapon** screen (`GameMode 2`) and an
**item/equipment** screen (`GameMode 3`) — each opened and closed by a key binding (the ROM uses
F1/F2 to open and F3 to close; browsers reserve the function keys, so a documented key binding is used).
While either menu is open the game SHALL be **paused**: no actor/guard/door logic runs and Snake does
not move (faithful to the ROM holding play in GameMode 2/3). The screen SHALL use the menu palette
(`SetMenuWeaponPal`).

#### Scenario: Open a menu pauses the game

- **WHEN** the player presses the weapon-menu (or item-menu) key during play
- **THEN** that full-screen menu appears and the game is paused (guards, doors, Snake all hold)

#### Scenario: Close returns to play

- **WHEN** the player presses the close key while a menu is open
- **THEN** the menu closes and play resumes from where it paused

### Requirement: The menu lists the owned inventory at the ROM's layout

Each menu SHALL render on a black screen with a centred title drawn at the ROM's `PrintTextXY` coordinates
(`WEAPON  SELECT` and `OPTION` from `data/menuweapontexts.asm`; `EQUIPMENT  SELECT` from
`data/menuequipmenttexts.asm`) and SHALL display the **owned** (compacted) entries at the exact slot
coordinates of `DrawWeaponMenu` / `DrawEquipMenu` and the cursor tables (`data/weaponcursorxy.asm` /
`data/itemcursorxy.asm`): the weapon screen places weapons in two columns plus the suppressor slot, each
as its icon + name (`idxWeaponName`) + 3-digit ammo (`Render3Numbers`, with the hundreds digit blank when
zero; the suppressor shows no ammo), with the `OPTION` label always present; the item screen places items
in three columns (holding 9 / 9 / 7) each as its icon (`ItemGfxXY`) + name (`idxItemName`). Icons come
from the exported `hud-icons.png` (menu palette `SetMenuWeaponPal` / `PalMenuWeapon`); names use the game
font (`font.png`). The gameplay HUD (`RenderHUD`) SHALL remain on screen. The captured case
(`EquipRemoved`) SHALL show an empty screen.

#### Scenario: Owned weapons/items are shown with icon, name, and count

- **WHEN** the weapon (or item) menu is open
- **THEN** each owned weapon/item appears at its ROM slot position as its icon, its name, and (weapons) its
  3-digit ammo, with the title and (weapon screen) the `OPTION` label drawn, and the HUD kept on screen

#### Scenario: Nothing owned shows an empty list

- **WHEN** the player owns no items (or has been captured)
- **THEN** the item screen shows no entries rather than stale ones

### Requirement: A cursor selects an entry

The menu SHALL show a cursor on the current selection — the ROM arrow glyph (`DrawArrow`, char `0x3C`) at
the selected entry's slot — the
**direction controls SHALL move the cursor** over the owned entries (with the ROM's hold-repeat delay),
and **Fire SHALL confirm** the highlighted entry — setting `SelectedWeapon` (weapon menu) or
`SelectedItem` (item menu). The HUD selection readout SHALL reflect the new choice.

#### Scenario: Move the cursor and confirm

- **WHEN** the player moves the cursor to an owned entry and presses Fire
- **THEN** that entry becomes the current weapon/item and the HUD readout updates

#### Scenario: Cursor starts on the current selection

- **WHEN** a menu opens
- **THEN** the cursor is on the currently selected weapon/item
