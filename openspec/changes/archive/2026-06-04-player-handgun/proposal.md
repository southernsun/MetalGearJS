## Why

Snake can't fight back yet. The handgun is the first weapon and the foundation of the player-shot
system. With the item system providing weapon selection, this change adds firing the handgun and
the player-shot entities, ported from the ROM (`ChkHandGunShot`, `BulletLogic`/`BulletLogic2`).

## What Changes

- With the handgun selected, pressing fire spawns a **player shot** (`ChkHandGunShot`): from Snake's
  gun position (Y − 14) in his facing direction, at the ROM shot speed (`ShootDirSpeeds`), with a
  range timer (`0x10` frames).
- Shots travel each tick and are removed on range expiry, on leaving the room, or on hitting a solid
  tile (`BulletLogic`/`BulletLogic2`, ignoring railing tiles `0x6B`/`0x6E`). Up to 6 active shots.
- Firing is disabled where the ROM disables it (water, deep water, box) per `ChkWeaponShot`.

**Out of scope:** the rest of the weapon roster (SMG/grenade/rocket/mines/missile); ammo counts +
HUD; suppressor/alert-trigger nuance; player shots damaging enemies is in scope only insofar as the
shot collides with tiles — enemy-hit reactions can be tuned with the existing actor model.

## Capabilities

### New Capabilities

- `browser-player-weapons`: firing the handgun and the player-shot entity system (spawn, travel,
  tile collision, range timer, pool cap), gated by the selected weapon and the firing-disabled modes.

## Impact

- **Browser game** (`web/game.js`): a `playerShots[]` list (mirrors the guard `bullets[]`): spawn
  on fire when the handgun is selected; per-tick travel; despawn on range/edge/solid-tile; draw the
  shot; cap at 6; disable in water/deep-water/box.
- **Source consumed (read-only)**: `logic/weapon/handgun.asm` `ChkHandGunShot` + `ShootDirSpeeds`;
  `logic/weaponuse.asm` `ChkWeaponShot` (disabled modes); `logic/collisions.asm`
  `BulletLogic`/`BulletLogic2` (tile collision, railings `0x6B`/`0x6E`); shot timer `0x10`, max 6.
- **Depends on**: `player-item-system` (`SelectedWeapon` = handgun). Reuses the existing
  bullet/tile-collision pattern from the guard work.
