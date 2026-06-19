## Context

The browser port already tracks `snake.life` / `snake.maxLife` (= `0x18`), an `invulnTimer`
(= `DamageDelayTimer`), `selectedWeapon`/`selectedItem`, and the handgun/player-shots system. What's
missing is the ROM's HUD and the faithful damage feedback. Today `drawLifeBar()` is a placeholder that
scales to our stand-in max of 24, there is no rank/weapon/item readout, and the post-hit feedback is a
non-ROM blink (`web/game.js` hides the sprite every few frames).

The ROM HUD is `RenderHUD` (`logic/hud.asm`): `DrawLife` + `DrawClass` + `DrawCallTimer` +
`DrawWeaponHUD` + `DrawItemHUD`. The damage flash is in the player sprite-colour path
(`Banks0123.asm:5489` `SetSnakeSprCol`). All the data needed is in the disassembly (cited below); the
only genuinely new assets are the weapon/item icons and a red Snake colour set.

The port renders pre-baked PNGs to a Canvas; it does not emulate the MSX2 VDP. So "draw the HUD with
VDP `DrawRect`/`FillRect`/`PrintText`" and "swap the sprite colour table" become "draw rectangles/text
on the Canvas" and "render a red-coloured Snake frame" — same visuals, different mechanism (a
documented technique divergence, consistent with how the rest of the port works).

## Goals / Non-Goals

**Goals:**
- Faithful LIFE bar (`Life` vs `0x30` scale, `MaxLife` `0x18`, `Class`-driven max) replacing the placeholder.
- CLASS/rank stars from `Class` (1–4), honouring the `Class`→`MaxLife` relationship (`UpdateLevels`).
- Red damage flash (`SnakeAttrDamage`, colour `08h`) alternating each frame while `invulnTimer != 0`,
  replacing the blink; covers every damage source.
- Weapon HUD: icon + 3-digit ammo; handgun ammo consumed on fire, blocked (click) at zero, noise alerts.
- Item HUD: icon (+ keycard number).
- Export weapon/item icons and Snake's red colour set.

**Non-Goals:**
- CALL sign / radio and the self-destruct countdown (`DrawCallTimer`/`DrawDestrucTimer`) — separate systems.
- The full equipment **menu** screen (`DrawEquipMenu`).
- Rank *progression* (hostage rescues that increment `Class`).
- **No oxygen gauge** — the ROM has none; oxygen is the binary `SELECTED_OXYGEN` tank check in
  `SetInWaterMode3` (already implemented). `OxygenTaken` is only a pickup flag.
- The full weapon roster beyond what exists (handgun); other weapons' fire logic stays out of scope.

## Decisions

- **HUD as a Canvas overlay, not VDP emulation, in a faithful bottom strip.** Add a `renderHud()` that
  draws the LIFE label+bar, CLASS+stars, weapon box+icon+ammo, and item box+icon each frame, mirroring
  `RenderHUD`'s element set, the ROM's colours (white `0Eh` outlines, bar full scale `0x30`), AND its
  **screen coordinates**. The ROM HUD is a bottom strip at screen Y 192-211 (the MSX2 frame is 212
  lines, play field 0-191); the canvas is extended by `HUD_H=20` and the HUD is drawn at the exact ROM
  X/Y (LIFE 16,193 + bar 49,193,50×8; CLASS 8,201 + stars 52,201; WEAPON box 159,193,58×18 + ammo
  192,200; ITEM box 222,193,27×18) — decoded from `txtLife`/`txtClass`/`DrawRect`/`DrawWeaponHUD`/
  `DrawItemHUD` (note: `PrintText` packs the position word X-then-Y; `DrawRect` uses H=SX/L=SY). Text is
  drawn in the **game font** (see below). Rationale: matches the original on-screen layout exactly.
- **Text in the ROM font.** Export `gfxFont` (108 1bpp 8×8 glyphs, white, char code = `0x30 + glyph`)
  to `font.png`/`font.json` and render HUD text by blitting glyphs (`drawText`), faithful to
  `PrintText`/`DrawChar`. Rationale: the user asked for the real font; a system font would diverge.
- **CLASS rank star is the ROM glyph, not a drawn shape.** `DrawClass` draws star tile `0x3B`, which
  `DrawChar` maps to tile `0x4B` — the page-1 slot `LoadFont` fills with the yellow star from
  `gfxSymbChars[0]` (= font glyph 11). So the exporter appends a yellow copy of glyph 11 to `font.png`
  (`font.json.starX`) and `drawStar` blits it. (Verified: rendered yellow, glyph 11 is the star.)
- **Life bar math from `DrawLife`.** Filled width ∝ `Life`, full at `0x30`; empty when `Life ≤ 1`.
  Keep `maxLife` as state; tie it to `Class` per `UpdateLevels` (rank up → raise max toward `0x30`).
  Display the current `Class` as `Class+1` stars; we do **not** implement what raises `Class`.
- **Red flash = per-frame colour swap, driven by the existing `invulnTimer`.** In the player draw
  path, when `invulnTimer != 0` and the frame counter's bit 0 is 0, draw the red Snake frame; else
  normal. This is exactly `SetSnakeSprCol`'s `DamageDelayTimer`/`TickCounter bit 0` logic. Remove the
  blink-hide. Rationale: one timer already exists and gates all damage (enemy 0x20, deep water 8), so
  the flash automatically covers every source.
- **Red frames: bake a `SnakeAttrDamage` colour variant** in the exporter (a `DamageColors` palette,
  like `WaterShadowColors`) rather than a Canvas tint. Rationale: exact ROM colour (`08h`), and the
  exporter already composites Snake; a global red multiply would be approximate. Alternative (CSS/
  canvas `globalCompositeOperation` tint) rejected for fidelity.
- **Ammo as a real inventory field.** Give the handgun an ammo count (seeded from the ROM's initial
  `Weapons` inventory), shown in the weapon HUD (3-digit). `firePlayerShot` consumes one round; at
  zero it plays the click feedback and spawns nothing; firing without a suppressor calls the
  alert-trigger hook. Faithful to `ChkHandGunShot` + `DecItemUnits`.
- **Icons exported from the equipment graphics.** Add an export path that decodes the weapon/item icon
  tiles at `WeaponGfxXY`/`ItemGfxXY` into a small atlas. Resolve the exact source gfx page during apply
  (the equip-screen graphics the ROM loads to VRAM page 1).

## Risks / Trade-offs

- **Icon source graphics location** → the exact ROM gfx the icons are copied from must be pinned during
  apply; mitigate by tracing `WeaponGfxXY`/`ItemGfxXY` to the loaded equip graphics and verifying a
  known icon (handgun) visually.
- **Initial handgun ammo value** → must come from the ROM's initial `Weapons` table, not a guess; if
  the init table isn't in the available sources, seed from the ROM and flag it as a divergence.
- **HUD placement vs the 256×192 play area** → the ROM HUD occupies fixed screen regions; in the port
  it overlays the canvas. Pick coordinates that don't occlude play; mirror ROM layout where practical.
- **Red flash at ~30 Hz** → alternating every frame can look harsh on high-refresh displays; it is
  faithful (`TickCounter bit 0`), so keep it but tie it to the game tick, not the display refresh.

## Migration Plan

1. Exporter: add weapon/item icon export + the `SnakeAttrDamage` red Snake variant; regenerate assets.
2. `game.js`: add `renderHud()` (life/class/weapon/item), remove the placeholder `drawLifeBar` and the
   blink-hide, add the red-flash branch to the player draw, add handgun ammo state + consumption.
3. Verify headless (life bar width, star count, red-frame selection while invuln, ammo decrement/empty)
   and in-browser. Update `coverage-map.json` (`DrawLife`/`DrawClass`/`DrawWeaponHUD`/`DrawItemHUD`/
   `SetSnakeSprCol`/`ChkHandGunShot` ammo) and regenerate `docs/rom-coverage.md`.

Rollback: the HUD/flash/ammo are additive in `game.js`; reverting the commit restores the placeholder.

## Open Questions

- Exact initial handgun ammo and the `Class`→`MaxLife` table values — pin from the ROM during apply.
- Which item icons to ship first (cardboard box + oxygen tank are the currently selectable items).
