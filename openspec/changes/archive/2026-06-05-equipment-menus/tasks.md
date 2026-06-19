> Port the ROM's weapon + item menus faithfully; cite the routine per piece (CLAUDE.md). Sources:
> `Banks0123.asm` (DrawWeaponMenu/DrawEquipMenu/Render3Numbers/SetMenuWeaponPal), `logic/menuequipment.asm`
> (MenuEquip/MenuEquipLogic/CompactEquipment/GetMenuCursor/DrawArrow/CalcCursorXYEquip), `logic/controls.asm`
> (ReadFKeys), `data/weaponnames.asm` + `data/itemnames.asm` (names), `constants/Enums.asm` (GAME_MODE_*).
> Reuse the exported `hud-icons.png` (icons) + `font.png` (`drawText`). Show only OWNED entries (flagged).

## 1. Asset export

- [x] 1.1 RoomViewer `--export-names`: decode `idxWeaponName` (`data/weaponnames.asm`) + `idxItemName` (`data/itemnames.asm`) — ASCII, `0`=space, `0xFF`=terminator — into `web/assets/names.json` (`{weapons:{id:name}, items:{id:name}}`). Map any special byte (e.g. `@`) to its font glyph or a space (flag).

## 2. Menu state + open/close + pause

- [x] 2.1 Add a `gameState === 'menu'` with `menuMode` (`'weapon'`/`'item'`); open each via a key binding (F-keys reserved → documented keys), seed the cursor at the current selection (`GetMenuCursor`); a key/`Esc` closes and resumes (`ReadFKeys` open / F3 close).
- [x] 2.2 In `update()`, while in the menu run only the menu input (cursor + confirm + close) and skip all actor/guard/door logic (play paused, faithful to GameMode 2/3). Load `names.json` in `loadAssets`.

## 3. Weapon menu (DrawWeaponMenu)

- [x] 3.1 Render the owned weapons grid: each = icon (`w<id>` from hud-icons) + name (`drawText` from `names.json`) + 3-digit ammo (`Render3Numbers`; suppressor → no ammo), on the menu palette backdrop (`SetMenuWeaponPal`).
- [x] 3.2 Cursor arrow on the selection (`DrawArrow`); d-pad moves it over the owned weapons (hold-repeat `ControlHoldWait=8`); **Fire** sets `SelectedWeapon`.

## 4. Item/equipment menu (DrawEquipMenu)

- [x] 4.1 Render the owned items in up to **3 columns** (`DrawEquipMenu` layout): each = icon (`i<id>`) + name + amount (keycard → card number); empty grid when nothing owned / captured (`EquipRemoved`).
- [x] 4.2 Cursor arrow + d-pad navigation (hold-repeat); **Fire** sets `SelectedItem`. HUD item readout reflects the new choice.

## 4b. Layout + loadout (refinement)

- [x] 4b.1 Layout matched closer to the ROM: the name sits to the **right** of the 16px icon (`DrawEquipMenu +16`), items in a tight 3-column grid, weapons in a single column with ammo. (Superseded by 4b.4.)
- [x] 4b.2 **Full loadout** (temporary, "function later"): all 8 weapons + all 25 items owned, so the menus are full. Snake now shows the armed pose for any held weapon except bomb/mine (`SetSprWalk4`).
- [x] 4b.4 **Faithful layout rewrite** (from the `examples/weapon.png`, `weapon2.png`, `equipment.png` reference shots). Black screen + centred title via the real `PrintTextXY` coords: "WEAPON  SELECT" @ (72,16), "EQUIPMENT  SELECT" @ (64,16), "OPTION" @ (104,144) (`data/menuweapontexts.asm` / `menuequipmenttexts.asm`). Entries laid out at the exact `DrawWeaponMenu`/`DrawEquipMenu` slot coords (`menuSlotPos`): weapons in two columns X=24/136 of 4 + the suppressor slot (96,168), rows +24 from Y=40, name +32, ammo +80/+8; items in three columns X=24/104/184 holding 9/9/7, rows +16 from Y=40, name +16 — all from the cursor tables `data/weaponcursorxy.asm` / `data/itemcursorxy.asm`. Arrow cursor = the ROM glyph `0x3C` (`DrawArrow`). Ammo formatted like `Render3Numbers` (hundreds blank when 0 → "00", logic/hud.asm:291; same fix applied to the HUD readout). The gameplay HUD is kept on screen (the ROM calls `RenderHUD` in the menus). Column-major cursor nav (up/down within a column, left/right jump a column). Palette confirmed correct (`PalMenuWeapon`, verified against the screenshots). Remaining flagged divergences: open/close keys (browser-reserved F-keys); OPTION is inert (options screen out of scope); only handgun ammo is tracked; exact ROM column-edge wrap not reproduced. Verified by `web/menu.headless.mjs` (25/25).
- [ ] 4b.3 (deferred) Some item names are the ROM's terse/Engrish strings ("BOMBE" = diving/scuba tank, "CIGAL" = cigarettes, plus GOGGL/COMPAS/ANTID/RATIO/UNIFO/PARAC). These are faithfully decoded from `data/itemnames.asm` — NOT a bug. If friendlier display labels are wanted, that's a deliberate divergence to add later (map ROM id → nicer label).

## 5. Verification

- [x] 5.1 Headless: opening a menu pauses (no actor logic / Snake doesn't move); cursor starts on the current selection; d-pad moves it over owned entries; Fire sets `SelectedWeapon`/`SelectedItem`; close resumes play.
- [ ] 5.2 Manual browser: open the weapon menu, pick the handgun; open the item menu, pick the box / oxygen / a card (CARD4); confirm the HUD readout + that the picked card then opens its keycard door.
- [x] 5.3 Regression: walking/guard/alarm/doors/HUD unaffected when no menu is open; quick-select bindings still work; confirm ROM citations.
- [x] 5.4 Update `Tools/coverage/coverage-map.json` (DrawWeaponMenu/DrawEquipMenu/MenuEquip/MenuEquipLogic/ReadFKeys done/partial) and regenerate `docs/rom-coverage.md`.
