# Lasers: the infrared beam corridors, the goggles, and the laser cameras

## Why

The laser corridors and the wall cameras are Metal Gear's signature stealth hazards, and the
disassembly specifies both completely. Beams: rooms 24/25/72 carry beam tables
(`LasersRoom24/25/72`, data/laserconfig.asm), the beams are INVISIBLE unless the infrared
goggles are the selected item (`DrawLaserBeams`, logic/drawlaserbeams.asm:8-14), touching one
— seen or unseen — raises the RED alert (`SetAlertMode5` treats ID_LASER like cameras) and
burns the room's beams away, none spawn during an alert, and room 72's beams cycle through
five ON/OFF patterns. Cameras (per the user's request — the wall-mounted kind that send red
beams and damage you): surveillance cameras (`ID_CAMERA`, CameraLogic) patrol path points and
raise the RED alert on sight — LIVE in exported rooms 14 and 31 (31 = the elevator's top
floor); laser cameras (`ID_CAMERA_LASER`, LaserCameraLogic) patrol the ceiling and fire a
damaging laser shot straight down when Snake passes underneath (`ID_LASER_SHOT`,
lasershot.asm + damagelaser.asm — 0x10 damage).

## What Changes

- **Exports**: rooms 20/22/24/25 (the corridor chain) + 111 (the laser-camera basement) as
  `?room=` islands — the chain hangs off room 16, which is NOT in the exported cluster, so
  none are on-foot reachable yet; `Tools/export-lasers.mjs` → `lasers.json` (beams + the five
  sequences) AND `cameras.json` (RoomsWithCamera/CamDirs facings, actor positions, ROM patrol
  paths from idxRoomPaths); `--export-camera` in MetalGearSpriteMover → camera.png (SprCamera
  4 facings × normal-blue/flash-red); laser.wav (SFX 4 "Laser shot").
- **Beams**: spawn per `InitLaserRoom` (never during an alert), trip per `ChkTouchLaser`'s
  exact math (RED alert + `RemoveLaserBeans`), draw only with the goggles selected (2px red
  lines — the ROM's dotted tile art approximated), cycle in room 72 per `DrawMovingLasers`
  (0xC0-iteration steps, only while watched, dormant until 72 exports).
- **Surveillance cameras**: ROM path patrols with random point waits (the R register),
  `ChkSeePlayer` from the lens offset (`CameraDrawOffsets`), red flash 0x20 iterations on
  sighting + the RED alert, frozen during alerts (`RenderCamera`). Live in rooms 14/31.
- **Laser cameras + shots**: X patrols; fire when Snake passes under (PlayerY ≥ camY,
  |dx| ≤ 4); the shot grows one 16px segment per iteration (11 max, 3 visual in room 111),
  damages 0x10 through the standard damage path, shrinks away; the camera shadows Snake's X
  within 0x60 then resumes (`CameraChkContinue`).
- **The goggles**: pickup 12 → equipment 4, placed as a DEMO item in room 2 (the established
  divergence) + a `?goggles` dev hook (grant + select) for the island rooms.

## Capabilities

### New Capabilities

- `browser-lasers`: the beams (spawn/visibility/touch/removal/cycling) and the cameras
  (patrol/sight/flash/freeze + the laser-camera firing and damage).

### Modified Capabilities

(none — alerts ride browser-guard-alarm's raiseAlarm with the new forced-RED variant the
ROM specifies for cameras/lasers; the goggles ride the item-selection system)

## Impact

- `web/game.js`: lasers + cameras + laser shots state/logic/draw; goggles; `raiseAlarm`
  grows a forceRed param (SetAlertMode5).
- Tools: export-lasers.mjs (new), --export-camera (new), rooms `--extra` + 20/22/24/25/111.
- New `web/lasers.headless.mjs` (21 checks); SESSION-STATE, rom-data-formats.md,
  rom-coverage.
