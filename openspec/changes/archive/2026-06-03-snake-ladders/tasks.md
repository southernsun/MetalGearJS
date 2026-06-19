> Re-scoped after ROM review: ladders are the building-2 roof ESCAPE (rooms 224-226), entered via
> SetLadderRoomEntry, room-specific limits, room-226 top = escape ending. Access via ?room=224 dev
> hook. Port from Banks0123.asm (Ladders*/ChkStartClimb/ChkExitLadders/ChkLadderLimits/
> ChkNextLadderRoom/SetSprLadder*/SetLeavedOuterH) + nextroom.asm (SetLadderRoomEntry); cite each.
> Depends on player-control-modes (dispatch, archived) + room-tile-types (isLadder, archived).

## 1. Assets

- [x] 1.1 Export the ladder-climb Snake frames (`SetSprLadder*`, sprite ids ~39-40) into `snake.png`/`snake.json`
- [x] 1.2 Export rooms 224, 225, 226 (PNG + collision/tiles) and merge them into `web/assets` (rooms/, manifest.json)
- [x] 1.3 Wire the 224↔225↔226 vertical links into `connections.json` (the ROM doesn't put ladder rooms in the connection table — manual, sequential)

## 2. Ladder modes (control-mode dispatch branches)

- [x] 2.1 Ladder-room set {224,225,226}; on `setRoom` into one, enter ladder-walk mode (6) at the floor (`SetLadderRoomEntry`: Y≈0x9E, X≈0xD8, dir left)
- [x] 2.2 `laddersWalk` (mode 6): left/right at walk speed; `ChkStartClimb` — on a ladder tile (`isLadder`/`0x08`) + Up → climb mode (7), anim 5. **Fix:** detect the ladder at the tile at `PlayerX-4` (the ROM's `GetTilePlayer` "ladder left tile"), not the player's centre tile — testing the centre let you mount only from the ladder's left edge; the `X-4` check matches the ROM and lets you mount from the centre/right. No X-snap on mount (ROM keeps PlayerX).
- [x] 2.3 `laddersClimb` (mode 7): vertical-only at `SPEED/2` (ROM climb 0x0100 = half walk), climb animation; `ChkExitLadders` — at floor level + Left/Right → ladder-walk
- [x] 2.4 `ChkLadderLimits`/`ChkNextLadderRoom`: past top (Y<16) → room+1 placed at bottom; past bottom (Y≥186) → room-1 placed at top; room 224 clamps at its bottom
- [x] 2.5 Room 226 top (Y<0x10) → escape ending (`SetLeavedOuterH`): set a flag + show a banner (minimal)
- [x] 2.6 `?room=224` dev hook enters ladder mode (not walk-reachable — documented divergence)

## 3. Verification

- [x] 3.1 Headless: enter 224 → ladder-walk; on a ladder tile + Up → climb; up/down constrained & 1px-equivalent; exit at floor; cross-room 224→225→226; 226 top → escape flag
- [x] 3.2 Manual browser (`?room=224`): walk to the ladder, climb up through 224→225→226, step off, reach the top → escape banner
- [x] 3.3 Regression: ordinary-room movement/doors/guard unaffected; no climb in non-ladder rooms; confirm ROM citations + the documented divergences (dev-hook access, manual links, speed scaling)
- [x] 3.4 Update `Tools/coverage/coverage-map.json` (ladder routines done) and regenerate `docs/rom-coverage.md`
