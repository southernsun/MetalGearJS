## Why

The room export only emits a solid-collision bitmap (`{width,height,solid[]}`) — it discards the
actual tile numbers. The upcoming movement modes need to recognise specific tiles: ladders
(`0x08`) and shallow/deep water (`0x73–0x76`). Without per-tile type data those modes can't be
detected at all. This change adds that data to the export — the prerequisite for `snake-ladders`
and `snake-water`.

## What Changes

- Extend the room/collision exporter to emit, alongside `solid[]`, a per-tile **tile-number grid**
  (one entry per tile) so the browser can classify any tile (ladder, shallow/deep water, …), not
  just solid/open.
- Load the grid in `game.js` and add tile-classification helpers (`isLadder`, `isShallowWater`,
  `isDeepWater`) using the ROM tile constants — used by later changes.

**Out of scope:** any movement behaviour (ladders/water are their own changes); changing the solid
bitmap or other exports.

## Capabilities

### Modified Capabilities

- `rom-asset-export`: the room export additionally emits a per-tile tile-type (tile-number) grid
  so the browser can detect ladder and water tiles, not only solidity.

## Impact

- **Export tooling**: extend the room/collision exporter to write a `tiles[]` array (raw tile
  numbers) into each `*.collision.json`.
- **Browser game** (`web/game.js`): load `tiles[]`; add `isLadder`/`isShallowWater`/`isDeepWater`
  helpers keyed off the ROM constants (`0x08`; `0x73–0x74`/`0x75–0x76`; shadow `0x6F–0x72`,
  brick-in-water `0x6D`).
- **Source consumed (read-only)**: the room tileset/`CollisionTiles` data the exporter already
  reads; `Banks0123.asm` water/ladder tile checks for the constant values.
- **Dependencies**: none. Prerequisite for `snake-ladders` and `snake-water`.
