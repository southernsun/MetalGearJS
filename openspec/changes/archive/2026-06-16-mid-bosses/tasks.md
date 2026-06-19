# Tasks — the mid-bosses

## 1. ROM survey

- [x] 1.1 tank.asm (the cannon column, the MG fan, the drift), bulldozer.asm (the phase
      push), arnold.asm (watch/dash, Card7Taken), firetropper.asm + flame.asm (the jet),
      DismissActor3/9 (the CARD7 drop, the KO latches), the life/touch tables

## 2. Implementation

- [x] 2.1 game.js midBosses system (per-kind ticks, the shell burst, the crush map, the
      KO latches, the CARD7 drop, the boss music handoffs); the four sprite sheets
- [x] 2.2 Approximations documented: sprite composition best-effort; the flame jet as a
      sweeping arc; the tank shell as a straight drop to Snake's row

## 3. Checks

- [x] 3.1 midbosses.headless.mjs: 19 checks — all suites green
- [ ] 3.2 User batch playtest (end of run)

## 4. Playtest-round fixes (2026-06-12, pre-test)

- [x] 4.1 Per-enemy weapon damage (idxWeaponPow columns): the TANK dies only to LAND
      MINES (5), the BULLDOZER only to GRENADES (5), the ARNOLDS only to ROCKETS (10);
      the Fire Trooper keeps the defaults — flat damage had let any weapon chip them
- [x] 4.2 Deaths run the ROM explosion: tank/dozer through BossDefeatedLogic's
      0x10-iteration 3-phase blast, Arnolds/Fire Trooper through the small
      ExplosionAnim frames (suite kills wait out the sequence; 22 checks)
- [x] 4.3 Tank composition + position: the 3x3 pair block (Tank1/2 on SprOffsets6,
      offY -48..-16, offX -24..+8, treads animating) at the REAL actor spot
      (ActorsRoom067: 0x90,0x10 — it emerges from the top); colors ActorSprColors5
      0x0B/CC 0x0C under SprsetPal13 = teal #244949 + gray; shot/expl shapes row 3
- [x] 4.4 Bulldozer composition + position: the 3x3 pair block CENTERED (+-24) at
      (0x70, 0x20) (ActorsRoom071); colors SprsetPal14 navy #242449 + gray
- [x] 4.5 Arnolds: the 2x2 pair block (SprOffsets9: y-32..0, x+-16) with the SPLIT
      colors (ActorSprColors10: blue #002449/tan torso, olive #496D24/tan legs — two
      sheets) at the REAL spots (both x 0x80, rows 0x2C/0xB2); facing/step frame map
      from ArnoldLeft/Right1/2; shapes Project 0 / Expl 1
- [x] 4.6 Arnolds complete ArnoldLogic: chase re-aims on the random wait; losing the
      row WALKS him BACK to x 0x80 (SetWalkSpeed 2px) where he RESTS in watch; ANY
      weapon hit (TOUCH_INFO is set before the damage lookup, so 0-damage hits count)
      BOUNCES him +-2 away from the player for weaponId+3 iterations with shots
      disabled (ArnoldBounceBack; the new t.hitBy hook at every damage site)
- [x] 4.7 Aimed-bullet tile rules split by dispatch class: guard bullets (0x2F) and
      shooter/suppressor/Big Boss bullets (0x3B) run BulletLogic — tile-checked with
      the railing pass and the two-rows-down double probe; jetpack/Hind D/lorry-shooter
      (0x3D), tank (0x3E), sgunner (0x3A) and MGK (0x3C) fly through walls (DummyLogic2
      — including the tank: its MG fire passing the mounds is ORIGINAL)
- [x] 4.8 The tank's bullets/shells fall at the ROM speed (TankShotLogic/
      InitTankShellBoss SpeedY 6/iteration — was 2.5): the fast fall keeps the MG fan
      cone narrow, restoring the BOTTOM-CORNER SAFE SPOTS (the fixed-X tank at 0x90,
      guns +-16, fan +-2/iter can't reach past ~x78-210 worst case); Arnold's walk-back
      is DirectionSpeeds 1px/iteration (was 2)
- [x] 4.9 Fire Trooper: WHITE (SprsetPal16 slot 2 = 77h,7) + tan; the REAL 6-status
      routine (firetropper.asm): walk toward the player CLAMPED to X 0x60..0x80, plant,
      EXTEND the 8-flame ray straight down (FT_ThrowFlames), SWEEP it as a pendulum
      (ANGLE 0x18..0x3F, DELTA +-4, sin/16-cos/16 steps, FLAME_MOV_ID sign cycle),
      retract one flame per iteration, repeat — replaces the invented stalk-and-arc;
      head/legs pairs at the SprOffsets3/4 offsets (y-11/y+4); at the REAL spot
      (ActorsRoom095: 0x70,0x20 — was 32px low); flames are the REAL Fire1/Fire2 pairs
      with SetFlameSprColor's A=8/C=46h = RED + CC YELLOW with the white core
