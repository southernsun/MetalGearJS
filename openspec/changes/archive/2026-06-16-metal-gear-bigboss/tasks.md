# Tasks — Metal Gear + Big Boss

## 1. Survey + implementation

- [x] 1.1 damagetoenemy.asm:166-246 (the shift buffer + PlasticBombOrder + the camera
      kill), ChkBigBossDoor + the OpenBigBossDoor setters (BossDefeatedLogic + the Big
      Boss dismiss), bigboss.asm (the confession + the hit-and-run states), the tile
      blocks (MetalGearTileMap/2 exported via ExportTileBlock)
- [x] 1.2 game.js: the bomb-order mechanic in explodeShot, lock 14, the two bosses;
      approximations documented (the crate-cover AI as flee/align/drift; the guard sheet
      for Big Boss pending SprBigBoss)

## 2. Checks

- [x] 2.1 metalgear.headless.mjs: 13 checks — all suites green
- [ ] 2.2 User batch playtest (end of run)

## 3. Playtest fixes (2026-06-12)

- [x] 3.1 MG_BOMB_ORDER is the PlasticBombOrder bytes VERBATIM
      ([2,2,1,2,1,2,2,1,1,2,1,1,2,1,2,2] newest-first; play order
      R,R,L,R,L,L,R,L,L,R,R,L,R,L,R,R) — the PLAY order had been transcribed into the
      stored slot (two slots differed), which would fail the authentic sequence
- [x] 3.2 The body sits at ChkDrawMetalGear's DE=6020h -> (0x60, 0x20) — was 24px high,
      breaking the background seam
- [x] 3.3 The body CARRIES ITS COLLISION like the ROM (DrawTileBlkTimp writes the tiles
      into the room map): MG_SOLID/MG_SOLID_BG = CollTilesMetalGear applied to
      MetalGearTileMap/TileMap2 over tile rect (12,4)-(19,15), reapplied on entry and on
      destruction (the wreck keeps only the back-wall rows)
- [x] 3.4 Area music follows the RoomsMusic high nibble (SetAreaMusic6): Theme of Tara /
      Sneaking Mission / TX-55 METAL GEAR (room 118 + the final ladders) / Beyond Big
      Boss (rooms 88-92, 186-187) — exported sneaking/tx55/escape.wav via the music
      renderer; DestructionTimerOn forces Beyond Big Boss EVERYWHERE during the countdown
- [x] 3.5 The camera laser draws from the CameraLaser attr offsets: the beam starts at
      the camera's BOTTOM EDGE (offY +8) and reaches at most +0x8F+16 — not from the
      camera's centre
- [x] 3.6 The doors open THEMSELVES: BossDefeatedLogic writes DoorOpenArray+62h=0 (door
      99, 118<->119) at Metal Gear's death and the Big Boss dismissal writes +6Ah=0
      (door 107, the ladders) — ported as forceOpenDoor()/openedDoorIds (persistent,
      pre-opened on rebuild); the one-shot ChkBigBossDoor flag stays as fallback
- [x] 3.7 The destruction music: DestructionTimerOn is set BEFORE the music re-tune and
      the stray stopAreaMusic is gone — Beyond Big Boss now takes over at the blast
      (and everywhere after, per SetAreaMusic6)
- [x] 3.8 The laser cameras sweep back and forth NONSTOP (UpdateActorPath turns them
      straight around) — the shared camPatrol had given them the normal cameras' random
      0-255-iteration stand at each path end (the "stuck opposite camera")
- [x] 3.9 The escape door 0x6B (107, room 119 -> the ladders 224) now enters via
      SetLadderRoomEntry's ladder-walk (mode 6, X 0xD8, Y 0x9E, facing left) instead of
      generic enterDoor centring — LocatePlayerEntry routes IdDoorEnter 0x6B there
      (nextroom.asm:307,581). It had only been reachable from the ?room=224 dev hook, so
      the real finale exit left Snake in NORMAL control on the ladder room. (metalgear
      headless +1 check.)

## 4. Audit-gap fixes (2026-06-14) — the four remaining Test 7 coverage gaps

- [x] 4.1 MetalGear_KO door lockout (ChkDoors, enterdoor.asm:31-39): canOpenDoor refuses
      door 0x62 (the CARD1 door before Metal Gear) once the self-destruct is running
      (destructionOn) — Snake can't go back. Keyed on the door ID exactly like the ROM.
- [x] 4.2 InitCameraLaser room-118 dismissal (camera.asm:7-14): buildCameras drops the
      laser cameras in room 118 once Metal Gear is destroyed (mgDestroyed) — they no longer
      re-init / keep firing on re-entry.
- [x] 4.3 Hidden doors (ChkEnterDoor, enterdoor.asm:64-70): maybeEnterDoor skips the two
      ROM "(?!)" doors wired to room 204 — 0x40 (room 6) and 0x6C (room 5) — so Snake walks
      over them harmlessly instead of warping to the parachute room.
- [x] 4.4 Lock-16 basement BOMB walls — graphic + footprint: RoomViewer ExportDoorGfx now
      exports wall-7..wall-19.png from the TilesBasemWall*/TilesWallBld3_108 tile tables
      (drawdoors.asm dispatch + data/doors.asm:923-1082); door-gfx.json + doorCollRect carry
      the per-type footprints; closedWallSolid() makes a closed breakable wall (render types
      7-19) SOLID until bombed/punched (was invisible + walk-through). `--export-doors` now
      also writes the door/wall PNGs + door-gfx.json. Divergence: one PNG per render type, so
      a type shared by two rooms with different tilesets (9: 59/96, 17: 93/169, 8: 61/115)
      uses the namesake room's tiles. (metalgear headless +5, doors headless +4.)

## 5. Playtest fixes round 2 (2026-06-14) — the finale walkthrough

- [x] 5.1 Door entry resets control mode (SetPlayerInDoor, nextroom.asm:393-395): enterDoor's
      generic path now sets controlMod=NORMAL + anim=NORMAL. A special mode (ladder-walk) was
      persisting through a door — stepping from the escape ladders (224) back through door 107
      into Big Boss room 119 left Snake free-walking across the screen, no longer climbing.
      Water/air-flow re-engage from the tile under Snake. (Reported in playtest step 6.)
- [x] 5.2 Big Boss rewritten to the real 6-state corridor AI (bigboss.asm BigBossLogic): spawns
      at ActorsRoom119 (0x30,0x38); circles the corridor track (vertical X 24/200, horizontal
      Y 56/168), hides at the crate cover spots (X 0x30/0x70/0xB0, Y 0x58/0x98), runs away when
      Snake closes within 0x48, pops out from cover to shoot when aligned within 0x30. Replaces
      the old flee/drift/aimed-shot approximation. (Reported: "incorrect walk routine.")
- [x] 5.3 Big Boss fires STRAIGHT axis bullets (BB_Shoot -> ID_BULLET_HORIZ/VERT via
      AddEnemyShot2), aimed down the corridor at Snake — not the aimed diagonal guard shot
      (fireGuardBullet). Tile-checked (the 0x3B BulletLogic class). (Reported: "wrong
      ammunition.") (metalgear headless Big Boss checks updated: spawn, corridor run, axis bullet.)

## 6. STILL OPEN from playtest round 2 (need your call)

- [x] 6.1 Big Boss SPRITES: now his REAL SprBigBoss frames. Added MetalGearSpriteMover
      `--export-bigboss` (WebExporter.ExportBigBoss): SprBigBoss decodes to 24 sprites (base
      pattern 0x60 -> idx (P-0x60)/4), composed as top OR-pair over legs OR-pair (16x32) per
      the BigBoss<Dir><1|2> attr records (actorspriteattr.asm:202-209); colours = ActorSprColors3
      (idxActorSprCols[ID_BIG_BOSS=0x20] = indices 2/0x0D/0x0F, the uniform/face/outline palette).
      Exported bigboss.png (128x32, 8 frames) + bigboss.json; game.js loads them and drawBigBoss
      uses them (anim bit 1 toggles walk1/walk2, BigBossSetSpr), guard-sheet fallback kept.
      NEEDS VISUAL CHECK: the palette is the ROM color-index default; tune if it looks off.
- [ ] 6.2 The ending (GS_Ending cinematics) is out of scope — the escape banner stands in, so
      reaching the top of the ladders has "no end" as reported. Documented divergence.
- [ ] 6.3 Step 2 "a call after the explosion": BossDefeatedLogic fires NO automatic call (only
      SFX 0x53 + the countdown + the door open). Room 119 has radio messages (texts 148/149)
      reachable by TUNING the transceiver (R). Please confirm that's what you remember.
