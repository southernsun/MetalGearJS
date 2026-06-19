# Tasks — intro scene

## 1. ROM survey

- [x] 1.1 logic/introscene.asm read end-to-end: the 13 IntroScene states, counts
      0x40/0x30/0x50/0x20/0x40 (call at 0x20)/LED climb/text 2/0x28/0x30/0x1C/0x0C, the
      Y snaps 0x88 (speed 0x0188, animation 5) and 0x66, BounceOffsets
- [x] 1.2 Init verified (Banks0123.asm:8422-8438): room 121, (0xC0,0xB8), animation 4,
      CONTROL_INTRO, speed 0x100, counter 0x40; IntroScene ends into ChkSaveGameStatus
- [x] 1.3 Room 121 collision verified: deep water 0x74 at the start, the solid fence band
      rows 0x68-0x80 the scripted snaps cross; text 2 verified in texts.json

## 2. Implementation

- [x] 2.1 startIntro() from titleStartGame(); the 13-state introTick(); INTRO_BOUNCE table
- [x] 2.2 Wiring: update() dispatch, the radio overlay via introRadio (text 2 prints over
      the radio UI), the DrawCallTimer ring cadence, input dropped during the intro
- [x] 2.3 restart() respawns at the intro checkpoint in room 121 (ChkSaveGameStatus);
      dev hooks (?room/#auto/?capture) still bypass title+intro

## 3. Checks

- [x] 3.1 title.headless.mjs: 12 intro checks (start state, both dives, the call at cnt
      0x20, the radio + 12 LEDs + text 2, the exit, the climb snaps 0x88/0x66, the hop,
      the play handoff + checkpoint, the respawn) — 23/23; all 16 suites green

- [x] 3.2 USER PLAYTEST CONFIRMED (2026-06-11): title -> PLAY START -> black beat with
      music -> swim -> double-ring call -> radio briefing -> fence climb -> play handoff

## 4. Playtest fixes (user-verified against the original)

- [x] 4.1 Pacing: introTick gated to the ROM iteration boundary (~30Hz) — the literal
      per-iteration counts/speeds (0x100/0x200/0x188) ran 2x fast at 60Hz ("moves very
      quickly through the water"); swim/climb stroke animation compensated (WALK_TICKS/2)
- [x] 4.2 Radio LEDs: DrawRadioLeds fills in PAIRS — each 8x8 tile holds two LED bars
      ("ON ON" tile 0x43 / "ON OFF" 0x42 / "OFF OFF" 0x41, each drawn on both display
      rows); the exporter had only the half-lit tile as led-on.png ("not all lights light
      up in red") — led-on/led-half re-exported, drawRadioScreen ports the column logic
- [x] 4.3 Font: AsmParser now handles IF (JAPANESE)/ELSE/ENDIF (Western branch) — both
      branches were collected, shifting every glyph after '?' by two tiles: the period
      printed as the Japanese CENTERED dot (user: "dots hovering in the middle") and the
      apostrophe glyph was a shifted kana tile ("ENEMY'S" wrong); font.png re-exported
- [x] 4.4 Text speed: TW_PrintChar3's mask 3 applies at the FULL tick rate (text mode
      replaces the play logic, so the ROM's TickInProgress halving doesn't bite) —
      ~15 chars/s, was 7.5 ("printed faster in the original"); text/rank suites updated
- [x] 4.5 Music: the game start brings up "Theme of Tara (intro)" (RoomsMusic nibble 0 for
      room 121; Mus_IntroTara lead-in + loop, 76s render via the new --export-sfx seconds
      arg → tara.wav); the radio pauses it (IntroScene5b/DrawRadio 0x59 + RestoreSoundData,
      resumed on ExitRadio), the alert/boss/death tracks replace it, restart re-enters with
      it. Divergences: the browser loop seam re-plays the lead-in, and the radio resume
      restarts the track (the ROM driver resumes the saved position)
- [x] 4.6 GS_PlayStart (Banks0123.asm:10270): Fire on the title first blinks
      "  PLAY START" at (0x48,0x88) — replacing PUSH SPACE KEY, WaitCounter bit 2 as the
      draw/erase phase — for 0x50 iterations with keys inert (ChkAnykeyStart is only
      pipelined while GameStatus < 3); then the intro begins (user-reported)
- [x] 4.7 InitGame (Banks0123.asm:11775-11780): the fresh start carries CIGARETTES,
      selected (CigarsTaken/units 1) — granted in startIntro so dev-hook boots and the
      empty-start item suites stay as they are (user-reported)
- [x] 4.8 The CALL ring (user-reported: chopped + louder than other sounds): playCallRing
      now follows SetSoundEntryChk (DrawCallTimer, logic/hud.asm:45) — a burst still
      playing is never cut and restarted; and call.wav re-exported ROM-RELATIVE via the
      new `--export-sfx-rel "<name>" "<ref>"` (per-file 0.9 normalization had boosted the
      ring ~4x — its raw PSG peak is 0.226 of the handgun's; other SFX can be re-balanced
      the same way if flagged)
- [x] 4.9 GS_StartGame's black beat (user-reported): InitGame starts the music while the
      screen is still ClearScreen-black; the shore appears after the screen-off load —
      intro status -1 (0x20 iterations, draw = plain black, no HUD). And the FIRST ring is
      IMMEDIATE (IntroScene5 `jp SetSoundEntry__` with 0x22 at cnt 0x20 — dropped earlier
      by mistake), so the cadence now yields the original's double ring before the answer
- [x] 4.10 HUD DrawRect off-by-one (user-reported: a black line inside the LIFE bar +
      CLASS touching the box): the ROM's DrawRect(X,Y,NX,NY) covers EXACTLY NX x NY pixels;
      canvas strokeRect needs w-1/h-1 — drawHudBox fixed for every box (life/weapon/item/
      menus/text window; the text window's compensating wnx-1 callsite reverted), and the
      6-row red fill now exactly fills the life box interior (rows 194-199 inside 193-200)
- [x] 4.11 Audio gate (user-reported: the swoop SFX missing/broken at boot): the autoplay
      policy blocks audio until a gesture, and the swoop fires ~3s into the auto-boot —
      the boot now waits behind the #gate splash ("press any key to start"); the gesture
      unlocks the AudioContext AND decodes all buffers BEFORE the Konami reveal begins.
      Dev hooks (?room/#auto/?capture) still boot instantly with gesture-joined audio;
      a #hash edit on an open page now reloads (fragment navigation never re-ran main())
- [x] 4.12 Default-open doors (user-reported: doors drawn on the room-5 lorries):
      IdDoorsLogic bits 7-6 == 10b = the door STARTS OPEN (SetDefaultDoorLock) — never
      drawn, walked straight through; the exporter now emits "open":true (41 doors:
      the lorry backs, through-ways) and buildDoors honors it
- [x] 4.13 Shot pacing (user-reported: rockets + missiles flying too fast):
      PlayerShotsLogic runs per ROM iteration — updatePlayerShots/ChkSMGShot gated to the
      30Hz boundary with the literal ROM values (speeds ±6/±5/±4/±3, bullet range 0x10,
      grenade fuse 0x18, bomb fuse 0x30, explosion 0x0F — the doubled x2 constants
      reverted); halves every projectile speed and restores the real fuse durations
- [x] 4.14 Grenade-launcher crosshair (user-reported missing): SetGrenaTargetSpr
      (Banks0123.asm:9937) ported — the white target sprite (SprGrenade's 3rd sprite,
      pattern 0x18, exported as shots.png "target") at the TargetXYOffsets per facing,
      hidden in box mode / room 204 / rooms >= 224 / near the throw's room edge
- [x] 4.15 Shot tile collision (user-reported: missiles exploding instantly when fired
      sideways from under a wall): the ROM detonates/removes a shot only when BOTH rows
      (sprite Y and ground Y_Alt) hit, probing shape-2 LEADING-EDGE points in the travel
      direction (ChkShotCollision/A + BoxColliderDat size 2) — ported for rockets,
      missiles AND bullets (PlayerBulletLogic uses the identical pattern; bullets now
      carry yAlt/dir); the old point-test OR also made bullets vanish under overhangs.
      Grenades (no tile collision) and bombs/mines (stationary) were already faithful
