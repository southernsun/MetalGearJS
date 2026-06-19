## Why

Ladders let Snake move vertically — but in Metal Gear MSX they are not a generic tile mechanic.
Investigating the ROM (during this change's implementation) showed ladders are the **building-2
roof escape sequence** (rooms 224-226): `NormalCtrl` never climbs; the ladder control modes are
entered only via `SetLadderRoomEntry` on entering a ladder room, and `ChkExitLadders`/
`ChkLadderLimits` are hard-coded to rooms 224/226 (the top of 226 triggers the Outer Heaven escape
ending). With the control-mode dispatch and tile-type data in place, this change ports that
faithful escape-ladder climb.

## What Changes

- Entering a ladder room (224-226) enters **ladder-walk** mode (`CONTROL_LADDER_WALK`=6) at the
  floor — left/right only (`SetLadderRoomEntry`).
- On a ladder tile (`0x08`) + **Up**, Snake enters **ladder-climb** mode
  (`CONTROL_LADDER_CLIMB`=7, `PlayerAnimation=5`): vertical-only at the ROM climb speed (half
  walk), snapped to the ladder, climb animation (`ChkStartClimb`/`LaddersClimb`/`SetSprLadder*`).
- Step off at floor level with Left/Right (`ChkExitLadders`); climb past the top/bottom limit to
  the next/previous ladder room (`ChkLadderLimits`/`ChkNextLadderRoom`, 224 clamps at the bottom);
  the top of room 226 triggers the **escape ending** (`SetLeavedOuterH`).
- **Export**: the ladder-climb Snake frames, and rooms **224/225/226** (PNG + tile data) merged
  into the browser's room set, with their **224↔225↔226 vertical links wired manually** (the ROM
  does not put ladder rooms in the normal connection table).
- **Access via a `?room=224` dev hook** — the ladder door is the end-game escape and not reachable
  by walking from the start cluster. Documented divergence (access only).

**Out of scope:** ladders in ordinary rooms (there are none — the mode is room-specific); the full
escape cutscene/ending beyond setting the escape flag + an on-screen note; reaching the rooms by
normal play.

## Capabilities

### Modified Capabilities

- `browser-player-control-modes`: adds the escape-ladder modes (ladder-walk + ladder-climb), the
  mount/exit transitions, the cross-room climb (224↔225↔226), and the room-226 escape trigger.
- `rom-asset-export`: emits the ladder-climb Snake frames and the escape-ladder rooms (224-226)
  with their wired vertical links.

## Impact

- **Browser game** (`web/game.js`): a ladder-room set {224,225,226}; ladder-mode entry on
  `setRoom` into a ladder room; `laddersWalk`/`laddersClimb` branches in the control-mode
  dispatch; `ChkStartClimb` (tile `0x08` + Up); `ChkExitLadders`; `ChkLadderLimits`/cross-room
  transition; the room-226 escape ending (flag + banner); the `?room=224` dev hook entering ladder
  mode.
- **Export tooling**: add the ladder frames to the Snake spritesheet; export rooms 224/225/226 and
  merge them (+ the 224↔225↔226 links) into `web/assets`.
- **Source consumed (read-only)**: `Banks0123.asm` `LaddersWalk`/`LaddersClimb`/`ChkStartClimb`/
  `ChkExitLadders`/`ChkLadderLimits`/`ChkNextLadderRoom`/`SetSprLadder*`/`SetLeavedOuterH`/
  `ControlPlayerV`; `nextroom.asm` `SetLadderRoomEntry`; ladder tile `0x08`.
- **Depends on**: `player-control-modes` (dispatch) and `room-tile-types` (tile detection).
