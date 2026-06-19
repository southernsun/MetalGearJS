# Design — laser beams + cameras

(Scope grew mid-change at the user's request: "lasers" also means the wall-mounted cameras
that fire damaging red beams — `ID_CAMERA_LASER`/`ID_LASER_SHOT` — so both camera types are
in. The corridor rooms also turned out to hang off room 16, which is NOT in the exported
cluster — they ship as `?room=` islands, not on-foot rooms.)

## Context — cameras (verified)

- **Rooms/facings** (logic/actors/camera.asm:76-120): `RoomsWithCamera` ∋ 14, 21, 27, 28,
  31, 36 (surveillance) and 111, 115, 118, 149 (laser type, by actor ID); the cpir leaves
  index c so room 14 → `CamDirs7` [right,left,left], room 31 → `CamDirs3` [right,up], room
  111 → `CamDirs1` [down,down]. Rooms 14 and 31 are exported (31 = the elevator top floor).
- **Patrols**: `GetPathPoints` (Banks0123.asm:6924) — `idxRoomPaths[room]` → per-actor
  pointer → count + (Y,X) points; cameras step 1px/iteration toward the point and wait a
  random (`ld a,r`) 0-255 iterations at each (CamMoveWait).
- **Sight** (`CamameraMove`): `ChkSeePlayer` from the lens (`CameraDrawOffsets`: up −12,
  down +43, left −17, right +16), skipped entirely during alerts; on sight: stop, 0x20
  iterations of red flashing (`CamAlertAnim`, red on bit 2), and the alert rises with the
  RED music (`SetAlertMode5` — ID_CAMERA and ID_LASER both force red); then frozen
  (`RenderCamera`).
- **Laser cameras** (`LaserCameraLogic`): X-only patrols pointing down; `LaserCamChkShot`
  fires when PlayerY ≥ camY and camX ∈ (playerX−4, playerX+4]: LASER_WAIT 0x20, the camera
  stops, `AddEnemy ID_LASER_SHOT` at the camera, SFX 4. After the wait: refire if still
  under; |dx| ≥ 0x60 → re-init the path and resume; else shadow the player's X
  (`CameraChkContinue`, speed ±0x100). The room-115 checkpoint sub-behaviour
  (`LaserCameraShot4`'s X list) is NOT ported — only room 111 ships (documented).
- **The shot** (lasershot.asm + damagelaser.asm): SpriteId 0x61 (`SprLaser` — a 1px
  column pattern), grows one 16px segment per iteration to 11 (room 111: NumSprites 3,
  and the hit length caps at 7), then shrinks one per iteration and dismisses. Hit:
  |playerX − shotX| < 8 AND |shotY + half − playerY| < half with half =
  `LaserLenghts[grown−1]`×8 → `TouchPlayer` → 0x10 damage (ActorTouchDamage[0x35],
  data/shapes.asm:39) through the DamageDelayTimer.
- **Sprites/colours**: `SprCamera` (gfx/sprites.asm:594) one 16×16 sprite per facing;
  drawn in colour 2 (SprsetPal0 blue 27h/2) normally, alternating colour 4 while flashing
  (the asm comment calls it red; exported as pure red). The laser is palette 8 = 70h/0
  pure red.

## Context — beams (verified)

Verified in the disassembly:

- **Data** (data/laserconfig.asm): per room a count + 7 bytes per beam: `status, Y, X,
  vramDY, vramDX, length, axis`. The VRAM byte-pair is the ROM's name-table draw address —
  irrelevant on canvas. Axis semantics from `ChkTouchLaser`'s math (the asm comments are
  swapped — the CODE is authoritative): axis 0 = a COLUMN beam at X (trips when
  |playerX − X| < 4 and |Y + 8 + len/2 − playerY| < len/2, i.e. spanning Y+8..Y+8+len);
  axis 1 = a ROW beam at Y (|playerY − Y| < 4, spanning X..X+len).
- **Spawn** (`InitLaserRoom`, Banks0123.asm:5653): on entering rooms 24/25/72 the beams are
  added to the actor list; in AlertMode none spawn. Status doubles as the actor's
  collision-enable, so an OFF beam (room 72 has several) neither draws nor trips.
- **Touch** (`ChkTouchLaser` ← ChkTouchEnemies): an ON beam crossing → `TouchLaserAlarm`:
  alert with respawn time 0x5A (`SetAlertModeRespawn`) + `RemoveLaserBeans` (every laser in
  the room dismissed) + background restored. Beams return on later non-alert entry.
- **Visibility** (`DrawLaserBeams`, logic/drawlaserbeams.asm): returns unless
  `SelectedItem == SELECTED_GOGGLES` (4) and no alert — the beams exist and kill your
  cover invisibly without the goggles. The ROM draws 1-tile beam strips into the name
  table; red.
- **Moving lasers** (`DrawMovingLasers`, Banks0123.asm:5785): room 72 ONLY, goggles
  selected ONLY (the cycle itself pauses when not watching!), `LaserRoomTimer` to 0xC0 →
  `LaserRoomCnt` cycles 0..4 → `idxLaserOnOff` row toggles each beam's status (and its
  collision). `LaserRoomCnt` resets at game init (:11527), not per room.
- **The goggles**: equipment 4 (`SELECTED_GOGGLES`), pickup id 12 (`GOGGLES`), icon `i4`
  already on the HUD sheet. A passive selected-item — no consume-on-use.
- Path: 16 → 20 (Machine Gun Kid's room — boss not ported, it's an empty corridor and a
  RoomsNoAlert room) → 22 → 24 → 25 (24's up-neighbour). All plain edge connections.

## Goals / Non-Goals

**Goals:** rooms 24/25 with live, faithful beams; the goggles-gated visibility; the touch
alarm + removal cycle; the full room-72 pattern logic (dormant until that room exports).

**Non-Goals:** Machine Gun Kid (room 20 ships as the empty corridor it is without its
boss); room 72's export; the ROM's dotted beam-tile art (a 2px red line stands in,
documented); laser SHOTS (`ID_LASER_SHOT` — the camera's projectile, a different system).

## Decisions

1. **lasers.json, not hand-typed tables**: `Tools/export-lasers.mjs` parses
   data/laserconfig.asm (count + 7-byte records, the same node-parser pattern as
   export-items) → `{ "24": [{on,y,x,len,axis}...], ..., "seq": [[...] x5] }`.
2. **A dedicated `lasers` array**, not the guard/prisoner actor model — the ROM also
   special-cases lasers everywhere (touch, alert-spawn, removal); `buildLasers(n)` on room
   entry, cleared by the touch alarm.
3. **Touch check placement**: with the other touch checks in the play frame (the ROM runs
   ChkTouchEnemies before doors/items); the ROM's exact inequalities, strict `<`.
4. **The alarm**: `raiseAlarm(currentRoom)` (the existing system); the 0x5A respawn time is
   noted but our single-guard port has no respawn pool — divergence already documented for
   the alarm system.
5. **Draw**: under the sprites, only with goggles selected + no alert: axis 0 → a 2px red
   vertical line at X spanning (Y+8, len); axis 1 → horizontal at Y spanning (X, len).
6. **Rooms via `--extra`**: 20/22/24/25 chain off room 16 — which is NOT in the exported
   cluster (it tops out at 14) — so they and room 111 ship as `?room=` islands like the
   prison pocket, until a cluster expansion reaches room 16.
7. **Goggles demo placement**: room 2 (with the oxygen tank), pickup 12 — the established
   DEMO-item divergence, so the player can actually find them before room 24.

## Risks / Trade-offs

- [Beam visual is a line, not the ROM tile art] → documented; geometry and color match.
- [Room 20 is a boss room shipping empty] → faithful to "no bosses yet"; noted in
  SESSION-STATE gaps.
- [LaserRoomCnt persistence] → module-level like the ROM variable; reset only on restart.
