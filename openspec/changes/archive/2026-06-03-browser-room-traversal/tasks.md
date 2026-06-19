## 1. Export: connection table in GameData

- [x] 1.1 Add `data/roomsconnections.asm` to `GameData.LoadFrom` and expose `int[] Connections(int room)` returning `[up,down,left,right]` (raw bytes, `255` preserved), read from `RoomConnections`
- [x] 1.2 Unit-sanity the parse: room 0 returns `[1,121,255,4]` — confirmed in export output

## 2. Export: multiple rooms + connections + manifest

- [x] 2.1 Extend RoomViewer `--export-web` to accept a room set — a start room + max count (default building cluster from room 0) — and resolve it via BFS over `Connections`, keeping only `RoomDefined` rooms within the cap
- [x] 2.2 For each room in the set, write `web/assets/rooms/<n>.png` (256×192) and `web/assets/rooms/<n>.collision.json` (32×24), reusing the existing render + collision-expansion code per room number
- [x] 2.3 Write `web/assets/connections.json` keyed by room number with `{up,down,left,right}`, mapping `255` → `null`, and `null` for any neighbor not in the exported set
- [x] 2.4 Write `web/assets/manifest.json` = `{ "rooms": [...], "start": 0 }`
- [x] 2.5 Run the export; verify every manifest room has a PNG + collision file and connections are internally consistent (16 rooms; no dangling refs)

## 3. Browser: room manager

- [x] 3.1 In `game.js`, load `manifest.json` and `connections.json` at startup
- [x] 3.2 Preload every manifest room's PNG + collision JSON into an in-memory map (keyed by room number) during the load screen
- [x] 3.3 Add `setRoom(n)` that makes room `n` active (swaps the background image + collision map used by rendering/collision); start on `manifest.start`
- [x] 3.4 Draw the active room's background each frame (replacing the single hardcoded room)

## 4. Browser: edge-crossing transitions

- [x] 4.1 In the movement step, detect when the candidate position crosses a room boundary (x<0, x≥256, y<0, y≥192) and identify the exit direction
- [x] 4.2 Treat off-room probe pixels as open for the exit direction only when `connections[room][dir]` is a room present in the manifest; otherwise keep off-room solid (edge stays blocked)
- [x] 4.3 When Snake crosses an open connected edge, call `setRoom(neighbor)` (hard cut, no scroll); leave unconnected/blocked edges stopping him exactly as before
- [x] 4.4 Guard against loading a neighbor absent from the manifest (treat as null/dead-end via `neighbor()`)

## 5. Browser: entry placement

- [x] 5.1 On transition, preserve the shared-axis coordinate and set the crossing coordinate just inside the opposite edge (`ENTER_MARGIN`) per the direction table
- [x] 5.2 If the entry point is solid in the new room, search along the entry edge for the nearest open tile to the preserved coordinate and place Snake there
- [x] 5.3 Preserve Snake's facing and walk/idle/punch state across the cut; ensure the next step does not immediately bounce back

## 6. Verification and polish

- [x] 6.1 Headless smoke test: load the game, confirm the start room renders and the manifest/connections load without errors (only the expected AudioContext-autoplay log)
- [x] 6.2 Simulate (node) walking off each connected edge of a few rooms and confirm the correct neighbor + a clear (non-solid) entry position both ways — 24 open passages cross both ways, 0 failures; 22 walled edges (door-only, deferred) correctly block
- [x] 6.3 Manually verify in a browser: walk between several connected building rooms, both directions, with collision intact and continuous movement across cuts
- [x] 6.4 Confirm unconnected edges still block and no transition loads a missing room — node sim: 0 wrong-neighbor/missing-room transitions; `neighbor()` returns null for non-manifest rooms
- [x] 6.5 Confirm only static assets are loaded at runtime (rooms/, connections.json, manifest.json, sprite + punch assets)
