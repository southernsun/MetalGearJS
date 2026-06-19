## 1. Remaining disassembly lookups

- [x] 1.1 Read `ChkPrisonWalls` (logic/doors/opendoor.asm:286) — facing `PunchWallDirs[type-7]`
      (:380) + `PlayerControlMod` 1 (punching) + `ChkTouchDoor`; each frame decrements the
      wall life (door ID 0x0C = `PrisonWall2Life` Grey Fox, else `PrisonWall1Life`; both
      0x28, Banks0123.asm:11798) with SFX 0x0A per hit; opens at 0 (SFX 0x1E like all
      types ≥ 7). Visuals: tile blocks from the host room's tileset (`DrawWallPrison*` →
      TilesWallPrison2/1/- at data/doors.asm:992-1024). Documented in rom-data-formats.md
- [x] 1.2 The equipment bag: pickup 34 (take-dispatch `pickup−8 == 0x1A`, logic/items.asm:122)
      in room 168 at (0x88, 0x20); `RecoverEquipment` (:295) clears EquipRemoved, sets
      EquipBagTaken, appends SELECTED_TRANSMITTER (1 unit) + TransmiTaken; ItemTakeText 62 ✓
- [x] 1.3 `FadeOutLogic` (Banks0123.asm:11672): steps every CurrentPal colour toward black,
      ≤7 iterations (3-bit channels). `SetTextUnskippable` (:7798) = SkipTextMode 2 (keys
      ignored; pages auto-advance on the 0x60 wait). Capture guards use the guard sheet's
      left/vertical frames (SpriteId 0x0A/0x0B)
- [x] 1.4 The pocket: 165 ⇄ (type-14/15 wall, id 0x67) ⇄ 164 [Grey Fox's cell] → (type-13
      wall, id 0x0C) → 54 → (connection) → 57 → (lock-10 punch door, id 0x9A) → 168 [the
      bag]. BONUS finding: lock 10 = `ChkPunchDoor` (:143, one punch facing the door) —
      ported too, it gates the bag room. Export set: 165, 164, 54, 57, 168

## 2. Exports

- [x] 2.1 Prison pocket exported (`--export-web 0 16 --extra ...,165,164,54,57,168`);
      doors.json carries the walls (locks 15/10 + types 12-15); door-types.json rows 12-15
      consumed at runtime now (ChkTouchDoor); NEW wall-12/13/14/15.png (the DrawWallPrison
      tile blocks, rendered per host room in the doors export) + wall-hit.wav (SFX 0x0A) +
      wall-broken.wav (SFX 0x1E); check-graph lists the pocket as foot-unreachable islands ✓

## 3. game.js — the flow

- [x] 3.1 The trigger (`chkCaptured` after chkTakeItems, CommonLogic order): room 8 +
      X 0xC0-0xD0 + !equipBagTaken → gameState 'capture'; `?capture` dev hook (zone
      unwalkable from the cluster — documented divergence)
- [x] 3.2 `captureTick` (ROM-iteration paced): guard A at (0xF0, snake Y) → text 6
      unskippable → guard B at (0xF0, 0xB0/0x88) → fast walk left to 0xB8 → turn → walk to
      snake's even Y → text 7 → 0x1E wait → mute (stopAlert + stopCallRing) → 0x3C wait →
      fade (7 alpha steps ≈ the palette fade, a documented approximation) → 0x10 wait →
      putInPrison. setText grew the SkipTextMode-2 param (dismissText ignores keys;
      auto-advance shared with text 10's timer)
- [x] 3.3 `putInPrison`: equipRemoved set (openMenu/menuList render EMPTY incl. suppressor;
      selectWeapon/selectItem/cycleItem refuse — ROM check sites cited), selections zeroed,
      alert cleared, Snake (0x80, 0x50) in room 165
- [x] 3.4 Walls + punch doors: doorCollRect types 12-15; `touchDoor` (ChkTouchDoor's open
      area from door-types.json); `chkPunchOpenDoors` every play frame (lock 10 one-punch,
      lock 15 life-decrement with wall-hit SFX); openDoor types ≥ 7 instant + wall-broken
      SFX; the bag → `recoverEquipment` (text 62 flows through the existing Western gate);
      Grey Fox = REAL_PRISONERS[164] (RoomsPrisoner; only his XY is ours — out of
      DEMO_PRISONERS so check-graph's reachability validation stays meaningful)
- [x] 3.5 TransmiTaken: chkAlarmEnd returns while set (ChkAlarmEnd :6636); setRoom re-raises
      via raiseAlarm outside RoomsNoAlert (:1756, SetAreaMusic4 :1590); the equipment-menu
      transmitter use now consumes AND clears the flag

## 3b. Playtest fixes (user-reported)

- [x] 3b.1 "Snake and the guards are not at the correct position when captured": the
      `?capture` hook scanned for the first free row from the TOP of room 8, dropping Snake
      in the upper area — but the room's only strip reaching room 12's edge (the real
      approach) is the bottom corridor past the tank. Snake now spawns at (0xC8, 0xA0)
      facing left; guard B correctly comes in ABOVE him (Y 0x88, PlayerY ≥ 0x98 branch)
- [x] 3b.2 "Snake can't walk up to the cell wall to punch it" / "now he walks too far INTO
      it": the ROM wall blocks by its DRAWN tiles' collision bits (the tileset CollTiles
      bitmap), not its full footprint. Snake's cell wall (type 14, columns 0x14/0x33/0x35):
      0x14 and 0x33 are SOLID, the right column 0x35 is WALKABLE — Snake steps exactly 8px
      into the drawn wall, stopping at X 56 where ChkTouchDoor's open area passes
      (56−32 = 24 < 26; a fully-solid wall would park his −8 probe at X 64 and the punch
      could never connect, while no collision let him sink to the room frame). The other
      walls' tiles are fully solid (type 15: 0x32/0x13; types 12/13: 0x17 — verified from
      the exported tile/solid maps) and their open areas extend OUTSIDE the footprint.
      `doorBlockRect` gives type 14 its 16px solid sub-rect; suite checks pin the X-56
      stop on both sides

- [x] 3b.3 "The punch-the-wall sound is incorrect": PlayBreakableSfx goes through
      SetSoundEntryChk — an already-playing instance is NOT restarted — but the port fired a
      fresh playBuf every punching frame, stacking instances into a buzz. The SFX id/wav was
      right (0x0A = Sfx_PunchWallBrk = catalog "Punch breakable wall", sounddata.asm:54);
      `playWallHit` now lets each play finish before retriggering
- [x] 3b.4 "The apostrophe in DON'T / I'M is positioned wrong": the apostrophe is ROM char
      0x97 and the dakuten 0x98 — TW_PrintChar5 (Banks0123.asm:8026-8033) advances them only
      FOUR pixels so the next letter merges into the glyph cell (the ROM's transparent
      copy). drawText now advances 4px for 0x97/0x98; our transparent glyph blits compose
      identically
- [x] 3b.5 "Enter on the transponder in the equipment menu should drop it": the ROM trigger
      is Fire (ControlsTrigger bit 4, menuequipment.asm:52-54) = Space in this port; Enter
      is now accepted too as the port's confirm key (input-binding divergence, like R for
      radio). ChkDropTransmitter (:238-248) consumes it + clears TransmiTaken; the alarm
      then ends by the NORMAL ChkAlarmEnd rules (the ROM does not stop it instantly —
      roomAlert stays the original alert room, so stepping out usually ends it at once)
- [x] 3b.6 "The fade to black should be slower": correct — FadeOutColors steps the palette
      only when TickCounter & 3 == 0 (Banks0123.asm:11707-11709), one of every four
      iterations: the full fade is ~28 iterations (~0.9s), not 7. captureTick's fade case
      now steps at that pace

## 4. Checks + docs

- [x] 4.1 web/capture.headless.mjs: 30 checks — trigger (zone, inert-after-bag, start),
      the scene script (guard positions/path/facings, both unskippable texts, key-ignore,
      auto-advance, fade timing), the prison state (room/position, empty menus, refusal of
      selection), the wall (39-punch hold, wrong-direction no-op, 40th breaks), Grey Fox +
      text 59, the bag (flags, text 62, the transmitter), the bugged alarm + the drop, the
      lock-10 punch door
- [x] 4.2 All 13 suites green (305 checks) + check-graph (pocket = expected islands);
      SESSION-STATE (shipped entry, dev hook, export list, divergences, gaps — punch-doors
      gap absorbed by this slice, plastic-bomb basement walls noted under weapons);
      rom-data-formats.md capture section; rom-coverage regenerated (capture-flow 94%)
- [x] 3b.7 "Guard B walks up to Snake but turns the other way": the capturescene.asm
      comment calls sprite 0x0B "Guard left", but idxSprites (data/actorspriteattr.asm:148)
      is authoritative: 0x0A = GuardLeft (guard A, right of Snake, facing him) and
      0x0B = GuardRight — guard B stops on Snake's LEFT at X 0xB8 and faces RIGHT, toward
      him. Another wrong-comment case; the port now faces him right (suite updated)
- [x] 3b.8 "Grey Fox is at the wrong location and should be blue": both right. His ROM
      position comes from the room actor list after all (ActorsRoom164,
      data/actorsinrooms.asm:884: ID_GREY_FOX at Y 0x60, X 0x80 — centre of the cell, not
      my guessed spot), and room 164 uses sprite set 9 (SprSetPrisoner2), which loads the
      ALTERNATE SprPrisoner2 sheet at the prisoner patterns and recolours slot 2 to dark
      blue (SprsetPal9: 13h/2) with tan details (42h/3). New greyfox.png export
      (--export-prisoner now writes both); drawPrisoner uses it in room 164; REAL_PRISONERS
      updated to the ROM position
