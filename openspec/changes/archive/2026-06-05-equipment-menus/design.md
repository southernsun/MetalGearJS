## Context

The port already has the inventory state (`ownedWeapons`/`ownedItems`, `selectedWeapon`/`selectedItem`),
the weapon/item **icons** (`hud-icons.png`, keyed `w<id>`/`i<id>`), and the **game font** (`font.png` +
`drawText`). What's missing is the ROM's two selection screens: the weapon menu (`GameMode 2`,
`DrawWeaponMenu`) and the item/equipment menu (`GameMode 3`, `DrawEquipMenu` + `logic/menuequipment.asm`),
opened by the F-keys (`ReadFKeys`), navigated by the d-pad with Fire to confirm, with play paused.

## Goals / Non-Goals

**Goals:**
- A paused full-screen **weapon menu** and **item menu** listing the owned entries (icon + name +
  ammo/count) with a cursor; Fire confirms → sets `SelectedWeapon`/`SelectedItem`.
- Open/close + cursor navigation faithful to `ReadFKeys`/`MenuEquipLogic` (direction move w/ repeat,
  Fire confirm); play fully paused while open.
- Names rendered with the font from an exported `names.json`.

**Non-Goals:**
- Radio/codec (GameMode 4), password screen, CALL/destruction HUD, item pickups/economy, item *use*
  effects beyond setting the selection, and the empty 25-slot grid (we list only owned entries).

## Decisions

- **A paused `'menu'` game state with a sub-mode.** Add `gameState === 'menu'` plus `menuMode`
  (`'weapon'`/`'item'`). In `update()`, when in the menu, run only the menu input (cursor + confirm +
  close) and **return before any actor/door/guard logic** — faithful to the ROM holding play in
  GameMode 2/3 (it's like the existing pause, but interactive). `draw()` renders the menu screen.
  Rationale: minimal, mirrors the ROM's mode switch; reuses the existing pause plumbing.
- **Open/close key binding (divergence).** F1/F2/F3 are browser-reserved, so the weapon menu and item
  menu each open with a documented key (finalize in apply — e.g. `Q` = weapon, `E` = item; the same key
  or `Esc` closes). The existing quick-select (number keys / `I`) stays. Inside the menu the d-pad
  (arrows/WASD) moves the cursor and **Space (Fire)** confirms — matching `MenuEquipLogic` (directions +
  Fire), with the ROM's hold-repeat delay (`ControlHoldWait = 8`).
- **Render owned entries as a grid (ROM layout, adapted).** Weapon menu: the owned weapons as
  icon + `drawText(name)` + 3-digit ammo (`Render3Numbers`; suppressor → no ammo). Item menu: the owned
  items in up to **3 columns** (`DrawEquipMenu` steps columns at the ROM X's, rows by +0x10 Y) as
  icon + name + amount (keycard → card number). Draw a **cursor arrow** at the current selection
  (`DrawArrow`/`CalcCursorXYEquip`). Exact pixel coords are adapted to the 256×212 canvas (flagged), but
  the column/row structure follows the ROM. Rationale: faithful structure without pixel-pixel VRAM math.
- **Names from `names.json`.** Export a `{weapons:{id:name}, items:{id:name}}` JSON decoded from
  `idxWeaponName`/`idxItemName` + the txt strings (`0`→space, `0xFF`→end). `drawText` renders them (the
  font has the letters/digits). Rationale: tiny data, reuses the font, no new glyph art.
- **Cursor model over the owned list.** Build the menu's entry list from `ownedWeapons`/`ownedItems`
  (skipping the "none" sentinel for weapons). The cursor indexes that list; opening seeds it at the
  current selection (`GetMenuCursor`). Confirm sets the selection and (optionally) closes.

## Risks / Trade-offs

- **Key binding clashes** (WASD is movement) → pick open/close keys outside WASD/1-7/M/Space/I/P; finalize
  + document in apply.
- **Layout fidelity** → the ROM grid is VRAM-tile based; we approximate the column/row layout on the
  canvas. Acceptable, flagged; the icon/name/count content is faithful.
- **Item names file** → `data/itemnames.asm` is the EN set (`txtArmor`, …); use it (not the JP file).
- **`@`/special chars in names** (e.g. `P@BOMB`) → map to the font glyph for that byte; if a name byte
  has no glyph, render a space and note it.

## Migration Plan

1. RoomViewer: export `names.json` (weapon + item names) from `idxWeaponName`/`idxItemName`.
2. `game.js`: add the `'menu'` state + open/close keys + pause; the weapon-menu and item-menu renderers
   (grid of owned entries: icon + name + ammo/count + cursor); d-pad cursor move (hold-repeat) + Fire
   confirm → set selection.
3. Verify headless (open pauses; cursor moves over owned entries; Fire sets the selection; close resumes)
   and in-browser. Update `coverage-map.json` (DrawWeaponMenu/DrawEquipMenu/MenuEquipLogic/ReadFKeys) and
   regenerate the doc.

Rollback: the menu state is additive; quick-select still works if the menus are reverted.

## Open Questions

- Final open/close key bindings (pick in apply; document as a divergence). Whether confirming also closes
  the menu (ROM stays open until F3; closing-on-confirm may feel better — decide in apply, note it).
