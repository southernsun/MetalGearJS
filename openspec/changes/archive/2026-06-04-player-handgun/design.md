## Context

Builds on the item system (`SelectedWeapon`). ROM: `ChkWeaponShot` dispatches on the selected
weapon and is blocked in water/deep-water/box (and certain rooms); `ChkHandGunShot` spawns a shot
from `PlayerY−14` in `PlayerDirection` at `ShootDirSpeeds` (~6 px/frame), range timer `0x10`, max 6
shots. `BulletLogic`/`BulletLogic2` move the shot and remove it on a solid tile, ignoring railing
tiles `0x6B`/`0x6E`. The port already has a guard `bullets[]` system to mirror.

## Goals / Non-Goals

**Goals:** fire the handgun; faithful player-shot spawn/travel/despawn; firing disabled in the
right modes. **Non-Goals:** other weapons; ammo/HUD; suppressor/alert nuance.

## Decisions

- **`playerShots[]` mirrors the guard `bullets[]`** (built in guard-chase-damage): spawn from the
  gun position with `ShootDirSpeeds` velocity + a `range` countdown; per-tick travel; despawn on
  range/edge/solid-tile via the existing tile-collision helper, ignoring railings. Straight along
  facing (4-dir).
- **Gate firing on the selected weapon + disabled modes** (`ChkWeaponShot`): only when
  `selectedWeapon == handgun` and not in water/deep-water/box.
- **Reuse the shot sprite or a simple dot.** Prefer exporting the shot sprite; a small fallback dot
  is acceptable initially (the guard bullet set the precedent).

## Risks / Trade-offs

- **[Player shots vs enemies]** → tile collision is the spec here; hitting the guard can reuse the
  actor model later. Keep scope to spawn/travel/tile-despawn now.
- **[No ammo/HUD]** → unlimited handgun for now; ammo + HUD are deferred (HUD change).
