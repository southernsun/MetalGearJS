# The roof traversal — bridges, the parachute, the air flow, jetpacks, sentinels

## Why

The roof (37-53) is the ROM's most mechanically novel region: moving walkways over a
chasm, falls that drop THREE STORIES back into the starting yards, a wind that blocks
passage without the bomb blast suit, a jetpack guard who electrifies the floor mid-scene,
and stationary look-cycling sentinels. None of it existed.

## What Changes

- BRIDGES (BridgeLogic, rooms 45/46): eight walkway segments sweeping at per-index speeds
  (BridgesSpeeds 0x40..0x100/256 px per iteration), all reversing every 0x20 iterations;
  touching one only sets the isOnBridge flag (SetOnBridge — the ROM never carries
  Snake); over the chasm tiles (tile 1) with no
  segment underfoot = the fall (ChkOnBridge). bridge.png export.
- THE FALL CHAIN (ChkParachute/NextParachuteRoom/SetLandingRoom): the bridge gaps
  (JumpRoomId 1/2) and room 117's roof-jump edge (door 0x91) cut to the brick wall (204)
  WITH the parachute selected — two screens of drifting fall (1px/iteration, the
  TickCounter-bit-4 sway, the SprParachute canopy) landing in room 5/6/10; WITHOUT it,
  FreeFall: Snake lands in the yard dead. The alert stops on the jump.
- THE AIR FLOW (ChkRoofAirFlow/AirFlowLogic, room 53): the wind band (Y 0x50-0x5F,
  X 0x48-0xBF) blows Snake back up 3px/iteration to Y < 0x30 unless the BOMB BLAST SUIT
  is selected — the user-remembered gate.
- THE JETPACK EVENT (jetpack.asm): room 40's guard descends to the wall switch (alarm +
  0x5A reinforcements), flips it with the CLICK — creating the POWER SWITCH actor and
  electrifying the floor — then takes off into the hover (the figure-eight oscillation,
  random-cadence aimed shots, life 2); rooms 44/48's takeoff guards launch the same way.
- SENTINELS (SentinelLogic, rooms 39/69/...): stationary guards cycling their look
  direction through their per-actor list (the path data holds DIRECTION BYTES); the alarm
  transforms them into normal chasers. actors.json classifies them with their dirs.

## Capabilities

### New Capabilities

- `browser-roof`: bridges, the fall chain, the air flow, jetpacks, sentinels.

## Impact

- web/game.js (control modes 4/5 now live), Tools/export-actors.mjs (sentinels/jetpacks/
  bridges), web/assets (bridge/parachute pngs, airflow.wav); roof.headless.mjs (19 checks).
- Divergences: the jetpack guard draws with the guard sheet (its own sprites pending);
  SENTINEL_WAIT approximated at 0x40 iterations.
