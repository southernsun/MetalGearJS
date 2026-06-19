# Hazards + alert reinforcements (the user's expansion-run reports)

## Why

Poking at the freshly exported world surfaced six missing ROM systems at once: the gas
rooms' drifting clouds, the rolling barrels (141/153/191/205), the electric floors with
their destructible power switches (37/110/40), camera contact (the "near-wall blind
spot"), the guard variants beyond slow/fast (medium/silencer/alert/red-alert — room 150's
four silencer guards and their suppressor drop), and the big one: ALERT REINFORCEMENTS
(a camera sighting "alerts the surveillance centre" and guards keep arriving).

## What Changes

- Gas clouds (GasLogic): per-room ID_GAS spots cycling hidden (random up to 255
  iterations) -> visible 0x20 with the 2-frame animation; pure ambience. gas.png export.
- Rolling barrels (RollingBarrelLogic): horizontal rolls accelerating ±8/256 px/iter²,
  bouncing between X 56-200 with SFX 0x1D, starting away from the player's side; touch =
  ALL LIFE (ActorTouchDamage 0xFF). barrel.png + barrel-hit.wav exports.
- Electric floor (ChkElectricFloor): per-room tile pairs (16/37/110: 0x60/0x61; 40:
  0x45/0x46; 116: 0x40/0x41), LIVE while the room's switch actor lives (ID_POWER_SWITCH /
  ID_JETPACK_SWITCH); a zap = SFX 0x18 + 2 life + the 8-frame delay; SHOOTING the switch
  (life 2) kills the floor. The live tiles pulse (the ROM's palette fade approximated).
  Rooms 16 (GUARD_SWITCH operator) and 116 (Metal Gear) stay inert for their own slices.
- Camera contact: the camera body has the shape-8 touch box with 0x10 damage — touching
  it zaps AND raises the red alert (ChkSeePlayer's TOUCH_INFO branch), closing the lens's
  near-wall dead zone the user found.
- Reinforcements (ChkRespawnEnemy + data/respawninfo.asm -> respawn.json): while the
  alarm is up and AlertRespawnTimer is armed (the RED alert and every camera sighting arm
  0x28), the room's RespawnInfo spot spawns an ALERTED guard each elapsed timer
  (0x14 + rnd&0xF), capped at 3, never from room 188 on; the alarm end disarms.
- Guard variants in actors.json: ID_GUARD_MEDIUM (0.75 speed), ID_GUARD_SILENCER (slow +
  the room-150 counter: the LAST kill drops the SUPPRESSOR at (0x62,0x24) per
  DismissActor8), ID_GUARD_ALERT/ID_GUARD_REDALERT (spawn chasing).

## Capabilities

### New Capabilities

- `browser-hazards`: gas clouds, barrels, electric floors.
- `browser-reinforcements`: the alert respawn system + guard variants.

## Impact

- web/game.js; Tools (export-respawn.mjs NEW, export-actors.mjs variants/gas/barrels/
  switch); web/assets (gas/barrel/respawn + 2 wavs); hazards.headless.mjs (21 checks).
