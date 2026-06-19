## 1. Exports

- [x] 1.1 `Tools/export-lasers.mjs`: data/laserconfig.asm → lasers.json (beams on/y/x/len/axis
      + the five LasersOnOff sequences) AND cameras.json (RoomsWithCamera/CamDirs facings
      [cpir index verified: room 14→CamDirs7 ... 149→CamDirs1], actor positions from
      data/actorsinrooms.asm [dw = Y low byte, X high — confirmed against the path
      columns/rows], ROM patrols from idxRoomPaths)
- [x] 1.2 Rooms 20/22/24/25 + 111 exported via `--extra` — they hang off room 16, which is
      NOT in the cluster, so they are `?room=` islands (the proposal's on-foot claim
      corrected); `--export-camera` → camera.png (SprCamera 4 facings × blue/red);
      laser.wav (SFX 4 "Laser shot")

## 2. game.js

- [x] 2.1 Beams: buildLasers on room entry (none during an alert), goggles demo pickup
      (id 12, room 2) + `?goggles` hook, SELECTED_GOGGLES = 4
- [x] 2.2 chkTouchLasers every play frame (the exact ChkTouchLaser inequalities, ON beams
      only): trip → RED alert (raiseAlarm grew a forceRed param per SetAlertMode5) +
      all beams removed
- [x] 2.3 drawLasers: goggles-selected + no alert only; 2px red lines on the ROM geometry
- [x] 2.4 movingLasersTick: room 72 + goggles only; 0xC0 timer cycling the five patterns
      (status + collision); LaserRoomCnt persists
- [x] 2.5 Cameras: buildCameras (positions/facings/paths), camPatrol (1px/iteration, random
      0-255 point waits per `ld a,r`), camSees (the guard LOS rules from the
      CameraDrawOffsets lens), sight → 0x20 red flash + RED alert → frozen; no
      movement/scan during alerts; drawn from camera.png (red frame on bit 2 of the
      flash countdown)
- [x] 2.6 Laser cameras: X patrol; fire when passed under (LaserCamChkShot ranges); the
      shot grows 1×16px segment per iteration (11 max / 3 in room 111), damages 0x10 via
      the ChkLaserShot LaserLenghts span through the normal damage path, shrinks away;
      0x20 refire wait; X-shadowing within 0x60 (CameraChkContinue) else patrol resume;
      SFX 4 on fire

## 3. Checks + docs

- [x] 3.1 web/lasers.headless.mjs: 21 checks — beam spawn/alert-suppression/restore,
      goggles-gated drawing, the strict-< touch math, RED alert + burn, the room-72 cycle
      (gated + pattern application), camera spawn (room 31), patrol step, sight→flash→
      freeze, laser-camera spawn (room 111), under-pass firing, shot growth + 0x10 damage,
      out-of-reach patrol resume, the full shot lifecycle
- [x] 3.2 All 14 suites green (326 checks); SESSION-STATE (shipped entry, hooks, exports,
      divergences, gaps); rom-data-formats.md lasers+cameras section; coverage map +
      rom-coverage regenerated

## 4. Playtest fix (user-reported, post-archive)

- [x] 4.1 "Room 31's cameras have the wrong colour and the left one should be rotated":
      SprCamera is EIGHT sprites — four facings x two OR-layers (CameraUp/Down/Left/Right,
      data/actorspriteattr.asm:335-338, pairs (2d, 2d+1)) — but the export had treated it as
      four single-layer sprites, so facing "right" actually drew down-layer-B (the rotation
      bug) and everything was a flat blue. Re-exported as OR-combined pairs in the camera
      rooms' real sprite palette (SprsetPal2 via set 22 SprSetCamGuard: layer A dark grey
      22h/2, layer B tan 42h/3, overlap black 0x0F; the flash row = dark red 50h/0 on both
      layers per CamAlertAnim's 44Bh)
- [x] 4.2 "Shouldn't the palette be grey when wearing the goggles?" — yes (missed feature):
      ChkGogglesPal (Banks0123.asm:2967) loads RoomPalette10 whenever the goggles are the
      selected item, in EVERY room — the per-room tile slots 1/3/5/9 go grey/black while
      the fixed slots, sprites and items keep their colours (and SetRoomPal re-applies on
      menu close :11915, so the swap is immediate). Each room now exports a
      <n>.goggles.png variant rendered with that palette block; draw() picks it while the
      goggles are selected; door/wall sprites grey via a grayscale filter (ramp
      approximation). The red laser emitters (fixed slot 8) stay red on the grey rooms —
      the ROM's infrared look
- [x] 4.3 "The lasers go a bit too far, overlapping walls": the draw had borrowed
      ChkTouchLaser's +8 (that offset is the COLLISION band only — PlayerY is the foot
      origin) and used a 2px line. The ROM's DrawLaserBeams3 issues a 1px VDP LINE from the
      beam's exact (X, Y) for len pixels (DrawLineVert/Horiz, N = len-1, no offset) — now
      drawn exactly so; the laser-camera shot is 1px too (SprLaser is a 1px column pattern)
- [x] 4.4 "Room 111: the turret beams should be bigger, and the camera moves too far
      right": both real. (a) SprLaser RLE-decodes to a 2px column through the sprite
      centre (rows of 0x01|0x80 — pixels at cell x 7-8), so the shot is 2px centred on the
      camera X, not 1px. (b) CameraChkContinue moves toward ACTOR.DestinationX — the
      camera's own PATH point, not the player; the earlier "X-shadowing" reading was
      wrong, which let our camera chase Snake beyond its patrol span. Status 1 now keeps
      patrolling the path (deterministic 1px steps + ping-pong), pausing at the checkpoint
      columns (the data after LaserCameraShot9: idx 1 -> 0x10/0x58, idx 2 -> 0xC0/0xF0,
      KO_POINTER_H) and while the player stands at its exact X; |dx| >= 0x60 re-inits the
      path (InitCamera3). Suite grew the path-not-player and exact-X-hold checks (23)
