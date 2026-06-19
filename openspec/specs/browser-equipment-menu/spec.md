# browser-equipment-menu Specification

## Purpose
TBD - created by syncing change equipment-menus. Update Purpose after archive.
## Requirements
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
the selected entry's slot. The **direction controls SHALL move the cursor over the ROM's fixed grid**
(`SelectIdx`: weapons 1-7 in two columns of 4+3, `CtrlMenuWeapon` Banks0123.asm:11387; items 1-25 in three
columns of 9+9+7, `MenuEquipLogic` logic/menuequipment.asm:51) with the ROM's **edge clamps** (no
wrapping: up/down stop at column ends; left/right jump a column and are blocked where the ROM blocks
them, including item slots 17-18 → 3rd column). A held direction SHALL repeat with the ROM's
`ControlHoldWait` delay (move on press, then every 8 ticks while held). The suppressor's drawn slot and
the `OPTION` label SHALL NOT be cursor-navigable (the ROM cursor cannot reach them).

**Every cursor move SHALL immediately select the entry under the cursor** (`MenuWeaponMove` →
`SelectWeapon` sets `SelectedWeapon` and `WeaponInUse`; `MenuEquipMove` → `SetSelectedItem` sets
`SelectedItem`) and play the cursor-move SFX (0x20). Moving onto an empty grid slot SHALL select ID 0
(weapon holstered / no item), as the ROM does when reading a zeroed inventory record. There SHALL be no
confirm press: closing the menu keeps the highlighted entry, and Fire in the **weapon** menu does
nothing. The HUD selection readout SHALL reflect each move live.

#### Scenario: Moving the cursor selects immediately

- **WHEN** the player moves the cursor onto an owned entry
- **THEN** that entry becomes the current weapon/item at that moment (HUD readout updates), the
  cursor-move SFX plays, and closing the menu keeps that selection without any confirm press

#### Scenario: Edge clamps, no wrap

- **WHEN** the player presses up on the first slot of a column (or down on the last, or a blocked
  left/right)
- **THEN** the cursor does not move and nothing is re-selected

#### Scenario: Held direction repeats at the ROM delay

- **WHEN** the player holds a direction in a menu
- **THEN** the cursor moves once on the press and then repeatedly with the 8-tick `ControlHoldWait`
  delay between moves

#### Scenario: Empty slot deselects

- **WHEN** the player moves the cursor onto a grid slot past the owned entries
- **THEN** the selection becomes 0 (holstered / no item) and the HUD readout shows none

#### Scenario: Cursor starts on the current selection

- **WHEN** a menu opens
- **THEN** the cursor is on the currently selected weapon/item (slot 1 if none)

### Requirement: Fire in the equipment menu uses the selected item

Pressing Fire in the **equipment** menu SHALL run the ROM's `ChkUseItem` chain
(logic/menuequipment.asm:208): with no item selected, nothing happens; a selected **ration** is
consumed (count −1, removed from the inventory at 0) and refills life to `MaxLife` — **except in deep
water** (`PlayerAnimation == 4`), where the ration branch is skipped; the transmitter / antidote /
cigarettes branches SHALL be ported with their ROM guards (antidote is NOT consumed; cigarettes require
the destruction timer) as no-ops until their systems exist. Any matched branch SHALL play the use-item
SFX (0x21); unmatched items (cards, binoculars, …) SHALL do nothing silently.

#### Scenario: Ration heals to full and is consumed

- **WHEN** the player has rations selected, is below max life and not in deep water, and presses Fire in
  the equipment menu
- **THEN** the ration count decreases by one, life becomes `MaxLife` (HUD life bar updates), and the
  use-item SFX plays

#### Scenario: Last ration disappears from the inventory

- **WHEN** the player uses a ration with exactly one left
- **THEN** the ration leaves the inventory (its menu slot empties)

#### Scenario: No ration use in deep water

- **WHEN** the player is swimming in deep water and presses Fire with rations selected
- **THEN** no ration is consumed and life does not change

#### Scenario: Non-usable item does nothing

- **WHEN** the player presses Fire with a card (or nothing) selected
- **THEN** nothing is consumed, no SFX plays, and the menu stays open
