## 1. SFX export (0x20 cursor move, 0x21 use item)

- [x] 1.1 Find the catalog names for SFX entries 0x20 and 0x21 in ThemeOfTaraPlayer's SFX
      catalog and export them: `dotnet run --project Tools/ThemeOfTaraPlayer -- --export-sfx
      "<name>" web/assets/cursor.wav` (0x20) and `web/assets/useitem.wav` (0x21)
- [x] 1.2 Wire `cursorBuf`/`useItemBuf` into `loadSounds()` + `playBuf` helpers in web/game.js

## 2. Menu grid navigation + select-on-move (CtrlMenuWeapon / MenuEquipLogic)

- [x] 2.1 Replace `menuCursor` with a 1-based `selectIdx` grid model: weapons 1-7 (columns
      4+3), equipment 1-25 (columns 9+9+7); map compacted owned list <-> grid slot
      (`list[selectIdx-1]`, empty slot = ID 0); suppressor slot and OPTION are not navigable
- [x] 2.2 Port the exact movement clamps (no wrap): weapons up@1/5, down@4/7, left blocked
      idx<5, right blocked idx>=4; equipment up@1/10/19, down@9/18/25, left blocked idx<10,
      right blocked idx>=17 — cite the ROM routines next to each clamp
- [x] 2.3 Select on every move: weapon menu sets `selectedWeapon` (+`WeaponInUse` semantics),
      item menu sets `selectedItem`; empty slot selects 0 (holster/none); play SFX 0x20 on
      each successful move; remove `menuConfirm()` and the Fire-confirms path (Fire in the
      weapon menu does nothing)
- [x] 2.4 Move menu input into a per-tick `menuTick()` (trigger latch from keydown + `held`
      set) implementing `ControlHoldWait`: move on press, then every 8 ticks while held
- [x] 2.5 Update cursor seeding on open (`GetWeaponCursor`/`GetMenuCursor`: grid slot of the
      current selection, slot 1 if none) and `drawMenu()`'s arrow to draw from `selectIdx`
      (arrow may sit on an empty slot)

## 3. ChkUseItem (Fire in the equipment menu)

- [x] 3.1 Port the `ChkUseItem` dispatch (logic/menuequipment.asm:208): selected==0 → return;
      deep water (`PlayerAnimation==4`) skips only the ration branch; ration → consume 1
      (remove at 0), `life = maxLife`, HUD update; transmitter/antidote/cigarettes as
      guarded no-ops with ROM citations (antidote not consumed; cigarettes need the
      destruction timer); matched branch → SFX 0x21, unmatched → silent return
- [x] 3.2 Keep the open menu display consistent after a use: ration count redraws, emptied
      slot shows nothing (the ROM recompacts only on next open — match that)

## 4. Door entry placement (SetPlayerInDoor2..4 + PlayerInDoorDat)

- [x] 4.1 Add `PLAYER_IN_DOOR_DAT` — the 19-entry `[offY, offX, dir]` table copied verbatim
      from logic/nextroom.asm:463-481, with the source cited
- [x] 4.2 Rewrite `enterDoor`: place Snake at `((dest.y + offY) & 0xFF, (dest.x + offX) &
      0xFF)` for the dest door's render type and set `snake.dir` from the table; delete the
      `freeAt` outward scan, the clamps, and the `enterOffX/Y` usage; keep the
      missing-door fallback and the arrive-open + `wasInside` latch
- [x] 4.3 If any demo-cluster door now lands on a solid tile, fix the offending exported
      collision/door data at the source (no relocation scan) and note what was wrong
      — RESULT: no fix needed; all 4 cluster door landings (types 1-4) are walkable in the
      exported collision. The old drift came from the approximate enterOff offsets feeding
      the scan, not from bad data.

## 5. Headless checks + docs

- [x] 5.1 menu.headless.mjs: update/replace confirm-based checks — select-on-move (weapon +
      item), edge clamps, hold-repeat delay, empty-slot deselect, cursor seeding, ration
      use (heal + consume + remove-at-0 + deep-water block + no-SFX cases)
- [x] 5.2 doors.headless.mjs: exact landing position + facing per door type against
      `PLAYER_IN_DOOR_DAT`; multi-round-trip no-drift check through 7↔11 (E/W) and a N/S
      pair; every demo-cluster door landing is walkable per the footprint map
- [x] 5.3 Run all headless suites (`node web/*.headless.mjs`) and `node Tools/check-graph.mjs`
      — 175/175 checks pass (hud 13, menu 43, alarm 19, shots 18, touch 17, items 27,
      rank 26, doors 12)
- [x] 5.4 Update web/index.html key help (menus: move selects, Space = use item in the item
      menu), docs/SESSION-STATE.md (move the two gaps out of "Biggest gameplay gaps", update
      check counts/divergences), and regenerate docs/rom-coverage.md
      (`node Tools/coverage/coverage.mjs`)
