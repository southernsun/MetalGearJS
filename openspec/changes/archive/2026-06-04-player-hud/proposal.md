## Why

The browser port has no real HUD: the life bar is a placeholder (`drawLifeBar`, scaled to a stand-in
max of 24), there is no rank/class display, and the equipped weapon/item are invisible on screen. The
post-hit feedback is also a placeholder — Snake's sprite is hidden every few frames (a blink), which
is **not** what the ROM does. "Player damage, life, death + life bar" is the lowest-coverage gameplay
component (27%). This change ports the ROM's actual HUD (`logic/hud.asm` `RenderHUD`) and the faithful
damage feedback so the systems we already built (life/i-frames, item select, handgun) become visible.

## What Changes

- **Faithful LIFE bar** — port `DrawLife`/`DecrementLife_B`/`SetDead` (`logic/hud.asm`): "LIFE" label,
  a white-outlined box, and a bar whose width tracks `Life` against the bar's full scale `0x30` (48),
  with `MaxLife` starting at `0x18` (24) per `InitPlayerVars`. Replaces the placeholder `drawLifeBar`.
- **CLASS / rank stars** — port `DrawClass`: "CLASS" label plus `Class+1` star tiles (1–4), driven by
  the `Class` variable; `MaxLife` is tied to `Class` via `UpdateLevels`. (What *increments* `Class` —
  hostage rescues — stays out of scope; we display the current rank and honor the `Class`→`MaxLife`
  relationship.)
- **Red DAMAGE flash** — port the `SetSnakeSprCol` damage path (`Banks0123.asm:5489`): while the
  damage-delay/i-frame timer is non-zero, Snake's colours swap to `SnakeAttrDamage` (red, colour `08h`)
  on alternating frames (`TickCounter` bit 0 — one frame red, one frame normal). Covers **all** damage
  (guard contact, bullets, deep-water drain). Replaces the placeholder blink-hide.
- **WEAPON HUD** — port `DrawWeaponHUD`: white-outlined weapon box, the selected weapon's icon, and its
  3-digit ammo (`Render3Numbers`). Adds **ammo tracking** to the weapon inventory (`Weapons`, ammo at
  offset +2; `GetWeaponInvAdd`).
- **ITEM HUD** — port `DrawItemHUD`: white-outlined item box, the selected item's icon, and (for cards)
  the card number, driven by the existing `SelectedItem`.
- **HUD icon assets** — export the weapon/item HUD icons from the ROM equipment graphics, keyed by
  `WeaponGfxXY` / `ItemGfxXY` (16×16, plus 32×16 "big" weapons).
- **Out of scope (documented):** the CALL sign / radio and the self-destruct countdown timer (separate
  radio/ending systems); the full equipment **menu screen** (`DrawEquipMenu`); rank *progression*
  scoring (hostages). **No oxygen gauge** — confirmed the ROM has none (oxygen is the binary
  `SELECTED_OXYGEN` equipped-tank check in `SetInWaterMode3`, already implemented in `snake-water`;
  `OxygenTaken` is only a pickup flag and `RenderHUD` draws no oxygen element).

## Capabilities

### New Capabilities
- `browser-player-hud`: the on-screen HUD — LIFE bar, CLASS/rank stars, and the equipped weapon (with
  ammo) and item readouts, drawn each frame from the player state (`RenderHUD`).

### Modified Capabilities
- `browser-snake-damage`: replace the placeholder i-frame blink with the faithful red colour-swap
  damage flash; make the life bar scale faithful (`Life` vs `0x30`, `MaxLife` `0x18`, `Class`-driven).
- `browser-player-weapons`: weapons carry an **ammo** count (the handgun and any firing weapon), shown
  in the weapon HUD and consumed on fire per the ROM weapon inventory.
- `rom-asset-export`: export the weapon/item HUD icons (`WeaponGfxXY`/`ItemGfxXY`) to `web/assets`.

## Impact

- **Code:** `web/game.js` — replace `drawLifeBar`; add `drawClassStars`, `drawWeaponHud`, `drawItemHud`,
  a `RenderHUD`-style compositor, the red-flash branch in the player draw path, weapon-ammo state, and
  ammo consumption in `firePlayerShot`. `web/index.html`/CSS as needed for HUD placement.
- **Assets:** new weapon/item icon sheet(s) + atlas under `web/assets`, produced by the C# export tool
  (`Tools/MetalGearSpriteMover` or `RoomViewer`), and a red-flash Snake colour variant if pre-baked.
- **Specs:** new `browser-player-hud`; deltas to `browser-snake-damage`, `browser-player-weapons`,
  `rom-asset-export`.
- **ROM sources:** `logic/hud.asm`, `Banks0123.asm` (`DrawWeaponHUD`/`DrawItemHUD`/`SetSnakeSprCol`/
  `GetWeaponInvAdd`/`GetItemInvAdd`/`InitPlayerVars`/`UpdateLevels`), `data/playersprite.asm`
  (`SnakeAttrDamage`), `data/hudstartendtexts.asm` (`txtLife`/`txtClass`), `Variables.asm`.
