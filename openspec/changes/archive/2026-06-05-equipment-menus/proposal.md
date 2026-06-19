## Why

Selection today is invisible plumbing — weapons via number keys, items via an `I` cycle — with no way
to *see* what you hold. The ROM has two full-screen menus for this: the **weapon screen** (`GameMode 2`,
`DrawWeaponMenu`) and the **equipment/item screen** (`GameMode 3`, `DrawEquipMenu`, `logic/menuequipment.asm`),
opened with the function keys, that list everything you carry (icon + name + ammo/count) and let you pick
with a cursor. We already export the weapon/item icons (`hud-icons.png`) and the game font (`font.png`),
so this is mostly the menu layout + navigation — and it makes the inventory legible and the keycards /
oxygen / box selectable the way the original plays.

## What Changes

- **Weapon screen** — port `DrawWeaponMenu`: a full-screen grid of the **owned weapons**, each drawn as
  its icon + name (`idxWeaponName`, `data/weaponnames.asm`) + 3-digit ammo (`Render3Numbers`; the
  suppressor shows no ammo), with a cursor on the current selection. Confirming sets `SelectedWeapon`.
- **Item/equipment screen** — port `DrawEquipMenu` (`Banks0123.asm`): a grid of the **owned items** (the
  `Equipment` inventory: +0 ID, +1 tens/units, +2 hundreds; up to 25 slots laid out in **3 columns**),
  each as its icon (`ItemGfxXY`) + name (`idxItemName`, `data/itemnames.asm`) + amount (cards show the
  card number). A cursor marks the current item; confirming sets `SelectedItem`. The captured case
  (`EquipRemoved`) shows an empty screen.
- **Open / close / navigate** — port the menu control flow (`ReadFKeys` `logic/controls.asm`;
  `MenuEquip`/`MenuEquipLogic` `logic/menuequipment.asm`): a key opens each screen, the **direction
  controls move the cursor** (with the ROM's repeat delay) over the owned entries, **Fire confirms** the
  selection, and a key closes it. While a menu is open the game is **paused** — no actor logic runs —
  faithful to the ROM holding play in GameMode 2/3. The menu uses the menu palette (`SetMenuWeaponPal`).
- **Names rendered with the game font** — the weapon/item name strings (`idxWeaponName`/`idxItemName` →
  ASCII, `0` = space, `0xFF` = terminator) are drawn with `font.png` (no new glyph art). Their text is
  exported as a small JSON (id → name) from the ROM so the browser has the labels.

## Capabilities

### New Capabilities
- `browser-equipment-menu`: the weapon-select and item/equipment full-screen menus — open/close, the
  owned-inventory grid (icon + name + ammo/count), the cursor + direction navigation, Fire-to-confirm,
  and pausing play while open.

### Modified Capabilities
- `browser-player-items`: the current weapon/item can now also be chosen through the menus (the existing
  quick-select bindings remain).
- `rom-asset-export`: export the weapon/item **name strings** (`idxWeaponName`/`idxItemName`) as a JSON
  the browser renders with the font.

## Impact

- **Code:** `web/game.js` — a paused `'menu'` game state with a `weapon`/`item` sub-mode; open/close key
  bindings (F-keys are browser-reserved → a documented key binding, per `browser-player-items`); a menu
  renderer (grid of owned entries from `ownedWeapons`/`ownedItems` with icon + `drawText` name + ammo/
  count, and a cursor arrow); direction-to-move-cursor with a repeat delay; Fire sets the selection. The
  per-frame `update()`/`draw()` skip actor logic while a menu is open.
- **Assets:** a `names.json` (weapon id → name, item id → name) emitted by the RoomViewer from
  `idxWeaponName`/`idxItemName` + the name text. (Icons + font already exported.)
- **Specs:** new `browser-equipment-menu`; deltas to `browser-player-items`, `rom-asset-export`.
- **Divergences (flagged):** open/close uses a key binding, not F1/F2/F3 (browsers reserve them); only
  the **owned** subset is shown (no pickups/economy); the menu layout follows the ROM grid but exact
  pixel coordinates may be adapted to the 256×212 canvas.
- **ROM sources:** `Banks0123.asm` (`DrawWeaponMenu`/`DrawEquipMenu`/`Render3Numbers`/`SetMenuWeaponPal`),
  `logic/menuequipment.asm` (`MenuEquip`/`MenuEquipLogic`/`CompactEquipment`/`GetMenuCursor`/`DrawArrow`/
  `CalcCursorXYEquip`), `logic/controls.asm` (`ReadFKeys`), `data/weaponnames.asm`, `data/itemnames.asm`,
  `constants/Enums.asm` (`GAME_MODE_*`, `SELECTED_*`).

## Out of scope

The radio/codec screen (`GameMode 4`), the password screen, the CALL/destruction-timer HUD, acquiring
new weapons/items (pickups), and item *use* effects beyond setting the current selection.
