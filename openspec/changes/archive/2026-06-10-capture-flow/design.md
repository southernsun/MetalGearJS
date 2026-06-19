# Design — the capture flow

## Context

Verified in the disassembly:

- **Trigger** (`CommonLogic`, logic/common.asm:26-47): every play frame after the door/item
  checks — if `EquipBagTaken` is 0, `Room == 8`, and `PlayerX` ∈ [0xC0, 0xD0), GameMode →
  0x0B (`GAME_MODE_CAPTURED`) with `CaptureStatus = 0`. `EquipBagTaken` makes the scene
  once-only; afterwards walking the zone is safe.
- **The scene** (`CaptureSceneLogic`, logic/capturescene.asm): status 0 spawns capture
  guard A at (0xF0, PlayerY); guard A's own actor logic (`CaptureGuardsLogic`) waits 2,
  shows "DON'T MOVE!" (text 6, `SetTextUnskippable`), and spawns guard B at X 0xF0 — at
  Y 0xB0 if Snake is above 0x98, else 0x88; guard B walks LEFT fast to X 0xB8, turns
  toward Snake's row, walks to his (even-adjusted) Y, faces left and says "YOU ARE
  CAPTURED" (text 7, unskippable), waits 0x1E; then the scene continues: timer 0x3C with
  the music muted, `FadeOutLogic` (a stepped palette fade to black), a 0x10 wait, and
  `PutInPrison`.
- **PutInPrison** (logic/capturescene.asm:87): `EquipRemoved = 1` (the arrays KEEP their
  contents — the flag empties the menus/HUD: the ROM checks it in DrawWeaponMenu/
  DrawEquipMenu (Banks0123.asm:1974/2171) and MenuWeaponMove selects 0 (:11469); selected
  weapon/item zeroed; alert + respawn timer cleared; Room = 165 (PreviousRoom 8), player
  at (0x80, 0x50); GameMode 0.
- **The cell**: room 165's only door is id 0x67, render type 0x0E (a `DrawWallPrison`
  variant), dest 164 — lock from `IdDoorsLogic`, opened by `ChkPrisonWalls` (the dispatch's
  last entries). Condition + visuals read in task 1.
- **The recovery** (`RecoverEquipment`, logic/items.asm:295): a specific pickup (the
  equipment bag — id/room located in task 1; its `ItemTakeText` entry is 62) clears
  `EquipRemoved`, sets `EquipBagTaken`, walks the Equipment array, and APPENDS THE
  TRANSMITTER — the bag is bugged. `ChkAlarmEnd` (Banks0123.asm:6636) returns immediately
  while `TransmiTaken` is set (the alarm never ends), and `SetAreaMusic4` (:1590) keeps
  re-raising it room after room; dropping it is the radio's `ChkDropTransmitter` use we
  already ported as a stub.

Our cluster reality: room 8's right side (the trigger zone X 0xC0-0xD0) is not walkable
from the cluster (entered from unexported rooms). Rooms 164/165 are outside the cluster.

## Goals / Non-Goals

**Goals:**
- The full scripted scene, frame-accurate: both guards, both unskippable texts, the mute,
  the fade, the prison transfer.
- `EquipRemoved` behaving exactly as the ROM's checks dictate (empty menus, cleared HUD
  boxes, selecting yields 0, no firing) and the bag recovery restoring everything + the
  bugged-transmitter consequence wired into the alarm.
- The cell escape through the real prison-wall door.

**Non-Goals:**
- The full prison-area progression (the isolated cell / Grey Fox, repeated captures
  teleporting there) — needs rooms far beyond the pocket.
- Reaching room 8's trigger zone on foot (cluster expansion later); a `?capture` dev hook
  triggers the scene for play until then.
- The uniform/cardboard-box capture avoidance variants, if any (read during task 1 only if
  they sit in the same routines).

## Decisions

1. **GameMode 0x0B as `gameState 'capture'`**: a scene state machine ticked on ROM
   iterations; the scripted guards are lightweight scene actors (position/sprite/timer
   structs reusing the guard sheet), not instances of the patrol guard.
2. **The fade**: `FadeOutLogic` steps the palette toward black; the port fades the CANVAS
   with a black overlay alpha-stepped at the ROM's pace (a presentational approximation —
   palette-stepping per colour is meaningless on RGBA canvas; cited).
3. **`EquipRemoved` wiring**: menus draw nothing while set (the spec'd captured case),
   `menuSelect` yields 0 (MenuWeaponMove :11469 behaviour), the HUD boxes show empty, and
   the fire path refuses (no weapon selected anyway). The arrays keep their contents — the
   bag restores by clearing the flag, exactly the ROM shape.
4. **The pocket export**: rooms 165 + 164 + the bag's room via `--export-web --extra`;
   `?room=165` works like the other island rooms. The capture scene itself runs in room 8
   (already exported).
5. **TransmiTaken**: a real flag now — `chkAlarmEnd` returns while set (cited), `setRoom`'s
   alarm re-raise path per `SetAreaMusic4`, and the radio's transmitter use clears it (the
   stub becomes real).

## Risks / Trade-offs

- [`ChkPrisonWalls` condition unknown until read] → task 1 reads it before porting; the
  punch-out is well known behaviour, but the code decides (punch count? any contact?).
- [The bag's placement may be in a room whose neighbours pull more exports] → the pocket is
  capped at the minimal rooms; anything further dead-ends like room 31.
- [Scene actors vs our single-guard model] → the scene runs in its own state, so the
  patrol-guard system is untouched.

## Open Questions

- None blocking; task 1 carries the listed lookups.
