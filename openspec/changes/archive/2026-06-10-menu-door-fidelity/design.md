# Design — menu + door entry fidelity

## Context

Two user-reported divergences, both verified against the disassembly:

- **Menus**: the ROM has no confirm press. `CtrlMenuWeapon` (Banks0123.asm:11387) and
  `MenuEquipLogic` (logic/menuequipment.asm:51) move a cursor over a **fixed grid**
  (`SelectIdx`), and every move immediately calls `SelectWeapon` / `SetSelectedItem`. Fire in
  the equipment menu is `ChkUseItem` (menuequipment.asm:208); Fire in the weapon menu does
  **nothing** (CtrlMenuWeapon never tests bit 4). Our port keeps a list-index cursor,
  confirms on Fire, wraps at edges, has no hold-repeat, no item use, and no menu SFX.
- **Doors**: the ROM places Snake with `SetPlayerInDoor2..4` (logic/nextroom.asm:397-453):
  look up the entered door in `DoorsList`, take its render **type** (byte +3) and **draw
  YX** (bytes +5/+6), then `PlayerInDoorDat[(type-1)*3]` gives `(offY, offX, direction)`;
  `PlayerY = DrawY + offY`, `PlayerX = DrawX + offX` (8-bit adds — `0xF8` means −8), and
  `PlayerDirection` is set from the table. Our `enterDoor` (web/game.js:914) instead adds
  approximate per-type `enterOffX/Y` from door-types.json, clamps, and runs a `freeAt`
  outward scan when the spot is solid — the scan relocates Snake by a few pixels per
  transit, accumulating drift until a door's rect no longer matches (E/W doors 7↔11).

## Goals / Non-Goals

**Goals:**
- Menus behave exactly like the ROM: grid navigation with edge clamps, select-on-move,
  hold-repeat (8-frame `ControlHoldWait`), equipment-menu Fire = `ChkUseItem`, SFX 0x20/0x21.
- Door entry is deterministic: ROM `PlayerInDoorDat` offsets + direction, no relocation scan,
  in-and-out round trips land on identical pixels forever.

**Non-Goals:**
- Poison/antidote, destruction timer/cigarettes, transmitter systems (their `ChkUseItem`
  branches are ported as guarded no-ops so the dispatch is faithful, but the underlying
  state doesn't exist yet).
- The OPTION screen, captured (`EquipRemoved`) flow, binoculars-on-exit (`ExitEquipMenu`).
- Elevator/parachute/ladder entry paths in `LocatePlayerEntry` (no elevators yet; ladder
  rooms keep their existing entry).
- Re-keying menus to F1/F2/F3 (browser-reserved; Q/E stay — documented divergence).

## Decisions

### 1. Menu cursor becomes the ROM's `SelectIdx` grid, not a list index

Replace `menuCursor` (index into the compacted owned list) with `selectIdx` (1-based grid
slot): weapons 1-7 (left column 1-4, right 5-7), equipment 1-25 (columns 1-9 / 10-18 /
19-25). Movement ports the exact clamps:

- Weapons (`CtrlMenuWeapon*`): up blocked at 1 and 5; down blocked at 4 and 7; left blocked
  when idx < 5 (else −4); right blocked when idx ≥ 4 (else +4).
- Equipment (`MenuEquip*`): up blocked at 1, 10, 19; down blocked at 9, 18, 25; left blocked
  when idx < 10 (else −9); right blocked when idx ≥ 17 (else +9 — the 3rd column only holds
  7, so rows 8-9 of column 2 can't go right).

No wrapping (the current modulo wrap goes away). The compacted owned list fills slots
1..n, so `entry = list[selectIdx-1]` and an empty slot yields ID 0 — moving onto it
holsters / deselects, exactly like the ROM reading a zeroed `Weapons`/`Equipment` record.
The suppressor's drawn slot (8th) and the OPTION label are **not navigable** (`SelectIdx`
caps at 7; CtrlMenuWeapon has no OPTION path) — fixes our cursor reaching both.
Rationale: alternatives (keeping list-index navigation and bolting on select-on-move) can't
reproduce empty-slot deselection or the column clamps, which are player-visible.

### 2. Select-on-move; the confirm path is deleted

Every successful move plays SFX 0x20 and immediately writes the selection
(`SelectedWeapon`+`WeaponInUse` ← weapon slot / `SelectedItem` ← item slot, HUD updated).
`menuConfirm()` is removed; Fire in the weapon menu is ignored; closing a menu (Q/E/Esc)
just returns to play — the highlighted entry is already selected. Cursor seeding on open
keeps the current behaviour (`GetMenuCursor`/`GetWeaponCursor`: index of the selected
entry, defaulting to slot 1).

### 3. Menu input moves into the tick loop for hold-repeat

The ROM menus read `ControlsTrigger` (new press → move now, reset `ControlHoldWait = 8`)
and `ControlsHold` (held → decrement the wait; at 0, move and reset to 8). Our keydown
handler can't express that, so menus get a per-frame `menuTick()` driven by the existing
`held` set plus a trigger latch from keydown, called from the main loop while
`gameState === 'menu'` (the loop already runs; play logic is what's gated). The 8-frame
delay uses game ticks, matching the ROM's per-frame decrements.

### 4. `ChkUseItem` ported with its exact dispatch order

Fire in the equipment menu runs the ROM chain (menuequipment.asm:208-290):

1. `SelectedItem == 0` → return (no SFX).
2. Deep water (`PlayerAnimation == 4`) skips the **ration branch only** (falls through to
   the transmitter check) — it does not block other items.
3. Ration → consume 1 (`DecItemUnits`; at 0 the item leaves the inventory), `Life = MaxLife`,
   HUD life redraw.
4. Transmitter → consume + clear the taken flag (no transmitter system yet → guarded no-op).
5. Antidote → clear `Poisoned` only — the ROM does **not** consume it (no poison yet → no-op).
6. Cigarettes → only while `DestructionTimerOn` (never, in this slice) → no-op.
7. Any branch that matched ends at `UseItemSfx` → SFX 0x21; unmatched items (cards,
   binoculars, …) return silently.

Only the ration is observable now; porting the full chain keeps the dispatch faithful and
the stubs document where poison/timer systems plug in later.

### 5. Door entry: port `PlayerInDoorDat` verbatim, drop the scan

`enterDoor` keeps the room cut + dest-door lookup by ID, then places Snake with the ROM
table — a 19-entry `PLAYER_IN_DOOR_DAT = [[offY, offX, dir], …]` copied from
nextroom.asm:463-481 (`[0x28,0x0C,2], [0xF8,0x10,1], [0x30,0x10,4], [0x30,0xF6,3], …`).

- `snake.y = (dest.y + offY) & 0xFF`, `snake.x = (dest.x + offX) & 0xFF` — true 8-bit adds,
  so `0xF8`/`0xF6` act as −8/−10 like the Z80 (`dest.x/y` are the exported DoorsList draw
  XY the ROM itself indexes).
- `snake.dir` ← the table direction (1=up, 2=down, 3=left, 4=right), replacing "keep
  walking direction". The ROM also clears the held-direction masks (`DisableControls` on
  the elevator path only; `SetPlayerInDoor2` doesn't) — we keep our current input state
  untouched, matching the room-to-room path.
- The `freeAt` outward scan, the clamps, and the `enterOffX/Y` lookups are deleted from
  this path. door-types.json keeps its fields (other consumers), but door entry no longer
  reads them.
- The no-matching-door fallback (warn + room centre) and the arrive-open + `wasInside`
  latch stay as-is (existing documented divergence / anti-bounce).

If a ROM offset lands in a tile our collision calls solid, that's a collision-data bug to
fix at the source, not something to paper over with a scan — the doors headless suite
validates every demo door's landing spot against the real footprint map.

### 6. SFX 0x20/0x21 via the existing exporter

`dotnet run --project Tools/ThemeOfTaraPlayer -- --export-sfx` with the catalog names for
entries 0x20 (cursor move) and 0x21 (use item) → `web/assets/cursor.wav` / `useitem.wav`,
wired like the other decoded SFX. (Identify the exact catalog names from the player's SFX
catalog first; SESSION-STATE already marks 0x20/0x21 as exportable.)

## Risks / Trade-offs

- [ROM offsets could land on solid tiles in *our* collision map (the original drift trigger)]
  → the headless suite asserts every demo-cluster door round trip lands on a walkable spot
  AND on identical pixels both ways; a failure points at bad exported collision/door data,
  which gets fixed in the data, not with a scan.
- [Select-on-move + empty grid slots means players can holster by wandering the menu] →
  faithful ROM behaviour; the HUD readout updates live so it's visible.
- [Menu input via tick loop changes feel (trigger latch vs keydown)] → trigger still moves
  on the press frame; only repeats wait 8 ticks — same as the ROM.
- [No-op `ChkUseItem` branches may read as dead code] → each cites its ROM line and the
  system it waits for, consistent with project convention.

## Open Questions

- None blocking. The catalog names for SFX 0x20/0x21 are looked up during implementation
  (the catalog is data in ThemeOfTaraPlayer; `--export-sfx` already handles arbitrary names).
