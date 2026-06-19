## Context

`web/assets/rooms/*.collision.json` is `{width,height,solid[]}` — a solidity bitmap derived from
the room's tiles, but the tile numbers themselves are dropped. The ROM detects ladders (tile
`0x08`) and water (`0x73–0x76`, shadow `0x6F–0x72` by room, brick-in-water `0x6D`) by reading the
tile under Snake. So the browser needs the per-tile type data the modes will key off.

## Goals / Non-Goals

**Goals:** emit a per-tile tile-number grid per room and expose tile-classification helpers in JS.
**Non-Goals:** any movement behaviour; new sprites; new rooms.

## Decisions

- **Emit the raw tile-number grid** (`tiles[]`, one byte per tile) next to `solid[]`. Most faithful
  and future-proof (any later tile-driven feature can use it). *Alternative:* compact ladder/water
  masks — smaller but throws away information we'll likely want; rejected.
- **Classify in JS, not the exporter.** Ship raw tile numbers; derive `isLadder`/`isShallowWater`/
  `isDeepWater` in `game.js` from the ROM constants, so the tile→meaning mapping lives next to the
  code that uses it and can cite the ROM.

## Risks / Trade-offs

- **[Bigger room JSON]** → ~one byte/tile (≤768/room) — negligible.
- **[Tile constants differ by room (shadow water depth)]** → encode the raw tile; let the JS
  helper apply the room-dependent rule (shadow `0x6F–0x72`), citing `RoomsWater`.
