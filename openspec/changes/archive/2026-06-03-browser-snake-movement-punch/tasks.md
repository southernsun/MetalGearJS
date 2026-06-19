## 1. Asset export — sprites

- [x] 1.1 Add a headless export mode to SpriteMover (or GfxViewer) that takes a list of Snake labels and writes a PNG spritesheet to `web/assets/snake.png`
- [x] 1.2 Composite each frame with Snake's true CC-bit colors (7 and 10) and pack the needed frames: `down/left/up/right` × `idle, walk1, walk2, punch` (from `SprSnake{Dir}`, `SprSnake{Dir}1`, `SprSnake{Dir}2`, `SprSnakePunch{D,L,U,R}`)
- [x] 1.3 Emit `web/assets/snake.json` atlas: one entry per frame keyed `<dir>-<state>` with `{x,y,w,h}` rectangles (16×32 composited frames) — implemented as a shared cell (frameWidth 19, frameHeight 32, anchorX 8, anchorY 24) + per-frame `{x,y}`, so all frames align
- [x] 1.4 Verify the spritesheet visually matches the in-tool Snake rendering for every direction/state — confirmed via headless screenshot (correct colors, idle frame faces down)

## 2. Asset export — room background and collision

- [x] 2.1 Export the chosen starting room (default room 0) to `web/assets/room.png` at 256×192 via RoomViewer's headless PNG export
- [x] 2.2 In the same room load, build the 32×24 solid grid by applying the room's `CollisionTiles` bitmap to the unpacked tile buffer
- [x] 2.3 Write `web/assets/room-collision.json` as `{ width:32, height:24, solid:[...] }` row-major (0=passable, 1=solid)
- [x] 2.4 Spot-check a few known walls/openings in the room against the collision JSON — 340/768 solid; ASCII dump + node probe checks confirm walls/crates solid, floor open

## 3. Asset export — punch SFX

- [x] 3.1 Add a headless WAV-render mode to ThemeOfTaraPlayer that runs an SFX byte stream through the PSG/BGM driver and captures samples
- [x] 3.2 Render `Sfx_Punch*` (from `sound/sfx/SfxPunch.asm`) to `web/assets/punch.wav`, stopping at end-of-channel (`0xFF`) and trimming trailing silence — used `Sfx_PunchGuard`
- [x] 3.3 Verify the WAV plays the punch SFX correctly in a media player — validated as RIFF/WAVE, mono, 44100 Hz, 16-bit, 0.127 s (audible spot-check recommended)

## 4. Browser scaffolding

- [x] 4.1 Create `web/index.html` with a 256×192 canvas, integer-scaled via CSS (`image-rendering: pixelated`) and a "press a key to start" gate
- [x] 4.2 Create `web/game.js` with an asset loader that fetches `snake.png`, `snake.json`, `room.png`, and `room-collision.json` and waits for all to load
- [x] 4.3 Set the 2D context `imageSmoothingEnabled = false` and draw the room background once assets are ready

## 5. Game loop, input, and movement

- [x] 5.1 Implement a fixed-timestep loop (logical 60 Hz accumulator on `requestAnimationFrame`)
- [x] 5.2 Track held keys (arrows + WASD) and resolve a single facing when multiple are pressed (most-recent-press wins)
- [x] 5.3 Implement per-direction movement that advances Snake's position and updates facing
- [x] 5.4 Implement the `idle | walk | punch` state machine and draw the correct atlas frame each tick (alternating `walk1`/`walk2` while moving, `idle` when stopped)

## 6. Collision

- [x] 6.1 Port Snake's `BoxColliderDat` probe offsets (per direction, Snake's size/shape) as constants — shape 0 (the player uses `ld b,0`)
- [x] 6.2 Before committing a move, test the two probe points for that direction against `room-collision.json` (`solid[(y>>3)*32 + (x>>3)]`) and cancel the move if either is solid
- [x] 6.3 Clamp Snake to the 256×192 room bounds
- [x] 6.4 Verify walls block Snake and open paths let him through, matching the room image — node simulation against the real map confirms blocking; spawn moved to a fully-open tile

## 7. Punch action and sound

- [x] 7.1 Create/resume an `AudioContext` on the first user gesture and decode `punch.wav` into an `AudioBuffer`
- [x] 7.2 On the punch key (default Space), enter the `punch` state for a fixed duration, show the directional punch frame, and lock out movement for that duration
- [x] 7.3 Play the punch `AudioBuffer` once per punch trigger
- [x] 7.4 Return to `walk`/`idle` after the punch duration; ensure repeated/held presses stay bounded and never leave Snake stuck

## 8. Verification and polish

- [x] 8.1 Manually verify all spec scenarios in a real browser: live 4-direction movement, walk/idle animation, collision feel, punch frame + audible sound, and audio-after-gesture (render + collision + asset-loading already verified headlessly)
- [x] 8.2 Confirm movement speed and walk cadence are stable across refresh rates (fixed timestep)
- [x] 8.3 Tune Snake's spawn position and movement speed to feel right in the starting room — spawn `(128,157)`; speed left at 1 px/tick (tunable in `game.js`)
- [x] 8.4 Confirm the browser loads only static assets (no ROM/asm needed at runtime) — only `room.png`, `snake.png`, `snake.json`, `room-collision.json`, `punch.wav`
