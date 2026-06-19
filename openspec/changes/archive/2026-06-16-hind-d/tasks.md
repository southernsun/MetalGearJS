# Tasks — Hind D

## 1. Survey + implementation

- [x] 1.1 hindd.asm (the burst cadence, the tile-block body/wreck, the KO latch);
      ExportTileBlock + --export-hindd (the body rendered with room 50's real tileset)
- [x] 1.2 game.js: the boss + the propeller blur + the burst AI; the fireGuardBullet
      regression fix (the shadowed guard-bullet spawner — guards/jetpacks shoot again)

## 2. Checks

- [x] 2.1 hindd.headless.mjs: 5 checks — all suites green
- [ ] 2.2 User batch playtest (end of run)

## 3. Playtest fixes (2026-06-12)

- [x] 3.1 The shot origin is the ACTOR position (ActorsRoom050: 0x80,0x58; hindd.asm
      spawns ID_BULLET at ix.Y/X) — was an invented (x, 44)+24 spawn; suite asserts it
- [x] 3.2 The rotors are the REAL 3-frame SprAirScrew sprites (HindDProp1-3: both outer
      2x2 rotors, then the centered blur sweeping left/right; color 0x0E white,
      ActorSprColors12) — was a translucent rectangle
- [x] 3.3 Explosives use the craft's own ActorShapeExpl 5 box (-0x20,0x10,0,0x10) via the
      new per-actor explShape in shotTarget — the generic +-0x14 box made grenade kills
      practically impossible; bullets use the real ActorShapeProject 4 box
- [x] 3.4 NOT changed (original ROM behavior): no touch box (ActorsShapeTouch = 0xFF —
      Snake walks through the craft) and NO hit color-flash (no such mechanism exists in
      the disassembly for enemies; only Snake has the damage color swap)
- [x] 3.5 The jetpack guard draws its REAL SprJetGuard art (stacked pairs + the
      SprShadow ground spot, SprsetPal5 colors) — the Snake-sheet stand-in is gone
- [x] 3.6 Per-enemy weapon damage (idxWeaponPow, weapondamage.asm): the new dmgTable
      override in weaponDamage() — the Hind D's ID-0x26 column is grenade launcher 5,
      everything else 0, so the real fight is 20 grenades (0x64 life); flat WEAPON_DMG
      had let bullets chip it
- [x] 3.7 Aimed enemy bullets (ID_BULLET 0x3D -> DummyLogic2, and the shotgunner's 0x3A)
      have NO tile check in the ROM — ours died on solid tiles, which silently ate most
      jetpack/guard/Hind D shots on tile-heavy rooms; updateBullets no longer stops them
      (MGunKidShotLogic has no tile check either — pillars block Snake, not bullets)
- [x] 3.8 Grenade-vs-Hind D verified end-to-end in the suite (a real lob from below the
      pad, 23 moves of 3px from PlayerY-16, bursting at ground+8 inside the shape-5 box,
      -5 life). The damage window is the LOWER FUSELAGE band (blast y 40..72, x 112..144)
      — bursts on the upper body/cockpit do nothing, in the ROM too
- [x] 3.9 The aimed-shot math is the ROM's (CalcShot2/CalcQuadrantDegree/CalShootSpeed +
      QuadrantDegrees/SinTable from data/maths.asm): the angle is QUANTIZED to 32x32-px
      block deltas — the crate-corner blind spots and the level-shot downward drift are
      back; all aimed shooters (guards/jetpacks/Hind D/Big Boss) and the scorpion charge
      route through calcShot() now (the exact-vector aim was a divergence)
- [x] 3.10 The death runs BossDefeatedLogic's 3-phase 0x10-iteration explosion
      (BossExplosion1/2/3: SprExplosionB+S fireballs in yellow/red with the white core,
      then the white flash block) before the wreck — exported explosion-b/-b-w/-s.png
- [x] 3.11 Room 117's jump edge (door 0x91, type 20) enters through DoorOpenEnterDat
      row 20's tall strip (X, Y-16, 8x64) — the default 16x16 footprint missed most of
      the dark edge, so the fall never triggered
