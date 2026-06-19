> Prerequisite for snake-ladders / snake-water. Export raw tile numbers; classify in JS against
> the ROM tile constants (cite them). No behaviour change.

## 1. Export tile-type grid

- [x] 1.1 Extend the room/collision exporter to emit a per-tile `tiles[]` (raw tile numbers) into each `*.collision.json`, alongside the existing `solid[]`
- [x] 1.2 Re-export the existing rooms; confirm `tiles[]` length == width*height and `solid[]` is unchanged

## 2. Browser tile classification

- [x] 2.1 Load `tiles[]` in `game.js` (on the active room's collision object)
- [x] 2.2 Add helpers `isLadder` (`0x08`), `isShallowWater` (`0x73–0x74`, brick `0x6D`, shadow `0x6F–0x72` per `RoomsWater`), `isDeepWater` (`0x75–0x76`) — each citing the ROM constant

## 3. Verification

- [x] 3.1 Spot-check the exported `tiles[]` against the ROM tiles for a known room (e.g. confirm ladder/water tile positions)
- [x] 3.2 Confirm existing movement/collision/doors are unaffected (solid bitmap path unchanged)
