# The capture flow (DON'T MOVE → prison → escape → the bugged bag)

## Why

The capture scene is the biggest remaining story system, and every neighbouring piece is
already shipped and waiting on it: text 62 ("I TOOK BACK THE WEAPONS AND EQUIPMENTS") sits
behind the Western pickup gate, texts 6/7 ("DON'T MOVE!" / "YOU ARE CAPTURED") are decoded,
the transmitter's radio-drop use is ported, and the prisoner dialogue tells the player to
get caught on purpose. The disassembly specifies it end to end: the once-only trigger in
room 8 (`CommonLogic`, logic/common.asm:26-47 — X 0xC0-0xD0, gated by `EquipBagTaken`), the
scripted two-guard scene (`CaptureSceneLogic`/`CaptureGuardsLogic`, logic/capturescene.asm),
the fade-out, `PutInPrison` (room 165, equipment flagged removed), the punch-out cell wall
(room 165's type-14 prison-wall door), and `RecoverEquipment` (logic/items.asm:295 — the
equipment bag restores everything, fires text 62, and plants the TRANSMITTER bug that keeps
the alarm alive until dropped via the radio).

## What Changes

- **The capture trigger** (`CommonLogic`): standing in room 8 at X 0xC0-0xD0 starts GameMode
  0x0B once per game (`EquipBagTaken` gates re-triggering). NOTE: that zone is outside our
  cluster's walkable area of room 8 (its right side is entered from unexported rooms) — the
  trigger is ported faithfully and a `?capture` dev hook exercises the scene until a cluster
  expansion opens the route (documented divergence, like the demo placements).
- **The scripted scene** (`CaptureSceneLogic` + `CaptureGuardsLogic`): guard A appears at
  (0xF0, Snake's Y) and says "DON'T MOVE!" (text 6, unskippable); guard B walks in from the
  right at fast speed, turns toward Snake's row, stops beside him and says "YOU ARE
  CAPTURED" (text 7); music mutes; the screen FADES OUT (`FadeOutLogic` — the port's first
  palette fade); then `PutInPrison`.
- **Prison** (`PutInPrison`): `EquipRemoved` set (weapons/items kept in the arrays but the
  menus show empty, the HUD boxes clear, weapons can't fire — the ROM's existing
  `EquipRemoved` checks, several already specced), selected weapon/item cleared, the alert
  killed, Snake at (0x80,0x50) in room 165 — exported with its pocket.
- **The cell escape**: room 165's only exit is the type-14 prison wall (id 0x67, dest 164,
  data/doors.asm) — opened per `ChkPrisonWalls` (condition read during implementation;
  the classic punch-out).
- **The recovery**: the equipment bag pickup (its room/pickup id located in task 1) runs
  `RecoverEquipment`: `EquipRemoved` cleared, `EquipBagTaken` set, text 62 finally passes
  the Western pickup gate, and the TRANSMITTER lands in the inventory — wiring
  `TransmiTaken` into `ChkAlarmEnd` (the alarm never ends while bugged) and making the
  radio's drop-transmitter use meaningful.
- **Exports**: the prison pocket rooms (165 + 164 + the bag's room) via `--extra`, the
  prison-wall door visuals if any, the capture-guard uses the existing guard sprites.

## Capabilities

### New Capabilities

- `browser-capture`: the trigger, the scripted scene, the prison transfer with
  `EquipRemoved`, the cell escape, and the recovery with its transmitter consequence.

### Modified Capabilities

- `browser-doors`: the prison-wall door type (14) and its `ChkPrisonWalls` open condition.
- `browser-guard-alarm`: carrying the transmitter SHALL keep the alarm from ending
  (`ChkAlarmEnd`, Banks0123.asm:6636) until it is dropped via the radio.

## Impact

- `web/game.js`: capture state machine (GameMode 0x0B), scripted capture guards, the
  palette fade, EquipRemoved gating in menus/HUD/fire, the prison-wall door, the bag +
  RecoverEquipment, TransmiTaken in chkAlarmEnd.
- RoomViewer: prison pocket rooms exported; doors export already handles new types.
- New `web/capture.headless.mjs`; SESSION-STATE, rom-coverage.
