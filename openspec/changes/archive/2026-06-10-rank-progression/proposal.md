# Rank progression (prisoners → Class growth)

## Why

The rank system is half-present: CLASS stars and the per-rank life table render in the HUD,
and the rank-1 ammo maxima clamp the inventory — but `Class` can never change, because the
thing that drives it (rescuing prisoners, `IncRescued`/`IncClassLv`, Banks0123.asm:9634) and
the thing that lowers it (killing one, `KillPrisoner` → `DowngradeRank`) aren't ported, and
neither is the prisoner actor itself.

## What Changes

- **Prisoners**: a touchable, rescuable prisoner actor (`PrisonerLogic`,
  logic/actors/prisoner.asm): idle 2-frame animation; Snake's touch (the prisoner's ROM touch
  shape, `ActorsShapeTouch` 0x17: |dy−(−8)|<16, |dx|<16) frees him (rescued pose), marks his
  `RescuedArray` flag so he's gone on re-entry, and calls `IncRescued`. Prisoners are also
  shootable (LIFE 2, handgun damage 2 — one bullet) and killing one calls `DowngradeRank`
  (`KillPrisoner`, Banks0123.asm:13276). The ROM's 23 prisoner rooms (129–203,
  `RoomsPrisoner`) are all outside the exported cluster, so a flagged DEMO prisoner is placed
  in a cluster room (same convention as the demo guard/items). Texts/radio are out of scope.
- **Rank up** (`IncRescued`/`IncClassLv`/`UpdateLevels`): every 5 rescues, Class +1 (cap 3),
  SFX 0x26, MaxLife 24/32/40/48 with a **full heal** to the new maximum, CLASS stars redraw,
  and the ammo/ration maxima move to the rank's `MaxAmmoLv1-4` row (BCD-read: handgun/SMG
  50/100/200/300, grenades 15/30/60/90, rockets 5/10/20/30, bomb/mine/missile 5/10/15/20,
  rations 3/6/9/18).
- **Rank down** (`DowngradeRank`): killing a prisoner resets the rescue counter AND the
  "regular 17" prisoners' rescued flags (the 6 specials stay rescued); Class −1 (floor 0),
  SFX 0x27, life *clamped* (not refilled) to the lower MaxLife, ammo/rations clamped
  (`LimitAmmo`).
- **Persistence**: Class survives the slice restart (it currently resets to 0 — the ROM
  continue keeps rank, matching the kept inventory).
- New exports: prisoner spritesheet (`SprPrisoner` idle×2 + rescued frames, MetalGearSpriteMover)
  and the rank-up/rank-down SFX (0x26/0x27 via the generic `--export-sfx`).

## Capabilities

### New Capabilities

- `browser-rank-progression`: prisoner rescue/kill actors, the rescue counter, Class
  up/downgrade with life/ammo consequences, and rescue-flag persistence rules.

### Modified Capabilities

- `browser-player-hud`: the CLASS stars and LIFE bar now react to a Class that actually
  changes (full-heal on rank up; clamp on rank down); the per-rank maxima requirement moves
  from "rank-1 only" to the full table.

## Impact

- `web/game.js`: prisoner state/logic/draw, `incRescued`/`incClassLv`/`updateLevels`/
  `downgradeRank`, rank-indexed `MAX_AMMO_LV`/`MAX_RATIONS_LV` in `clampInventory`, shot-kill
  path for prisoners, restart keeps class.
- `Tools/MetalGearSpriteMover`: `--export-prisoner` (prisoner.png + prisoner.json).
- New WAVs: rankup.wav / rankdown.wav.
- New `web/rank.headless.mjs`; coverage map + SESSION-STATE.
