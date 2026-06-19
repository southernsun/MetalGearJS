> Faithfully port the ROM HUD + damage feedback. Cite the source routine next to each ported piece
> (per CLAUDE.md). Sources: `logic/hud.asm` (RenderHUD/DrawLife/DrawClass), `Banks0123.asm`
> (DrawWeaponHUD/DrawItemHUD/SetSnakeSprCol/InitPlayerVars/UpdateLevels/GetWeaponInvAdd/DecItemUnits),
> `logic/weapon/handgun.asm` (ChkHandGunShot ammo + ChkAlertTrigger), `data/playersprite.asm`
> (SnakeAttrDamage), `Variables.asm` (Life/MaxLife/Class). NO oxygen gauge (ROM has none — binary tank).

## 1. Assets (exporter)

- [x] 1.1 Export weapon/item HUD icons: decode the icon tiles at `WeaponGfxXY`/`ItemGfxXY` (16×16, 32×16 for big weapons) into a PNG + JSON atlas under `web/assets`, keyed by weapon ID / item ID. Pin the source equip gfx page; verify the handgun icon visually. Done — `GfxItems` 3bpp tiles loaded to page-1 0xB000=(0,96), 32 tiles/row (`LoadTilesGfx`); rebuilt the page-1 bitmap and cropped icons (word=(SY<<8)|SX, SX bit0=size). New `--export-hud-icons` RoomViewer mode → `hud-icons.png`/`.json` (35 icons). Verified handgun/box/oxygen/SMG render correctly.
- [x] 1.2 Export Snake's red damage-flash frames: add a `DamageColors` palette (`SnakeAttrDamage`, colour `08h`/`47h`) and emit red-coloured walk/idle/armed frames into `snake.png`/`snake.json` (mirrors `WaterShadowColors`). Done — 40 `damage-*` frames added (red body + black outline; red puddle with 3 holes). Index 8 = (255,0,0) (RoomViewer `--palette`, consistent across rooms).
- [x] 1.3 Regenerate `web/assets` and confirm the atlas keys the new icons + red frames. Done — `snake.json` has 40 `damage-*` frames; `hud-icons.json` has 35 weapon/item icons.
- [x] 1.4 Export the game font (`gfxFont`, `gfx/font.asm`): 108 white 1bpp 8×8 glyphs (char = `0x30 + glyph`) → `font.png`/`font.json` for faithful HUD text. Done — RoomViewer `ExportFont` (gfxFont + gfxSymbChars contiguous = 108 glyphs); verified "LIFE/CLASS/0-9" render in the real font. Also appends a **yellow rank star** (glyph 11 = `gfxSymbChars[0]`, `font.json.starX`) for CLASS.

## 2. Life bar + rank (DrawLife / DrawClass)

- [x] 2.1 Replace the placeholder `drawLifeBar` with a faithful LIFE bar: "LIFE" label, white-outline box, filled width ∝ `Life` against full scale `0x30`, empty when `Life ≤ 1` (`DrawLife`, logic/hud.asm). Keep `maxLife` (`0x18`, `InitPlayerVars`). Done in `renderHud` — red fill (index 8 = `88h`), white box.
- [x] 2.2 Draw CLASS + `Class+1` stars (1–4) from a `class`/rank state value (`DrawClass`). Tie `maxLife` to `Class` per `UpdateLevels` (rank up raises max toward `0x30`). Do not implement what increments `Class`. Done — `snake.class`, `RANK_MAX_LIFE=[24,32,40,48]`, and the **real ROM star glyph** (`gfxSymbChars[0]` = font glyph 11, drawn yellow — `DrawClass` tile `0x3B`→`DrawChar` 0x4B, the slot `LoadFont` fills with the yellow star at page-1 (88,64)).

## 3. Red damage flash (SetSnakeSprCol)

- [x] 3.1 Remove the placeholder invuln blink-hide in the player draw path (`web/game.js`). Done.
- [x] 3.2 Add the red flash: while `invulnTimer != 0`, draw the red Snake frame on alternating ticks (frame counter bit 0 == 0 → red, else normal), reverting at 0 — faithful to `SetSnakeSprCol` (`DamageDelayTimer`/`TickCounter` bit 0). Applies to the current `playerSpriteKey` frame (walk/idle/armed). Done via `tickCounter` + `'damage-'+key`.
- [x] 3.3 Confirm the flash covers all sources (guard contact, bullet, deep-water drain) since they all set `invulnTimer`. Done — gated only on `invulnTimer`, no source exclusion.

## 4. Weapon + item HUD (DrawWeaponHUD / DrawItemHUD)

- [x] 4.1 Draw the weapon box (white outline) + selected weapon icon; empty when `selectedWeapon == 0` (`DrawWeaponHUD`). Done via `drawHudBox`.
- [x] 4.2 Draw the 3-digit weapon ammo next to the icon (`RenderAmmoHUD`/`Render3Numbers`), read from the weapon's ammo state. Done — `handgunAmmo` shown 3-digit.
- [x] 4.3 Draw the item box (white outline) + selected item icon; for keycards draw the card number; empty when `selectedItem == 0` (`DrawItemHUD`). Done — icon shown; no keycards owned this slice (card-number path deferred until cards exist).
- [x] 4.4 Compose 2.x + 3.x + 4.x into a single `renderHud()` called each frame (mirrors `RenderHUD`); place it so it doesn't occlude the play area. Done — faithful **bottom strip** (canvas extended by `HUD_H=20`; MSX2 is 212 lines): LIFE+bar (16/49,193), CLASS+stars (8/52,201), WEAPON box+icon+ammo (159,193), ITEM box+icon (222,193) at the ROM's exact screen coords, text in the game font (`drawText`).

## 5. Handgun ammo (ChkHandGunShot)

- [x] 5.1 Add an ammo count to the handgun (seed from the ROM's initial `Weapons` inventory; flag if the init value isn't in available sources). Done — `handgunAmmo` seeded to 50 (rank-1 max `MaxAmmoLv1[0]=0x50`); we start equipped, so the pickup grant isn't modelled (flagged).
- [x] 5.2 In `firePlayerShot`: block firing when ammo is 0 (empty "click" feedback, no shot); otherwise consume one round (`DecItemUnits`) and update the HUD count. Done — `playClick()` at 0, `handgunAmmo--` on fire.
- [x] 5.3 Firing without a suppressor triggers the alert-trigger hook (`ChkAlertTrigger`) — wire to the existing guard-alert path (or stub + flag if that hook isn't present yet). Done — a shot calls `enterAlert(guard)` if not already alerted (ROM distance check simplified to current-room guard; flagged).

## 6. Verification

- [x] 6.1 Headless: LIFE bar width tracks `Life` against `0x30`; CLASS shows `Class+1` stars; red frame chosen on even ticks while `invulnTimer != 0` and normal otherwise; ammo decrements on fire and blocks at 0. Done — `web/hud.headless.mjs`, 13/13 checks pass.
- [x] 6.2 Manual browser: take damage (guard/bullet/deep water) → red flash + bar drop; fire handgun → ammo counts down, click at empty; weapon/item icons show the equipped selection. Confirmed in-browser before archive.
- [x] 6.3 Regression: movement/guard/doors/water/box/handgun-travel unaffected; confirm ROM citations in comments. Done — changes additive (HUD overlay, red-flash branch, ammo gate); `node --check` + headless pass; no movement/door/water logic touched.
- [x] 6.4 Update `Tools/coverage/coverage-map.json` (DrawLife/DrawClass/DrawWeaponHUD/DrawItemHUD/SetSnakeSprCol/ChkHandGunShot-ammo done) and regenerate `docs/rom-coverage.md`. Done — player-damage-hud 27%→72%, player-weapons →91%, overall →58%.
