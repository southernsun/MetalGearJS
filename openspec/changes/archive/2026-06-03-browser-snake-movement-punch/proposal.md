## Why

The repository fully documents the Metal Gear (MSX2) ROM and has C# tools that reconstruct
its graphics, rooms, and sound directly from the disassembly. The natural next step is to
*play* a piece of it in a browser. Starting with the most fundamental interaction — Solid
Snake walking around a real room, then throwing a punch with its sound effect — gives us a
runnable, faithful slice of the game on the web and establishes the asset and engine
foundation every later feature (enemies, weapons, doors) will build on.

## What Changes

- Add an **offline asset-export step** that turns ROM/disassembly data into static files a
  browser can load with no decoding logic of its own: Snake's sprite frames → a PNG
  spritesheet + JSON atlas, one starting room → a background PNG plus a per-tile collision
  map (JSON), and the punch sound effect → a WAV.
- Add a **browser game** (vanilla HTML/JS/Canvas, no build tooling) that renders the
  starting room and lets Snake walk in four directions with the correct walking animation
  and idle frames, using keyboard input at the game's 256×192 native resolution (scaled up).
- Implement **tile collision** so walls and solid scenery block Snake, reproducing the
  original's per-tile solid bitmap and two-point-per-direction box check rather than a
  bounding box guessed by eye.
- Add a **punch action**: a key triggers Snake's directional punch animation frame and
  plays the exported punch sound effect via the Web Audio API.
- No changes to the disassembly itself — the `.asm` sources remain the source of truth; the
  export step reads them (or reuses the existing C# decoders) to produce derived assets.

## Capabilities

### New Capabilities

- `rom-asset-export`: An offline build step that derives browser-ready assets from the
  disassembly — Snake's movement and punch sprite frames as a PNG spritesheet with a JSON
  atlas, a chosen starting room as a background PNG, that room's per-tile collision map as
  JSON, and the punch SFX as a WAV — written to a `web/assets/` folder the game loads at
  runtime.
- `browser-snake-movement`: A browser game that renders the starting room and moves Solid
  Snake in four directions with the correct walk/idle animation, scaled-up native
  resolution, keyboard controls, and tile-based collision that blocks walls and solid
  scenery faithfully to the ROM.
- `browser-snake-punch`: A punch action layered on the movement game — a key triggers
  Snake's directional punch sprite for a short fixed duration and plays the exported punch
  sound effect, then returns to the normal movement state.

### Modified Capabilities

<!-- None. This is greenfield browser work; no existing openspec specs to modify. -->

## Impact

- **New code/assets** (none of the existing disassembly is modified):
  - `web/` — `index.html`, `game.js` (and any small JS modules), plus `web/assets/`
    containing the exported PNG/JSON/WAV files.
  - An export script/tool (e.g. a small Python script under `Tools/` or an added export mode
    on an existing C# tool such as the RoomViewer / SpriteMover / ThemeOfTaraPlayer) that
    produces the assets in `web/assets/`.
- **Source data consumed (read-only)**: `gfx/sprites.asm` (Snake walk + `SprSnakePunch*`
  frames), `data/playersprite.asm` (sprite attributes/colors), `data/rooms.asm` +
  `data/metatiles.asm` + tileset/palette tables (chosen room background), the room's
  collision-tile bitmap (`CollTiles*`), and `sound/sfx/SfxPunch.asm` + the BGM/PSG driver
  data (punch SFX → WAV).
- **Dependencies**: Browser runtime only (Canvas 2D + Web Audio). The export step depends on
  the existing toolchain already used in the repo (.NET 8 for the C# tools, or Python for a
  standalone script); no new runtime dependency is shipped to the browser.
- **Out of scope** (future changes): enemies/AI, weapons other than the punch, doors/room
  transitions, the HUD, music playback, and save/load.
