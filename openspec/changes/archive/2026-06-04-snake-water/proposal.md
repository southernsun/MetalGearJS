## Why

Water rooms put Snake into wading (shallow) or swimming (deep) modes. With the control-mode
dispatch and tile-type data in place, this change adds water, ported from the ROM
(`ChkWater`/`ChkWaterTiles`/`SetInWaterMode`/`SetDeepWaterMode`).

## What Changes

- The tile under Snake in a water room sets shallow water (tiles `0x73–0x74`, brick `0x6D`, shadow
  `0x6F–0x72`; `PlayerAnimation=2`, wading sprite) or deep water (`0x75–0x76`; `PlayerAnimation=4`,
  swimming sprite); moving back onto land restores the walk animation.
- Movement stays under normal control in water (the ROM keeps the same control); only the sprite
  /animation changes (shallow vs deep).
- Deep-water oxygen drain is **deferred** (left as a gated hook — no item system / UI yet).
- **Export**: the wading + deep-water swim Snake frames, and at least one **water room** with its
  connection, so the mode is reachable.

**Out of scope:** ladders, box, weapons (their own changes); deep-water oxygen damage + UI;
deep-water-only rooms beyond one example.

## Capabilities

### Modified Capabilities

- `browser-player-control-modes`: adds shallow- and deep-water modes driven by the tile under
  Snake in water rooms, with the wading/swimming animations.
- `rom-asset-export`: emits the shallow-water and deep-water Snake sprite frames and exports a
  water room (with connection) so water is reachable.

## Impact

- **Browser game** (`web/game.js`): per-tick water check using the tile-type grid + the water-room
  list; set `playerAnimation` 2/4; sprite selection for wading/swimming; restore on land.
- **Export tooling**: add the water/deep-water frames to the Snake spritesheet; export a water room
  + connection.
- **Source consumed (read-only)**: `Banks0123.asm` `ChkWater`/`ChkWater2`, `ChkWaterTiles`/`2`/`3`,
  `RoomsWater`, `SetInWaterMode`/`2`/`3`, `SetDeepWaterMode`, `SetSprWater*`, `SetSprDeepWater`;
  water tile constants `0x6D`, `0x6F–0x76`.
- **Depends on**: `player-control-modes` (dispatch) and `room-tile-types` (water-tile detection).
