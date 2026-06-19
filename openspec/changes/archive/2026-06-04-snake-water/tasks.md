> Depends on player-control-modes (dispatch) + room-tile-types (water-tile detection). Port the
> ROM water routines (Banks0123.asm); cite each. Water tiles: shallow 0x73–0x74 / brick 0x6D /
> shadow 0x6F–0x72; deep 0x75–0x76. RoomsWater = 70,73,74,77,78,105,106,107,211,212.

## 1. Assets

- [x] 1.1 Export the wading frames (`SetSprWater*`, ids ~28–31) and the deep-water swim frames (`SetSprDeepWater`, ids ~37–38) into `snake.png`/`snake.json`
- [x] 1.2 Export a water room (one shallow; deep optional) and wire its connection

## 2. Water modes

- [x] 2.1 Per tick in a water room, read the tile under Snake; set `PlayerAnimation=2` (shallow) or `=4` (deep) per the tile constants; restore `=0` on land
- [x] 2.2 Apply the room-dependent shadow-water rule (`RoomsWater`); brick-in-water (`0x6D`) = shallow
- [x] 2.3 Sprite selection: wading vs swimming animation; deep water = swim
- [x] 2.4 Deep-water oxygen drain (`SetInWaterMode3` → `DecrementLife_C`): in deep water without the scuba/oxygen tank, lose 2 life every 8 frames (gated by the shared invuln/damage-delay timer), death at 0. No item system yet → `hasScubaTank()` is always false (always drains); the oxygen item arrives with the item system. **Faithful: silent, no blink** — the ROM's deep-water drain plays no SFX and does not flash the sprite (only the electric floor has a damage SFX); the sole feedback is the life bar falling. (Verified by tracing the ROM; the earlier red/white blink + drain sound were untraceable inventions and were removed.)
- [x] 2.5 Deep-water sprite colour: `WaterShadowAttr` stacks two opaque (non-CC) planes — plane 0 (front) = colour index 14, plane 1 (behind) = index 15. SnakePal doesn't set those, so they keep the **room palette** values — verified via `--palette` that water rooms (77/105) have **14 = white (255,255,255), 15 = black (0,0,0)**. With correct MSX2 plane priority (front plane wins) the two frames are a **~100px white blob with only ~3 black "hole" pixels** (the behind-plane pixels that fall in the front plane's gaps), matching the **PUDDLE** sprites on the reference sheet (`examples/…Weapons, Items, Hostages, Projectiles, & Effects.png`). Fixed a renderer bug in `SnakeSprites` where non-CC planes overwrote each other instead of respecting plane priority — that had produced 17 black pixels instead of 3. (Earlier all-black / grey / all-white attempts were also wrong.)
- [x] 2.6 Export the water cluster (rooms 73–78,105 around 77) + connections so you can swim up/through and out (the exit is the room above, per the original) — `?room=77` dev hook

## 3. Verification

- [x] 3.1 Headless: enter shallow → anim 2; enter deep → anim 4; leave → anim 0
- [x] 3.2 Manual browser: wade through shallow water, swim in deep water, exit onto land
- [x] 3.3 Regression: dry-land movement/doors/guard unaffected; confirm ROM citations
- [x] 3.4 Update `Tools/coverage/coverage-map.json` (mark the water routines done) and regenerate `docs/rom-coverage.md`
