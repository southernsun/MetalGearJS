## 1. Remaining lookups

- [x] 1.1 Shot sprite/colour tables: data/weaponspratt.asm (idxShotSprAtt) — OR-pairs with
      offsets (−8,−8): grenade/bomb 7+CC|0Ah, rocket 7+CC|0Ch, mine 0Ch+CC|07h, missile
      8+0Fh, explosions 6+CC|08h (overlap 0x0E white); the medium explosion's final frame
      = SprExplosB3Attr, a 32x32 white 4-sprite burst; SpriteIDs 1..0xB mapped
- [x] 1.2 The missile gates the player: NormalCtrl (Banks0123.asm:8468-8470) returns while
      PlayerShotsList[0] holds ID 7 — Snake FREEZES and the direction keys steer the
      missile (ControlMissile reads ControlsTrigger)
- [x] 1.3 Explosive contact (ChkEneHitByShot, logic/damagetoenemy.asm:133-152): rocket /
      land mine / missile transition to their explode status on an enemy hit (status 0 ->
      1) while the enemy takes the table damage; grenade/bomb/mine HITS use the
      ActorShapeExpl shapes (guards: shape 1 = ±20px box) vs the projectile shapes for
      bullets/rocket/missile

## 2. Exports

- [x] 2.1 `--export-shots` → shots.png/shots.json: 17 frames (grenade, rocket x4, bomb,
      mine, missile x4, sexp-1..3, mexp-1..2 16x16 + mexp-3 32x32 white) in the ROM
      attr colours (fixed slots + the MSX2 defaults for untouched 7/0xA)
- [x] 2.2 SFX: smg/grenade-throw/rocket/missile/bomb-set/explosion/bomb-explosion.wav
      (0x0D/0x12/0x13/0x14/0x17/0x1A/0x1C from the catalog)

## 3. game.js

- [x] 3.1 chkWeaponShot dispatch (fireQueued = ControlsTrigger, held 'fire' = ControlsHold;
      no weapons in rooms >= 224 / water / box); per-weapon max actives (6/6/2/1/1/3/1)
      and one-at-a-time for rocket/bomb/missile; firePlayerShot superseded
- [x] 3.2 SMG: hold-autofire every 2 ticks, BurstCnt cycling the SMG_BulletSpeeds fan
      (0, ±1.5, ±3 drift), ammo per bullet, click when dry, suppressor + alert noise
- [x] 3.3 Grenade: ±3 on the facing axis, the GrenadeYOffsets parabola on the DRAWN Y only,
      no tile collision/contact kill, 0x18 timer -> explode (1-frame ±20 blast window,
      small explosion frames, SFX 0x1A + alert)
- [x] 3.4 Rocket: ±5, contact kill 0x0A + explode, tile collision -> medium explosion
- [x] 3.5 Plastic bomb: PBombDirOffset placement, 0x30-iteration fuse (x2 ticks),
      explode -> chkBombWalls (lock-14 open-area test -> openDoor); consumable; NOTE: no
      lock-14 wall exists in the exported rooms yet — the hook is suite-tested
      synthetically and goes live with the basement exports
- [x] 3.6 Mine: armed at Snake's spot (max 3, consumable), trips on enemy contact (±20
      shape): damage 5 + the small explosion
- [x] 3.7 Missile: one at a time, ±4; normalControl freezes Snake while it flies and routes
      the direction keys to steerMissile (90°/180° re-aims + the directional frame); tile
      collision -> medium explosion
- [x] 3.8 Damage via WEAPON_DMG (2/2/5/0xA/5/5/5 vs guards); demo pickups: SMG+bombs room 3,
      grenade launcher+mines room 9, rocket launcher+missiles room 10 (check-graph spots;
      room 5 left for the items suite's synthetic placements)
- [x] 3.9 drawPlayerShots: bullets stay dots; everything else from shots.png by
      type/direction/explosion phase (mexp-3 = the 32x32 white burst)

## 4. Checks + docs

- [x] 4.1 shots.headless.mjs: 40 checks (the original 18 + SMG cadence/fan/reset, grenade
      arc/over-wall/timer/blast window, rocket single+contact+medium, bomb placement/
      consumable/single/fuse/WALL-OPENING + lock-14 punch no-op, mine arm/trip, missile
      fire/freeze/steer/release)
- [x] 4.2 All 14 suites green (352 checks); hud/items suites migrated from firePlayerShot
      to the dispatch; SESSION-STATE, rom-data-formats weapons section, coverage map +
      rom-coverage regenerated
