## 1. Survey + lookups

- [x] 1.1 Lock-16 = ChkBasementWall confirmed from ChkOpenDoor's dispatch (14 =
      ChkBigBossDoor — the weapons slice's hook was on the wrong number); the live bomb
      walls: 166⇄167 (Ellen) and 114⇄116 (building 3, unexported)
- [x] 1.2 Room 166 = the trap room (ChkSayHelpMe text 128 / ID_PITFALL ±40 trigger,
      +2/iteration hole to 0x40, SFX 7, all-life kill); room 167 = ID_ELLEN with
      ActorSprColors14 (tan + dark red) and rescue text 129; the route 54→55→56 +
      55's CARD6 door → 166 (the card lives in a later zone — gated, documented)

## 2. Exports

- [x] 2.1 Rooms 55/56/166/167 (85 total); export-actors grew pitfalls/helpme + fixed
      ID_ELLEN; ellen.png (SprElen, tan/red); pitfall.wav (SFX 7)

## 3. game.js

- [x] 3.1 chkBombWalls keyed on lock 16; punching a lock-16 wall plays the breakable SFX
      and never opens (ChkPunchBaseWall)
- [x] 3.2 Pitfalls: closed → ±40 trigger → 2px/iteration hole to 64 (SFX 7) → inside
      ±size/2 = all life, i-frames bypassed; drawn as the shaded pit under everything
- [x] 3.3 The HELP-ME voice: text 128 unskippable after 2 iterations, re-cried every 0xC0
- [x] 3.4 Ellen: the third prisoner sheet keyed on room 167

## 4. Checks + docs

- [x] 4.1 capture.headless grew the trap-room route (41 checks): the pitfall arm/trigger/
      growth/lethality, the help-me cadence, the lock-16 wall (punch-proof, bomb opens),
      Ellen + text 129; shots.headless's synthetic wall re-keyed to 16
- [x] 4.2 All 15 suites green (395 checks); SESSION-STATE; coverage

## 5. Building 3 + gas rooms (extended into this change)

- [x] 5.1 Survey: building 3 = rooms 111-116/118/119 (one edge component); entrances are
      all far-zone doors EXCEPT room 224 -> 119, which is lock 14 = the BIG BOSS DOOR
      (endgame-gated — faithful); 114 <-> 116 turned out to be a CARD1 door, NOT a bomb
      wall (the only lock-16 wall in the data is Ellen 166 <-> 167); room 113 carries TWO
      pitfalls (live via the generic system); room 8 doors into 138 (CARD1), where the
      GAS MASK (pickup 13) lives — CARD1 itself sits in room 127 (a later zone; gated)
- [x] 5.2 Rooms 112-116/118/119 + 138 exported (93 total); the 224->119 and 8->138 doors
      now survive the export's dest filter
- [x] 5.3 Gas rooms (ChkGasRooms, damagegas.asm): rooms 29 (the 2F loop — live NOW),
      94-101 (future), 112/114 (building 3); without the GAS MASK selected, 2 life every
      0x10 frames via the shared damage delay; the mask stops it cold
- [x] 5.4 capture.headless grew the gas checks (drain, the delay gate, the mask) — 44;
      all 15 suites green (398 checks)

## 6. The courtyard ring (extended into this change)

- [x] 6.1 Survey: room 11's north edge opens the courtyard component — 64-70 (real guards
      in 70), the WATER ROOMS 71-78/105 (their door entries: 69->73, 70->71, 102->75 —
      no longer dev-hook islands; 74-78 chain by SWIMMING, which check-graph's foot mask
      does not traverse), the desert edge 102/103/106/120, and the lorry interiors
      173-175 (+176/177 behind 70's doors) with their real items (bombs, mines, ammo)
- [x] 6.2 Rooms 64-70/102/103/106/120/173-177 exported (109 total); no new code — rooms,
      doors, items, guards, water tiles all ride the shipped systems
- [x] 6.3 All 15 suites green (398 checks); the desert rooms 208/211 (scorpions — a new
      actor) deferred to the desert slice

## 7. The interiors + dark rooms (extended into this change)

- [x] 7.1 Survey: the START CLUSTER doors into interiors 126-137 (room 5 -> 127 = CARD1
      behind a lock-11 door; 9 -> 135 = CARD4; 6 -> 129 prisoner; 13/14 -> 134/136/137 =
      the rooms-12-14 connectors), the basement doors into 122/123/169-172, the water
      rooms into 178-180, 115 -> 194 — 22 interiors with CARD1/CARD3/CARD4, binoculars,
      uniform/armor, FIVE more live prisoners (129/134/136/180/194), and room 123 = the
      FIRST DARK ROOM (triple pitfalls in the dark)
- [x] 7.2 Lock 11 = ChkDoorLorry: opens by ONE PUNCH facing it OR a plastic bomb in its
      zone — both wired (chkPunchOpenDoors + chkBombWalls)
- [x] 7.3 Dark rooms (SetRoomPal :2946-2964, rooms 123-125/220-221): BLACK (RoomPalette11
      `.dark.png` exports) unless the FLASHLIGHT (item 3, pickup 11 — live in room 176)
      is selected; checked BEFORE the goggles, per ChkFlashLight's fall-through
- [x] 7.4 22 rooms exported (131 total); all 15 suites green (398 checks)

## Playtest

- [x] USER PLAYTEST CONFIRMED (2026-06-11): Part A � HELP-ME cadence, pitfall trigger/
      growth + the real GfxPitfall art (exported after the grey-interior report), lethal
      fall, the lock-16 bomb wall (punch inert), Ellen rescue text 129. Part C � gas
      drain 2/beat + the mask gate. Part B fix: dark rooms hide the open pit (palette 11
      blacks slots 5/9 � the pit's only colours), still lethal

