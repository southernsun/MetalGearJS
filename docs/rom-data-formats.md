# How the ROM stores its data

A reference for the Metal Gear (MSX2) disassembly's data formats, as verified while porting
slices to `web/`. Every section cites the defining source (`.asm` file / routine) — when in
doubt, the disassembly wins over this document. Exporters under `Tools/` decode these
formats into `web/assets/*.json|png|wav`; this file explains what they are decoding.

> **Note:** `.asm` / `file:line` citations and `room_images/` references in this doc refer to the separate MSX disassembly repo ([southernsun/MetalGear](https://github.com/southernsun/MetalGear)), expected as a sibling clone at `../MetalGear`.

General conventions used throughout the ROM:

- **BCD counters.** Ammo, rations, frequencies, and timers that are displayed as digits are
  binary-coded decimal (`add a, 1 / daa` — e.g. `DecItemUnits` Banks0123.asm:1824,
  `ChgRadioFreq` :10931). One byte holds two decimal digits (0x85 = "85").
- **8-bit wrap as signed offsets.** Position tables store negative offsets as wrapped bytes:
  `0xF8` acts as −8, `0xF6` as −10 (`PlayerInDoorDat`, logic/nextroom.asm:463). Adds are
  8-bit, so the wrap is the sign.
- **Y-before-X words.** `dw` coordinate words usually store Y in the low byte and X in the
  high byte (items, text XYs: "dw YX").
- **0xFF / 0xFE terminators.** Lists end on 0xFF; 0xFE is an in-stream control (new XY in
  text blocks, opcode prefix in sound data).
- **Tick domain.** Timing constants count iterations of `GameStatusLogic` (incremented at
  Banks0123.asm:10059), which the 60Hz VDP interrupt SKIPS while the previous iteration is
  still running (`TickInProgress`, :456-463) — effectively ~30Hz during gameplay. The sound
  driver (`UpdateSound`) runs on every interrupt regardless, i.e. true 60Hz.

## Graphics

All tile/sprite pixels are planar, MSB = leftmost pixel.

- **1bpp glyphs** (`gfxFont` + `gfxSymbChars`, gfx/font.asm): 8 bytes per 8×8 glyph, one bit
  per pixel, coloured at load time (`LoadFont`, logic/loadfont.asm: white 0x0E for text,
  yellow 0x06 for the rank star, red for `gfxFreqDigits` — the 13 digital digits used by the
  radio frequency and the destruction timer). `DrawChar` (Banks0123.asm:4721) maps character
  code → VRAM tile as `char + 0x10` ('0' = 0x30 → tile 0x40). NOTE: the glyph run contains
  `IF (JAPANESE)` blocks (the 0x5C period — Western LOW dot vs Japanese centered dot — and
  the 0x97/0x98 apostrophe/dakuten pair); any parser must take exactly ONE branch (the
  Western `ELSE`) or every glyph after 0x5B shifts (this bug shipped once: dots printed as
  the centered Japanese dot until AsmParser learned IF/ELSE/ENDIF).
- **2bpp tiles** (`gfxCALL`, gfx/font.asm:87; decoder `Decode2bppRow` Banks0123.asm:5076):
  16 bytes per tile — per row two bytes, FIRST byte = low bit-plane, SECOND = high. Pixel
  index = (highBit<<1)|lowBit, looked up in a 4-entry colour table loaded into
  `BufferColor` (the CALL sign uses `colorsCALL: 6, 8, 0x0E, 0x0F`, logic/loadfont.asm:57).
- **3bpp tiles** (room tilesets, `GfxItems`, alert icon; decoder `Decode3bppTile`): 24 bytes
  per tile — per row three plane bytes giving a 0-7 index mapped through a per-set colour
  table (e.g. `ColorsItems`). See Tools/RoomViewer/README.md for the full render pipeline
  (rooms are metatile grids over these tilesets; two 256-tile banks exist, `TilesetBank`
  selecting the second for screens like the radio).
- **Tile maps / "tile blocks"** (data/tileblocks.asm): a header then raw tile numbers, row
  by row. Two header shapes: `db rows / db cols` (e.g. `RadioTilesMap: 9 rows × 18 cols`)
  or `dw 0xHHWW` (e.g. `SnakeTilesMap: dw 404h` = 4×4, `SnakePicture0-2` 2×2 mouth/eye
  variants). Drawn by `DrawTilesBlock` at a VRAM XY.
- **Sprites** are 16×16 OR-pairs: two 8×16 hardware sprites overlaid per frame. The guard
  sheet (`SprGuard`, 32 sprites) packs upper bodies as pairs 0-7 (per direction) and legs at
  `8 + phase*8 + 2*dir` (3 phases); colours come from `ActorSprColors*` tables. Snake's
  damage-red variants are palette swaps (`SnakeAttrDamage`, Banks0123.asm:5489).

## Rooms, collision, connections

- A room is a grid of metatiles indexing into a tileset (per-room tileset + palette ids);
  collision/walkability is derived from tile attributes. The decode is fully ported in
  Tools/RoomViewer (see its README — `Decode3bppTile`, `TileSetBuilder`, metatile sets);
  the web export flattens each room to a PNG + a `solid[]`/`tiles[]` collision JSON.
- **Connections**: per-room up/down/left/right neighbour table (`GetNextRoomNum`); values
  ≥ 0xF0 are elevators (`SetNextRoomElev`, logic/nextroom.asm:64). Edge entry positions for
  non-door crossings come from `EntryRoomXY` (logic/nextroom.asm:362, one YX word per
  direction).

## Doors (`DoorsList`, 16 bytes per door)

Layout per logic/nextroom.asm:121: `0=ID, 1=Open, 2=LogicOpen(lock), 3=Type(render), 4=Cnt,
5=DrawY, 6=DrawX, 7=OpenOffY, 8=OpenNY, 9=OpenOffX, 10=OpenNX, 11=EnterOffY, 12=EnterNY,
13=EnterOffX, 14=EnterNX, 15=DestinationRoom`.

- **Lock** (`LogicOpen` & 0x1F, `ChkOpenDoor` logic/doors/opendoor.asm): 0 = plain, 1 =
  elevator, 2-9 = keycard L (opened by card L−1: `ChkCard`), others = punch/lorry/wall.
- **Render type** (1-19) selects the door graphic AND the entry placement: on entering a
  room through a door, `SetPlayerInDoor2..4` (logic/nextroom.asm:397-453) places the player
  at `DrawYX + PlayerInDoorDat[(type-1)*3]` — a 19-entry `[offY, offX, direction]` table
  (:463-481, wrapped-byte offsets, direction 1=up 2=down 3=left 4=right).
- Door collision differs from the drawn sprite (drawdoors.asm): E/W doors collide at the
  passage base `(X[,−8], Y+32, 16, 32)`.

## Elevators

- **Per-elevator data** (data/elevatorrooms.asm; `GetElevatorRoomDat` Banks0123.asm:980):
  elevator room (240 + index) → `dw limitUp,limitDown`, then `db prevRoom / dw playerY,
  elevatorY` per floor. Room 240: floors room 31 (0x34/0x38, top) and room 3 (0xB4/0xB8,
  bottom).
- **Floor mapping is DOORS, not connections**: a floor room reaches its elevator through a
  **type-5** door (opens pushing UP; dest ≥ 0xF0 — room 3: id 2 at (0x64,0), dest 240,
  data/doors.asm:308), and the elevator room exits through **type-6** doors at X 0xE0, one
  per floor Y (room 240: id 2 → room 3 at Y 0x98; id 0x22 → room 31 at Y 0x18,
  data/doors.asm:848) — paired with the floor rooms' doors by ID. Type 5/6 are lock 1
  (`ChkElevatorDoor`, logic/doors/opendoor.asm:51: type 5 needs PlayerDirection up, type 6
  right, then the normal touch check). `GetNextRoomNum` (Banks0123.asm:889) gives room 240
  NO connections (0xFF); rooms 241-250 use connection rows (table index room−95) for the
  multi-room shafts.
- **Entry placement** (`SetDoorDestination` → `SetElevatorPosY`, logic/nextroom.asm:152-193):
  door dest ≥ 0xF0 → player at (0xD8, floor playerY), cabin at (0x70, floor elevatorY);
  `LocatePlayerEntry` → `SetElevatorCtrl` (control mode 2, facing left). Returning to a
  floor room goes through the paired door → `SetPlayerInDoor` (PlayerInDoorDat type 5).
- **The ride** (`ChkCtrlElevator` Banks0123.asm:9082 + `ElevatorRoomLogic`
  logic/elevatorroom.asm): start only inside the cabin (X < 0x78), direction masks per room
  (240-242 both, 243-244 up-only, 245-246 down-only, ≥ 247 both); GameMode 6 moves cabin +
  player 1px/iteration; floor stops at cabin Y 0x38/0x78/0xB8 (express rooms 247-250 skip
  while the direction is held); Y < 24 / ≥ 208 exits the shaft (NextRoomDirect = dir; the
  connection-entry path `SetNextRoomElev` parks the cabin at 0xD0/0x18). The elevator-room
  walk clamps X at 104 left and exits via `ExitRoom` right at ≥ 244 (connection rooms only —
  in room 240 the type-6 doors at X 0xE0 intercept first).
- **Graphics**: elevator rooms use the `TileSetElevator` room tileset (`GfxElevators`);
  the cabin is 12 hardware sprites = 6 OR-pairs (`SprElevatorDat` offsets/patterns/colours,
  logic/elevatorroom.asm:230) from `SprElevator` (gfx/sprites.asm:449, the common RLE sprite
  encoding) loaded at pattern base 0x38 (`SprSetElevator`, data/spritesets.asm:69).

## The capture flow + breakable walls

- **Trigger** (`CommonLogic`, logic/common.asm:26-47): every play frame, if `EquipBagTaken`
  is clear and the player stands in room 8 at X 0xC0-0xD0, GameMode → 0x0B
  (`GAME_MODE_CAPTURED`). The flag makes the scene once per game.
- **The scene** (logic/capturescene.asm): `CaptureSceneLogic` (status-indexed) spawns guard A
  at (0xF0, PlayerY) — his actor logic (`CaptureGuardsLogic`) waits 2 iterations, shows
  text 6 "DON'T MOVE!" via `SetTextUnskippable` (SkipTextMode **2**: keys ignored, pages
  auto-advance on the 0x60 wait timer, Banks0123.asm:7798), and spawns guard B at X 0xF0
  (Y 0xB0 below the player, or 0x88 above when PlayerY ≥ 0x98). Guard B walks left FAST to
  X 0xB8, turns toward the player's row, walks to his even-adjusted Y, faces left and shows
  text 7 "YOU ARE CAPTURED", waits 0x1E; then the scene mutes the music, waits 0x3C, runs
  `FadeOutLogic` (steps every `CurrentPal` colour toward black, ≤7 iterations), waits 0x10,
  and `PutInPrison` (:87): `EquipRemoved` = 1, selected weapon/item and the alert cleared,
  Room = 165 (PreviousRoom 8), player at (0x80, 0x50), GameMode 0.
- **EquipRemoved**: the menus draw EMPTY (DrawWeaponMenu/DrawEquipMenu, Banks0123.asm:
  1974/2171) and menu movement selects 0 (:11469) — but the inventory ARRAYS keep their
  contents; the flag is simply cleared again by the recovery.
- **Prison walls** (lock 15, `ChkPrisonWalls`, logic/doors/opendoor.asm:286): require facing
  `PunchWallDirs[renderType−7]` (:380, types 7-20), `PlayerControlMod` = 1 (punching) and
  the door's `ChkTouchDoor` open area; each qualifying frame decrements the wall's life —
  SFX 0x0A per hit — and the wall opens at 0 (SFX 0x1E "wall broken", like every type ≥ 7,
  `InitOpenDoor`). Door ID 0x0C is Grey Fox's wall (`PrisonWall2Life`); everything else
  decrements `PrisonWall1Life`. Both start at 0x28 = 40 (Banks0123.asm:11798). The walls are
  tile blocks from the host room's own tileset drawn over the opening (`DrawWallPrison*`,
  drawdoors.asm:262-281; row/col counts + tile ids at data/doors.asm:992-1024).
- **Punch doors** (lock 10, `ChkPunchDoor`, opendoor.asm:143): one punch facing the door
  (render type doubles as the required direction) with the touch check — e.g. the 57⇄168
  pair (door id 0x9A).
- **The pocket**: cell 165's only exit is its type-14 wall to 164 — Grey Fox's cell
  (`RoomsPrisoner`, logic/actors/prisoner.asm:43; rescue text 59), whose own type-13 wall
  (door id 0x0C) drops into basement room 54; 54 → 57 by connection, and 57's punch door
  reaches room 168, where the equipment bag waits (pickup 34 at (0x88, 0x20)).
- **The recovery** (`RecoverEquipment`, logic/items.asm:295, dispatched when pickup−8 =
  0x1A): clears `EquipRemoved`, sets `EquipBagTaken`, shows text 62 (the single Western
  take-description), and APPENDS THE TRANSMITTER (1 unit) to the first empty equipment
  slot, setting `TransmiTaken` — the bag is bugged: `ChkAlarmEnd` (Banks0123.asm:6636)
  never ends the alarm while the flag is set and `SetAreaMusic4` (:1590) re-raises it in
  every room outside `RoomsNoAlert` (:1756), until the transmitter is consumed from the
  equipment menu (`ChkUseItem`).

## Lasers + cameras

- **Beam tables** (`LasersRoom24/25/72`, data/laserconfig.asm): a count, then 7 bytes per
  beam: `status, Y, X, vramDY, vramDX, length, axis` (the VRAM pair is the name-table draw
  address). Axis from `ChkTouchLaser`'s MATH (logic/laserbeams.asm — the asm comments are
  swapped): axis 0 = a COLUMN at X spanning Y+8..Y+8+len (trip: |px−X| < 4); axis 1 = a ROW
  at Y spanning X..X+len (trip: |py−Y| < 4). `InitLaserRoom` (Banks0123.asm:5653) spawns
  them as actors on room entry — none during an alert; a trip raises the alert (respawn
  0x5A) with the RED music (`SetAlertMode5` forces red for ID_LASER and ID_CAMERA) and
  `RemoveLaserBeans` dismisses every beam in the room. `DrawLaserBeams`
  (logic/drawlaserbeams.asm) renders them ONLY while `SelectedItem == SELECTED_GOGGLES` (4)
  and no alert. Room 72 only: `DrawMovingLasers` (:5785), also goggles-gated, steps
  `LaserRoomCnt` through the five `LasersOnOff` 10-wide patterns every 0xC0 iterations.
- **Cameras** (logic/actors/camera.asm): `RoomsWithCamera` (149,118,115,111,110,36,31,28,
  27,21,14) + `RoomCamTypes`/`CamDirs*` facings (cpir index: room 14 → CamDirs7, 31 →
  CamDirs3 [right,up], 111 → CamDirs1 [down,down]); positions from the room actor lists
  (data/actorsinrooms.asm, `dw` = Y low / X high); patrols from `idxRoomPaths`
  (data/paths.asm:788 → per-actor pointer → count + (Y,X) points), 1px/iteration with
  random (`ld a,r`) waits at points. Surveillance (`ID_CAMERA`): `ChkSeePlayer` from the
  `CameraDrawOffsets` lens (up −12 / down +43 / left −17 / right +16); on sight: stop, 0x20
  iterations flashing colour 2↔4, the RED alert; frozen during alerts (`RenderCamera`).
  Laser type (`ID_CAMERA_LASER`): fires `ID_LASER_SHOT` when PlayerY ≥ camY and camX ∈
  (playerX−4, playerX+4] (SFX 4, refire wait 0x20); within |dx| < 0x60 it shadows the
  player's X (`CameraChkContinue`), else resumes its path.
- **Laser shots** (logic/actors/lasershot.asm + logic/damagelaser.asm): SpriteId 0x61
  (`SprLaser`, a 1px column), one 16px segment per iteration up to 11 (room 111:
  3 sprites, hit length capped at 7), then shrinking away. Hit: |px − shotX| < 8 AND
  |shotY + half − py| < half, half = `LaserLenghts[grown−1]` × 8 → `TouchPlayer` → 0x10
  damage (ActorTouchDamage, data/shapes.asm:39).

## Player weapons

- **Dispatch** (`ChkWeaponShot`, logic/weaponuse.asm:8): no weapons in rooms ≥ 224 /
  water / the box; `SelectedWeapon−1` jump-indexes the per-weapon fire checks
  (logic/weapon/*.asm); shots share the 6-slot `PlayerShotsList` (0x40 bytes each);
  `PlayerShotLogic` dispatches per shot ID; `NumSprShot` = 1/1/2/4/4/2/4 sprites.
- **Damage** (data/weapondamage.asm): per-weapon tables of damage per enemy ID (header =
  max simultaneous shots: 6/2/1/1/3/1). Vs guards: bullets 2, grenade 5, rocket 0x0A,
  bomb/mine/missile 5. Hit shapes: bullets/rocket/missile use `ActorShapeProject`,
  grenade/bomb/mine `ActorShapeExpl` (guards: shape 1 = ±0x14 box). On a contact hit,
  rocket/mine/missile transition to their explode status (`ChkEneHitByShot` :133-152).
- **SMG** (smg.asm): fire held → a bullet every 2 iterations; `BurstCnt` 1..8 indexes
  `SMG_BulletSpeeds` (32 bytes/direction = 8 × 8.8 (Y,X) speed pairs — drift 0/±1.5/±3
  across the facing axis); suppressor honoured; SFX 0x0D.
- **Grenade** (grenade.asm): ±3 on the facing axis; the REAL Y (`Y_Alt`) moves linearly
  while the drawn Y adds `GrenadeYOffsets[timer]` (25 entries, peak −0x28); timer 0x18 →
  explode: SFX 0x1A, a ONE-iteration KILL_BY_CONTACT window, the 3-frame small explosion
  (timer ≥ 0xA / ≥ 5 / else); no tile collision in flight.
- **Rocket** (rocket.asm): slot-0 only; ±5; kills by contact; tile collision → the medium
  explosion (timer 15); SFX 0x13 / 0x1A.
- **Plastic bomb** (plasticbomb.asm): slot-0 only, consumable; placed at `PBombDirOffset`
  (up −0x10 / down +8 / left −0x0C / right +0x0C); fuse 0x30; SFX 0x17 set, 0x1C explode.
  `ChkBasementWall` (opendoor.asm:332): a lock-14 wall opens while the slot-0 bomb is
  EXPLODING inside its open area (`ChkBombLocation`); punching only plays SFX 0x0A.
- **Mine** (mine.asm): consumable, armed at the player's X/Y, passive KILL_BY_CONTACT —
  an enemy contact deals the damage and explodes it (small, SFX 0x1C).
- **Missile** (missile.asm): slot-0 only, consumable; ±4; `ControlMissile` re-aims it on
  every direction trigger; `NormalCtrl` (Banks0123.asm:8468) IGNORES player controls while
  shot 0 is ID 7 — Snake freezes, the keys fly the missile; SFX 0x14.
- **Shot sprites** (data/weaponspratt.asm `idxShotSprAtt`, SpriteID 0..0xB): OR-pairs at
  offset (−8,−8); grenade/bomb colours 7+CC|0Ah, rocket 7+CC|0Ch, mine 0Ch+CC|07h,
  missile 8+0Fh, explosions 6+CC|08h (overlap 0x0E = the white core); the medium
  explosion's last frame is a 32×32 white 4-sprite burst (`SprExplosB3Attr`). Gfx labels:
  SprGrenade / SprRocket* / SprPlasticBomb / SprMine / SprMissile* / SprExplosionS/B.

## Per-room configuration bytes

- **`RoomsMusic[room]`** (data/musicradioconfig.asm:15; read by `SetAreaMusic6`/
  `ChkRadioCalls` Banks0123.asm:1616/1730): high nibble = area music id; **bit 3 = incoming
  radio call in this room** (the value 8 doubled twice becomes the 32-iteration pending
  timer); bits 2-0 = secure-room flags (1 = shooting doesn't raise the alarm / can't use
  binoculars). The table has an `IF (JAPANESE)` row — exporters take the ELSE branch.
- **`idxMapZones`** (same file, :58): one nibble per room = map zone (0-4 building 1,
  5+ building 2/3 — zones ≥ 5 require the antenna for radio contact).
- **`RoomsNoAlert`** (Banks0123.asm:1756): plain room-number list (alert suppressed).
- **`RedAlertRooms`** (chkdiscover.asm): 128-bit bitmap, MSB-first within each byte —
  rooms whose alarm is a red alert.

## Items

- **Inventory records** (`Weapons` / `Equipment` arrays): 4 bytes per slot — `0=ItemID,
  1=tens/units (BCD), 2=hundreds, 3=unused` (logic/menuequipment.asm:33). Slot compaction
  happens when a menu screen opens (`CompactWeapons`/`CompactEquipment`); consuming the
  last unit zeroes the record (`RemoveItem`, Banks0123.asm:1904) without recompacting.
- **Items in rooms** (data/itemsinrooms.asm; consumed by `AddRoomItems`):
  `idxRoomItemsIdx[room-122]` (rooms 122-217, 0 = none) → 1-based index into `idxRoomItems`
  (a `dw` pointer list) → a set of `(ID, Y, X)` byte triplets terminated by 0xFF. The
  ROCKET_LAUNCHER entry aborts the rest of a set while the Schneider radio-event flag is
  clear. Exported by Tools/export-items.mjs.
- **Pickup boxes / amounts**: `ItemTakeAmount` grants per item; `MaxAmmoLv1-4` /
  `MAX_RATIONS` clamp per rank (`Class`).

## Radio

- **Per-room callers** (data/radiocalls.asm; flattened into `RadioPersonsDat` by
  `UpdateRadio` Banks0123.asm:2379): `idxRoomRadio` is a `dw` pointer per room (`NoRadio`
  for none) to a list of 2-byte records — byte 0: bits 7-4 person id (1=Big Boss …
  7=Big Boss bldg 2), bit 3 **1 = wait-call / 0 = auto-reply**, bit 2 auto-tune, bit 0
  **1 = end of list**; byte 1: text id. Person id → frequency via `RadioFreqs`
  (Banks0123.asm:2455; Big Boss = `FREQ_BIGBOSS` 0x85, displayed "120.85"). A JP variant
  (radiocallsjp.asm) exists — non-JP is authoritative here.
- **Runtime records** (`RadioPersonsDat`, 0x20 bytes apart): `0=frequency, 2=bits
  (0 wait-call, 1 auto-tune), 3=text id` (`ChkRadioReceiv` Banks0123.asm:10968).
- **Incoming call state**: `RadioCallFlag` (0 pending / 1 ringing / 2 stopped) +
  `IncomingCallTimer` (logic/incomingcall.asm: pending 32 → ring 0x58 with a same-iteration
  fall-through decrement). The CALL sign is `txtCALL` (data/hudstartendtexts.asm:74): two
  XY-prefixed rows of 3 tile bytes (chars 0x9C-0xA1 → the `gfxCALL` 2bpp tiles).

## Texts

- **Index**: `idxTexts` (data/texts.asm:6) — a `dw` pointer per **1-based** text id
  (`GetText` Banks0123.asm:5274 does `dec a` before indexing; `txtEmpty` fills unwritten
  entries; JP table in textsjp.asm).
- **Per text**: first byte = `TextBoxType` (low nibble = window type 0-4, see below), then a
  **dictionary-compressed** stream (`DecodeText`, Banks0123.asm:5305): `0x00` = space,
  other bytes < 0xA1 = font character codes (`DrawChar` glyphs, NOT pure ASCII — letters and
  digits match ASCII but punctuation is custom: 0x3D = '!', 0x5C = '.', 0x5F = ',', 0x97 =
  apostrophe drawn 4px wide), **bytes ≥ 0xA1 = dictionary tokens** — `token − 0xA1` indexes
  `idxDictionary` (data/texts.asm:573), whose entries are raw 0xFF-terminated byte runs
  copied verbatim into the buffer (`AddDictEntry` :5352 — entries may embed 0xFE newlines;
  no nested tokens). Controls in the outer stream: `0xFE` = newline, `0xFD` = page wait
  (decode pauses, `PendingTextFlag` set — the `*` in the disassembly's comments), `0xFF` =
  end.
- **Engine**: `SetText` (:7808) records the id + `SkipTextMode` and enters GameMode 0xA.
  `TW_GetTextPage` (:8227) decodes one page into `TextBuffer`; `TW_PrintChar` (:7952)
  prints one character per `TickCounter & 7 == 0` iteration (mask 3 for the staff roll)
  with print SFX 0x23 per non-space character, wrapping when X passes
  `TextX + TextNX − 8`. While text 10/155 prints, the Snake portrait talks
  (`DrawSnakeFrame`, `SnakePicture0-2` on `TickCounter & 0x1C`). M/Enter skip
  (`SkipText`) when `SkipTextMode` is 0; F4 exits a radio text (:7842).
- **Window geometry per type** (index = `TextBoxType & 0x0F`): `TextBoxXYSize`
  (Banks0123.asm:8383, 4 bytes: window Y, X, NY, NX), `TextXYSize` (:8374, 6 bytes: text
  Y, X, clear NY, NX, prompt Y, X), `TextBoxEffectDat` (:8365, 8 bytes: appear-animation
  params). Type 3 is the radio text box (window 0x74,0x20 size 0x48×0xC8), type 4 the
  field dialog at the top of the screen.
- **HUD/menu micro-texts** (data/hudstartendtexts.asm, data/menuweapontexts.asm …) use a
  simpler uncompressed shape for `PrintTextGetXY` (Banks0123.asm:4676): `dw YX`, raw
  character bytes, `0xFE` = next XY follows, `0xFF` = end.

## Sound (music + SFX)

One catalog of pattern streams (mirrored in Tools/ThemeOfTaraPlayer/MusicCatalog.cs with
names and start addresses; the engine is a port of the ROM driver):

- Channel streams hold note-format or SFX-format commands; `0xFE`-prefixed opcodes are
  universal: `FE 00` = mode swap (note↔SFX format), `FE FF addr` = call, `FE FE addr` =
  goto (infinite loop — used by looping music), `FE n addr` = counted loop (n times — e.g.
  the incoming-call ring repeats its beep 6×), `0xFF` = end/return.
- SFX-format bodies alternate `0x2x dd` config bytes and `VF LL` freq/vol pairs, `0x1x`
  noise periods.
- SFX are addressed by game-side ids (`SetSoundEntry(Chk)` — Chk only gates on the
  sound-enabled config bit): 0x0C handgun, 0x0E suppressed, 0x10 damage, 0x15 click,
  0x16 guard dead, 0x20 menu cursor, 0x21 use item, 0x22 incoming call ring, 0x23 text
  print, 0x24 pickup, 0x25 spawn, 0x26/0x27 rank up/down, 0x28 stop-sfx, 0x50 radio noise,
  0x5C mute.

## Actors / guards

- The enemy pool is a fixed array of actor structures (`EnemyList`, 16 actors × 0x20
  bytes; id, position, direction, life, sprite/colour pointers, per-type fields). Guard
  patrol/LOS/alert logic reads per-room guard definitions; reinforcement respawns pull
  from `RespawnInfo` (3 bytes per room). Touch/impact boxes are constants in the logic
  (e.g. ChkTouchEnemies |dy|<8,|dx|<12; shot impact |dy−16|<16,|dx|<8).
- Prisoners are actors with `ActorShapeProject` shape 0 and the rescue/kill flow in
  `PrisonerLogic` (rank `Class` drives `MaxAmmo`/`MaxLife` levels, `RANK_MAX_LIFE`
  24/32/40/48).

## Where the exporters live

| Data | Exporter | Output |
| --- | --- | --- |
| Rooms/collision/doors/door gfx/HUD icons/font/CALL sign/alert icons/names | `Tools/RoomViewer --export-web` (+ flags) | web/assets/* |
| Snake / guard / prisoner sprites, Zzz, bullet | `Tools/MetalGearSpriteMover`, RoomViewer flags | snake.png, guard.png, … |
| Music/SFX → WAV | `Tools/ThemeOfTaraPlayer --export-sfx "<name>"` | *.wav |
| Items in rooms | `node Tools/export-items.mjs` | items.json |
| Radio-call room bit | `node Tools/export-radio.mjs` | radio.json |
| Radio callers per room | `node Tools/export-radiocalls.mjs` (radio-answer-call change) | radiocalls.json |
| Decoded texts | `node Tools/export-texts.mjs` (radio-answer-call change) | texts.json |
