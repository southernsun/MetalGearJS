> Keycard-locked doors, ported faithfully (per CLAUDE.md). Sources: `logic/doors/opendoor.asm`
> (ChkOpenDoor/ChkCard1..8/ChkTouchDoor), `Banks0123.asm` (DoorsList +2 LogicOpen via IdDoorsLogic[id-1]),
> `constants/Enums.asm` (SELECTED_CARD* = 0x0E..0x15). **Elevators split into their own change** — see
> the proposal scope note + design correction + the `project-elevator-floor-mapping` memory.

## 1. Asset export

- [x] 1.1 `WriteDoorsJson` (RoomViewer): emit each door's **lock type** (`IdDoorsLogic[id-1] & 0x1F`) as `lock`. Done — `--export-doors` regenerates `doors.json` with `lock` for the existing room set (+ a `--doors-audit` tool to find candidates).
- [x] 1.2 Keycard-door room: **no new export needed** — the existing cluster already has them (6↔7 & 7↔11 = CARD4 lock 5; 73↔76 = CARD5 lock 6).

## 2. Keycard doors

- [x] 2.1 `buildDoors` loads the per-door `lock` (absent → plain).
- [x] 2.2 `canOpenDoor` (= `ChkOpenDoor`): a keycard lock opens only when `selectedItem === cardItemForLock(lock)` (card id `0x0C + lock`) AND `door.type === DIR_TO_PD[snake.dir]` (facing); else locked, no transition; plain doors unchanged; no opening under the box. Verified **8/8 headless**.
- [x] 2.3 Cards CARD1/CARD4/CARD5 added to `ownedItems` (selectable via the `I` cycle) so the cluster's keycard doors are openable; HUD item box shows the card icon.

## 3. Verification

- [x] 3.1 Headless: keycard door opens only with the matching card selected + facing; locked otherwise; plain doors still open; elevator/unsupported locks don't push-open; no open under the box. (`/tmp/kc.mjs`, 8/8.)
- [ ] 3.2 Manual browser: cycle to CARD4 (`I`), open the 6↔7 / 7↔11 doors; cycle to CARD5 for 73↔76; without the card the door stays shut.
- [x] 3.3 Regression: plain doors, edge traversal, collision, guard/alarm, HUD unaffected (alarm 19/19, HUD 13/13).
- [x] 3.4 Update `Tools/coverage/coverage-map.json` (ChkOpenDoor/ChkCard* done) and regenerate `docs/rom-coverage.md`.
