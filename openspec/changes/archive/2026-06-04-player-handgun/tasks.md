> Depends on player-item-system (SelectedWeapon = handgun). Port the ROM handgun + shot routines
> (logic/weapon/handgun.asm ChkHandGunShot + ShootDirSpeeds; logic/weaponuse.asm ChkWeaponShot;
> logic/collisions.asm BulletLogic/BulletLogic2); cite each. Range 0x10, max 6, railings 0x6B/0x6E.
> Reuse the guard bullets[] pattern from guard-chase-damage.

## 1. Player shots

- [x] 1.1 Add a `playerShots[]` list (max 6) mirroring the guard `bullets[]`
- [x] 1.2 On fire with the handgun selected, spawn a shot from `PlayerY−14` along `PlayerDirection` at `ShootDirSpeeds`, range timer `0x10`
- [x] 1.3 `BulletLogic`: per-tick travel; despawn on range expiry, room edge, or solid tile (ignore railings `0x6B`/`0x6E`)
- [x] 1.4 Draw the shot (export the shot sprite if practical, else a small fallback dot)

## 2. Fire gating

- [x] 2.1 Only fire when `selectedWeapon == handgun` (`HAND_GUN=1`)
- [x] 2.2 Disable firing in shallow water, deep water, and box (per `ChkWeaponShot`)

## 3. Verification

- [x] 3.1 Headless: fire spawns a shot; despawn on range/wall/edge; pool capped at 6; no fire while swimming/boxed
- [x] 3.2 Manual browser: fire the handgun in all four directions; shots stop at walls
- [x] 3.3 Regression: movement/guard/doors unaffected; confirm ROM citations
- [x] 3.4 Update `Tools/coverage/coverage-map.json` (BulletLogic/handgun/ReadFKeys done) and regenerate `docs/rom-coverage.md`

## 4. Playtest fixes
- [x] 4.1 On-screen legend updated (web/index.html) to the new controls: Fire=Space, Punch=M, Weapon 1–7 / 0=none, Item=I, Pause=P
- [x] 4.2 Armed Snake pose when a weapon is selected (`SetSprWalk4` +12): exported armed walk/idle frames (sprites 12–23) and `playerSpriteKey` uses `armed-*` when `selectedWeapon === HAND_GUN`; `0` holsters (unarmed). Verified armed↔unarmed switch headlessly
