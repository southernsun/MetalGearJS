## 1. Export: door data in GameData

- [x] 1.1 Add `data/doors.asm` to `GameData.LoadFrom`; expose `Doors(int room)` decoding the room's `DoorsRoomNNN` list (5-byte records `[ID, Type, DrawY, DrawX, DestRoom]`, `0xFF` terminator; `NoDoorsRoom` → empty)
- [x] 1.2 Expose the door type table: `DoorTypeInfo(int type)` reading `DoorOpenEnterDat` at `(type-1)*8` → `{openOffX/Y (signed), openNX/Y, enterOffX/Y (signed), enterNX/Y}`
- [x] 1.3 Sanity-check the parse against known records (room 6 door `dest=7`; room 7 doors `dest=6` and `dest=11`) — confirmed in export output

## 2. Export: doors.json, door-types.json, door.wav

- [x] 2.1 In RoomViewer `--export-web`, for each exported room write its usable doors to `web/assets/doors.json` (keyed by room → `[{id,type,x,y,dest}]`)
- [x] 2.2 Apply filtering: drop doors with `dest ≥ 0xF0` (elevators), known fake/special doors, and doors whose `dest` is not in the exported room set; log dropped doors with the reason
- [x] 2.3 Write `web/assets/door-types.json` from `DoorOpenEnterDat` (all referenced types), with signed offsets preserved
- [x] 2.4 Add a `Sfx_Door` render mode to ThemeOfTaraPlayer (reuse the punch-WAV offline render) → `web/assets/door.wav`
- [x] 2.5 Run the export; verify `doors.json` has entries for rooms with in-cluster doors (6,7,11), every door `dest` is in the manifest, and `door.wav` is a valid WAV (0.577 s)

## 3. Browser: load + render doors

- [x] 3.1 In `game.js`, load `doors.json` and `door-types.json` at startup (alongside manifest/connections)
- [x] 3.2 Build per-room door state (open flag + open timer) for the active room; reset/rebuild it on `setRoom`
- [x] 3.3 Compute each door's footprint rect `(x+openOffX, y+openOffY, openNX, openNY)` from its type
- [x] 3.4 Draw the active room's doors each frame using the real decoded door graphics (4bpp `GfxDoorFront/Down/Left/Right` → transparent PNGs per orientation, exported with the building palette); closed/opening draws the sprite, open draws nothing so the room shows through (verified via room 6/7/11 screenshots)

## 4. Browser: open + collision

- [x] 4.1 Make closed-door footprints solid: `closedDoorBlocking()` rejects candidate positions whose probes fall inside a closed door of the active room; open doorways override wall tiles via `inOpenDoor()`. **Fix:** collision is now separate from rendering (`doorCollRect`, per-type from `drawdoors.asm`) — the angled east/west doors collide at the passage base `(X[,−8], Y+32, 16, 32)`, not the draw rect, so they no longer walk-through; north re-centered (render offX 0, collision X−4 ×32)
- [x] 4.2 When Snake contacts a closed door, start opening it: play `door.wav` once and run `DOOR_OPEN_TICKS`, then mark it open (passable); don't replay on an already-open door
- [x] 4.3 Decode `door.wav` into an `AudioBuffer` (after the audio gesture) and play it on open, like the punch sound

## 5. Browser: enter + transition

- [x] 5.1 Detect Snake entering an open door's enter zone (with a "was-in-door" latch so arrival doesn't immediately re-trigger)
- [x] 5.2 On enter, `setRoom(dest)` and place Snake at the destination room's door with the matching `id`, offset by that door type's enter offsets, clamped + settled onto open floor, facing preserved
- [x] 5.3 Handle a missing matching door in the destination: place Snake at a safe default (room centre / nearest open tile), log once, never off-screen
- [x] 5.4 Confirm open-edge crossings and unconnected-edge blocking still behave exactly as before (edge logic runs unchanged when no door is involved)

## 6. Verification and polish

- [x] 6.1 Headless smoke test: game loads with doors.json/door-types.json/door.wav, room renders, no console errors (only the expected AudioContext-autoplay log)
- [x] 6.2 Simulate (node) entering a door both ways and confirm the correct destination + clear entry, and that a closed door blocks until opened — 6↔7, 7→11, 11→7 all OK; closed doors blocked-while-closed
- [x] 6.3 Manually verify in a browser: walk into a door, hear it open, enter it, arrive in the destination room at the matching door; confirm closed doors block and the door SFX plays
- [x] 6.4 Confirm only static assets are loaded at runtime (doors.json, door-types.json, door.wav + existing assets) and no filtered/elevator door is ever loaded (doors.json contains only in-cluster doors)
- [x] 6.5 Tune `DOOR_OPEN_TICKS` (18) and placement; replaced the placeholder rectangles with the real decoded door graphics per orientation. Also fixed audio from user feedback: the punch/door SFX render quiet (~0.15 peak) so the exporter now normalizes them to 0.9 peak — the audio pipeline itself (gesture unlock, decode, playback) was verified working via CDP
