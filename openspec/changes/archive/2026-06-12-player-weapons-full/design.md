# Design — the other weapons

## Context (verified in the disassembly)

- **Dispatch**: `ChkWeaponShot` (logic/weaponuse.asm:8) — no weapon in elevators/water/box;
  `SelectedWeapon-1` jump-indexes to ChkHandGunShot / ChkSMGShot / ChkGrenadeShot /
  ChkFireRocket / ChkPBombShot / ChkLMineShot / ChkMissileShot. Shots live in the shared
  6-slot pool (`GetEmptyShotDat`); `PlayerShotLogic` dispatches per shot ID to the
  per-weapon logic. `NumSprShot` = 1/1/2/4/4/2/4 sprites per shot.
- **SMG** (logic/weapon/smg.asm): fire HELD → `SubMachGunTimer` shoots every 2 iterations;
  `BurstCnt` cycles 1..8 picking a row of `SMG_BulletSpeeds` (16 bytes/direction = 8 × 8.8
  (speedY, speedX) pairs — the burst fans around the facing axis: straight, ±1.5px drift,
  ±3px drift); ammo decrements per bullet, click SFX 0x15 when dry, SMG SFX 0x0D or
  suppressor 0x0E (`InvSupressor` honoured, noise → `ChkAlertTrigger`); otherwise a normal
  bullet (range timer 0x10, KILL_BY_CONTACT, spawn Y−14).
- **Grenade** (grenade.asm): trigger-fired; speed ±3 on the facing axis ONLY (GrenadeSpeeds);
  TWO Y values — the "real" Y_Alt moves linearly, the VISUAL Y = Y_Alt +
  `GrenadeYOffsets[timer]` (a 24-entry parabola peaking −0x28); timer 0x18 → explode:
  SFX 0x1A + ChkAlertTrigger + KILL_BY_CONTACT for exactly ONE frame (SmallExplosionLogic
  clears it on its first tick) + the small explosion (timer 0xF, sprite frames at ≥0xA / ≥5 /
  else). NO tile collision in flight (it flies over walls); boundary check removes it.
  Max actives: 2 (GrenadeDamage header).
- **Rocket** (rocket.asm): trigger-fired, slot-0 only (one in the room); speed ±5; spawn
  Y−16 with Y_Alt at PlayerY; kills by contact in flight; tile collision (both probes) →
  medium explosion (timer 15, frames 7/8/9), SFX 0x13 fire / 0x1A explode + alert.
- **Plastic bomb** (plasticbomb.asm): trigger-fired, slot-0 only; PLACED at
  `PBombDirOffset` from the player (up Y−0x10, down Y+8, left X−0x0C, right X+0x0C);
  consumable (DecItemUnits type 1); timer 0x30 → KILL_BY_CONTACT one frame → medium
  explosion SFX 0x1C + alert. `ChkBasementWall` (logic/doors/opendoor.asm:332): while
  PlayerShotsList[0] is a PLASTIC_BOMB with status 2 (exploding), a lock-14 wall opens if
  the BOMB sits in the wall's bomb zone (`ChkBombLocation` = the door's open area +4).
  Punching those walls just plays SFX (PlayBreakableSfx) — they only yield to the bomb.
- **Mine** (mine.asm): trigger-fired, consumable, placed AT the player's X/Y; passive
  (MineDummy) with KILL_BY_CONTACT set — an enemy walking into it takes MineDamage and the
  mine explodes (small explosion, SFX 0x1C + alert). Max actives 3 (MineDamage header).
- **Missile** (missile.asm): trigger-fired, slot-0 only, consumable; speed ±4, spawn
  Y−0x10; `ControlMissile`: each direction TRIGGER re-runs `SetMissileSpr` (new direction,
  speeds, directional sprite) — full 90°/180° steering; tile collision → medium explosion;
  SFX 0x14. (Whether the ROM gates Snake's own movement during flight: checked at
  implementation against PlayerControlLogic; if it doesn't, both move on the same keys —
  port what the ROM does.)
- **Damage** (data/weapondamage.asm): per-weapon tables indexed by enemy ID−1, header =
  max simultaneous shots. Guards (IDs 4/5): SMG 2, grenade 5, rocket 0x0A, bomb 5, mine 5,
  missile 5.
- **Sprites**: SprGrenade, SprRocketUp/Right/Down/Left, SprPlasticBomb, SprMine,
  SprMissileUp/Right/Down/Left, SprExplosionS, SprExplosionB (gfx/sprites.asm); shot
  SpriteIDs 1=grenade, 2=rocket, 3-5=small explosion, 6=bomb, 7-9=medium explosion,
  0xA=mine, 0xB=missile; colours from the shot attr tables (SprShootsAtt area — read at
  export time).

## Goals / Non-Goals

**Goals**: all six weapons firing/behaving per the ROM in the existing playerShots pool;
the bomb-able lock-14 walls; ROM damage values per enemy; the real SFX; demo pickups so
each weapon is playable.
**Non-Goals**: enemies unique to far rooms (the damage tables' other columns apply when
those enemies exist); the Metal Gear bomb-ORDER mechanic (room 118); water/parachute
restrictions beyond the ChkWeaponShot gates already enforced.

## Decisions

1. **Same pool, per-type tick**: playerShots entries grow `type`, `status`, `timer`,
   `yAlt` fields; update dispatches per type like PlayerShotLogic. Bullets (handgun+SMG)
   share the existing bullet path.
2. **Explosion kill windows are the ROM's**: one frame for grenade/mine/bomb transitions —
   not a lingering AoE; the medium/small explosion is animation.
3. **The parabola is visual-only**, exactly as the ROM splits Y vs Y_Alt; collision/enemy
   hits use the shot's REAL coordinates.
4. **Bomb walls**: on the bomb's explode transition, check lock-14 doors' open-area+4 zone
   against the bomb's position and open (wall-broken SFX path).
5. **SMG burst table hardcoded** from SMG_BulletSpeeds (cited), converted from 8.8 to
   px/tick floats.
6. **Demo pickups**: grenade launcher already drops in room 4? (weapons 2-7 placed across
   cluster rooms 5/6/7/9 as DEMO items — documented, like the handgun).

## Risks / Trade-offs

- [Six behaviours in one slice] → each is small and table-driven; the suite covers each.
- [Missile + player sharing controls] → resolved by reading the ROM gate at implementation.
- [Shot sprite colours unknown until export] → the export reads the ROM tables; worst case
  the catalogued MSX colours are applied manually with a cite.
