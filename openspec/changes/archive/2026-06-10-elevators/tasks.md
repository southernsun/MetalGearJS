## 1. Remaining disassembly lookups

- [x] 1.1 Read the `GetNextRoomNum` elevator branch + `ChkOpenDoor` lock-1 branch — FINDINGS
      (documented in docs/rom-data-formats.md "Elevators"): room 240 has NO connections; the
      elevator room's floor exits are invisible TYPE-6 DOORS at X 0xE0, one per floor Y,
      paired with the floor rooms' type-5 doors by door ID (the memory note was exactly
      right: doors, not connections); `ChkElevatorDoor` opens type 5 pushing UP, type 6
      pushing RIGHT; rooms 241-250 use connection rows (index room−95) for multi-room shafts
- [x] 1.2 Located the cabin sprites — `SprElevator` (gfx/sprites.asm:449, common RLE
      encoding) at pattern base 0x38 (`SprSetElevator`); the type-5 door graphic is
      `GfxDoorElevator` (4x4 blob, LoadGfxDoors Banks0123.asm:2720; DrawDoorElevator draws
      the centred 24x32); type 6 = DrawDoorDummy (draws nothing, no collision tiles)

## 2. Exports

- [x] 2.1 `Tools/export-elevators.mjs` → elevatorrooms.json (11 elevator rooms; 240 =
      floors 31(0x34/0x38) + 3(0xB4/0xB8), sanity-asserted)
- [x] 2.2 WriteDoorsJson keeps elevator doors whose dest is exported; GameData.Doors fixed
      for the idxDoors gap (rooms ≥ 240 index at room−15, AddDoorsData :1274); door-gfx
      gained type 5 (door-elevator.png from GfxDoorElevator, verified visually)
- [x] 2.3 Rooms 240 + 31 exported via the new `--export-web ... --extra 240,31` (the
      original 27-room set reproduced exactly + the two extras; ?room=240/31 load)
- [x] 2.4 Cabin exported: `--export-elevator` → elevator.png (32x64, 6 OR-pair cells from
      SprElevatorDat, anchored at the ElevatorX/Y origin) + elevator.json; verified visually

## 3. game.js — entry, walk, ride

- [x] 3.1 Door entry branch: dest ≥ 240 → enterElevator (player 0xD8/floor Y, cabin
      0x70/floor Y, limits, control mode 2 facing left); leaving an elevator room by door
      resets control mode 0 (SetPlayerInDoor); canOpenDoor lock 1 = ChkElevatorDoor
      (type 5 up / type 6 right); doorCollRect entries for types 5 (4x4 at X−4) and 6
      (the DoorOpenEnterDat row-6 zone, invisible trigger)
- [x] 3.2 Control mode 2 (`elevatorControl`): horizontal-only walk, left clamp X 104 (the
      ROM's X≥244 ExitRoom is connection-based and undefined for room 240 — the type-6
      doors intercept first; clamped at 243 with citation), doors push/enter via the
      standard machinery
- [x] 3.3 Ride start (`chkCtrlElevator`): cabin X < 0x78, per-room masks (240-242/≥247
      both, 243-244 up, 245-246 down), limit refusal, gameState 'elevator'
- [x] 3.4 GameMode-6 ride: 1px/iteration, floor stops 0x38/0x78/0xB8, the express
      hold-to-skip quirks ported verbatim (up: 248-250 then 247; down: 247-249 then 250),
      shaft exit at Y<24/≥208 chaining via connections with the 0xD0/0x18 parking
      (missing neighbour = stop in place, cited divergence), stop returns control with the
      held left/right facing
- [x] 3.5 Render: drawElevator (elevator.png at the ElevatorX/Y anchor) in elevator rooms

## 4. Checks + docs

- [x] 4.1 web/elevator.headless.mjs (22 checks): door gating, entry parking, left clamp,
      cabin-only ride start, both floor stops riding up, limit refusal, exit right into
      room 31 (SetPlayerInDoor placement), return at the top floor, ride down, express
      skip (room 248), shaft chaining + missing-neighbour stop, cabin draw anchor
- [x] 4.2 All suites pass — 261/261 across 11 suites; check-graph reaches room 240 by the
      door from room 3; SESSION-STATE updated (cluster map: room 3 ⇄ 240 ⇄ 31, exporter
      list, shipped entry, gaps) and rom-coverage regenerated

## 5. Playtest fixes (user-reported)

- [x] 5.1 Type-5 door opened with the wrong animation — now the ROM's sliding double door:
      EraseDoorElevator (erasedoor.asm:289) erases vertical lines from the CENTRE outward
- [x] 5.2 Cabin ("lift") colours were hand-picked greens — replaced with the REAL palette:
      elevator rooms use spriteset 0 → SprsetPal0 (data/palettes.asm:214): blue (idx 2) +
      three greys, black OR-overlap from the PalMenuWeapon fixed slots; re-exported
- [x] 5.3 Exiting the shaft cut to the floor room ~16px early — the type-6 door now keeps
      the ROM's DISTINCT zones (DoorOpenEnterDat row 6): touch/open at X-8..X+8, ENTER at
      X+8..X+24 (doors gained enterRect; other types unchanged); type 6 also opens
      instantly (EraseDoorDummy — no animation)
- [x] 5.4 The floor exit played the regular door sound — DoorOpenSfxs (erasedoor.asm:83)
      gives types 5 AND 6 the dedicated ELEVATOR door SFX 0x1B, now exported
      (elevator-door.wav) and used for both
- [x] 5.5 Rescue text "screen jumps up" — the browser page scrolled on still-held arrow
      keys while the text window was open; arrows/Space now preventDefault in the text
      state (elevator suite: 24 checks)
