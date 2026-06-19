# Tasks — the roof traversal

## 1. ROM survey

- [x] 1.1 bridge.asm + ChkOnBridge (8 segments, per-index speeds, the 0x20 flip, the
      chasm tiles), nextroom.asm ChkParachute/FreeFall/NextParachuteRoom/SetLandingRoom
      (the 204 chain, landings 5/6/10), ChkRoofAirFlow + AirFlowLogic (the room-53 band +
      the bomb suit gate), jetpack.asm (the switch event + the hover), sentinel.asm,
      ParachuteLogic (the sway)

## 2. Implementation

- [x] 2.1 export-actors.mjs: sentinels (with DIRECTION-BYTE lists), jetpacks, bridges;
      bridge.png/parachute.png (the generic exporter); airflow.wav
- [x] 2.2 game.js: control modes 4 (parachute) + 5 (air flow) live; bridges (the
      on-bridge flag + fall), the fall chain (both gates), the jetpack event (descend/
      flip/takeoff/hover/snipe), sentinels in the guard system, the room-117 jump door
      interception

## 3. Checks

- [x] 3.1 roof.headless.mjs: 19 checks — all suites green
- [ ] 3.2 User batch playtest (end of run)

## 4. Playtest fixes (2026-06-12)

- [x] 4.1 Bridges are 32x16: sprite 0x35 = TWO 16x16 singles at (-16,-8)/(0,-8)
      (actorspriteattr.asm:360), color slot 0x0C = #6D6D6D (PalMenuWeapon 33h,3) — was a
      single OR-combined 16x16 in the default colors. New `--export-actor-singles`
      SpriteMover mode; drawBridges draws both panels
- [x] 4.2 The parachute fall uses the REAL pose: player sprite 36 (SetSprParachute) added
      to the snake.png export as 'parachute-fall' (full canopy + hanging Snake, no gun) —
      playerSpriteKey had no ANIM 3 case (fell through to the armed pose) and the old
      16x16 canopy overlay is gone; snake.json cell is now 32x64
- [x] 4.3 The landing is the FIXED yard spot (SetLandingPos2, nextroom.asm:540-573):
      room 5 (0x68,0x38) / room 6 (0x80,0xA8) / room 10 (0xA0,0x80), facing up — the
      drift X + y=24 placement could land Snake inside walls; the FreeFall corpse uses
      the same spots; entering 204 centers X 0x80 / Y 0x30 (SetParachuteMode), repeats
      keep the drift X (SetParachuteStartY); suite +1 check (20)
- [x] 4.4 Bridges: the ROM only sets the isOnBridge FLAG (SetOnBridge) — it never
      carries the player, so the carry is gone (spec + proposal reworded). Touch shape
      decode settled: the inc/dec around GetShapeInfo makes ImpactAreasInfo indexed by
      the shape id DIRECTLY (row 7 = 0,8,0,16; confirmed by the guard box row 8 =
      0,8,0,12 in use all run) — band |by-y|<8, |bx-x|<16. The ROM's strict <8 works
      because its player Y stays EVEN (2px/iteration); our 1px ticks land on the odd
      seam rows between the 16px-spaced segments (47,63,...,159), causing coin-flip
      falls at every seam — the port closes the band to <=8 (equivalent coverage)
- [x] 4.5 The bridge column oscillates AROUND its data positions: InitBridge starts
      MOVEMENT_CNT at 0x10 (first flip), 0x20 thereafter — the 0x20 start swung every
      segment 0..+32px right of the ROM track, breaking the crossing mid-room; and the
      fall probe is GetTilePlayer's exact window (the tile at X-4 and the NEXT column,
      both == 1), not a 7px span that could land inside one tile
- [x] 4.6 The parachute canopy colors: SnakeColors() now fills slots 0Dh (tan 53h,4 —
      SprsetPal20/SprsetPal5) and 0Eh (white 77h,7) used only by SnakeAttrParach — they
      were unset and rendered black
- [x] 4.7 Guards never walk diagonally (room 47 report): the patrol waypoint homing
      recomputed the max axis EVERY tick, staircasing when |dx|~|dy| — it now commits to
      the current axis until exhausted (GuardsInfo scripts are one-axis-at-a-time), with
      the step clamped to the axis remainder
