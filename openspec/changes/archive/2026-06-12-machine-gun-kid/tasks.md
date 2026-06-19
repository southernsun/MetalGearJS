## 1. Lookups

- [x] 1.1 MachGunKidLogic's 5 states + MachGunStatus latches + SetBossMusic ("Mercenary"
      0x3E) + the shot (speedY 5, fan (dÃ—0x40âˆ’0x80)/256, SFX 5 = Sfx_BulletShot â€” the
      guard-shot mapping confirmed) + tables (life 0x14, bullet damage 8, weapon damage =
      the guard column, explosion shape 0x1B) + sprites (SprMGunKid pairs, SprsetPal11)

## 2. Exports

- [x] 2.1 `--export-mgk` â†’ mgk.png/mgk.json (fire/recoil/walk1/walk2, 16x32, brown/tan)
- [x] 2.2 mercenary.wav (the new Music fallback in `--export-sfx`, 12s loop) +
      bullet-shot.wav (SFX 5 â€” also replaces the guard-shot synth stand-in)

## 3. game.js

- [x] 3.1 The boss object + bossTick (iteration-paced 5-state port: intro/text 79
      once/music; think with the same-column wait; Â±4 walks clamped 0x20-0xE0; the 0x28
      shoot window with the Â±0x30 arc, a bullet every 4th iteration cycling the 0..4..0
      fan with the recoil frame; hide; repeat)
- [x] 3.2 Bullets carry per-bullet damage (his = 8); pillar tile-collision gives the
      cover game; playShot now uses the decoded SFX 5
- [x] 3.3 shotTarget includes the boss (projectile shape 0 / his explosion shape 0x1B);
      death at 0 life: SFX 0x16, music stop, mgkDead latch (never respawns)
- [x] 3.4 Porting fix surfaced by the suite: contact-triggered explosions (rocket/mine/
      missile) do NOT double-hit â€” only grenade/bomb open the one-iteration blast window
      (RocketExplode/MineExplode clear KILL_BY_CONTACT)

## 4. Checks + docs

- [x] 4.1 web/mgk.headless.mjs: 18 checks (spawn/life, the once-only unskippable speech,
      the slide distances, the same-column wait vs break-cover, the shoot cadence/fan/
      damage, the arc exit, the X limits, handgun/rocket damage, the permanent death)
- [x] 4.2 All 15 suites green (370 checks); SESSION-STATE; coverage map + regenerate

## 5. The Shotgunner (extended into this change)

- [x] 5.1 ShotGunnerLogic read (room 57 â€” on the prison-escape route, already exported):
      intro text 61 + boss music; INVULNERABLE rolls toward the player (Â±4/iteration,
      COLLISION_CFG 0, wall or 0x0B timer); the 0x2D standing window firing an AIMED
      blast every 16th iteration (CalcShot2 speed 0x90 = the guard-bullet rate, SFX 0x0F,
      8 damage, the 3-frame expanding 4-pellet visual); the crate-corner hold-fire zone
      (PlayerY >= 166 AND PlayerX >= 170); life 0x14; standing touch 4; ShotGunnerStat
      bit 0 permanent death (DismissActor8)
- [x] 5.2 `--export-sgunner` â†’ sgunner.png/json (stand + 3 rolls 16x32 in SprsetPal10
      dark-blue/tan + 3 pellet frames) + shotgun.wav ("Shotgunner shot")
- [x] 5.3 game.js: the boss object grew `kind` (mgk/sg) + `inv`; sgTick (the 3-state
      port); shotTarget skips the invulnerable roll; the blast = an aimed guard-pool
      bullet with the expanding pellet draw (4 copies spreading, offsets approximated);
      drawBoss/death latch dispatch by kind
- [x] 5.4 mgk.headless.mjs grew 10 Shotgunner checks (spawn, the once-only speech,
      invulnerable rolls + pass-through shots, the standing window, the 16-iteration
      blast cadence + aim + damage, the crate-corner hold, standing vulnerability,
      permanent death) â€” 28 total; all 15 suites green (386 checks)

## 6. Playtest

- [x] 6.1 USER PLAYTEST CONFIRMED (2026-06-11): the SHOTGUNNER (room 57, via the
      capture escape) — speech/boss music, invulnerable rolls, the standing blasts,
      weapon damage, the permanent death latch
- [x] 6.2 USER PLAYTEST CONFIRMED (2026-06-11): Machine Gun Kid (room 20 — the user initially fought the
      Shotgunner believing it was MGK)

