## Context

Discovered during implementation: ladders are the **building-2 roof escape** (rooms 224-226), not
a generic tile. `NormalCtrl` never climbs; `SetLadderRoomEntry` (nextroom.asm, via the ladder
door from the Big Boss room) puts the player into ladder-walk mode (6) at the floor; on a ladder
tile (`0x08`) + Up, `ChkStartClimb` enters climb mode (7) at 1 px/frame (ROM `PlayerMovSpeed`
0x0100 vs walk 0x0200); `ChkExitLadders` (room 224) steps off at the floor; `ChkLadderLimits`/
`ChkNextLadderRoom` cross rooms at Y<16 (up) / Y≥186 (down), 224 clamps at the bottom (Y 0x99),
and the top of 226 (Y<0x10) calls `SetLeavedOuterH` (the escape ending).

Two facts shape the browser port:
- The ladder rooms are end-game; the door isn't walk-reachable → access via the existing
  `?room=N` dev hook (`?room=224`).
- The ROM does **not** link 224-226 in the normal connection table (the exporter emits no
  up/down for them); the ladder code transitions by room sequence. So we wire 224↔225↔226 links
  manually when merging the rooms.

ROM Y/X map directly to our 0..191 / 0..255 (floor 0x9E≈158, climb floor 0x99≈153, top 16,
bottom 186) — same scale we already use. Speeds scale to our Snake (browser walk = `SPEED` = 1.0
≈ ROM 2px): ladder-walk = `SPEED`, climb = `SPEED/2` (climb is half walk, faithfully).

## Goals / Non-Goals

**Goals:** faithful escape-ladder climb across 224-226 with the room-specific limits and the
room-226 escape trigger, reachable via the dev hook.
**Non-Goals:** generic ladders (none exist); the full escape cutscene; reaching the rooms by play.

## Decisions

- **Ladder modes as dispatch branches** (6 ladder-walk, 7 ladder-climb) plugged into the
  control-mode `switch`. Ladder mode is entered only on `setRoom` into a ladder room (the
  {224,225,226} set), faithful to `SetLadderRoomEntry`.
- **Vertical transitions by sequence**, since the rooms aren't in the connection table: climbing
  past the top → room+1 (place at bottom), past the bottom → room-1 (place at top), within
  {224,225,226}; 224 clamps at its bottom; 226 top → escape ending. Wire the same 224↔225↔226
  links into `connections.json` for consistency, but the ladder code drives the transition.
- **Mount uses the tile grid** (`isLadder`, tile `0x08`) — but only while in a ladder room, so
  ordinary-room tile-8 false positives never trigger a climb.
- **Escape ending = a flag + on-screen banner** (minimal); the full ending scene is out of scope.
- **Sprites via the existing export path** (climb frames added like the death frames).

## Risks / Trade-offs

- **[Dev-hook-only access]** → documented divergence (access only; the mechanic is faithful). The
  door entry could be wired later when the Big Boss area is exported.
- **[Manual vertical links]** → the exporter doesn't emit ladder-room connections; we wire
  224↔225↔226 by hand and note it. Matches the ROM's sequential transition.
- **[Within-room climb extents]** → use the room's ladder tiles + the ROM Y limits; verify mount/
  exit/clamp don't fight the box collider (climb is vertical-only, snapped to the ladder column).

## Open Questions

- Escape ending presentation — a simple banner + return to title, or just a logged flag for now?
  (Lean: banner + reset to the dev room.)
