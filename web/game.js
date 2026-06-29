/*
 * Metal Gear (MSX2) — Solid Snake browser prototype.
 *
 * Renders an exported room background, walks Snake around it with the original
 * walk/idle animation and tile collision, and lets him punch (with the exported
 * punch sound effect). All assets are pre-exported static files under assets/ —
 * this script does no ROM decoding of its own.
 *
 * Faithfulness notes (sources are in the disassembly):
 *  - Directions match the ROM: 1=Up, 2=Down, 3=Left, 4=Right (PlayerDirection).
 *  - Collision uses Snake's size/shape 0 box, two probe points per direction,
 *    ported from logic/collisions.asm (BoxColliderDat) — the player movement
 *    code calls ChkTileCollision_ with B=0 (Banks0123.asm ChkPlayerColl).
 *  - The collision map marks a tile solid when its tile number's bit is set in
 *    the room's CollisionTiles bitmap (see room-collision.json).
 */

'use strict';

// ---- Display ---------------------------------------------------------------
const VIEW_W = 256, VIEW_H = 192;   // native SCREEN 5 page (a room is 256x192)
const HUD_H  = 20;                  // bottom HUD strip (the ROM HUD sits at screen Y 192-211)
const SCALE  = 2;                   // integer upscale (2x native 256x212 -> 512x424 display)
const TICK_HZ = 60;                 // logical update rate (the game ran at 60Hz)
const TICK_MS = 1000 / TICK_HZ;

// ---- Tunables (movement feel — see tasks 8.3) ------------------------------
const SPEED        = 1.0;  // pixels per tick
const WALK_TICKS   = 8;    // ticks between walk-frame swaps
const PUNCH_TICKS  = 12;   // how long the punch frame holds (~0.2s)
const SPAWN_X = 128, SPAWN_Y = 157; // Snake's start in room 0 — open floor, free to move all directions
// Where Snake lands after a non-door room crossing, from the ROM's EntryRoomXY table
// (logic/nextroom.asm SetRoomEntryXY: dw 0B800h,1200h,0F200h,0C00h indexed by NextRoomDirect
// 1=Up,2=Down,3=Left,4=Right — high byte = pixel). The entry AXIS snaps to these; the
// perpendicular axis is preserved from the exit. NB the table is ASYMMETRIC (up 184 / down 18
// aren't VIEW_H∓margin), so don't derive it from a single margin.
const ENTRY_UP_Y = 0xB8;    // 184 — entering a room going up (land near the bottom)
const ENTRY_DOWN_Y = 0x12;  // 18  — entering going down (land near the top)
const ENTRY_LEFT_X = 0xF2;  // 242 — entering going left (land near the right edge)
const ENTRY_RIGHT_X = 0x0C; // 12  — entering going right (land near the left edge)
// Where Snake crosses to the neighbour room, from the ROM's ChkExitRoom (Banks0123.asm:9418):
// PlayerX < 12 -> left, >= 244 -> right; PlayerY < 16 -> up, >= 186 -> down. The crossing fires at
// these edges, NOT at the screen border — exiting ~12px sooner leaves the correct amount of travel
// in the next room (and pairs with the ENTRY_* values so a fresh entry never immediately re-exits).
const EXIT_LEFT_X = 12, EXIT_RIGHT_X = 244, EXIT_UP_Y = 16, EXIT_DOWN_Y = 186;
const crossesEdge = (dir, x, y) =>
  dir === 'left' ? x < EXIT_LEFT_X : dir === 'right' ? x >= EXIT_RIGHT_X :
  dir === 'up'   ? y < EXIT_UP_Y   : dir === 'down'  ? y >= EXIT_DOWN_Y : false;
// Per-type door-open animation length = the EraseDoor{dir} erase-line count to SetDoorOpen
// (logic/doors/erasedoor.asm): north 25, south 33, west 36, east 36, elevator 13. (#105)
const DOOR_OPEN_TICKS_BY_TYPE = { 1: 25, 2: 33, 3: 36, 4: 36, 5: 13 };
const DOOR_OPEN_TICKS = 25;   // fallback / drawDoors progress denominator

// ---- Per-actor attribute tables (issue #48) --------------------------------
// The ROM keys an actor's HP and contact damage off its actor ID (constants/Enums.asm), via
// flat tables indexed by (ID-1). The port previously flattened these into shared scalars
// (GUARD_LIFE/TOUCH_DAMAGE/BULLET_DAMAGE), which silently gave non-guard actors the guard
// defaults. These are the real ROM tables — read HP/touch-damage through them so per-actor
// values are data, not code. (Touch-SHAPE and the AlertRespawnTimer seeds are handled at their
// own sites; the touch-shape table is a deliberate follow-up — see issue #48.)
const ID_GUARD_SLOW = 0x04, ID_LAND_MINE = 0x07, ID_GUARD_SILENCER = 0x39, ID_PRISONER1 = 0x31;
const ID_BIG_BOSS = 0x20, ID_MACH_GUN_KID = 0x22, ID_COWARD_DUCK = 0x29;
const ID_SGUNNER_SHOT = 0x2B, ID_GUARD_BULLET = 0x2F, ID_BULLET_HORIZ = 0x3A, ID_BULLET_VERT = 0x3B;
const ID_SHOT_M_GUN_KID = 0x3C, ID_BULLET = 0x3D, ID_TANK_BULLET = 0x3E, ID_BOOMERANG = 0x3F;

// idxActorLife (data/actorspriteattr.asm:127) — default LIFE seeded by SetupActor, indexed (ID-1).
const ACTOR_LIFE = [
  0xFF,0xFF,0xFF,0x02,0x02,0x05,0xFF,0x1E,0x37,0x02,0x04,0x02,0x04,0x04,0x02,0xFF, // ID 0x01-0x10
  0x02,0x28,0x02,0x02,0x02,0x02,0xFF,0x02,0x02,0x28,0x02,0x02,0x80,0x02,0x02,0x28, // ID 0x11-0x20
  0x14,0x14,0xFF,0x1E,0xFF,0x64,0xFF,0xFF,0x14,0xF0,0x14,0x02,0x02,0x02,0x02,0x02, // ID 0x21-0x30
  0x02,0x02,0x02,0x02,0x02,0x02,0x02,0x02,0x04,0x02,0x02,0x02,0x02,0x02,0x02,0x02, // ID 0x31-0x40
];
// ActorTouchDamage (data/shapes.asm:36) — damage dealt to Snake on contact, indexed (ID-1).
// 0xFF here is a crush/instakill (tank, bulldozer, pitfall). All enemy bullets (0x2B/0x2F/0x3A-0x3E)
// are 8; the boomerang (0x3F) is 0x10.
const ACTOR_TOUCH_DMG = [
  0x00,0x00,0x00,0x02,0x02,0x00,0x10,0x00,0xFF,0x02,0x02,0x20,0x02,0x02,0xFF,0xFF, // ID 0x01-0x10
  0x00,0xFF,0x02,0x02,0x02,0x02,0x20,0x02,0x02,0x08,0x02,0x02,0x00,0x02,0x02,0x08, // ID 0x11-0x20
  0x04,0x04,0x00,0x04,0x08,0x00,0x00,0x00,0x04,0x00,0x08,0x00,0x00,0x00,0x08,0x02, // ID 0x21-0x30
  0x00,0x00,0x00,0x00,0x00,0x10,0x00,0x00,0x04,0x08,0x08,0x08,0x08,0x08,0x10,0x00, // ID 0x31-0x40
  0x10,                                                                            // ID 0x41
];
const actorLife = (id) => ACTOR_LIFE[id - 1];
const actorTouchDmg = (id) => ACTOR_TOUCH_DMG[id - 1];
// Armor (the bullet-proof vest) halves damage ONLY for these shot IDs — ChkUsingArmor
// (logic/touchenemy.asm:169-187): ID_SGUNNER_SHOT, ID_GUARD_BULLET, and ID_BULLET_HORIZ..ID_TANK_BULLET.
// It explicitly does NOT cover body contact, mines, explosions, or the boomerang (0x3F). (Issue #27.)
const ARMOR_HALVES = new Set([
  ID_SGUNNER_SHOT, ID_GUARD_BULLET, ID_BULLET_HORIZ, ID_BULLET_VERT, ID_SHOT_M_GUN_KID, ID_BULLET, ID_TANK_BULLET]);

// ---- Guard tunables (ported from chkdiscover.asm / guard.asm) --------------
const GUARD_WALK_TICKS = 8;   // GuardPatrolLogic2 `ld bc,700h` -> Anim2FramesActor masks ANIM_CNT&7: swap every 8 (#58)
// Patrol stop-and-look (ChkWaitPathPoint -> GuardPatrolTurn -> GuardPatrolWait, #39): at a path
// point there's a ~50% chance to KEEP walking; otherwise the guard stands 0x10 facing its travel
// direction, then turns ±90° and looks 0x10 more (LOS active the whole time), then resumes.
const GUARD_LOOK_TICKS = 0x10;   // Wait set in ChkWaitPathPoint / GuardPatrolTurn (each phase)
// GuardPatrolTurn's turn (guard.asm:144 `xor 2`): Up<->Left is exact (the random `or` bit has no
// effect there); Down<->Right is our symmetric completion — the ROM's `xor 2` yields out-of-range
// direction values (0/6) for Down/Right facings, a ROM bug, so we port the routine's ±90° INTENT.
const PATROL_TURN = { up: 'left', left: 'up', down: 'right', right: 'down' };
// ChkViewVertical/Horizontal: Snake is in the sight band when |perp| < HALF (strict). ChkViewVertical
// uses HALF 8 (up/down); ChkViewHorizontal uses HALF 6 for a guard, HALF 4 for a camera.
const LOS_BAND_UD = 8;        // facing up/down: |dx| < 8 (ChkViewVertical, H=0x08)
const LOS_BAND_LR = 6;        // guard facing left/right: |dy| < 6 (ChkViewHorizontal, H=0x06)
const LOS_BAND_LR_CAM = 4;    // camera facing left/right: |dy| < 4 (ChkViewHorizontal, H=0x04)
// ChkViewObstacles: handrail tiles (0x68-0x6C, 0x6E) and 0x8B-0x8E are SEE-THROUGH — LOS passes
// them even though they're solid for movement (you can see across the water-channel railings).
const LOS_SEETHROUGH = new Set([0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6E, 0x8B, 0x8C, 0x8D, 0x8E]);
// Punch hitbox + KO/death, ported exactly from the ROM (logic/punchenemy.asm ChkArea /
// Banks0123.asm ChkKillPunching). A punch in direction D lands iff the guard is within a
// 12px radius (strict <) of a point offset PUNCH_AREA[D] from Snake, on BOTH axes.
const PUNCH_AREA = {                  // (Xoffset, Yoffset) added to the guard before the test
  up:    { xoff: 0,   yoff: 12 },     // PunchUpDat
  down:  { xoff: 0,   yoff: -12 },    // PunchDownDat
  left:  { xoff: 12,  yoff: 0 },      // PunchLeftDat
  right: { xoff: -12, yoff: 0 },      // PunchRightDat
};
const PUNCH_RADIUS = 12;              // ChkArea X/Y radius (0Ch), comparison is strict <
const GUARD_STUN_TICKS = 0x40;        // StunnedCnt set by a connecting punch (64 @ 60Hz)
const GUARD_REPUNCH_LOCK = 0x38;      // can't re-punch while StunnedCnt >= this (~9-tick lockout)
const GUARD_PUNCHES_TO_KILL = 3;      // ChkKillPunching: the 3rd punch kills the guard

// ---- Combat tunables (alert chase + bullets + Snake damage) ----------------
// Sources: guardalert.asm (GuardWalk chases via GetDirToPlayer + SetWalkSpeedFast;
// DirectionSpeeds2 = ±2 vs patrol ±1), guardshot.asm (InitGuardShot: ID_GUARD_BULLET
// 0x2F, sprite 0x72, shot-speed param 0x90, SFX 5), data/shapes.asm (ActorTouchDamage = 2),
// logic/touchenemy.asm (DamageDelayTimer = 0x20), logic/hud.asm (DecrementLife_B clamps at 0,
// SetDead), Banks0123.asm (InitPlayerVars life 0x18, DeadLogic DeadTimer 0x80).
// Alert speed EQUALS Snake's speed in the ROM, not double it: the guard's fast speed
// (DirectionSpeeds2 = ±2 px/frame) is the same 2 px/frame Snake walks at (PlayerMovSpeed = 0x0200,
// i.e. +2 px/frame in 8.8 fixed-point). Patrol is half that (DirectionSpeeds = ±1). So we scale
// to our Snake: alert = SPEED, patrol = SPEED/2.
const GUARD_CHASE_SPEED = SPEED;      // alert == Snake (ROM DirectionSpeeds2 == PlayerMovSpeed)
const ALERT_ICON_TICKS  = 0x10;       // SetAlertRoom (chkdiscover.asm:313-314): AlertIconTimer = 0x10
                                      //   (16 iters, ~0.27s) — the "!" flash, NOT a persistent badge (#57)
const GUARD_MAX_BULLETS = 6;          // ROM caps active guard bullets at 6
const GUARD_BULLET_SPEED = 2.5;       // px/tick; derived from the 0x90 shot-speed param (exact
                                      //   8.8 fixed-point scaling approximated — tuned for feel)
const TOUCH_DAMAGE  = actorTouchDmg(ID_GUARD_SLOW);   // ActorTouchDamage[ID_GUARD_SLOW] = 2 (guard body)
// Guard TOUCH box (ChkTouchEnemy2: ActorsShapeTouch[ID_GUARD-1] = 8 → ImpactAreasInfo row 8,
// data/shapes.asm: 0, 8, 0, 0Ch). ChkArea (logic/punchenemy.asm): touch iff
// |guardY+offY − snakeY| < distY AND |guardX+offX − snakeX| < distX, strict <, Y then X.
const GUARD_TOUCH_SHAPE = { offY: 0, distY: 8, offX: 0, distX: 12 };
const BULLET_DAMAGE = actorTouchDmg(ID_GUARD_BULLET); // ActorTouchDamage[ID_GUARD_BULLET] = 8 (was a flat
                                      //   2 — the ROM value is 8; #48 corrects every enemy bullet to 8)
const INVULN_TICKS  = 0x20;           // DamageDelayTimer: i-frames after any enemy hit (32 @ 60Hz)
const SNAKE_MAX_LIFE = 0x18;          // InitPlayerVars starting life (24); MaxLife also 24 this slice
const DEAD_TICKS = 0x80;              // DeadTimer: dead-state countdown before the GAME OVER screen (128 @ 60Hz)
const GAME_OVER_TICKS = 0x100;       // GS_GameOver F5 window — the ROM waits for the game-over music to
                                     //   finish (SoundWorkArea+2); we approximate that tail as a fixed span (#35)

// ---- Player handgun shots (ChkHandGunShot + ShootDirSpeeds + BulletLogic) -------------------
// Literal ROM values: shot speed ±6 px/frame along the facing axis (ShootDirSpeeds), a range timer
// of 0x10 frames, max 6 shots (GetEmptyShotDat), spawned from the gun (PlayerY-14). Railing tiles
// 0x6B/0x6E don't stop a shot (BulletLogic). Projectiles run on the ROM iteration boundary
// (updatePlayerShots is gated to ~30Hz), so speeds/ranges/fuses are literal ROM values.
const PLAYER_SHOT_SPEED = 6;          // ShootDirSpeeds (±6 px/iteration)
const PLAYER_SHOT_RANGE = 0x10;       // PLAYER_SHOT.Timer (16 iterations)
const PLAYER_SHOT_MAX = 6;            // max player shots on screen
const PLAYER_SHOT_GUN_Y = 14;         // spawn Y = PlayerY - 14 (gun height)
const RAILING_LEFT = 0x6B, RAILING_RIGHT = 0x6E;  // tiles a shot passes through
const playerShots = [];               // active player shots: { x, y, vx, vy, range }

// ---- Shot-vs-enemy hits (logic/damagetoenemy.asm ChkPlayerShots → ChkEneHitByShot) ----------
// The guard's projectile impact box is shape 0 (ActorShapeProject[ID_GUARD-1] = 0, data/shapes.asm)
// → ImpactAreasInfo row 0 (data/shapes.asm:47): offY=0F0h(−16), distY=10h(16), offX=0, distX=8.
// A shot hits iff |guardY−16−shotY| < 16 AND |guardX−shotX| < 8 (strict <, Y checked first).
const GUARD_SHAPE = { offY: -16, distY: 16, offX: 0, distX: 8 };  // ImpactAreasInfo shape 0
const GUARD_BULLET_DAMAGE = 2;  // BulletDamage[ID_GUARD-1] (data/weapondamage.asm:18): handgun does 2
const GUARD_LIFE = actorLife(ID_GUARD_SLOW);   // idxActorLife[ID_GUARD_SLOW] = 2 (data/actorspriteattr.asm);
                                //   TransformAlertGuard never resets LIFE, so alert keeps the spawn 2

// ---- Collision box, ported from logic/collisions.asm (BoxColliderDat shape 0)
// Two probe points per direction, each [offsetY, offsetX] relative to Snake's
// logical position (= the actor origin / sprite anchor).
const PROBES = {
  up:    [[-5, -6], [-5,  5]],
  down:  [[ 4, -6], [ 4,  5]],
  left:  [[-4, -8], [ 3, -8]],
  right: [[-4,  7], [ 3,  7]],
};
const DELTA = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy:  1 },
  left:  { dx: -1, dy: 0 },
  right: { dx:  1, dy: 0 },
};

// ---- Canvas ----------------------------------------------------------------
const canvas = document.getElementById('screen');
canvas.width  = VIEW_W * SCALE;
canvas.height = (VIEW_H + HUD_H) * SCALE;   // room (0..192) + bottom HUD strip (192..212)
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;   // keep pixels crisp when scaling
ctx.scale(SCALE, SCALE);             // draw in native coords; scale handles upscale

const gate = document.getElementById('gate');
const errEl = document.getElementById('err');
const pauseBtn = document.getElementById('pause');
if (pauseBtn) pauseBtn.addEventListener('click', () => { togglePause(); pauseBtn.blur(); });

// ---- Assets ----------------------------------------------------------------
// `assets.room` / `assets.collision` always point at the *active* room; the room
// manager swaps them. All rooms are preloaded into `rooms` so cuts are instant.
const assets = { room: null, sheet: null, atlas: null, collision: null, punchBuf: null, doorBuf: null };
const rooms = new Map();      // room number -> { img, collision }
let connections = {};         // room number (string) -> { up, down, left, right }
let manifest = { rooms: [], start: 0 };
let currentRoom = 0;
let doorsData = {};           // room number (string) -> [ {id,type,x,y,dest} ]
let doorTypes = {};           // type (string) -> { openOffX/Y, openNX/Y, enterOffX/Y, enterNX/Y }
let doorGfx = {};             // type (string) -> { img, w, h, offX, offY } (sprite geometry)
const doorImages = new Map(); // door png filename -> Image
let activeDoors = [];         // door state for the active room (built by setRoom)
let guardsData = {};          // room -> injected guard def (dev/test seam; no production demo guard)
let guards = [];              // ALL the active room's guards (EnemyList holds up to 16)
let guard = null;             // alias: guards[0] or null (kept in sync for the suites)
let itemsData = {};           // room number (string) -> [{id,y,x}] (items.json, AddRoomItems data)
let roomItems = [null, null, null];   // ItemsInTheRoom: 3 FIXED slots — a pickup only zeroes its
                                      //   slot (EraseTakenItem), holes do not compact
let spawnedItemLatch = false; // SpawnedItems: at most one enemy drop per room
let guardSheet = null;        // guard spritesheet image
let guardPalettes = null;     // guard-palettes.json: room -> {u:[r,g,b], f:[r,g,b]} (per-area SprsetPal)
let activeGuardSheet = null;  // guard.png recoloured for the current room's sprite palette
const guardSheetCache = new Map();   // palette-key -> recoloured canvas
let guardAtlas = null;        // guard atlas (frameWidth/Height, anchor, frames)
let alertIcon = null;         // decoded "!" alert icon image
let alertIconRed = null;      // decoded red "!" for a red alert (GuardSetAlarm red sign)
let alertSource = null;       // currently-playing alert music node (so it can be stopped)
let alertPlaying = false;     // latch so the alert sound isn't retriggered each frame
let audioCtx = null;
let audioBus = null;          // master mix node -> speakers AND the bug-report capture tap
let captureDest = null;       // MediaStreamAudioDestinationNode feeding the bug recorder's audio
// All sound connects here, not straight to audioCtx.destination, so the recorder can tap it.
// Falls back to the raw destination before the bus exists (it's created with the AudioContext).
function audioOut() { return audioBus || (audioCtx && audioCtx.destination); }
let guardBulletImg = null;    // decoded guard-bullet sprite (optional)
let hudIcons = null;          // weapon/item HUD icon sheet (hud-icons.png, DrawWeaponHUD/DrawItemHUD)
let hudIconsAtlas = null;     // hud-icons.json: icon key ("w<id>"/"i<id>") -> {x,y,w}
let fontImg = null;           // game font glyph sheet (font.png, gfxFont; DrawChar)
let fontMeta = null;          // font.json: { charW, charH, first, count }
let zzzImg = null;            // sleeping "Zzz" sign frames (zzz.png, SprZzz)
let zzzMeta = null;           // zzz.json: { frameWidth, frameHeight, frames }
let names = null;             // names.json: { weapons:{id:name}, items:{id:name} } (idxWeaponName/idxItemName)
let callSignImg = null;       // decoded CALL sign (call-sign.png — gfxCALL 2bpp tiles, LoadFont)
let pitfallImg = null;        // the open pit (pitfall.png — GfxPitfall via PitfallTileMap, 64x64)
let callRooms = new Set();    // rooms whose RoomsMusic byte has bit 3 = incoming call (radio.json)
let radioCallFlag = 2;        // RadioCallFlag: 0=pending, 1=incoming call (ringing), 2=stopped
let incomingCallTimer = 0;    // IncomingCallTimer (pending delay, then the ring countdown)
let callTickCounter = 0;      // the call system's TickCounter, in ROM ITERATIONS (see chkIncomingCall)
let callRingSrc = null;       // the playing ring SFX source — tracked so SetAreaMusic6 can cut it
// ---- Radio / transceiver state (RadioLogic, GameMode 4 — Banks0123.asm:10675) ---------------
let radioState = 1;           // EquipRadioStatus: 1=idle, 2=signal up, 3=reply, 4=signal off
let radioFreq = 0x85;         // RadioFreq (BCD byte, shown as "120."+digits) — the game starts
                              // tuned to Big Boss's FREQ_BIGBOSS 0x85 (Banks0123.asm:11794)
let radioCmd = 0;             // RadioCmd: 1 = SEND (shows SEND instead of RECV)
let replyRequested = false;   // ReplyRequested (set by SEND; lets wait-call entries answer)
let autoReplyDone = false;    // AutoReplyDone (latches an auto-reply until the freq is retuned)
let radioLedCnt = 0;          // RadioLedCnt (0-12 lit LED cells)
let radioLedDelay = 0;        // RadioLedDelay (0x10 before the first LED, then 2 per LED)
let replyPerson = null;       // ReplyRadioPerson — the matched radiocalls entry
let radioHoldWait = 8;        // ControlHoldWait for frequency tuning (8 then 2)
let radioPersons = [];        // RadioPersonsDat: the current room's callers (UpdateRadio)
let radiocallsData = null;    // radiocalls.json (idxRoomRadio flattened)
let radioDirTrigger = null;   // latched left/right press for the next radio iteration
let radioUpTrigger = false;   // latched UP press (SEND)
let radioNoiseSrc = null;     // looping radio-noise ambience (SFX 0x50; muted by 0x5C)
let radioBgImg = null, snakePortraitImg = null, freqDigitsImg = null, ledOnImg = null,
    ledHalfImg = null;
let snakeTalkImgs = [];       // SnakePicture0/1/2 talking-portrait frames
// ---- Elevator state (GetElevatorRoomDat / ElevatorRoomLogic) --------------------------------
let elevatorsData = null;     // elevatorrooms.json: room -> { up, down, floors }
let elevatorY = 0;            // ElevatorY (the cabin; X is fixed at 0x70 by SetElevatorPosY)
let elevatorX = 0x70;         // ElevatorX
let elevatorDir = 0;          // ElevatorDir: 1=up, 2=down
let elevatorStatus = 0;       // ElevatorStatus: 0=moving, 1=floor stop, 2=shaft exit
let elevatorLimitUp = 0;      // ElevatorLimitUp/Down (per elevator room)
let elevatorLimitDown = 0;
let elevatorImg = null, elevatorMeta = null;   // the composed SprElevator cabin
// ---- Laser beams + cameras (laserconfig.asm / camera.asm / lasershot.asm) -------------------
let lasersData = null;        // lasers.json: room -> beams [{on,y,x,len,axis}] + seq (room 72)
let camerasData = null;       // cameras.json: room -> [{y,x,dir,laser,path}]
let musicLoops = null;        // music-loops.json: trackKey -> {start,end} seconds (issue #16)
let cameraImg = null;         // camera.png: 4 facings x 2 rows (normal blue / flash red)
let lasers = [];              // the active room's beams
let laserRoomTimer = 0;       // LaserRoomTimer (room 72 cycle wait, 0xC0)
let laserRoomCnt = 0;         // LaserRoomCnt (which LasersOnOff pattern; reset at game init)
let cameras = [];             // the active room's cameras
let laserShots = [];          // live laser-camera shots
// ---- Boot / title state (GS_KonamiLogo / MenuLogoLogic) -------------------------------------
let titlePhase = null;        // 'konami-reveal'|'konami-hold'|'swoop'|'wipe'|'text-wait'|'ready'
let titleCnt = 0;             // the active phase's counter (reveal ticks / WaitCounter / MenuCnt)
let konamiLogoImg = null;     // konami-logo.png (gfxKonamiLogo(2)/gfxKonami via KonamiLogoTiles)
let metalImg = null, gearImg = null;   // gfxMetalGearLogo blocks (MetalTilesDat/GearTilesDat)
let titleCanvas = null, titleCtx = null;   // offscreen surface the swoop ACCUMULATES on
// ---- Capture flow state (GAME_MODE_CAPTURED / capturescene.asm) -----------------------------
let equipRemoved = false;     // EquipRemoved: menus/HUD empty, nothing selectable (arrays kept)
let equipBagTaken = false;    // EquipBagTaken: the capture scene is once-only
let transmiTaken = false;     // TransmiTaken: the bag's bug — the alarm never ends while carried
let captureStatus = 0;        // CaptureStatus + the guards' merged script step
let captureTimer = 0;         // CaptureTimer / the guards' waits
let captureFade = 0;          // FadeOutLogic progress (0..7 palette steps -> black)
let captureGuards = [];       // the two scripted capture guards: { x, y, dir, walk, phase }
let prisonWall1Life = 0x28;   // PrisonWall1Life — Snake's cell wall (40 punches, init :11798)
let prisonWall2Life = 0x28;   // PrisonWall2Life — Grey Fox's cell wall
let devCapture = false;       // ?capture: jump into the scene (the trigger zone isn't walkable yet)
const bullets = [];           // active guard bullets: { x, y, vx, vy }
let gameState = 'play';       // 'play' | 'dead' (SetDead/DeadLogic) | 'menu' (GameMode 2/3 equipment screens)
let menuMode = null;          // 'weapon' (GameMode 2) | 'item' (GameMode 3) while gameState === 'menu'
let selectIdx = 1;            // SelectIdx — 1-based slot on the menu grid (weapons 1-7, items 1-25)
let menuEntries = [];         // the compacted owned entries, snapshotted on open (CompactWeapons /
                              // CompactEquipment run once per open; the ROM works off that in-RAM
                              // list — consuming the last of an item zeroes its slot, no recompact)
let menuHoldWait = 8;         // ControlHoldWait — ticks until a held direction repeats
let menuDirTrigger = null;    // ControlsTrigger: direction pressed this frame (latched for menuTick)
let menuFireTrigger = false;  // ControlsTrigger: Fire pressed this frame (latched for menuTick)
let deadTimer = 0;            // counts down in the dead state (DeadTimer)
let gameOverTimer = 0;        // GS_GameOver: counts down the F5 window after the dead animation (#35)
let continueArmed = false;    // RestoreGameFlag — F5 pressed on the GAME OVER screen -> continue

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image: ' + src));
    img.src = src;
  });
}
const loadJSON = (src) =>
  fetch(src).then(r => { if (!r.ok) throw new Error('Failed to load ' + src + ' (' + r.status + ')'); return r.json(); });

async function loadAssets() {
  const [sheet, atlas, mani, conns, dData, dTypes, dGfx, iData] = await Promise.all([
    loadImage('assets/snake.png'),
    loadJSON('assets/snake.json'),
    loadJSON('assets/manifest.json'),
    loadJSON('assets/connections.json'),
    loadJSON('assets/doors.json'),
    loadJSON('assets/door-types.json'),
    loadJSON('assets/door-gfx.json'),
    loadJSON('assets/items.json').catch(() => ({})),
  ]);
  // Guard sprite + alert icon + bullet + HUD icons are optional (graceful fallbacks if absent).
  [guardSheet, guardAtlas, alertIcon, guardBulletImg, hudIcons, hudIconsAtlas, fontImg, fontMeta, alertIconRed, zzzImg, zzzMeta, names] = await Promise.all([
    loadImage('assets/guard.png').catch(() => null),
    loadJSON('assets/guard.json').catch(() => null),
    loadImage('assets/alert-icon.png').catch(() => null),
    loadImage('assets/guard-bullet.png').catch(() => null),
    loadImage('assets/hud-icons.png').catch(() => null),
    loadJSON('assets/hud-icons.json').catch(() => null),
    loadImage('assets/font.png').catch(() => null),
    loadJSON('assets/font.json').catch(() => null),
    loadImage('assets/alert-icon-red.png').catch(() => null),
    loadImage('assets/zzz.png').catch(() => null),
    loadJSON('assets/zzz.json').catch(() => null),
    loadJSON('assets/names.json').catch(() => null),
  ]);
  [prisonerSheet, prisonerMeta, greyFoxSheet, ellenSheet, madnarSheet] = await Promise.all([
    loadImage('assets/prisoner.png').catch(() => null),
    loadJSON('assets/prisoner.json').catch(() => null),
    loadImage('assets/greyfox.png').catch(() => null),   // SprPrisoner2 in room 164's blue
    loadImage('assets/ellen.png').catch(() => null),     // SprElen (room 167)
    loadImage('assets/madnar.png').catch(() => null),    // SprMadnar (rooms 182/189)
  ]);
  // Incoming radio call data: per-room call bit (RoomsMusic bit 3, data/musicradioconfig.asm)
  // and the decoded CALL sign graphic (gfxCALL via LoadFont).
  const radio = await loadJSON('assets/radio.json').catch(() => null);
  callRooms = new Set(radio ? radio.callRooms : []);
  callSignImg = await loadImage('assets/call-sign.png').catch(() => null);
  pitfallImg = await loadImage('assets/pitfall.png').catch(() => null);
  scorpionSheet = await loadImage('assets/scorpion.png').catch(() => null);
  scorpionMeta = await loadJSON('assets/scorpion.json').catch(() => null);
  gasSheet = await loadImage('assets/gas.png').catch(() => null);
  barrelSheet = await loadImage('assets/barrel.png').catch(() => null);
  respawnData = await loadJSON('assets/respawn.json').catch(() => null);
  guardPalettes = await loadJSON('assets/guard-palettes.json').catch(() => null);
  endExplodeImg = await loadImage('assets/ending-explosion.png').catch(() => null);            // EndingExplosion tiles (base palette)
  endExplodeFlashImg = await loadImage('assets/ending-explosion-flash.png').catch(() => null); // the palette-flash variant
  endExplodeMeta = await loadJSON('assets/ending-explosion.json').catch(() => null);
  bridgeSheet = await loadImage('assets/bridge.png').catch(() => null);
  jetguardSheet = await loadImage('assets/jetguard.png').catch(() => null);
  shadowSheet = await loadImage('assets/shadow.png').catch(() => null);
  dogSheet = await loadImage('assets/dog.png').catch(() => null);
  duckSheet = await loadImage('assets/cowardduck.png').catch(() => null);
  boomerangSheet = await loadImage('assets/boomerang.png').catch(() => null);
  hindDImg = await loadImage('assets/hindd.png').catch(() => null);
  hindDWreckImg = await loadImage('assets/hindd-wreck.png').catch(() => null);
  airscrewSheet = await loadImage('assets/airscrew.png').catch(() => null);
  explosionBSheet = await loadImage('assets/explosion-b.png').catch(() => null);
  explosionBWSheet = await loadImage('assets/explosion-b-w.png').catch(() => null);
  explosionSSheet = await loadImage('assets/explosion-s.png').catch(() => null);
  mgImg = await loadImage('assets/metalgear.png').catch(() => null);
  mgBgImg = await loadImage('assets/metalgear-bg.png').catch(() => null);
  tankSheet = await loadImage('assets/tank.png').catch(() => null);
  dozerSheet = await loadImage('assets/bulldozer.png').catch(() => null);
  arnoldSheet = await loadImage('assets/arnold.png').catch(() => null);
  arnoldLegsSheet = await loadImage('assets/arnold-legs.png').catch(() => null);
  ftSheet = await loadImage('assets/firetrooper.png').catch(() => null);
  flameSheet = await loadImage('assets/flame.png').catch(() => null);
  tankShellSheet = await loadImage('assets/tankshell.png').catch(() => null);
  textsData = await loadJSON('assets/texts.json').catch(() => null);          // decoded idxTexts
  elevatorsData = await loadJSON('assets/elevatorrooms.json').catch(() => null);
  lasersData = await loadJSON('assets/lasers.json').catch(() => null);    // LasersRoom24/25/72
  camerasData = await loadJSON('assets/cameras.json').catch(() => null);  // RoomsWithCamera + paths
  musicLoops = await loadJSON('assets/music-loops.json').catch(() => null);  // per-track loop points
  cameraImg = await loadImage('assets/camera.png').catch(() => null);     // SprCamera 4 dirs x 2 colours
  [shotsSheet, shotsMeta] = await Promise.all([
    loadImage('assets/shots.png').catch(() => null),                      // weapon projectiles/explosions
    loadJSON('assets/shots.json').catch(() => null),
  ]);
  actorsData = await loadJSON('assets/actors.json').catch(() => null);    // real guards/prisoners
  [mgkSheet, mgkMeta, sgSheet, sgMeta] = await Promise.all([
    loadImage('assets/mgk.png').catch(() => null),                        // Machine Gun Kid frames
    loadJSON('assets/mgk.json').catch(() => null),
    loadImage('assets/sgunner.png').catch(() => null),                    // Shotgunner frames
    loadJSON('assets/sgunner.json').catch(() => null),
  ]);
  [bigBossSheet, bigBossMeta] = await Promise.all([
    loadImage('assets/bigboss.png').catch(() => null),                    // SprBigBoss frames (room 119)
    loadJSON('assets/bigboss.json').catch(() => null),
  ]);
  [elevatorImg, elevatorMeta] = await Promise.all([
    loadImage('assets/elevator.png').catch(() => null),
    loadJSON('assets/elevator.json').catch(() => null),
  ]);
  [konamiLogoImg, metalImg, gearImg] = await Promise.all([
    loadImage('assets/konami-logo.png').catch(() => null),
    loadImage('assets/metal.png').catch(() => null),
    loadImage('assets/gear.png').catch(() => null),
  ]);
  // Radio screen assets (RadioLogic / DrawRadio) + per-room callers.
  radiocallsData = await loadJSON('assets/radiocalls.json').catch(() => null);
  [radioBgImg, snakePortraitImg, freqDigitsImg, ledOnImg, ledHalfImg, ...snakeTalkImgs] = await Promise.all([
    loadImage('assets/radio-bg.png').catch(() => null),
    loadImage('assets/snake-portrait.png').catch(() => null),
    loadImage('assets/freq-digits.png').catch(() => null),
    loadImage('assets/led-on.png').catch(() => null),
    loadImage('assets/led-half.png').catch(() => null),
    loadImage('assets/snake-talk0.png').catch(() => null),
    loadImage('assets/snake-talk1.png').catch(() => null),
    loadImage('assets/snake-talk2.png').catch(() => null),
  ]);
  assets.sheet = sheet;
  assets.atlas = atlas;
  manifest = mani;
  connections = conns;
  doorsData = dData;
  doorTypes = dTypes;
  doorGfx = dGfx;
  itemsData = iData;

  // Load the door sprite PNGs referenced by door-gfx.json.
  const doorPngs = [...new Set(Object.values(doorGfx).map((g) => g.img))];
  await Promise.all(doorPngs.map(async (name) => doorImages.set(name, await loadImage('assets/' + name))));

  // Preload every room in the manifest so transitions are instant + synchronous. The
  // goggles variant is the same room rendered with RoomPalette10 (ChkGogglesPal's grey
  // infrared palette — the per-room tile slots go grey, fixed slots stay).
  await Promise.all(manifest.rooms.map(async (n) => {
    const [img, goggles, dark, collision] = await Promise.all([
      loadImage(`assets/rooms/${n}.png`),
      loadImage(`assets/rooms/${n}.goggles.png`).catch(() => null),
      DARK_ROOMS.has(n) ? loadImage(`assets/rooms/${n}.dark.png`).catch(() => null) : null,
      loadJSON(`assets/rooms/${n}.collision.json`),
    ]);
    rooms.set(n, { img, goggles, dark, collision });
  }));

  setRoom(manifest.start);
}

// ---- Room manager ----------------------------------------------------------
let previousRoom = -1;        // PreviousRoom (some init logic keys on where Snake came from)
let enterDir = 0;             // NextRoomDirect (1=Up/from-south 2=Down 3=Left 4=Right) on edge crossings
function setRoom(n) {
  const r = rooms.get(n);
  if (!r) { console.warn('Room not loaded:', n); return; }
  previousRoom = currentRoom;
  currentRoom = n;
  if (gameState === 'play') chkSaveGameStatus(n);   // ChkSaveGameStatus: arm a checkpoint on the pair
  if (n === 111) switchOffMsx = true;               // ChkSwitchMsxOff: room 111 arms Big Boss's MSX order
  assets.room = r.img;
  assets.roomGoggles = r.goggles || null;
  assets.roomDark = r.dark || null;
  assets.collision = r.collision;
  buildDoors(n);
  buildGuard(n);
  buildRoomItems(n);
  buildPrisoner(n);
  buildLasers(n);           // InitLaserRoom: the room's beams (none while the alert is up)
  buildCameras(n);          // InitCamera / InitCameraLaser
  buildBoss(n);             // InitMachGunKid (room 20, unless MachGunStatus says dead)
  buildPitfalls(n);         // InitPitfall + the HELP-ME voice (room 166)
  buildScorpions(n);        // InitScorpion (the desert rooms 102/208/209)
  buildMines(n);            // InitMines (the buried mine fields, rooms 9/64/114/120)
  buildShellSpawner(n);     // InitSpawnTankShell (the desert barrage, rooms 65/66)
  buildDesertSecurity(n);   // InitDesertSecurity (room 69's uniform-gated door)
  buildElevRelief(n);       // InitSpawnGuardElev (room 3's relieve ceremony)
  buildGasClouds(n);        // InitGas (the gas rooms' drifting clouds)
  buildBarrels(n);          // InitRollingBarrel (141/153/191/205)
  buildPowerSwitch(n);      // InitPowerSwitch / the electric floor (37/110/40)
  buildBridges(n);          // InitBridge (the moving walkways, 45/46)
  buildJetpacks(n);         // InitJetpackTakeoff / the room-40 switch event
  buildDogs(n);             // InitDog (room 207)
  buildDuck(n);             // InitCowardDuck (room 193, gated on CARD8)
  buildMidBosses(n);        // Tank (67) / Bulldozer (71) / Arnolds (83) / Fire Trooper (95)
  buildHindD(n);            // Hind D (room 50)
  buildMetalGear(n);        // Metal Gear (room 118)
  buildBigBoss(n);          // Big Boss (room 119)
  buildFakeMadnar(n);       // the room-189 trap
  // InitShooter (rooms 88/90/91): the ambush shooters set the alarm directly (AlertMode=1 +
  // AlertRespawnTimer word 0x0A80 -> timer 0x80, budget 0x0A) WITHOUT transforming the shooters —
  // they run ShooterLogic until they self-transform. (Room 206's shooters do NOT raise the alarm.)
  if ([88, 90, 91].includes(n) && actorsData && actorsData[n] &&
      actorsData[n].guards.some((g) => g.shooter) && !alertMode) {
    alertMode = true; redAlertFlag = devForceRed || redAlertBit(n); redAlertMusic = devForceRed; roomAlert = n;
    alertRespawnTimer = 0x80; numRespawnGuards = 0x0A;        // InitShooter's 0x0A80
    playAlert();
  }
  chkLorryMov(n);           // the moving-lorry ride (GameMode 5)
  playerShots.length = 0;   // room change clears any in-flight player shots
  updateAreaMusic();        // SetAreaMusic6: the RoomsMusic nibble picks the track

  // SetAreaMusic6 (Banks0123.asm:1609-1612): entering a room first cuts a playing ring SFX.
  // Then ChkRadioCalls (Banks0123.asm:1689): RadioCallFlag defaults to 2 (stopped); a room whose
  // RoomsMusic byte (data/musicradioconfig.asm) has bit 3 arms a pending call —
  // IncomingCallTimer = 32 (the bit value 8 doubled twice), RadioCallFlag = 0. The ROM's caller
  // gates — Schneider's frequency once he's captured, Jennifer below Class 3 / her brother dead,
  // the antenna for MapZone >= 5 — depend on systems outside this slice; every exported room
  // passes them, so they are not invented here.
  stopCallRing();
  if (callRooms.has(n)) { incomingCallTimer = 32; radioCallFlag = 0; }
  else radioCallFlag = 2;

  // UpdateRadio (Banks0123.asm:2379): load the room's radio callers (radiocalls.json =
  // idxRoomRadio flattened); an auto-tune entry sets the frequency on entry (UpdateRadio3).
  radioPersons = (radiocallsData && radiocallsData[n]) || [];
  for (const p of radioPersons) if (p.autoTune) radioFreq = p.freq;

  // SetAreaMusic4 (Banks0123.asm:1590): carrying the bugged transmitter re-raises the alert
  // in every room outside RoomsNoAlert (and the elevators).
  if (transmiTaken && n < 240 && !NO_ALERT_ROOMS.has(n)) raiseAlarm(n);
}

// ---- Room items (AddRoomItems, logic/addroomitems.asm) ---------------------------------------
// The ROM places items only in rooms 122-217 (idxRoomItemsIdx), exported to items.json. The early
// cluster rooms hold none — faithfully empty. (The old DEMO_ITEMS overlay that seeded cards/box/
// weapons into rooms 1-10 was removed now that the connected world ships the real pickups.)

// Taken flags (SetItemAsTaken, logic/items.asm): guns 1-4 and the suppressor mark WeaponsTaken,
// equipment 9+ marks ItemsTaken — but explosives 5-7, RATION, and AMMO_CRATE are deliberately
// never marked, so they respawn on re-entry.
const weaponsTaken = new Set(), itemsTaken = new Set();
const itemRespawns = (id) =>
  (id >= PLASTIC_BOMB && id < SUPRESSOR) || id === P_RATION || id === P_AMMO_CRATE;
const isItemTaken = (id) =>
  !itemRespawns(id) && (id < ARMOR_ID ? weaponsTaken.has(id) : itemsTaken.has(id));
function setItemAsTaken(id) {
  if (itemRespawns(id)) return;
  (id < ARMOR_ID ? weaponsTaken : itemsTaken).add(id);   // suppressor (8) sits in WeaponsTaken
}
const PLASTIC_BOMB = 5, ARMOR_ID = 9;                    // Enums.asm (PLASTIC_BOMB / ARMOR)

// Build the active room's live items: placement data minus taken items, max 3 slots
// (ItemsInTheRoom holds 3 structures). Resets the one-drop-per-room latch (SpawnedItems).
function buildRoomItems(n) {
  spawnedItemLatch = false;
  roomItems = [null, null, null];
  let slot = 0;
  for (const it of (itemsData[String(n)] || [])) {
    // AddRoomItems2 (addroomitems.asm:44-49): the rocket launcher is withheld until Jennifer's
    // rocket-promise radio text (117) sets JeniRocketF; reaching it before then STOPS adding the
    // rest of the list too. (#34)
    if (it.id === ROCKET_LAUNCHER && !jeniRocket) break;
    if (isItemTaken(it.id)) continue;            // AddRoomItems5: an already-taken item is skipped
    if (slot >= 3) break;                        // ItemsInTheRoom holds 3 structures
    roomItems[slot++] = { id: it.id, y: it.y, x: it.x };
  }
}

// ---- Pickup (ChkTakeItems / ChkTakeItem, logic/items.asm) ------------------------------------
// Box: |itemY + 16 - playerY| < 16, then |itemX + NX/2 - playerX| < radius — NX/2=16, radius=20
// for 32-wide items (weapons 1-4), NX/2=8, radius=12 for 16-wide (everything else). Strict <.
function chkTakeItems() {
  for (let i = 0; i < roomItems.length; i++) {
    const it = roomItems[i];
    if (!it) continue;
    const wide = itemIsWide(it.id);
    if (Math.abs(it.y + 16 - snake.y) >= 16) continue;
    if (Math.abs(it.x + (wide ? 16 : 8) - snake.x) >= (wide ? 20 : 12)) continue;
    roomItems[i] = null;                                 // EraseTakenItem: zero the slot (no compaction)
    takeItem(it.id);
    playPickup();                                        // SFX 0x24 "pick up item"
    chkItemTakeText(it.id);                              // description path (Western-gated)
  }
}

// The pickup-description path (ErasePickedItem3 tail, logic/items.asm:399-414): a description
// shows only when the taken item EMPTIED the room (the TempData2 last-item check). ItemTakeText
// (data/itemtaketextid.asm) maps the pickup id to a text id (0/255 = none) — and then the
// Western ROM's IF (!JAPANESE) gate returns unless that text is 62 ("I TOOK BACK THE WEAPONS
// AND EQUIPMENTS", the post-capture equipment recovery). The disassembly marks the gate as a
// BUG/LIMITATION vs the Japanese version, which shows every description. So all normal pickups
// are silent BY THIS PORTED LOGIC — not a missing feature — and text 62 becomes reachable when
// the capture flow lands.
const ITEM_TAKE_TEXT = [   // ItemTakeText (data/itemtaketextid.asm), indexed by pickup id - 1
  16, 56, 46, 119, 69, 18, 29, 43, 65, 67, 96, 75, 151, 0, 85, 98,
  13, 152, 120, 81, 121, 11, 37, 63, 55, 103, 110, 153, 143, 8, 255, 71,
  40, 62, 21,
];
function chkItemTakeText(id) {
  if (roomItems.some(Boolean)) return;          // not the room's last item
  const text = ITEM_TAKE_TEXT[id - 1] || 0;
  if (text === 0 || text === 255) return;       // no description available for this item
  if (text !== 62) return;                      // the Western gate (logic/items.asm:409-413)
  setText(62);
}

// ChkTakeItem4 dispatch: ammo crate / weapon / suppressor / equipment item.
function takeItem(id) {
  if (id === P_AMMO_CRATE) { pickAmmoCrate(); return; }
  if (id < SUPRESSOR) { pickUpWeapon(id); return; }
  setItemAsTaken(id);
  if (id === SUPRESSOR) { invSuppressor = true; return; }     // PickSupressor: InvSupressor flag
  // Equipment: add to the inventory (inventory id = pickup id - 8, AddItemInventory) or
  // increment its units (AddItemAmount). A card's units hold its identification number.
  const inv = id - SUPRESSOR;
  if (inv === 0x1A) { recoverEquipment(); return; }           // the trash bag (logic/items.asm:122)
  items.set(inv, (items.get(inv) || 0) + ITEM_TAKE_AMOUNT[id - 1]);
  // AddItemInventory3: picking up the antenna forces a pending incoming call (items.asm:162-170). (#109)
  if (inv === SELECTED_ANTENNA) { incomingCallTimer = 0x10; radioCallFlag = 0; }
  clampInventory();
}

// PickUpWeapon + GetWeapon3: add/refill the weapon with its ItemTakeAmount (0 for guns 1-4,
// 5 for explosives); Snake's FIRST weapon is auto-selected — unless it's the grenade launcher.
function pickUpWeapon(id) {
  setItemAsTaken(id);
  const first = weapons.size === 0;
  weapons.set(id, (weapons.get(id) || 0) + ITEM_TAKE_AMOUNT[id - 1]);
  if (first && id !== GRENADE_LAUNCHER) selectedWeapon = id;
  clampInventory();
}

// PickAmmoCrate: +0x20 handgun, +0x20 SMG, +6 grenades, +2 rockets — owned weapons only.
function pickAmmoCrate() {
  for (const [w, n] of [[HAND_GUN, 20], [SUB_MACHINE_GUN, 20], [GRENADE_LAUNCHER, 6], [ROCKET_LAUNCHER, 2]])
    if (weapons.has(w)) weapons.set(w, weapons.get(w) + n);
  clampInventory();
}

// MaxAmmoRatioF cheats (passwords.asm): INTRUDER lifts every weapon's cap to 999, ISOLATION the
// rations cap (SetMaxAmmoVals checks the flags before clamping).
let maxAmmoCheat = false, maxRationsCheat = false;
// LimitAmmo / ChkMaxAmount with the current rank's maxima (SetMaxAmmoVals row per Class).
function clampInventory() {
  const max = MAX_AMMO_LV[snake.class] || MAX_AMMO_LV[0];
  for (const [w, a] of weapons) weapons.set(w, Math.min(a, maxAmmoCheat ? 0x999 : (max[w] || 0)));
  if (items.has(SELECTED_RATION))
    items.set(SELECTED_RATION, Math.min(items.get(SELECTED_RATION),
      maxRationsCheat ? 0x999 : (MAX_RATIONS_LV[snake.class] || 3)));
}

// ---- Passwords + save/load (passwords.asm + the cassette save of GameProgressBuffer) -----------
// The ROM's five secret passwords are CHEAT codes typed while PAUSED (checked on ExitPauseMode):
// DS 4 = class +2 · ANTA WA ERAI = class +1 · INTRUDER = max ammo · ISOLATION = max rations ·
// HIRAKE GOMA = all 8 cards + Grey Fox's cell open. We reuse the same pause-typed buffer for SAVE /
// LOAD: the ROM persists GameProgressBuffer to CASSETTE TAPE (no browser equivalent), so the
// faithful analog serialises the same progress to localStorage — a documented medium divergence.
let passwordBuffer = '';
const PASSWORDS = [
  // SetMaxClass djnz cascade (passwords.asm:156-164): DS 4 (c=0) → +1 class; ANTA WA ERAI (c=1)
  // → IncClassLv ×3 = max class (the header literally reads "ANTA WA ERAI: Max. class level"). (#38)
  { code: 'DS4',        apply: () => incClassLv() },                                          // class +1
  { code: 'ANTAWAERAI', apply: () => { incClassLv(); incClassLv(); incClassLv(); } },         // class +3 (max)
  { code: 'INTRUDER',   apply: () => { maxAmmoCheat = true; for (const w of weapons.keys()) weapons.set(w, 0x999); } },
  { code: 'ISOLATION',  apply: () => { maxRationsCheat = true; if (items.has(SELECTED_RATION)) items.set(SELECTED_RATION, 0x999); } },
  { code: 'HIRAKEGOMA', apply: () => { for (let c = 0; c < 8; c++) if (!items.has(SELECTED_CARD1 + c)) items.set(SELECTED_CARD1 + c, 1); openedDoorIds.add(0x0B); } },
];
function passwordKey(k) {                       // ReadKeyboard/AddCharPassBuf: roll into a 12-char buffer
  if (/^[a-z0-9]$/i.test(k)) passwordBuffer = (passwordBuffer + k.toUpperCase()).slice(-12);
}
function chkPasswords() {                       // ChkPasswords, on ExitPauseMode
  const b = passwordBuffer;
  if (b.endsWith('SAVE')) { passwordBuffer = ''; saveGame(); return; }
  if (b.endsWith('LOAD')) { passwordBuffer = ''; loadGame(); return; }
  // Only the class-changing codes play SFX 0x26 — and they do it inside IncClassLv (incClassLv).
  // INTRUDER/ISOLATION/HIRAKE GOMA (SetMaxAmmount/SetMaxRations/SetAllCards) play no SFX. (#74)
  for (const p of PASSWORDS) if (b.endsWith(p.code)) { passwordBuffer = ''; p.apply(); clampInventory(); return; }
}

const SAVE_KEY = 'metalgear.save';
function serializeProgress() {                  // the GameProgressBuffer equivalent
  return {
    room: currentRoom, x: snake.x, y: snake.y, dir: snake.dir, class: snake.class, life: snake.life,
    weapons: [...weapons], items: [...items], selectedWeapon, selectedItem, invSuppressor,
    doors: [...openedDoorIds], weaponsTaken: [...weaponsTaken], itemsTaken: [...itemsTaken],
    rescuedCnt, transmiTaken, checkpoint: introCheckpoint,
    maxAmmoCheat, maxRationsCheat,
    tankKO, dozerKO, ftKO, hindDKO, mgkDead, sgDead, bigBossDead, mgDestroyed, card7Taken, escaped,
    exitedLorry: [...guardExitedLorry],          // Guard1/2/3ExitedLorry
    switchOffMsx, schneiderCaptured,             // SwitchOffMSXF / SchneiderCaptured (radio gates)
  };
}
function restoreProgress(s) {
  snake.class = s.class; snake.maxLife = RANK_MAX_LIFE[snake.class]; snake.life = s.life;
  weapons.clear(); for (const [k, v] of s.weapons) weapons.set(k, v);
  items.clear(); for (const [k, v] of s.items) items.set(k, v);
  selectedWeapon = s.selectedWeapon; selectedItem = s.selectedItem; invSuppressor = s.invSuppressor;
  openedDoorIds.clear(); for (const d of s.doors) openedDoorIds.add(d);
  weaponsTaken.clear(); for (const w of s.weaponsTaken) weaponsTaken.add(w);
  itemsTaken.clear(); for (const i of s.itemsTaken) itemsTaken.add(i);
  rescuedCnt = s.rescuedCnt; transmiTaken = s.transmiTaken; introCheckpoint = s.checkpoint;
  maxAmmoCheat = s.maxAmmoCheat; maxRationsCheat = s.maxRationsCheat;
  tankKO = s.tankKO; dozerKO = s.dozerKO; ftKO = s.ftKO; hindDKO = s.hindDKO;
  mgkDead = s.mgkDead; sgDead = s.sgDead; bigBossDead = s.bigBossDead; mgDestroyed = s.mgDestroyed;
  card7Taken = s.card7Taken; escaped = s.escaped;
  if (s.exitedLorry) guardExitedLorry = [...s.exitedLorry];
  switchOffMsx = !!s.switchOffMsx; schneiderCaptured = !!s.schneiderCaptured;
  gameState = 'play';
  setRoom(s.room);
  snake.x = s.x; snake.y = s.y; snake.dir = s.dir;
  snake.controlMod = CONTROL_NORMAL; snake.anim = ANIM_NORMAL; snake.state = 'idle';
}
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serializeProgress())); playBuf(assets.useItemBuf); } catch (e) {} }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadGame() {
  let s; try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return; }
  if (s) { restoreProgress(s); playBuf(assets.useItemBuf); }
}

// ---- Checkpoints (logic/checkpoints.asm) -------------------------------------------------------
// ChkSaveGameStatus: on entering one of the SaveStatRooms (room, previousRoom) transitions — and
// NOT after Metal Gear is destroyed (MetalGear_KO) — the full progress is snapshot (StoreGameStat
// copies GameDataAreas into GameProgressBuffer). RestoreGameStat replays it on a game over, so a
// death reverts to the last checkpoint (progress made since it is lost). Reuses serializeProgress.
const SAVE_STAT_ROOMS = new Set([
  '121,121', '121,0', '240,3', '240,31', '242,39', '241,15', '241,27', '242,53', '241,63',
  '243,72', '245,206', '243,95', '245,207', '244,88', '246,154', '243,81', '245,205', '247,109',
  '250,115', '165,8', '10,204', '64,11', '73,69', '125,93', '56,123', '102,75', '108,104',
  '105,78', '110,107', '118,116', '123,56',
]);
let checkpointSnapshot = null, pendingCheckpoint = false;
function chkSaveGameStatus(room) {        // called from setRoom (room transition)
  if (mgDestroyed) return;                // MetalGear_KO: no checkpoints once the base is doomed
  if (SAVE_STAT_ROOMS.has(room + ',' + previousRoom)) pendingCheckpoint = true;
}
function takePendingCheckpoint() {        // snapshot after the entry position has settled
  if (!pendingCheckpoint) return;
  pendingCheckpoint = false;
  checkpointSnapshot = serializeProgress();
}

// ---- Enemy drops (ChkDropItem Banks0123.asm:12832 + SpawnItem logic/spawnitem.asm) -----------
// Rolled only on the third-PUNCH kill (the shot-kill path never reaches ChkDropItem; and the
// ROM's logic bug limits drops to ID_GUARD_SLOW — our guard's type, so it costs nothing here):
// (r >> 2) & 3 -> 0 = ration, 1 = ammo crate (ListDropItems), >= 2 = nothing. The item spawns
// at (X-8, Y-4), only once per room (SpawnedItems) and only if the first item slot is free.
function chkDropItem(g) {
  const roll = (rndByte() >> 2) & 3;
  if (roll >= 2) return;
  spawnItem(roll === 0 ? P_RATION : P_AMMO_CRATE, g.x - 8, g.y - 4);
}
function spawnItem(id, x, y) {
  // SpawnItem2 checks ONLY slot 0 of ItemsInTheRoom — a drop is possible while slots 1/2 still
  // hold items (picking up the slot-0 item frees it; slots never compact).
  if (spawnedItemLatch || roomItems[0]) return;          // one spawn per room; slot 0 must be free
  spawnedItemLatch = true;
  roomItems[0] = { id, y, x };
  playSpawn();                                           // SFX 0x25 "spawn item"
}

// ---- Rank progression (Banks0123.asm: IncRescued :9634 / IncClassLv :9643 / UpdateLevels
// :9654 / DowngradeRank :9581) ------------------------------------------------------------
let rescuedCnt = 0;              // RescuedCnt: rescues toward the next rank (0-4)
const rescuedRooms = new Set();  // RescuedArray analog, keyed by room number
// DowngradeRank (Banks0123.asm:9581-9590): RescuedArray is indexed in REVERSE of RoomsPrisoner
// (InitPrisoner's `cpir` leaves c = 22 - position). The downgrade zeroes RescuedArray[0..17] but
// SAVES/RESTORES index 0Dh (=13 → RoomsPrisoner[9] = room 193, Jennifer's brother). So the
// preserved set is indices 18-22 (rooms 203/164/167/182/189) PLUS index 13 (room 193) — NOT room
// 202 (index 17, which IS reset). The prisoner.asm:40 "first 6 not restored" comment is imprecise:
// it's the first FIVE of RoomsPrisoner plus the explicitly-restored 193. (#37)
const SPECIAL_PRISONER_ROOMS = new Set([189, 182, 167, 164, 203, 193]);

// IncRescued: every 5th rescued prisoner raises the rank.
function incRescued() {
  if (++rescuedCnt < 5) return;
  rescuedCnt = 0;
  incClassLv();
}
// IncClassLv: Class caps at 3; SFX 0x26; UpdateLevels refills life at the new maximum.
function incClassLv() {
  if (snake.class >= 3) return;
  snake.class++;
  playBuf(assets.rankUpBuf);
  updateLevels(true);
}
// UpdateLevels: MaxLife 24/32/40/48 per Class; rank-up REFILLS life, a downgrade only clamps
// (DowngradeRank saves/restores Life around UpdateLevels). Ammo/ration ceilings re-clamp.
function updateLevels(refill) {
  snake.maxLife = RANK_MAX_LIFE[snake.class];
  snake.life = refill ? snake.maxLife : Math.min(snake.life, snake.maxLife);
  clampInventory();
}
// DowngradeRank: reset the counter and the REGULAR prisoners' rescued flags (specials stay
// rescued) — this happens even at Class 0; then Class-1 with SFX 0x27 and clamped levels.
function downgradeRank() {
  for (const r of [...rescuedRooms]) if (!SPECIAL_PRISONER_ROOMS.has(r)) rescuedRooms.delete(r);
  rescuedCnt = 0;
  if (snake.class === 0) return;
  snake.class--;
  playBuf(assets.rankDownBuf);
  updateLevels(false);
}

// ---- Text window (SetText → GAME_MODE_TEXT_BOX) -------------------------------------------
// Real port of the ROM text pipeline. texts.json is the decoded text table (idxTexts + the
// dictionary, Tools/export-texts.mjs; format in docs/rom-data-formats.md "Texts") — strings
// hold the RAW ROM char codes, which index font.png directly. A text prints one character per
// TickCounter & 3 == 0 ROM ITERATION (TW_PrintChar2, Banks0123.asm:7989; the STAFF roll uses
// mask 7; one iteration = two 60Hz ticks, see chkIncomingCall — so tickCounter & 7 here), with
// print SFX 0x23 per non-space character (TW_PrintChar6), 8px advance (4px for the 0x97
// apostrophe), +12px per line (TW_PrintNewLine :8113), and a wrap when X passes
// TextX + TextNX − 8 (:8010). A page wait (the 0xFD between pages) waits for M/Enter
// (TW_Wait), blinking the enter icon — char 0x3F at PromptXY on TickCounter bit 4
// (DrawEnterIcon :8207) — when the TextBoxType high nibble is set; text 10 instead
// auto-advances after 0x60 iterations (:8175). A key press DURING printing skips straight to
// the next page (SkipText :8130 — it does not finish the current one). Window geometry per
// type (cfg & 0x0F) is the ROM's TextBoxXYSize/TextXYSize (:8374-8387); the box is a black
// fill with a WHITE border — DrawTextBoxIn (logic/textboxappear.asm:58-62) frames the box
// with DrawRect in TextBoxEff_Col, which every TextBoxEffectDat row sets to 0x0E (white).
// (The grow-in animation itself isn't reproduced — only its final bordered box.)
const TEXT_BOX_XY = [                       // [winY, winX, winNY, winNX] (TextBoxXYSize :8383)
  [0x18, 0xA0, 0x11, 0x40],
  [0x08, 0x30, 0x29, 0xA0],
  [0x04, 0x58, 0x40, 0x88],
  [0x74, 0x20, 0x48, 0xC8],                 // type 3: the radio text box
  [0x08, 0x30, 0x29, 0xA0],
];
const TEXT_XY = [        // [textY, textX, clearNY, clearNX, promptY, promptX] (TextXYSize :8374)
  [0x1C, 0xA4, 0x08, 0x38, 0x1C, 0xD4],
  [0x0C, 0x34, 0x20, 0x98, 0x24, 0xC4],
  [0x08, 0x5C, 0x38, 0x80, 0x38, 0xD4],
  [0x78, 0x24, 0x38, 0xB8, 0xA8, 0xD4],
  [0x12, 0x38, 0x14, 0x88, 0x1E, 0xB8],
];
const APOSTROPHE = 0x97;                    // half-width char (TW_PrintChar5)
let textsData = null;                       // texts.json: id -> { cfg, pages: [[lines]] }
let textBox = null;                         // { id, cfg, pages, page, shown, wait, waitCnt }
let textReturnState = 'play';

// SetText (Banks0123.asm:7808): open text `id` in its window, pausing the current mode.
// mode = SkipTextMode: 0 keys page/skip (default); 2 = SetTextUnskippable (:7798) — keys are
// ignored entirely and each page auto-advances on the wait timer (the capture scene texts).
function setText(id, mode) {
  // While Snake is dead the ROM's GAME_MODE_DEAD owns the dispatch (DeadLogic) — no text box may
  // open over it. Letting setText flip gameState to 'text' here would strand the dead countdown
  // (update() routes to updateTextBox and never reaches the DeadLogic restart) — a softlock that
  // can't be escaped (issue #13). Defensive: never open text while dead.
  if (gameState === 'dead') return;
  const t = textsData ? textsData[id] : null;
  if (!t) { console.warn('No text', id); return; }
  textReturnState = gameState;
  gameState = 'text';
  textBox = { id, cfg: t.cfg, pages: t.pages, page: 0, shown: 0, wait: false, waitCnt: 0x60,
              mode: mode || 0 };
}
const pageChars = (t) => t.pages[t.page].reduce((n, l) => n + l.length, 0);
const textCharAt = (t, i) => {              // i-th printable char of the current page
  for (const line of t.pages[t.page]) {
    if (i < line.length) return line[i];
    i -= line.length;
  }
  return ' ';
};
// Next page, or close and return to the paused mode (TextBox_End → PrevGameMode).
function advanceTextPage(t) {
  if (t.page + 1 < t.pages.length) { t.page++; t.shown = 0; t.wait = false; t.waitCnt = 0x60; }
  else {
    // TextBoxExit (Banks0123.asm:8301-8324): READING certain radio texts sets event
    // flags — Jennifer's rocket promise (117), Jennifer opening the compass door (118),
    // and Schneider's discovery (138).
    if (t.id === 117) jeniRocket = true;
    else if (t.id === 118) jeniOpenDoor = true;
    else if (t.id === 138) schneiderCaptured = true;
    textBox = null; gameState = textReturnState;
  }
}
let jeniRocket = false, schneiderCaptured = false;   // JeniRocketF / SchneiderCaptured
let switchOffMsx = false;   // SwitchOffMSXF — set on entering room 111 (ChkSwitchMsxOff); after this,
                            // contacting Big Boss by radio gets the "switch off your MSX" message
function updateTextBox() {
  const t = textBox;
  if (!t) { gameState = textReturnState; return; }
  if (!t.wait) {
    if (t.shown >= pageChars(t)) { t.wait = true; return; }   // page printed → TW_Wait
    // TW_PrintChar3 (Banks0123.asm:7994): print delay mask 3 on TickCounter. Text-box mode
    // replaces the play logic with the light TextBoxLogic, so the ROM's TickInProgress skip
    // doesn't halve it — the mask runs at the FULL tick rate (~15 chars/s, user-verified
    // against the original; the page-wait timer below stays on the iteration domain).
    if ((tickCounter & 3) !== 0) return;
    const ch = textCharAt(t, t.shown++);
    if (ch !== ' ') playBuf(assets.textBuf);                  // SFX 0x23 (spaces silent)
    return;
  }
  if ((tickCounter & 1) !== 0) return;                        // ROM iteration boundary
  // TW_Wait: text 10 and SkipTextMode-2 texts auto-advance on the 0x60-iteration timer
  // (Banks0123.asm:8147/8175); everything else in mode 0 waits for M/Enter (dismissText).
  if ((t.id === 10 || t.mode === 2) && --t.waitCnt <= 0) advanceTextPage(t);
}
// M / Enter: mid-print = SkipText (jump to the next page); waiting = advance. Unskippable
// texts (SkipTextMode 2) ignore the keys entirely (TW_PrintChar/TW_Wait mode checks).
function dismissText() {
  const t = textBox;
  if (!t || t.mode === 2) return;
  advanceTextPage(t);
}
function drawTextWindow() {
  const t = textBox;
  if (!t) return;
  const type = t.cfg & 0x0F;
  const [wy, wx, wny, wnx] = TEXT_BOX_XY[type] || TEXT_BOX_XY[0];
  ctx.fillStyle = '#000'; ctx.fillRect(wx, wy, wnx, wny);
  drawHudBox(wx, wy, wnx, wny);    // white DrawRect frame (DrawTextBoxIn3, colour 0x0E)
  const [ty, tx, , clearNX, py, px] = TEXT_XY[type] || TEXT_XY[0];
  let x = tx, y = ty, drawn = 0;
  outer: for (const line of t.pages[t.page]) {
    for (const ch of line) {
      if (drawn >= t.shown) break outer;
      if (x > tx + clearNX - 8) { x = tx; y += 12; }          // wrap (TW_PrintChar4)
      drawText(ch, x, y);
      x += ch.charCodeAt(0) === APOSTROPHE ? 4 : 8;           // half-width apostrophe
      drawn++;
    }
    x = tx; y += 12;                                          // explicit newline (+12)
  }
  // Blinking enter icon on key-paged texts with more pages (cfg high nibble, char 0x3F).
  if (t.wait && t.page + 1 < t.pages.length && (t.cfg & 0xF0) && (tickCounter & 0x20))
    drawText(String.fromCharCode(0x3F), px, py);
}

// ---- Prisoners (PrisonerLogic, logic/actors/prisoner.asm) --------------------------------
// REAL prisoners come from the room actor lists (actors.json — most plain prisoner rooms
// share the `ActorPrisoner` block at X 0x80, Y 0x60); their rescue texts are the real
// PrisonerTexts. Grey Fox (164) additionally renders from the SprPrisoner2 sheet in the
// room's blue sprite palette (greyfox.png). (The old DEMO_PRISONERS overlay in cluster rooms
// 3/5-9 was removed now that the connected world ships the real prisoners.)
let actorsData = null;        // actors.json: room -> { guards: [...], prisoners: [...] }
const PRISONER_LIFE = actorLife(ID_PRISONER1);   // idxActorLife[ID_PRISONER1] = 2 (one handgun bullet kills)
// Touch shape (ActorsShapeTouch[ID-1] = 0x17 -> ImpactAreasInfo row 0x17, data/shapes.asm:70:
// 0F8h, 10h, 0, 10h): touch iff |prisonerY - 8 - snakeY| < 16 AND |prisonerX - snakeX| < 16.
const PRISONER_TOUCH_SHAPE = { offY: -8, distY: 16, offX: 0, distX: 16 };
let prisoner = null;              // active room's prisoner (or null)
let prisonerSheet = null, prisonerMeta = null;   // prisoner.png / prisoner.json (optional)
let greyFoxSheet = null;      // greyfox.png — SprPrisoner2, room 164's blue palette (same layout)
let ellenSheet = null;        // ellen.png — SprElen, tan + the red dress (room 167)
let madnarSheet = null;       // madnar.png — SprMadnar, the white-coat doctor (182/189)
// ---- Pitfalls + the HELP-ME voice (PitfallLogic / ChkPitfall / ChkSayHelpMe) ----------------
// A closed pitfall triggers when Snake comes within ±40px of its centre (ChkTriggerPitfall),
// opens 2px per iteration to 64px (SFX 7 "Pitfall opens"), and from then on standing inside
// the hole KILLS outright (ChkPitfall: DecrementLife_B with all life). The HELP-ME voice
// (ID_HELPME_VOICE, room 166) cries text 128 (unskippable) every 0xC0 iterations.
let pitfalls = [];            // the active room's pitfalls: { x, y, state, size }
let helpmeActive = false, helpmeTimer = 0;

// InitPrisoner: place the room's prisoner unless his rescued flag is set.
// Pitfalls + the help-me voice come from the room actor list too (InitPitfall: closed,
// collision-armed; room 190's pre-opened pitfall is out of the exported world).
function buildPitfalls(n) {
  const a = actorsData && actorsData[n];
  pitfalls = ((a && a.pitfalls) || []).map((p) => ({ x: p.x, y: p.y, state: 'closed', size: 0 }));
  helpmeActive = !!(a && a.helpme);
  helpmeTimer = 2;                              // the first cry comes almost at once
}

// One iteration of the pitfall + help-me logic.
function pitfallTick() {
  if (helpmeActive && gameState === 'play' && --helpmeTimer <= 0) {
    helpmeTimer = 0xC0;                         // ChkSayHelpMe: re-cry delay
    setText(128, 2);                            // "HELP ME!" (unskippable)
  }
  for (const p of pitfalls) {
    if (p.state === 'closed') {                 // ChkTriggerPitfall: ±40px of the centre
      if (Math.abs(snake.y - p.y) < 40 && Math.abs(snake.x - p.x) < 40) {
        p.state = 'opening';
        playBuf(assets.pitfallBuf);             // SFX 7 "Pitfall opens"
      }
      continue;
    }
    if (p.state === 'opening' && (p.size += 2) >= 0x40) { p.size = 0x40; p.state = 'open'; }
    // ChkPitfall: inside the hole (±size/2 of the centre) = all life gone
    const half = p.size >> 1;
    if (Math.abs(snake.y - p.y) < half && Math.abs(snake.x - p.x) < half) {
      snake.invulnTimer = 0;                    // the pit ignores i-frames (DecrementLife_B direct)
      damage(0xFF);
    }
  }
}

// The hole: the ROM pre-draws the full 64x64 pit image (SetupPitfall: GfxPitfall tiles via
// PitfallTileMap — exported as pitfall.png) and reveals a CENTRE-OUT window of it as the
// hole grows (PitfallLogic3/RenderPitfallP0: the source window expands from the image
// centre with HOLE_SIZE). The brick rim and black interior come from the real art.
function drawPitfalls() {
  // Dark rooms: RoomPalette11 blacks palette slots 5 and 9 — the ONLY colours the pit art
  // uses besides black — so without the flashlight the open hole is pitch black like the
  // rest of the room (and still lethal). Verified against the exported art's colour set.
  if (DARK_ROOMS.has(currentRoom) && selectedItem !== SELECTED_FLASHLIGHT) return;
  for (const p of pitfalls) {
    if (p.size <= 0) continue;
    const half = p.size >> 1;
    if (pitfallImg) {
      ctx.drawImage(pitfallImg, 32 - half, 32 - half, p.size, p.size,
                    p.x - half, p.y - half, p.size, p.size);
    } else {                                   // fallback if the export is missing
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(p.x - half, p.y - half, p.size, p.size);
    }
  }
}

// ---- Scorpions (ScorpionLogic, logic/actors/scorpion.asm; rooms 102/208/209) --------------
// Desert wildlife: wanders in random DIAGONALS (ScorpionSpeedDat — dir 1=up-left,
// 2=down-right, 3=down-left, 4=up-right; ±1px per iteration), charges when the player is
// within 0x51 (GetDistancePlayer), turns back at the room margins (ChkScorpionLimits).
// A sting deals NO direct damage — it POISONS (ChkScorpion, touchenemy.asm:115-121:
// Poisoned=1 + the damage SFX, skipping TouchPlayer); poison then drains 1 life every
// 0x40 ITERATIONS (GS_Playing, Banks0123.asm:12197-12206) until the ANTIDOTE is used
// (not consumed). Life 2 (idxActorLife), bullet box shape 2 = (0,8,0,8).
let scorpions = [];
let poisoned = false;                                // Poisoned (cleared by ChkUseAntidote)
const SCORPION_SPEED = { 1: [-1, -1], 2: [1, 1], 3: [1, -1], 4: [-1, 1] };  // (dy, dx)
// ScorpionSeePlayer charges via CalcShot with the DEFAULT ShotSpeed 0x80 (+difficulty*8
// — no difficulty setting here, so the base); the quantized-angle velocity comes from
// calcShot() per iteration.
const SCORPION_FRAME = { 1: 0, 3: 2, 4: 4, 2: 6 };   // sheet: UL1,UL2,LD1,LD2,RU1,RU2,DR1,DR2
const SCORPION_SHOT_SHAPE = { offY: 0, distY: 8, offX: 0, distX: 8 };       // shape 2
let scorpionSheet = null, scorpionMeta = null;

function buildScorpions(n) {
  const a = actorsData && actorsData[n];
  scorpions = ((a && a.scorpions) || []).map((s) => ({
    x: s.x, y: s.y, dir: 1 + ((Math.random() * 4) | 0),     // InitScorpion's random frame/dir
    status: 2, wait: 8, anim: 0, life: 2,
    frame: SCORPION_FRAME[1 + ((Math.random() * 4) | 0)],   // InitScorpion -> SetScorpionSprId
    shotShape: SCORPION_SHOT_SHAPE,
  }));
}

function scorpionTick() {
  if ((tickCounter & 1) !== 0) return;               // ROM iteration boundary
  for (let i = scorpions.length - 1; i >= 0; i--) {
    const s = scorpions[i];
    if (s.life <= 0) {                               // KillActor on the logic tick
      playBuf(assets.guardDeadBuf);
      scorpions.splice(i, 1);
      continue;
    }
    s.anim = (s.anim + 1) & 0xff;
    const out = s.y < 0x11 || s.y >= 0xB0 || s.x < 0x11 || s.x >= 0xF0;  // ChkScorpionLimits
    switch (s.status) {
      case 0: {                                      // ScorpionWander
        // GetDistancePlayer (guardalert.asm:443-465) returns Chebyshev max(|dx|,|dy|), NOT Manhattan
        // — on diagonals the old |dx|+|dy| started the charge from up to ~40% too far. (#46)
        const dist = Math.max(Math.abs(snake.x - s.x), Math.abs(snake.y - s.y));
        if (dist < 0x51) {                           // ScorpionSeePlayer: charge (CalcShot)
          s.status = 1; s.wait = 8;
          // CalcShot with the default ShotSpeed 0x80: the QUANTIZED-angle dash (see
          // calcShot), aimed once — the scorpion always shoots PAST Snake, never
          // parking on him. At zero distance both blocks are 0 -> degree 32: a
          // full-speed down-right diagonal.
          const v = calcShot(s.x, s.y, 0x80);
          s.vx = v.vx; s.vy = v.vy;
          break;
        }
        if (out) {                                   // ScorpionTurn: opposite diagonal
          s.dir = { 1: 2, 2: 1, 3: 4, 4: 3 }[s.dir];
          const [dy, dx] = SCORPION_SPEED[s.dir]; s.vy = dy; s.vx = dx;
          s.frame = SCORPION_FRAME[s.dir] + ((s.anim & 4) ? 1 : 0);  // SetScorpionSprId
        } else if (--s.wait <= 0) {                  // ScorpionNewDir: random walk burst
          s.wait = 5 + ((Math.random() * 4) | 0);    // RandomWait5_8
          s.dir = 1 + ((Math.random() * 4) | 0);
          const [dy, dx] = SCORPION_SPEED[s.dir]; s.vy = dy; s.vx = dx;
          s.frame = SCORPION_FRAME[s.dir] + ((s.anim & 4) ? 1 : 0);  // SetScorpionSprId
        }
        s.x += s.vx || 0; s.y += s.vy || 0;
        break;
      }
      case 1: {                                      // ScorpionAttack: toward the player
        if (out || --s.wait <= 0) { s.status = 2; s.wait = 0x14; s.vx = 0; s.vy = 0; break; }
        s.x += s.vx; s.y += s.vy;
        break;
      }
      case 2:                                        // ScorpionWait, then a fresh wander
        if (--s.wait <= 0) { s.status = 0; s.wait = 1; }
        break;
    }
    // The sting (ChkScorpion): the guard-class touch box (shape 8: |dy|<8, |dx|<12) —
    // poison + the damage SFX, NO direct damage, no i-frame interaction.
    if (Math.abs(snake.y - s.y) < 8 && Math.abs(snake.x - s.x) < 12) {
      if (!poisoned) { poisoned = true; playHit(); }
    }
  }
}

function drawScorpions() {
  for (const s of scorpions) {
    // SetScorpionSprId runs only on init / new dir / turn — the sprite HOLDS between
    // direction picks (and through the whole charge); it is not a free-running anim.
    const f = s.frame != null ? s.frame : SCORPION_FRAME[s.dir];
    if (scorpionSheet)
      ctx.drawImage(scorpionSheet, f * 16, 0, 16, 16, Math.round(s.x - 8), Math.round(s.y - 8), 16, 16);
  }
}

// ---- Land mines (InitMines, logic/actors/mine.asm) ----------------------------------------
// Buried mines placed per room (actorsinrooms.asm): INVISIBLE unless the mine detector item is
// selected (then drawn as DrawMine's 5x5 marker). Player contact destroys the mine (LIFE=0,
// touchenemy.asm:110-113) and deals ActorTouchDamage[ID_LAND_MINE-1] = 0x10 (TouchPlayer);
// SFX = the bomb blast 0x1C. Rooms 9 (12), 64 (9), 114 (8), 120 (9).
const SELECTED_MINE_DETECTOR = 7;            // Enums.asm SELECTED_MINE_DETECTOR (ItemMineDetect)
const MINE_DAMAGE = actorTouchDmg(ID_LAND_MINE);   // ActorTouchDamage[ID_LAND_MINE] = 0x10 (shapes.asm)
let mines = [];
function buildMines(n) {
  const a = actorsData && actorsData[n];
  mines = ((a && a.mines) || []).map((m) => ({ x: m.x, y: m.y, exploding: 0 }));
}
function mineTick() {
  if ((tickCounter & 1) !== 0) return;       // ROM iteration boundary
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    if (m.exploding > 0) { if (--m.exploding <= 0) mines.splice(i, 1); continue; }
    // ChkArea touch box: ActorsShapeTouch[ID_LAND_MINE]=8 -> ImpactAreasInfo row 8 (0,8,0,0x0C):
    // |mineX-snakeX| < 0x0C AND |mineY-snakeY| < 8, strict < (was ±8 in X). Contact destroys it. (#65)
    if (Math.abs(m.x - snake.x) < 0x0C && Math.abs(m.y - snake.y) < 8) {
      m.exploding = 0x0F;                     // ActorShapeExpl blast frames
      playBuf(assets.bombExplosionBuf);       // SFX 0x1C
      damage(MINE_DAMAGE);                    // honours the i-frames like any contact hit
    }
  }
}
function drawMines() {
  const reveal = selectedItem === SELECTED_MINE_DETECTOR;   // DrawMines: only with the detector
  for (const m of mines) {
    if (m.exploding > 0) {
      const r = 4 + (0x0F - m.exploding);                   // a brief expanding blast
      ctx.fillStyle = (m.exploding & 2) ? '#ffd070' : '#ffffff';
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.fill();
    } else if (reveal) {
      ctx.fillStyle = '#e04030';                            // DrawMine's 5x5 marker
      ctx.fillRect(Math.round(m.x) - 2, Math.round(m.y) - 2, 5, 5);
    }
  }
}

// ---- Desert security (desertsecurity.asm; room 69) ----------------------------------------
// Not a visible guard: when Snake nears the desert guards WEARING THE UNIFORM, the lock-12
// building-2 door opens ("Come in", text 127); without it, the alarm triggers. A warning (text 35)
// prints once on entry. Dismissed if Snake came from building 2 (room 73) or while the alarm is up.
const SELECTED_UNIFORM = 0x18;               // Enums.asm SELECTED_UNIFORM
const SELECTED_COMPASS = 0x0B;               // Enums.asm SELECTED_COMPASS (navigates the desert, room 103)
let desertSecurity = null, desertGuardTextShown = false;
function buildDesertSecurity(n) {
  // InitDesertSecurity: an unconditional StopAlert on entering room 69 (clears the alert so the
  // uniform/"Come in" flow can run), then dismiss if Snake arrived from building 2 (room 73). (#97)
  if (n === 69) stopAlarm();
  desertSecurity = (n === 69 && previousRoom !== 73) ? { status: 0, timer: 0x10, doorStep: 0 } : null;
}
function desertSecurityTick() {
  if (!desertSecurity || (tickCounter & 1) !== 0) return;   // ROM iteration boundary
  if (alertMode) { desertSecurity = null; return; }         // DesertSecurityLogic: removed in alert
  const ds = desertSecurity;
  if (ds.timer > 0) {                                        // ChkDesertGuardTxt: the warning text
    if (--ds.timer === 0 && !desertGuardTextShown) { desertGuardTextShown = true; setText(35, 2); }
    return;
  }
  if (ds.status === 0) {                                     // DesertSecurity1: is Snake near the guards?
    if (snake.y < 128 && snake.x >= 0x38 && snake.x < 0xB8) ds.status = 1;
    return;
  }
  if (selectedItem !== SELECTED_UNIFORM) {                   // DesertSecurity2: no uniform -> alarm
    raiseAlarm(currentRoom, false, 0x1E); desertSecurity = null; return;   // DesertSecurity2: `ld a,1Eh`
  }
  if (ds.doorStep === 0) { ds.doorStep = 1; setText(127, 2); return; }   // DesertSecurity3: "Come in"
  doorBuild2Open = true;                                     // DesertSecurity4: DoorBuild2LockedF
  desertSecurity = null;
}

// ---- Elevator-guard relieve ceremony (guardelevator.asm / elevatorguardspawner.asm; room 3) -
// The full two-guard ceremony, ported faithfully. The two posted guards stand at X 0x50 / 0x90,
// look around (GuardRandomDir), and after the relieve time walk off to the right while the left
// guard announces "Relieve" (text 1); a spawner (SpawnGuardElev) periodically marches a fresh
// pair in from the right (X 0xF2) to the two posts. If the player enters the corridor (PlayerY <
// 0x3D, GuardElevSetAlert / GuardElevLeave) the alarm sounds: the first guard turns into a chasing
// alert guard (TransformAlertGuard) and the second flees to the right (GuardElevFlees, speed 4).
// Status: 0 Walk-to-post, 1 Idle/look, 2 Leave, (3 Alert is folded into the transform), 4 Flee.
const ELEV_WALK = 0, ELEV_IDLE = 1, ELEV_LEAVE = 2, ELEV_FLEE = 4;
const ELEV_DIR_NUM = { up: 1, down: 2, left: 3, right: 4 };
const ELEV_DIR_STR = { 1: 'up', 2: 'down', 3: 'left', 4: 'right' };
let elevGuards = [], elevSpawner = null;
// posted = a placed guard standing idle at its post; otherwise a relieve guard entering from 0xF2.
function makeElevGuard(x, y, posted, destX) {
  const g = { x, y, dir: posted ? 'down' : 'left', status: posted ? ELEV_IDLE : ELEV_WALK,
    wait: 0, moving: !posted, destX: posted ? x : (destX != null ? destX : 0x50), lookTimer: 0x1E,
    spawnedSecond: false, animTimer: 0, walkPhase: 0, stepping: false, asleep: false,
    stunnedCnt: 0, state: 'idle', anim: 0 };
  if (!posted && g.destX !== 0x90) g.wait = 0x40;          // InitGuardRelieve: time to spawn #2
  return g;
}
function buildElevRelief(n) {
  elevGuards = []; elevSpawner = null;
  if (n !== 3) return;
  const fromElev = previousRoom === ELEVATOR_ROOM;         // PreviousRoom == 240 (came up/down)
  // InitSpawnGuardElev: a shorter loop count when the player came from the elevator (no posts up).
  elevSpawner = { wait: 0x1E, loops: fromElev ? 5 : 0x13 };
  // InitGuardElevat: the two placed guards are dismissed if the player arrived via the elevator.
  if (!fromElev) { elevGuards.push(makeElevGuard(0x50, 0x30, true)); elevGuards.push(makeElevGuard(0x90, 0x30, true)); }
}
function elevAnim(g) { g.stepping = true; if ((++g.animTimer & 3) === 0) g.walkPhase ^= 1; }
function elevReach(g) {                                     // GuardReachElevator: stop, look down, idle
  g.wait = 0; g.status = ELEV_IDLE; g.moving = false; g.dir = 'down'; g.lookTimer = 0x1E; g.stepping = false;
}
function elevRandomDir(g) {                                 // GuardRandomDir: look L/R/down (never up)
  g.stepping = false;
  if (--g.lookTimer > 0) return;
  g.lookTimer = ((Math.random() * 0x10) | 0) + 0x20;
  const dn = ELEV_DIR_NUM[g.dir];
  let a = (dn & 1);
  a = (a + ((Math.random() * 2) | 0) + dn) & 3;
  if (a === 0) return;                                      // "do not look up"
  g.dir = ELEV_DIR_STR[a + 1];
}
function elevTransform(g) {                                 // TransformAlertGuard: -> real chaser
  const ng = makeGuard({ x: g.x, y: g.y, dir: g.dir, speed: SPEED / 2 });
  enterAlert(ng);
  guards.push(ng);
  g.remove = true;
}
// GuardElevSetAlert + GuardElevAlert: sound the alarm, turn the first guard into a chaser, the
// second flees. Done in one beat (the 0xF-iteration look-at-player delay is collapsed — cosmetic),
// so the alarm always has a live guard (chkAlarmEnd's empty-room check can't cancel it).
function elevDetect() {
  if (!alertMode) raiseAlarm(currentRoom, false, 0x3C);    // GuardElevSetAlert: `ld a,3Ch` (elevatorguardspawner.asm:205)
  let chaser = false;
  for (const g of elevGuards) {
    if (g.status === ELEV_FLEE || g.remove) continue;
    if (!chaser) { elevTransform(g); chaser = true; }      // EnemyListEntry1 -> alert chaser
    else { g.status = ELEV_FLEE; g.moving = true; g.dir = 'right'; }   // EnemyListEntry2 -> flee
  }
}
function elevGuardLogic(g) {
  if (g.remove) return;
  if (g.status === ELEV_FLEE) { elevAnim(g); g.x += 4; if (g.x > 0xF8) g.remove = true; return; }
  if (alertMode) return;                                   // already transformed by elevDetect
  switch (g.status) {
    case ELEV_WALK:                                         // GuardElevatorWalk: march to the post
      if (snake.y < 0x3D) { elevDetect(); return; }
      elevAnim(g); g.x -= 1;                                // SetWalkSpeed (left = 1px/iteration)
      if (g.x <= g.destX) { g.x = g.destX; elevReach(g); return; }
      if (g.destX === 0x90) return;                         // the second guard never spawns another
      if (!g.spawnedSecond && --g.wait <= 0) {              // spawn the second guard from the right
        g.spawnedSecond = true; elevGuards.push(makeElevGuard(0xF2, 0x30, false, 0x90));
      }
      return;
    case ELEV_IDLE:                                         // GuardElevIdle: look around, then leave
      if (snake.y < 0x3D) { elevDetect(); return; }
      g.wait = (g.wait - 1) & 0xFF;                         // dec from 0 -> 0xFF: ~255-iteration post
      if (g.wait !== 0) { elevRandomDir(g); return; }
      g.status = ELEV_LEAVE; g.moving = true; g.dir = 'right'; g.stepping = true;
      if (g.destX === 0x50) setText(1, 2);                  // the left guard announces "Relieve"
      return;
    case ELEV_LEAVE:                                        // GuardElevLeave: walk off to the right
      if (snake.y < 0x3D && snake.x + 0x10 >= g.x) { elevDetect(); return; }
      elevAnim(g); g.x += 1;
      if (g.x > 0xF8) g.remove = true;
      return;
  }
}
function elevReliefTick() {
  if (currentRoom !== 3 || (tickCounter & 1) !== 0) return;  // 30Hz iteration gate
  const active = elevGuards.slice();                         // guards spawned this tick act next tick
  if (alertMode) elevDetect();                               // GuardElevator: transform/flee on alarm
  else if (elevSpawner && --elevSpawner.wait <= 0) {         // SpawnGuardElev
    elevSpawner.wait = 0x1E;
    if (--elevSpawner.loops <= 0) { elevSpawner.loops = 0x17; elevGuards.push(makeElevGuard(0xF2, 0x30, false, 0x50)); }
  }
  for (const g of active) elevGuardLogic(g);
  elevGuards = elevGuards.filter((g) => !g.remove);
}
function drawElevRelief() {
  for (const g of elevGuards) drawGuardOne(g);               // reuse the guard sprite renderer
}

// ---- Gas clouds (GasLogic, logic/actors/gas.asm) ------------------------------------------
// Every gas room's ID_GAS spots: hidden for a RANDOM time (the R register, up to 255
// iterations), then visible 0x20 iterations animating 2 frames every 8 (Anim2FramesActor),
// then hidden again with a fresh random delay. Pure ambience — no collision.
let gasClouds = [];
function buildGasClouds(n) {
  const a = actorsData && actorsData[n];
  gasClouds = ((a && a.gas) || []).map((g) => ({
    x: g.x, y: g.y, visible: false, timer: 1 + ((Math.random() * 255) | 0), anim: 0,
  }));
}
function gasCloudTick() {
  if ((tickCounter & 1) !== 0) return;             // ROM iteration boundary
  for (const g of gasClouds) {
    g.anim = (g.anim + 1) & 0xff;
    if (--g.timer > 0) continue;
    g.visible = !g.visible;
    g.timer = g.visible ? 0x20 : 1 + ((Math.random() * 255) | 0);
  }
}
function drawGasClouds() {
  if (!gasSheet) return;
  for (const g of gasClouds) {
    if (!g.visible) continue;
    const f = (g.anim & 8) ? 1 : 0;                // 2 frames, swapped every 8 iterations
    ctx.drawImage(gasSheet, f * 16, 0, 16, 16, Math.round(g.x - 8), Math.round(g.y - 8), 16, 16);
  }
}
let gasSheet = null;

// ---- Rolling barrels (RollingBarrelLogic, logic/actors/rollingbarrels.asm) ----------------
// Rooms 141/153/191/205: ONE barrel actor sits at the top-centre (x 128, y 8) and rolls
// horizontally, accelerating ±8/256 px per iteration, bouncing between X 56 and 200 (SFX 0x1D),
// starting AWAY from the player's side (InitRollingBarrel: PlayerX < 0x80 -> right, else left).
// It is NOT a single barrel: the actor's sprite-attribute list RollBarrels1/2 draws a tall
// 16-wide COLUMN of ~9 stacked barrel segments (D0/D4 cap + D8/DC ×7 + E0/E4 cap) that spans
// almost the whole room height — a rolling wall you dodge through the bottom corridor. Touching
// ANY of it = ALL LIFE (ActorTouchDamage[ID_ROLLING_BARREL-1] = 0xFF). 2 roll frames every 4
// iterations. (Was a single, badly-drawn 16x16 barrel — issue #20.)
const BARREL_W = 16;                                  // column width (the ROM sprite column is 16 wide)
const BARREL_SEGS = 9, BARREL_SEG_H = 16;            // RollBarrels1: 9 stacked 16px segments
const BARREL_H = BARREL_SEGS * BARREL_SEG_H;         // 144px — most of the 192px room height
let barrels = [];
function buildBarrels(n) {
  const a = actorsData && actorsData[n];
  barrels = ((a && a.barrels) || []).map((b) => ({
    x: b.x, y: b.y, vx: snake.x < 0x80 ? 0.5 : -0.5, anim: 0,
  }));
}
function barrelTick() {
  if ((tickCounter & 1) !== 0) return;             // ROM iteration boundary
  for (const b of barrels) {
    b.anim = (b.anim + 1) & 0xff;
    if (b.x >= 200) { b.x = 199; b.vx = -0.5; playBuf(assets.barrelHitBuf); }     // bounce
    else if (b.x <= 56) { b.x = 57; b.vx = 0.5; playBuf(assets.barrelHitBuf); }
    b.vx += b.vx < 0 ? -8 / 256 : 8 / 256;         // RB_IncrementSpeed
    b.x += b.vx;
    // The crush: touching ANY part of the rolling column is fatal (damage 0xFF = all life; the
    // normal damage delay applies). The column spans [b.y, b.y + BARREL_H] at the rolling X.
    if (Math.abs(snake.x - b.x) < 12 && snake.y > b.y - 8 && snake.y < b.y + BARREL_H &&
        snake.invulnTimer === 0)
      damage(0xFF);
  }
}
function drawBarrels() {
  for (const b of barrels) drawBarrelColumn(Math.round(b.x), Math.round(b.y), b.anim);
}
// One rolling cylinder: a 16-wide column of BARREL_SEGS stacked barrel segments. Round shading
// across the width + horizontal joint rings + vertical staves that slide between the 2 roll frames
// so it reads as rotating as it crosses the room.
function drawBarrelColumn(cx, y0, anim) {
  const x0 = cx - (BARREL_W >> 1), w = BARREL_W, h = BARREL_H;
  const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0);   // dark edges -> light centre (round)
  grad.addColorStop(0, '#4a2f15'); grad.addColorStop(0.35, '#a8702f');
  grad.addColorStop(0.5, '#e0ad5c'); grad.addColorStop(0.65, '#a8702f');
  grad.addColorStop(1, '#4a2f15');
  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = '#2e1d0c';                                 // segment joint rings (stacked barrels)
  for (let s = 0; s <= BARREL_SEGS; s++) ctx.fillRect(x0, y0 + Math.min(s * BARREL_SEG_H, h - 1), w, 1);
  const f = (Math.floor(anim / 4) & 1);                      // 2 roll frames every 4 iterations
  ctx.fillStyle = 'rgba(46,29,12,0.85)';                     // dark staves slide sideways = rolling
  for (const sx of (f ? [3, 8, 13] : [1, 6, 11])) ctx.fillRect(x0 + sx, y0, 1, h);
  ctx.fillStyle = 'rgba(255,235,190,0.45)';                  // highlight staves (opposite phase)
  for (const sx of (f ? [5, 10, 15] : [3, 8, 13])) ctx.fillRect(x0 + sx, y0, 1, h);
  ctx.strokeStyle = '#241606'; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
}
let barrelSheet = null;

// ---- Power switches + the electric floor (powerswitch.asm / damageelectric.asm) -----------
// Rooms with electrified floor tiles (ChkElectricFloor): 16/37/110 use tiles 0x60/0x61,
// room 40 uses 0x45/0x46, room 116 uses 0x40/0x41. The floor is LIVE while PowerSwitchOn —
// set by the room's switch actor (ID_POWER_SWITCH in 37/110, ID_JETPACK_SWITCH in 40);
// SHOOTING the switch dead turns the floor off for the visit. Standing on a live tile:
// SFX 0x18, an 8-frame damage delay, 2 life per zap. (Room 16's GUARD_SWITCH operator and
// room 116's Metal Gear floor land with their own slices — those floors stay inert here.)
const ELECTRIC_TILES = { 16: [0x60, 0x61], 37: [0x60, 0x61], 110: [0x60, 0x61],
                         40: [0x45, 0x46], 116: [0x40, 0x41] };
let powerSwitch = null;        // { x, y, life, jetpack } — the room's destructible switch
let powerSwitchOn = false;
let powerFadeBright = 1, powerFadeDelta = 1;   // PowerSwitchLogic palette fade: BRIGHT 1..7 (white at 7)
// weapondamage.asm row for ID_POWER_SWITCH (index 0x2C-1=43): every weapon is 0xFF (no damage)
// EXCEPT the remote-control MISSILE (=5). With LIFE 2, only the missile (weapon id 7) can blow the
// fuse — the whole point of the electric-floor puzzle. (Was destroyable by any weapon — issue #26.)
const POWER_SWITCH_DMG = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 5 };
function buildPowerSwitch(n) {
  const a = actorsData && actorsData[n];
  const p = a && a.powerswitch;
  // A JETPACK switch (room 40) does NOT arm the floor at entry — the jetpack guard's
  // descend-and-flip event creates the real power switch mid-scene (JetpackSwitchLogic2).
  if (p && p.jetpack) { powerSwitch = null; powerSwitchOn = false; return; }
  powerSwitch = p ? { x: p.x, y: p.y, life: 2, dmgTable: POWER_SWITCH_DMG,
                      shotShape: { offY: 0, distY: 8, offX: 0, distX: 8 } } : null;
  powerSwitchOn = !!p;                             // InitPowerSwitch: on while the switch lives
}
function chkElectricFloor() {
  if (!powerSwitchOn) return;
  const pair = ELECTRIC_TILES[currentRoom];
  if (!pair || !assets.collision || !assets.collision.tiles) return;
  if (snake.invulnTimer > 0) return;               // the damage delay gates repeats
  const c = assets.collision;
  const tileAt = (x) => c.tiles[((snake.y >> 3) * c.width) + (x >> 3)];   // GetTilePlayer row
  const l = tileAt(snake.x - 4), r = tileAt(snake.x + 3);
  if (l === pair[0] || l === pair[1] || r === pair[0] || r === pair[1]) {
    playBuf(assets.electricBuf);                   // SFX 0x18
    snake.invulnTimer = 8;                         // DamageDelayTimer = 8
    snake.life = Math.max(0, snake.life - 2);      // DecrementLife_2
    if (snake.life === 0) enterDead();
  }
}
function powerSwitchTick() {
  if (powerSwitch && powerSwitch.life <= 0) {      // shot dead: the floor dies with it
    powerSwitch = null;
    powerSwitchOn = false;
  }
  // PowerSwitchLogic (powerswitch.asm:24): every 4 iterations BRIGHT += BRIGHT_DELTA, oscillating
  // 1<->7 (ChkRevertFade). The tile colour is built R=G=B=BRIGHT, so it ramps grey -> pure WHITE
  // at 7. 4 iterations ~= 8 of our 60Hz ticks. (Was a fixed yellow sine pulse — issue #24.)
  if (powerSwitchOn && (tickCounter & 7) === 0) {
    powerFadeBright += powerFadeDelta;
    if (powerFadeBright >= 7) { powerFadeBright = 7; powerFadeDelta = -1; }
    else if (powerFadeBright <= 1) { powerFadeBright = 1; powerFadeDelta = 1; }
  }
}
function drawPowerSwitchFloor() {
  // The ROM swaps the electric tiles' palette slot to a pulsing grey that peaks at white
  // (PowerSwitchLogic). We can't swap a palette index over the room PNG, so 'lighten'-blend the
  // live tiles toward rgb(BRIGHT) — at peak BRIGHT=7 they go white; at the dim end they're left
  // alone. (Deliberate divergence: tint vs palette swap — matches the visible grey->white pulse.)
  if (!powerSwitchOn) return;
  const pair = ELECTRIC_TILES[currentRoom];
  const c = assets.collision;
  if (!pair || !c || !c.tiles) return;
  const v = Math.round((powerFadeBright / 7) * 255);   // BRIGHT 1..7 -> 0..255 grey
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  for (let ty = 0; ty < c.height; ty++)
    for (let tx = 0; tx < c.width; tx++) {
      const t = c.tiles[ty * c.width + tx];
      if (t === pair[0] || t === pair[1]) ctx.fillRect(tx * 8, ty * 8, 8, 8);
    }
  ctx.globalCompositeOperation = prevOp;
}

// ---- The roof: bridges, the air flow, the parachute, the jetpack event --------------------
// Bridges (BridgeLogic, logic/actors/bridge.asm; rooms 45/46): EIGHT walkway segments
// sweep horizontally over the chasm, each at its own speed (BridgesSpeeds 0x40..0x100 in
// 8.8 = 0.25..1px/iteration), ALL reversing every 0x20 iterations (the controller).
// Touching a segment (touch shape 7 — GetShapeInfo's inc/dec nets ImpactAreasInfo ROW 7:
// offY=0 distY=8, offX=0 distX=16) sets the isOnBridge flag — NOTHING ELSE: the ROM does
// not carry Snake, he has to walk. The 16px-spaced segments' +-8 bands tile the column
// seamlessly: the ROM's strict <8 never sees the odd boundary rows (its player Y stays
// even at 2px/iteration), so our sub-pixel Y uses <=8 — the same effective coverage.
// Standing on the chasm tiles (tile number 1) with no flag is THE FALL (ChkOnBridge).
const BRIDGE_SPEEDS = [0x40, 0x80, 0xC0, 0x100, 0x100, 0xC0, 0x80, 0x40];
let roofBridges = [];
let bridgeSheet = null;   // (the parachute pose now lives in snake.png as 'parachute-fall')
function buildBridges(n) {
  const a = actorsData && actorsData[n];
  // InitBridge: MOVEMENT_CNT starts at 0x10 (then 0x20 per flip) — the segments
  // oscillate +-16px*speed AROUND their data positions, staying aligned with the
  // fixed ends. (A 0x20 start swings them 0..+32 to the right of the ROM positions.)
  roofBridges = ((a && a.bridges) || []).map((b, i) => ({
    x: b.x, y: b.y, vx: (BRIDGE_SPEEDS[i % 8] / 256), cnt: 0x10,
  }));
}
function bridgeTick() {
  if ((tickCounter & 1) !== 0 || !roofBridges.length) return;
  let flip = false;
  const ctl = roofBridges[0];
  if (--ctl.cnt <= 0) { ctl.cnt = 0x20; flip = true; }       // BridgeCtrlLogic
  let onBridge = false;
  for (const b of roofBridges) {
    if (flip) b.vx = -b.vx;
    b.x += b.vx;
    // ChkArea with shape 7 (row 7: 0,8,0,16): |bridgeY - playerY| <= 8 (see header
    // note on the boundary closure) and |bridgeX - playerX| < 16.
    if (Math.abs(b.y - snake.y) <= 8 && Math.abs(b.x - snake.x) < 16) onBridge = true;
  }
  if (onBridge) return;                                      // SetOnBridge: flag only, no fall
  // ChkOnBridge -> GetTilePlayer: the tile at (X-4, Y) and the NEXT tile column —
  // both must be the chasm tile (1) to fall; the fixed bridge ends use other tiles.
  const c = assets.collision;
  if (!c || !c.tiles) return;
  const ti = ((snake.y >> 3) * c.width) + ((snake.x - 4) >> 3);
  if (c.tiles[ti] === 1 && c.tiles[ti + 1] === 1)
    startFall(currentRoom === 45 ? 1 : 2);
}
function drawBridges() {
  if (!bridgeSheet) return;
  // Sprite 0x35 (actorspriteattr.asm:360): TWO 16x16 singles at offsets (-16,-8) and
  // (0,-8) — a 32x16 walkway centered on the actor X (matching touch shape 7 |dx|<16).
  for (const b of roofBridges) {
    ctx.drawImage(bridgeSheet, 0, 0, 16, 16, Math.round(b.x - 16), Math.round(b.y - 8), 16, 16);
    ctx.drawImage(bridgeSheet, 16, 0, 16, 16, Math.round(b.x), Math.round(b.y - 8), 16, 16);
  }
}

// The fall (ChkParachute, logic/nextroom.asm:204-254): jumping off the roof (room 117's
// open edge door 0x91) or missing a bridge (45/46). WITH the PARACHUTE selected: two
// screens of the brick wall (room 204, HeightParachuteCnt=2), drifting down in parachute
// control; the landing rooms are 5 (from 45), 6 (from 46), 10 (from 117). WITHOUT it:
// FreeFall — Snake lands in the yard dead (all life).
const PARACHUTE_LANDING = { 1: 5, 2: 6, 3: 10 };
// SetLandingPos2 (nextroom.asm:540-573): each yard has a FIXED landing spot —
// room 5 (lorries) (0x68,0x38), room 6 (dogs left) (0x80,0xA8), room 10 (dogs
// right) (0xA0,0x80) — used by both the parachute landing and the dead free-faller.
const LANDING_XY = { 5: [0x68, 0x38], 6: [0x80, 0xA8], 10: [0xA0, 0x80] };
let parachuteCnt = 0, parachuteJumpId = 0;
function startFall(jumpId) {
  parachuteJumpId = jumpId;
  if (selectedItem === SELECTED_PARACHUTE) {
    parachuteCnt = 2;                              // HeightParachuteCnt
    stopAlarm();                                   // StopAlert on the jump
    setRoom(204);
    snake.x = 0x80; snake.y = 0x30;                // SetParachuteMode: centered, top
    snake.controlMod = CONTROL_PARACHUTE;
    snake.anim = ANIM_PARACHUTE;
    snake.state = 'idle';
  } else {                                         // FreeFall: lands dead in the yard
    const room = PARACHUTE_LANDING[jumpId] || 10;
    setRoom(room);
    [snake.x, snake.y] = LANDING_XY[room];         // SetLandingPos2
    snake.invulnTimer = 0;
    damage(0xFF);
  }
}
// ParachuteLogic (Banks0123.asm:8564): fall 1px/iteration, swaying ±1 with TickCounter
// bit 4; exiting the bottom of room 204 either repeats the wall or lands (SetLandingRoom).
function parachuteControl() {
  snake.y += 0.5;
  snake.x += (tickCounter & 16) ? -0.5 : 0.5;
  snake.state = 'idle';
  if (snake.y >= 0xB8) {                           // NextParachuteRoom
    if (--parachuteCnt > 0) { setRoom(204); snake.y = 0x30; return; }  // SetParachuteStartY (X keeps the drift)
    const room = PARACHUTE_LANDING[parachuteJumpId] || 10;
    setRoom(room);
    [snake.x, snake.y] = LANDING_XY[room];         // SetLandingXY -> SetLandingPos2
    snake.dir = 'up';                              // PlayerDirection = up on touchdown
    snake.controlMod = CONTROL_NORMAL;
    snake.anim = ANIM_NORMAL;
  }
}

// The roof air flow (ChkRoofAirFlow, Banks0123.asm:9284-9316): room 53's band
// (Y 0x50-0x5F, X 0x48-0xBF) blows Snake back UP (3px/iteration until Y < 0x30) unless
// the BOMB BLAST SUIT is selected — the gate the user remembered.
function chkRoofAirFlow() {
  if (currentRoom !== 53 || selectedItem === SELECTED_BOMB_SUIT) return;
  if (snake.y < 0x50 || snake.y >= 0x60) return;
  if (snake.x < 0x48 || snake.x >= 0xC0) return;
  snake.controlMod = CONTROL_AIRFLOW;
  playBuf(assets.airflowBuf);                      // SFX "Pushed back by roof air"
}
function airFlowControl() {
  snake.y -= 1.5;                                  // 3px per iteration, per-tick halved
  snake.state = 'idle';
  if (snake.y < 0x30) snake.controlMod = CONTROL_NORMAL;   // ExitAirFlow
}

// ---- Jetpack guards (logic/actors/jetpack.asm) --------------------------------------------
// Room 40's ID_JETPACK_SWITCH: a flying guard descends to the wall switch (Y 0x86), flips
// it with the CLICK (creating the POWER SWITCH actor at (0x44,0x70) — the floor goes
// LIVE), then takes off; rooms 44/48's ID_JETPACK_TAKEOFF guards launch when seen. A
// flying jetpack hovers in a figure-eight (acceleration toward alternating Y 0x60/0x70 /
// X 0x78/0x88 targets) and snipes at Snake on a random 0x1E+ cadence. Life 2.
let jetpacks = [];
let jetguardSheet = null, shadowSheet = null;
function buildJetpacks(n) {
  const a = actorsData && actorsData[n];
  jetpacks = ((a && a.jetpacks) || []).map((j) => ({
    x: j.x, y: j.y, mode: j.mode, wait: 0x20, vx: 0, vy: 0, anim: 0, life: 2,
    shotShape: GUARD_SHAPE,
  }));
  if (a && a.powerswitch && a.powerswitch.jetpack)
    jetpacks.push({ x: a.powerswitch.x, y: a.powerswitch.y, mode: 'descend',
                    wait: 0x20, vx: 0, vy: 0, anim: 0, life: 2, shotShape: GUARD_SHAPE });
}
function jetpackTick() {
  if ((tickCounter & 1) !== 0) return;
  for (let i = jetpacks.length - 1; i >= 0; i--) {
    const j = jetpacks[i];
    if (j.life <= 0) { playBuf(assets.guardDeadBuf); jetpacks.splice(i, 1); continue; }
    j.anim = (j.anim + 1) & 0xff;
    switch (j.mode) {
      case 'descend':                              // JetpackSwitchLogic: down to the switch
        if (!alertMode) raiseAlarm(currentRoom, false, 0x5A);
        j.y += 2;
        if (j.y >= 0x86) {
          playBuf(assets.clickBuf);                // SFX 0x15
          powerSwitch = { x: 0x44, y: 0x70, life: 2, dmgTable: POWER_SWITCH_DMG,
                          shotShape: { offY: 0, distY: 8, offX: 0, distX: 8 } };
          powerSwitchOn = true;                    // the floor goes LIVE
          j.mode = 'takeoff'; j.wait = 0x20;
        }
        break;
      case 'takeoff':                              // JetpacTakeoff: rise, then fly
        j.y -= 1;
        if (--j.wait <= 0) {
          j.mode = 'fly'; j.wait = 0x2D;
          if (!alertMode) raiseAlarm(currentRoom, false, 0x1E);
        }
        break;
      case 'fly': {                                // JetPackMove: the hover oscillation
        const ty = (j.anim & 0x80) ? 0x70 : 0x60, tx = (j.anim & 0x80) ? 0x88 : 0x78;
        j.vy += (j.y < ty ? 0x18 : -0x18) / 256;
        j.vx += (j.x < tx ? 0x30 : -0x30) / 256;
        j.y += j.vy; j.x += j.vx;
        if (--j.wait <= 0) {                       // a random-cadence shot at the player
          j.wait = 0x1E + ((Math.random() * 16) | 0);
          fireGuardBullet(j, false);               // ID_BULLET (0x3D): flies through walls
        }
        break;
      }
    }
    // No body-contact damage: InitJetpack/InitJetpackTakeoff/InitJetpackSwitch all set
    // COLLISION_CFG=2 (player SHOTS only, bit0 clear), so only the jetpack's bullets hurt
    // Snake — touching the guard is harmless. (jetpack.asm:20/84/145; issue #42)
  }
}
function drawJetpacks() {
  // SprJetGuard (loaded over the guard slots in jetpack rooms): two stacked OR-pairs
  // per facing (sheet: tops D,L,U,R = frames 0-3, bottoms = frames 4-7) + the SprShadow
  // ground spot. Airborne attr (JetPackDown, SprOffsets12): body at y-32/y-16 with the
  // shadow cast at y+30. The event guard faces down throughout.
  if (!jetguardSheet) return;
  for (const j of jetpacks) {
    const x = Math.round(j.x - 8);
    if (shadowSheet) ctx.drawImage(shadowSheet, 0, 0, 16, 16, x, Math.round(j.y + 30 - 8), 16, 16);
    ctx.drawImage(jetguardSheet, 0, 0, 16, 16, x, Math.round(j.y - 32), 16, 16);
    ctx.drawImage(jetguardSheet, 4 * 16, 0, 16, 16, x, Math.round(j.y - 16), 16, 16);
  }
}

// ---- Dogs (DogLogic, logic/actors/dog.asm; room 207) --------------------------------------
// Sleep (random 0x20-0x38 iterations, lying) -> listen (random 20-32, sitting) -> a coin
// flip back to sleep or RUN: charge at the player on ONE AXIS at 3px/iteration, re-aiming
// (with a BARK, SFX 3) every random 20-32 iterations, flipping to the other axis on wall
// collisions. Life 2, touch damage 2.
let dogs = [];
let dogSheet = null;
function buildDogs(n) {
  const a = actorsData && actorsData[n];
  dogs = ((a && a.dogs) || []).map((d) => ({
    x: d.x, y: d.y, vx: 0, vy: 0, anim: 0, life: 2, shotShape: GUARD_SHAPE,
    basement: !!d.basement,
    // InitDogBasement: a placed dog lies asleep (status 0, Timer 0x40); a SPAWNED dog (ID_SPAWN_DOG)
    // enters already running (status 1). A surface dog (room 207) uses the sleep/listen/charge DogLogic.
    status: d.basement ? (d.spawn ? 1 : 0) : 0,
    wait: d.basement ? 0x40 : 0x20 + (((Math.random() * 4) | 0) * 8),
    dir: d.basement ? (snake && snake.y < d.y ? 1 : 2) : 2,
  }));
}
const DOG_SPEEDS = { 1: [-3, 0], 2: [3, 0], 3: [0, -3], 4: [0, 3] };  // (dy, dx)
function dogAim(d) {
  // GetDirToPlayer with the axis flip on collision (ChkDogCollision probes 8px ahead).
  const dx = snake.x - d.x, dy = snake.y - d.y;
  let dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 3 : 4) : (dy < 0 ? 1 : 2);
  const probe = (dd) => {
    const [py, px] = { 1: [-8, 0], 2: [8, 0], 3: [0, -8], 4: [0, 8] }[dd];
    const c = assets.collision;
    return !!(c && c.solid[(((d.y + py) >> 3) * c.width) + ((d.x + px) >> 3)]);
  };
  if (probe(dir)) dir = dir <= 2 ? (dx < 0 ? 3 : 4) : (dy < 0 ? 1 : 2);   // the other axis
  d.dir = dir;
  const [vy, vx] = DOG_SPEEDS[dir]; d.vy = vy; d.vx = vx;
  d.wait = (5 + ((Math.random() * 4) | 0)) * 4;    // 20-32 iterations
}
// DogBasementLogic (dogbasement.asm): a free-roaming dog — sleep (0) -> run (1) -> chase (2). It
// runs in a cardinal direction at 3px, turns when an 8px-ahead probe hits a wall, and when it gets
// near the player it chases, re-aiming on its current axis with a bark every 0x18 iterations.
const DOG_DELTA = { 1: [0, -3], 2: [0, 3], 3: [-3, 0], 4: [3, 0] };       // [vx,vy] at speed 3 (0x300)
const DOG_PROBE = { 1: [0, -8], 2: [0, 8], 3: [-8, 0], 4: [8, 0] };       // 8px-ahead (DogSpeedDat)
const DOG_OPP = { 1: 2, 2: 1, 3: 4, 4: 3 };
function dogSolid(d, dir) {
  const c = assets.collision; if (!c || !c.solid) return false;
  const [px, py] = DOG_PROBE[dir];
  return !!c.solid[(((d.y + py) >> 3) * c.width) + ((d.x + px) >> 3)];
}
function dogNearPlayer(d) {                                                 // ChkDogNearPlayer
  if (d.dir === 3 || d.dir === 4) {                                         // moving horizontally (ChkDogNearPlayer3)
    return Math.abs(snake.y - d.y) < 0x30 && d.x > snake.x - 0x20 && d.x <= snake.x + 0x20;
  }
  return Math.abs(snake.x - d.x) < 0x30 && d.y > snake.y - 0x18 && d.y <= snake.y + 0x18;     // moving vertically (ChkDogNearPlayer2)
}
function dogTurn(d) {                                                       // ChkDogChgDir: turn at a wall
  const horiz = d.dir === 3 || d.dir === 4;
  const toward = horiz ? (snake.y < d.y ? 1 : 2) : (snake.x < d.x ? 3 : 4);
  for (const nd of [toward, DOG_OPP[toward], DOG_OPP[d.dir]]) if (!dogSolid(d, nd)) { d.dir = nd; return; }
  d.dir = DOG_OPP[d.dir];
}
function dogStep(d) {
  if (dogSolid(d, d.dir)) { dogTurn(d); return; }
  const [vx, vy] = DOG_DELTA[d.dir]; d.x += vx; d.y += vy; d.vx = vx; d.vy = vy;
}
function basementDogMove(d) {
  switch (d.status) {
    case 0:                                              // DogBaseSleep
      if (--d.wait > 0) return;
      d.dir = snake.y < d.y ? 1 : 2;                      // SetVertDogSpeed: wake toward the player
      d.status = 1;
      return;
    case 1:                                              // DogBaseRun: roam until near the player
      if (dogNearPlayer(d)) { d.status = 2; d.wait = 0x18; return; }
      dogStep(d);
      return;
    case 2:                                              // DogBaseChase
      dogStep(d);
      if (--d.wait <= 0) {
        playBuf(assets.barkBuf);                          // SFX 3
        d.wait = 0x18;
        d.dir = (d.dir === 3 || d.dir === 4) ? (snake.x < d.x ? 3 : 4) : (snake.y < d.y ? 1 : 2);
      }
      return;
  }
}
function dogTick() {
  if ((tickCounter & 1) !== 0) return;
  for (let i = dogs.length - 1; i >= 0; i--) {
    const d = dogs[i];
    if (d.life <= 0) { playBuf(assets.guardDeadBuf); dogs.splice(i, 1); continue; }
    d.anim = (d.anim + 1) & 0xff;
    if (d.basement) {
      basementDogMove(d);
      if (Math.abs(snake.y - d.y) < 8 && Math.abs(snake.x - d.x) < 12 && snake.invulnTimer === 0) {
        damage(2);
        if (!alertMode) raiseAlarm(currentRoom);
      }
      continue;
    }
    switch (d.status) {
      case 0:                                      // DogSleep
        if (--d.wait <= 0) { d.status = 1; d.wait = (5 + ((Math.random() * 4) | 0)) * 4; }
        break;
      case 1:                                      // DogListen: a coin flip
        if (--d.wait <= 0) {
          if (Math.random() < 0.5) { d.status = 0; d.wait = 0x20 + (((Math.random() * 4) | 0) * 8); }
          else { d.status = 2; dogAim(d); }
        }
        break;
      case 2: {                                    // DogMove: charge, re-aim with the bark
        const [py, px] = { 1: [-8, 0], 2: [8, 0], 3: [0, -8], 4: [0, 8] }[d.dir];
        const c = assets.collision;
        const hit = !!(c && c.solid[(((d.y + py) >> 3) * c.width) + ((d.x + px) >> 3)]);
        if (!hit && --d.wait > 0) { d.x += d.vx; d.y += d.vy; break; }
        if (!hit) playBuf(assets.barkBuf);         // SFX 3 on the timed re-aim
        dogAim(d);
        break;
      }
    }
    if (Math.abs(snake.y - d.y) < 8 && Math.abs(snake.x - d.x) < 12 && snake.invulnTimer === 0) {
      damage(2);                                   // ActorTouchDamage[ID_DOG-1] = 2
      if (!alertMode) raiseAlarm(currentRoom);     // a biting dog wakes the base
    }
  }
}
// dog.png pair-frames (pattern base 0x60): down1=0,1 down2=2,3 left1=4,5 left2=6,7
// up1=8,9 up2=10,11 right1=12,13 right2=14,15 lying=16 listening=17. Up/down frames are
// two pairs STACKED (16x32); left/right side-by-side (32x16).
const DOG_RUN_BASE = { 2: 0, 3: 4, 1: 8, 4: 12 };
function drawDogs() {
  if (!dogSheet) return;
  for (const d of dogs) {
    // surface dog: status 0 lying / 1 listening / 2 running. basement dog: 0 lying, 1/2 running.
    const lying = d.status === 0, listening = !d.basement && d.status === 1;
    if (lying || listening) {
      const f = lying ? 16 : 17;
      ctx.drawImage(dogSheet, f * 16, 0, 16, 16, Math.round(d.x - 8), Math.round(d.y - 8), 16, 16);
      continue;
    }
    const base = DOG_RUN_BASE[d.dir] + ((d.anim & 4) ? 2 : 0);
    if (d.dir === 1 || d.dir === 2) {              // tall frames: SprOffsets15 (-16,-8)/(0,-8)
      ctx.drawImage(dogSheet, base * 16, 0, 16, 16, Math.round(d.x - 8), Math.round(d.y - 16), 16, 16);
      ctx.drawImage(dogSheet, (base + 1) * 16, 0, 16, 16, Math.round(d.x - 8), Math.round(d.y), 16, 16);
    } else {                                       // long frames: SprOffsets16 (-8,-16)/(-8,0)
      ctx.drawImage(dogSheet, base * 16, 0, 16, 16, Math.round(d.x - 16), Math.round(d.y - 8), 16, 16);
      ctx.drawImage(dogSheet, (base + 1) * 16, 0, 16, 16, Math.round(d.x), Math.round(d.y - 8), 16, 16);
    }
  }
}

// ---- Coward Duck (CowardDuckLogic, logic/actors/cowardduck.asm; room 193) -----------------
// Jennifer's brother's jailer: gated on CARD8 (he reappears until it's taken). Intro text
// 139 once + boss music; then the loop — sidestep toward the player 8 iterations at 2px,
// stop and THROW A BOOMERANG (elliptical flight via the sine table, clockwise by side,
// random short range, returns and vanishes), wait 5, return toward the room centre, and
// again. Life 0x14, touch 8; his death drops CARD8 at (0x38, 0x70) (DismissActor4).
let duck = null, duckSpeechDone = false;
let boomerangs = [];
let duckSheet = null, boomerangSheet = null;
// Card8Taken (the flag set when CARD8 is collected): the port tracks card ownership in `items`, so
// derive it instead of carrying a separate flag (kept in sync with save/load and the HIRAKEGOMA
// cheat for free). InitCowardDuck reads Card8Taken (cowardduck.asm:307), so the jailer reappears
// until the card is actually picked up — even after the duck is killed and drops it.
function card8Taken() { return items.has(SELECTED_CARD1 + 7); }   // CARD8 = SELECTED_CARD1+7 (0x15)
function buildDuck(n) {
  boomerangs = [];
  const a = actorsData && actorsData[n];
  if (!a || !a.duck || card8Taken()) { duck = null; return; }
  duck = { x: a.duck.x, y: a.duck.y, homeX: a.duck.x, status: 0, timer: 3,
           vx: 0, anim: 0, life: 0x14, shotShape: GUARD_SHAPE };
  startBossMusic();                                // SetBossMusic
}
// Coward Duck body contact: InitCowardDuck leaves COLLISION_CFG=3 (default), so his body deals
// ActorTouchDamage[ID_COWARD_DUCK]=4 on top of the boomerang. Touch shape 8 = (0,8,0,0x0C). (#42)
const DUCK_TOUCH_DMG = actorTouchDmg(ID_COWARD_DUCK);
const DUCK_TOUCH_SHAPE = { offY: 0, distY: 8, offX: 0, distX: 0x0C };
function duckTick() {
  if ((tickCounter & 1) !== 0 || !duck) return;
  const d = duck;
  if (d.life <= 0) {                               // DismissActor4: the CARD8 drop
    playBuf(assets.guardDeadBuf);
    roomItems[0] = { id: 0x1D, x: 0x38, y: 0x70 }; // CARD8 pickup
    playBuf(assets.spawnBuf);
    duck = null;
    stopBossMusic();
    return;
  }
  d.anim = (d.anim + 1) & 0xff;
  if (Math.abs(d.y + DUCK_TOUCH_SHAPE.offY - snake.y) < DUCK_TOUCH_SHAPE.distY &&
      Math.abs(d.x + DUCK_TOUCH_SHAPE.offX - snake.x) < DUCK_TOUCH_SHAPE.distX)
    damage(DUCK_TOUCH_DMG);                        // ChkTouchEnemy: body contact (no armor)
  switch (d.status) {
    case 0:                                        // the intro speech (text 139, once)
      if (--d.timer > 0) return;
      if (!duckSpeechDone) { duckSpeechDone = true; setText(139, 2); }
      d.timer = 0x10; d.status = 1;
      return;
    case 1:                                        // CD_ChoseLR: toward the player
      if (--d.timer > 0) return;
      d.timer = 8; d.vx = snake.x >= d.x ? 2 : -2; d.status = 2;
      return;
    case 2:                                        // CD_MoveAndShot
      d.x += d.vx;
      if (--d.timer > 0) return;
      d.timer = 5; d.vx = 0; d.status = 3;
      boomerangs.push({                            // InitBoomerang
        sx: d.x, sy: d.y - 0x10, x: d.x, y: d.y - 0x10,
        angY: 64, dAngY: -2, angX: 64, dAngX: -4,
        ccw: d.x < 0x80, short: Math.random() < 0.5, counter: d.x < 0x80 ? 2 : 0, anim: 0,
      });
      playBuf(assets.boomerangBuf);                // SFX 6
      return;
    case 3:                                        // CD_ChoseLRCenter
      if (--d.timer > 0) return;
      d.timer = 8; d.vx = d.x >= 0x80 ? -2 : 2; d.status = 4;
      return;
    case 4:                                        // CW_MoveRestart
      d.x += d.vx;
      if (--d.timer > 0) return;
      d.timer = 8; d.vx = 0; d.status = 1;
      return;
  }
}
function boomerangTick() {
  if ((tickCounter & 1) !== 0) return;
  for (let i = boomerangs.length - 1; i >= 0; i--) {
    const b = boomerangs[i];
    b.anim++;
    b.angY += b.dAngY;
    if (b.angY >= 64 || b.angY < 0) {              // BoomInvertYSpeed
      b.dAngY = -b.dAngY;
      if (b.dAngY === -2) { boomerangs.splice(i, 1); continue; }   // returned: dismissed
    }
    b.angX += b.dAngX;
    if (b.angX >= 0x40 || b.angX < 0) { b.dAngX = -b.dAngX; b.counter++; }
    // GetSinCos returns 0-255; the ROM then halves (cos/2 -> depth 127, or /4 short)
    // and quarters for X (cos/4 -> +-63). (The old x127-then-/2 double-scaled to half
    // the real sweep — the boomerang never reached the player.)
    const cosY = Math.cos((Math.max(0, Math.min(63, b.angY)) / 64) * Math.PI / 2) * 255;
    const cosX = Math.cos((Math.max(0, Math.min(63, b.angX)) / 64) * Math.PI / 2) * 255;
    b.y = b.sy + (b.short ? cosY / 4 : cosY / 2);
    b.x = b.sx + ((b.counter >= 2 && b.counter < 4) ? -(cosX / 4) : cosX / 4);
    // The hit (the standard small-shot box, guard-class damage 8).
    if (Math.abs(snake.y - b.y) < 8 && Math.abs(snake.x - b.x) < 12 && snake.invulnTimer === 0)
      damage(8);
  }
}
function drawDuck() {
  if (!duck || !duckSheet) return;
  const fire = duck.status === 3;
  const base = fire ? 2 : 0;
  // Anim2FramesActor (mask 7) alternates the walk pose (CowardDuck1/2) while moving —
  // frame B borrows the fire pose's legs, like the ROM's CowardDuck2 rows.
  const walk2 = !fire && duck.vx !== 0 && (duck.anim & 8);
  const dx = Math.round(duck.x - 8);
  ctx.drawImage(duckSheet, base * 16, 0, 16, 16, dx, Math.round(duck.y - 24), 16, 16);
  ctx.drawImage(duckSheet, (walk2 ? 3 : base + 1) * 16, 0, 16, 16, dx, Math.round(duck.y - 8), 16, 16);
  // The boomerang: SprBoomenrang's 3 spin frames (white, color 0x0E), advancing every
  // 2 iterations (BoomerangLogic's SPIN_CNT).
  for (const b of boomerangs) {
    const f = (b.anim >> 1) % 3;
    if (boomerangSheet)
      ctx.drawImage(boomerangSheet, f * 16, 0, 16, 16, Math.round(b.x - 8), Math.round(b.y - 8), 16, 16);
  }
}

// ---- The mid-bosses: Tank (67), Bulldozer (71), Arnolds (83), Fire Trooper (95) -----------
// Each is a permanent-KO boss with the Mercenary music. Tank (tank.asm): drifts up/down at
// 0.5px/iteration with idle beats; the CANNON fires a shell when Snake stands in its
// column (±4), and the MACHINE GUNS burst 0x2D iterations every 0x1E from alternating
// sides, a bullet every 8 with a cycling 0-4 X-speed fan. Life 0x37; touch = crush (all
// life); shell blast 0x20 damage. Bulldozer (bulldozer.asm): pushes DOWN in accelerating
// phases (0x60/0x80/0xC0/0xE0 per 256) with 0x10 stops, halting at Y 160; life 0x28,
// touch = crush. Arnolds (arnold.asm, x2, gated on CARD7): watch flipping randomly, then
// dash at 3px/iteration when Snake crosses their row (±0x10); life 0x28 each, touch 8;
// the SECOND death drops CARD7 at (0x30,0x30). Fire Trooper (firetropper.asm, gated on
// FireTrooper_KO): intro text 108, stalks horizontally (2px/iteration, X 0x60-0x80) and
// sweeps his EIGHT flames out and back (flame touch 8); life 0x1E, touch 4.
let midBosses = [], ftFlames = [];
let tankSheet = null, dozerSheet = null, arnoldSheet = null, ftSheet = null;
let arnoldLegsSheet = null, flameSheet = null, tankShellSheet = null;
let tankKO = false, dozerKO = false, card7Taken = false, ftKO = false;
let ftSpeechDone = false;
let tankShells = [];
function buildMidBosses(n) {
  midBosses = []; ftFlames = []; tankShells = [];
  // Per-enemy damage columns (idxWeaponPow, data/weapondamage.asm): the TANK (ID 9)
  // dies only to LAND MINES (5), the BULLDOZER (ID 0x12) only to GRENADES (5), the
  // ARNOLDS (ID 0x1A) only to ROCKETS (10); the Fire Trooper takes the defaults.
  const TANK_DMG   = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 5, 7: 0 };
  const DOZER_DMG  = { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0, 6: 0, 7: 0 };
  const ARNOLD_DMG = { 1: 0, 2: 0, 3: 0, 4: 10, 5: 0, 6: 0, 7: 0 };
  if (n === 67 && !tankKO) {
    // ActorsRoom067: (0x90, 0x10) — the sprite hangs y-48..0 ABOVE the actor, so it
    // emerges from the top gate. Shapes: Project/Expl 3 (-0x18, 0x18, 0, 0x18).
    midBosses.push({ kind: 'tank', x: 0x90, y: 0x10, vy: 0.5, life: 0x37, anim: 0,
                     cannon: 0x3C, mgTimer: 0x1E, mgOn: false, mgSide: 1, mgShot: 0,
                     moveTime: 0x9A, idle: 0, dmgTable: TANK_DMG,
                     shotShape: { offY: -0x18, distY: 0x18, offX: 0, distX: 0x18 },
                     explShape: { offY: -0x18, distY: 0x18, offX: 0, distX: 0x18 } });
    startBossMusic();
  } else if (n === 71 && !dozerKO) {
    // ActorsRoom071: (0x70, 0x20), the 48x48 blade block centered on the actor.
    midBosses.push({ kind: 'dozer', x: 0x70, y: 0x20, vy: 0x60 / 256, life: 0x28, anim: 0,
                     phase: 0, timer: 0x30, dmgTable: DOZER_DMG,
                     shotShape: { offY: 0, distY: 0x18, offX: 0, distX: 0x18 } });
    startBossMusic();
  } else if (n === 83 && !card7Taken) {
    // ActorsRoom083: both at x 0x80 — the top row (y 0x2C) and the bottom row (0xB2).
    // Shapes: Project 0 (-0x10, 0x10, 0, 8), Expl 1 (0, 0x14, 0, 0x14).
    const ARNOLD_SHOT = { offY: -0x10, distY: 0x10, offX: 0, distX: 8 };
    const ARNOLD_EXPL = { offY: 0, distY: 0x14, offX: 0, distX: 0x14 };
    midBosses.push({ kind: 'arnold', x: 0x80, y: 0x2C, life: 0x28, anim: 0, status: 0,
                     wait: 8, vx: 0, dir: 'left', dmgTable: ARNOLD_DMG,
                     shotShape: ARNOLD_SHOT, explShape: ARNOLD_EXPL });
    midBosses.push({ kind: 'arnold', x: 0x80, y: 0xB2, life: 0x28, anim: 0, status: 0,
                     wait: 8, vx: 0, dir: 'right', dmgTable: ARNOLD_DMG,
                     shotShape: ARNOLD_SHOT, explShape: ARNOLD_EXPL });
    startBossMusic();
  } else if (n === 95 && !ftKO) {
    // ActorsRoom095: (0x70, 0x20). Shapes: Project 0x12 (+4, 0x10, 0, 8),
    // Expl 0x0F (+0x14, 0x10, 0, 0x10).
    midBosses.push({ kind: 'ft', x: 0x70, y: 0x20, life: 0x1E, anim: 0, status: 0,
                     wait: 2, vx: 0, facing: 'left', jet: 0,
                     shotShape: { offY: 4, distY: 0x10, offX: 0, distX: 8 },
                     explShape: { offY: 0x14, distY: 0x10, offX: 0, distX: 0x10 } });
    startBossMusic();
  }
}
function midBossTick() {
  if ((tickCounter & 1) !== 0) return;
  for (let i = tankShells.length - 1; i >= 0; i--) {        // the tank's cannon shells
    const s = tankShells[i];
    s.y += 6;                                               // InitTankShellBoss/InitTankShell: SpeedY 6
    if (s.timer != null) {                                  // desert air shell (ThankShellLogic)
      s.x += s.vx || 0;                                     // the X drift (AddActorSpeedX)
      if (Math.abs(snake.y - s.y) < 20 && Math.abs(snake.x - s.x) < 20 && snake.invulnTimer === 0)
        damage(0x20);                                       // ActorTouchDamage[ID_TANK_SHELL_AIR-1] = 0x20
      if (--s.timer <= 0 || s.y > 184) {                    // flying time elapsed -> ID_BIG_EXPLOSION
        playBuf(assets.explosionBuf);                       // SFX 0x1A
        tankShells.splice(i, 1);
      }
      continue;
    }
    if (s.y >= snake.y || s.y > 184) {                      // the burst
      if (Math.abs(snake.y - s.y) < 20 && Math.abs(snake.x - s.x) < 20 && snake.invulnTimer === 0)
        damage(0x20);                                       // ActorTouchDamage shell = 0x20
      playBuf(assets.explosionBuf);
      tankShells.splice(i, 1);
    }
  }
  for (let i = midBosses.length - 1; i >= 0; i--) {
    const b = midBosses[i];
    if (b.life <= 0) { midBossKill(b, i); continue; }
    b.anim = (b.anim + 1) & 0xff;
    if (b.kind === 'tank') {
      if (Math.abs(snake.x - b.x) < 5 && b.cannon === 1) {     // cannon column: PlayerX-X+4 < 9 unsigned = ±4 (#102)
        tankShells.push({ x: b.x, y: b.y + 4 });
        playBuf(assets.rocketBuf);                          // shell shot
        b.cannon = 0x1E;
      } else if (b.cannon > 1) b.cannon--;
      if (!b.mgOn) { if (--b.mgTimer <= 0) { b.mgOn = true; b.mgTimer = 0x2D; } }
      else if (--b.mgTimer <= 0) { b.mgOn = false; b.mgTimer = 0x1E; b.mgSide = -b.mgSide; }
      else if ((b.anim & 7) === 0) {                        // the machine-gun fan
        b.mgShot = (b.mgShot + 1) & 7;
        const sp = b.mgShot < 5 ? b.mgShot : 8 - b.mgShot;   // SpeedXUnsigned: 0,1,2,3,4,3,2,1
        // TankShotLogic (tankshot.asm:48-50): SpeedX = SpeedXUnsigned − 2 → a SYMMETRIC −2..+2 fan,
        // IDENTICAL for both guns (the firing side only shifts the spawn X by ±16, NOT the spread).
        // SpeedY 6/iteration (3/tick); the fast fall keeps the cone narrow (the classic safe spots). (#31)
        bullets.push({ x: b.x + 16 * b.mgSide, y: b.y - 0x0E,
                       vx: (sp - 2) / 2, vy: 3, dmg: 8, srcId: ID_TANK_BULLET });
        playShot();
      }
      if (--b.moveTime <= 0) { b.moveTime = 0x32 + ((Math.random() * 2) | 0) * 0x68; b.vy = -b.vy; }
      b.y += b.vy;
      if (b.y < 0x10) { b.y = 0x10; b.vy = 0.5; }
      if (b.y > 0x60) { b.y = 0x60; b.vy = -0.5; }
    } else if (b.kind === 'dozer') {
      if (b.y >= 160) { b.vy = 0; }                         // StopBulldozer at the bottom
      else if (b.phase & 1) {                               // a stop beat
        if (--b.timer <= 0) {
          b.phase++;
          b.timer = 0x30;
          b.vy = [0x60, 0x80, 0xC0, 0xE0][Math.min(3, b.phase >> 1)] / 256;
        }
      } else {
        b.y += b.vy;
        if (--b.timer <= 0) { b.phase++; b.timer = 0x10; b.vy = 0; }
      }
    } else if (b.kind === 'arnold') {
      // ArnoldLogic (arnold.asm): watch -> chase (3px, re-aiming each random wait) ->
      // when Snake leaves the row, WALK BACK to x 0x80 (2px) and REST (watch) -> and
      // ANY weapon hit (even 0 damage — TOUCH_INFO is set before the damage lookup)
      // bounces him +-2 AWAY from the player for weaponId+3 iterations, shots disabled.
      const inRow = Math.abs(snake.y - b.y + 0x10) < 0x21;
      const seePlayer = () => {                             // ArnoldSeePlayer
        b.status = 1; b.wait = 1 + ((Math.random() * 24) | 0);   // SetArnoldRndWait
        b.vx = snake.x < b.x ? -3 : 3;                      // SetChaseSpeed (DogSpeeds)
        b.dir = b.vx < 0 ? 'left' : 'right';
      };
      if (b.hitBy && b.status !== 3) {                      // ArnoldBounceBack
        b.pushCnt = b.hitBy + 3;
        b.oldStatus = b.status; b.oldVx = b.vx;
        b.vx = snake.x < b.x ? 2 : -2;                      // away from the player
        b.status = 3; b.shotsOff = true;
      }
      b.hitBy = 0;
      switch (b.status) {
        case 0:                                             // ArnoldWatch
          if (inRow) seePlayer();
          else if (--b.wait <= 0) {                         // ArnoldTurn: random facing
            b.wait = 1 + ((Math.random() * 24) | 0);
            b.dir = Math.random() < 0.5 ? 'left' : 'right';
          }
          break;
        case 1:                                             // ArnoldTowardsPlayer
          if (!inRow) {                                     // ArnoldStopChase
            if (b.x === 0x80) { b.status = 0; b.vx = 0; b.wait = 1 + ((Math.random() * 24) | 0); }
            // SetWalkSpeed -> DirectionSpeeds: the walk back is 1px/iteration
            else { b.status = 2; b.vx = b.x < 0x80 ? 1 : -1; b.dir = b.vx < 0 ? 'left' : 'right'; }
            break;
          }
          b.x += b.vx;
          if (b.x < 0x18 || b.x > 0xE8) { b.x = Math.max(0x18, Math.min(0xE8, b.x)); seePlayer(); }
          else if (--b.wait <= 0) seePlayer();              // re-aim
          break;
        case 2:                                             // ArnoldReturn
          if (inRow) { seePlayer(); break; }
          b.x += b.vx;
          if ((b.vx > 0 && b.x >= 0x80) || (b.vx < 0 && b.x <= 0x80)) {   // recenter + rest
            b.x = 0x80; b.vx = 0; b.status = 0;
            b.wait = 1 + ((Math.random() * 24) | 0);
          }
          break;
        case 3:                                             // ArnoldBounceBack3
          b.x += b.vx;
          if (b.x < 0x18 || b.x > 0xE8 || --b.pushCnt <= 0) {
            b.x = Math.max(0x18, Math.min(0xE8, b.x));
            b.vx = b.pushCnt > 0 ? 0 : b.oldVx;             // wall: stop; else resume
            b.status = b.oldStatus; b.shotsOff = false;
          }
          break;
      }
    } else if (b.kind === 'ft') {
      // FireTrooperLoogic's 6-status machine (firetropper.asm). The flames are a RAY of
      // 8 actors at cumulative (gapX, gapY) steps from the plant point, extended
      // straight down (FT_ThrowFlames) and then swept like a pendulum (FT_MoveFlames:
      // ANGLE 0x3F..0x18 with DELTA +-4; step = sin/16 down, +-cos/16 across, the X
      // sign cycling with FLAME_MOV_ID), retracted one per iteration, then he walks
      // toward the player's side again — CLAMPED to the X band 0x60..0x80.
      switch (b.status) {
        case 0:                                             // the intro (text 108)
          if (--b.wait <= 0) {
            if (!ftSpeechDone) { ftSpeechDone = true; setText(108, 2); }
            b.status = 1;
          }
          break;
        case 1:                                             // FT_GetFlames + MoveToPlayer
          b.vx = snake.x < b.x ? -2 : 2;
          b.facing = b.vx < 0 ? 'left' : 'right';
          b.status = 2;
          break;
        case 2: {                                           // FT_Walk: clamp to 0x60..0x80
          b.x += b.vx;
          const plant = b.x >= 0x80 ? 0x80 : (b.x < 0x60 ? 0x60 : null);
          if (plant != null) {
            b.x = plant; b.startX = plant; b.startY = b.y; b.vx = 0;
            b.facing = 'down'; b.jet = 0x10; b.status = 3;
            b.angle = 0x3F; b.delta = 4; b.movId = 2; b.gx = 0; b.gy = 0;
            ftFlames = Array.from({ length: 8 }, () => ({ x: plant, y: b.y + 0x0B, anim: 0 }));
          }
          break;
        }
        case 3: {                                           // FT_ThrowFlames: extend down
          if (--b.jet <= 0) { b.jet = 0x50; b.status = 4; break; }
          const gap = 0x10 - b.jet;
          ftFlames.forEach((f, k) => { f.y = b.startY + (k + 1) * gap; f.x = b.startX; });
          break;
        }
        case 4: {                                           // FT_MoveFlames: the pendulum
          if (--b.jet <= 0) { b.jet = 9; b.status = 5; break; }
          b.angle += b.delta;
          if (b.angle < 0x18) { b.angle = 0x18; b.delta = -b.delta; b.movId = (b.movId + 1) & 3; }
          else if (b.angle >= 0x3F) { b.angle = 0x3F; b.delta = -b.delta; b.movId = (b.movId + 1) & 3; }
          const sin = SIN_TABLE[b.angle], cos = SIN_TABLE[0x3F - b.angle];
          const sx = (b.movId === 1 || b.movId === 2) ? -1 : 1;
          const stepY = sin >> 4, stepX = sx * (cos >> 4);
          b.facing = b.angle >= 0x2C ? 'down' : (sx < 0 ? 'left' : 'right');
          ftFlames.forEach((f, k) => {
            f.y = b.startY + (k + 1) * stepY;
            f.x = b.startX + (k + 1) * stepX;
          });
          break;
        }
        case 5:                                             // FT_BringInFlames + restart
          if (--b.jet <= 0) { ftFlames = []; b.status = 1; break; }
          ftFlames.length = Math.max(0, ftFlames.length - 1);
          break;
      }
      for (const f of ftFlames) {                           // ActorTouchDamage[ID_FLAME] = 8
        f.anim = (f.anim + 1) & 0xff;
        if (Math.abs(snake.y - f.y) < 8 && Math.abs(snake.x - f.x) < 8 && snake.invulnTimer === 0)
          damage(8);
      }
    }
    // The crush/contact: tank+dozer = all life, arnold 8, ft 4.
    const dmgMap = { tank: 0xFF, dozer: 0xFF, arnold: 8, ft: 4 };
    if (Math.abs(snake.y - b.y) < 12 && Math.abs(snake.x - b.x) < 16 && snake.invulnTimer === 0)
      damage(dmgMap[b.kind]);
  }
}
function midBossKill(b, i) {
  // The big bosses (tank/dozer) die through BossDefeatedLogic's 0x10-iteration
  // 3-phase explosion; the Arnolds/Fire Trooper through the small ExplosionAnim.
  if (b.dying == null) {
    b.dying = 0;
    playBuf((b.kind === 'tank' || b.kind === 'dozer') ? assets.explosionBuf : assets.guardDeadBuf);
    return;
  }
  if (++b.dying < 0x10) return;
  midBosses.splice(i, 1);
  if (b.kind === 'tank') tankKO = true;                     // BossTank_KO
  if (b.kind === 'dozer') dozerKO = true;                   // SetBulldozerKO
  if (b.kind === 'ft') { ftKO = true; ftFlames = []; }      // FireTrooper_KO (the flames die too)
  if (b.kind === 'arnold' && !midBosses.some((x) => x.kind === 'arnold')) {
    roomItems[0] = { id: 0x1C, x: 0x30, y: 0x30 };          // CARD7 (DismissActor3)
    playBuf(assets.spawnBuf);
  }
  if (!midBosses.length) stopBossMusic();                   // the area music returns
}

// ---- Desert tank-shell barrage (shellspawner.asm; rooms 65/66) -----------------------------
// While the desert tank (room 67) lives, shells rain from the sky (InitSpawnTankShell dismisses
// once BossTank_KO). SpawnTankShell cycles: SFX 0x0B, then drops an ID_TANK_SHELL_AIR at a
// (every-4th aimed at Snake, else random) X — falling SpeedY 6 with an X drift, exploding after a
// 0x0A-0x19 flying timer for 0x20 contact damage. Reuses the tankShells pool (timer/vx = air shell).
let shellSpawner = null;
function buildShellSpawner(n) {
  shellSpawner = (n === 65 || n === 66) && !tankKO ? { status: 0, wait: 0x14, anim: 0 } : null;
}
function shellSpawnerTick() {
  if (!shellSpawner || (tickCounter & 1) !== 0) return;     // ROM iteration boundary
  const s = shellSpawner;
  s.anim = (s.anim + 1) & 0xff;
  if (--s.wait > 0) return;
  if ((s.status & 1) === 0) {                                // status 0: the shot SFX, then arm
    s.status = 1; s.wait = 0x14;
    playBuf(assets.rocketBuf);                               // SFX 0x0B (shell shot)
    return;
  }
  s.status = 0; s.wait = 0x32;                               // status 1: drop a shell (SpawnTankShell2)
  const x = (s.anim & 3) === 0 ? snake.x : (0x20 + ((Math.random() * 0xC0) | 0));   // every 4th aimed
  tankShells.push({ x, y: 0, vx: Math.random() < 0.5 ? -0.5 : 0.5, timer: 0x0A + ((Math.random() * 16) | 0) });
}

function drawMidBosses() {
  for (const s of tankShells) {       // TankShell (attr :457): the SprCannonShell pair
    if (tankShellSheet)
      ctx.drawImage(tankShellSheet, 0, 0, 16, 16, Math.round(s.x - 8), Math.round(s.y - 8), 16, 16);
  }
  for (const b of midBosses) {
    if (b.dying != null) {       // BossDefeatedLogic / ExplosionAnim replace the sprites
      if (b.kind === 'tank' || b.kind === 'dozer') drawBossExplosion(b.x, b.y + 16, b.dying);
      else if (explosionSSheet) {
        const f = b.dying < 5 ? 0 : b.dying < 10 ? 1 : 2;   // SmallExplosion1-3
        ctx.drawImage(explosionSSheet, f * 16, 0, 16, 16,
                      Math.round(b.x - 8), Math.round(b.y - 8), 16, 16);
      }
      continue;
    }
    const blink = (b.anim & 4) ? 1 : 0;
    if (b.kind === 'tank' && tankSheet) {
      // Tank1/Tank2 (actorspriteattr.asm:325-328) on SprOffsets6: a 3x3 pair block at
      // offY -48/-32/-16, offX -24/-8/+8; the bottom (tread) row animates 6,7,8 <-> 9,7,10.
      const row2 = blink ? [9, 7, 10] : [6, 7, 8];
      const frames = [0, 1, 2, 3, 4, 5, ...row2];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
        ctx.drawImage(tankSheet, frames[r * 3 + c] * 16, 0, 16, 16,
                      Math.round(b.x - 24 + c * 16), Math.round(b.y - 48 + r * 16), 16, 16);
    } else if (b.kind === 'dozer' && dozerSheet) {
      // Bulldozer (attr raw rows): a 3x3 pair block CENTERED on the actor (+-24).
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
        ctx.drawImage(dozerSheet, (r * 3 + c) * 16, 0, 16, 16,
                      Math.round(b.x - 24 + c * 16), Math.round(b.y - 24 + r * 16), 16, 16);
    } else if (b.kind === 'arnold' && arnoldSheet) {
      // ArnoldLeft/Right 1/2 on SprOffsets9: a 2x2 pair block spanning y-32..0, x-16..16;
      // the torso pairs use the blue colors, the leg pairs the olive ones (ActorSprColors10
      // splits the rows — hence the two sheets). Frame map per facing/step (base 0x38).
      const A = b.dir === 'left'
        ? (blink ? { tl: 14, tr: 15, bl: 12, br: 13 } : { tl: 8, tr: 9, bl: 10, br: 11 })
        : (blink ? { tl: 6, tr: 7, bl: 4, br: 5 } : { tl: 0, tr: 1, bl: 2, br: 3 });
      ctx.drawImage(arnoldSheet, A.tl * 16, 0, 16, 16, Math.round(b.x - 16), Math.round(b.y - 32), 16, 16);
      ctx.drawImage(arnoldSheet, A.tr * 16, 0, 16, 16, Math.round(b.x), Math.round(b.y - 32), 16, 16);
      const legs = arnoldLegsSheet || arnoldSheet;
      ctx.drawImage(legs, A.bl * 16, 0, 16, 16, Math.round(b.x - 16), Math.round(b.y - 16), 16, 16);
      ctx.drawImage(legs, A.br * 16, 0, 16, 16, Math.round(b.x), Math.round(b.y - 16), 16, 16);
    } else if (b.kind === 'ft' && ftSheet) {
      // FireTrooperL/D/R (SprOffsets3/4): the head pair at y-11 (walk2 bobs to -10) and
      // the legs at y+4. Heads: L=0, D=1, R=2; legs: walk 3<->5, firing 4.
      const head = b.facing === 'down' ? 1 : (b.facing === 'left' ? 0 : 2);
      const firing = b.status >= 3 && b.status <= 4;
      const legsF = firing ? 4 : (blink ? 5 : 3);
      const bob = !firing && blink ? -10 : -11;
      ctx.drawImage(ftSheet, head * 16, 0, 16, 16, Math.round(b.x - 8), Math.round(b.y + bob), 16, 16);
      ctx.drawImage(ftSheet, legsF * 16, 0, 16, 16, Math.round(b.x - 8), Math.round(b.y + 4), 16, 16);
    }
  }
  for (const f of ftFlames) {       // Fire1/Fire2: red + CC yellow pairs, white core
    if (flameSheet)
      ctx.drawImage(flameSheet, ((f.anim & 8) ? 1 : 0) * 16, 0, 16, 16,
                    Math.round(f.x - 8), Math.round(f.y - 8), 16, 16);
  }
}

// ---- Hind D (HindDLogic, logic/actors/hindd.asm; room 50) ---------------------------------
// The roof gunship: a STATIONARY body (the HindDTileMap tile block at (0x40,0), exported
// as hindd.png; the wreck HindDTileMap2 replaces it on death) with the 3-frame rotor
// sprites (SprAirScrew, HindDProp1-3; its SFX every 4 iterations). It fires 5-bullet
// AIMED bursts — a bullet every 5 iterations, spawned AT the actor position (128,0x58)
// — pausing 0x11 between bursts. Life 0x64; permanent BossHindD_KO latch. The actor has
// NO touch shape (ActorsShapeTouch[0x25] = 0xFF) — walking through it is original.
let hindD = null;
let hindDImg = null, hindDWreckImg = null, airscrewSheet = null;
let hindDKO = false;
function buildHindD(n) {
  hindD = (n === 50 && !hindDKO)
    ? { x: 0x80, y: 0x58, life: 0x64, anim: 0, shootDelay: 5, shots: 5, bursting: true,
        // bullets: ActorShapeProject 4 (ImpactAreasInfo row 4: -0x20,0x20,0,0x10);
        // explosives: ActorShapeExpl 5 (row 5: -0x20,0x10,0,0x10) — the grenade must
        // burst right under the cockpit block.
        shotShape: { offY: -0x20, distY: 0x20, offX: 0, distX: 0x10 },
        explShape: { offY: -0x20, distY: 0x10, offX: 0, distX: 0x10 },
        // weapondamage.asm, the ID 0x26 column: ONLY the grenade launcher hurts it
        // (5 per hit -> 20 grenades for the 0x64 life); everything else is 0.
        dmgTable: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0, 6: 0, 7: 0 } }
    : null;
  if (hindD) startBossMusic();
}
function hindDTick() {
  if ((tickCounter & 1) !== 0 || !hindD) return;
  const h = hindD;
  if (h.life <= 0) {                               // BossDefeatedLogic -> RemoveHindD
    // The big-boss death (BossDefeatedLogic, Banks0123.asm:13375): 0x10 iterations of
    // the 3-phase explosion (sprites 0x7F/0x80/0x81) before the wreck replaces it.
    if (h.dying == null) { h.dying = 0; playBuf(assets.explosionBuf); stopBossMusic(); }
    else if (++h.dying >= 0x10) { hindDKO = true; hindD = null; }
    return;
  }
  h.anim = (h.anim + 1) & 0xff;
  if ((h.anim & 3) === 0) playBuf(assets.propellerBuf);     // SFX 2 every 4 iterations
  if (h.bursting) {
    if (--h.shootDelay <= 0) {
      h.shootDelay = 5;
      if (--h.shots <= 0) { h.bursting = false; h.shootDelay = 0x11; return; }
      // HindDLogic spawns ID_BULLET at the ACTOR's own XY (hindd.asm:72-75);
      // fireGuardBullet aims from (x, y-16), so compensate to originate at (h.x, h.y).
      fireGuardBullet({ x: h.x, y: h.y + 16 }, false);   // 0x3D: through walls
    }
  } else if (--h.shootDelay <= 0) {
    h.bursting = true; h.shootDelay = 5; h.shots = 5;
  }
}
// HindDProp1/2/3 (actorspriteattr.asm:470-495): per frame, (offY, offX, sprite-index)
// rows relative to the actor at (0x80, 0x58). Frame 0 = both outer rotors (2x2 each);
// frames 1/2 = the single centered blur sweeping left then right. SprAirScrew singles,
// color 0x0E white (ActorSprColors12).
const HINDD_PROPS = [
  [[-80, -64, 0], [-80, -48, 1], [-64, -64, 2], [-64, -48, 3],
   [-80, 32, 12], [-80, 48, 13], [-64, 32, 14], [-64, 48, 15]],
  [[-48, -48, 4], [-48, -32, 5], [-32, -48, 6], [-32, -32, 7]],
  [[-48, 16, 8], [-48, 32, 9], [-32, 16, 10], [-32, 32, 11]],
];
function drawHindD() {
  if (currentRoom !== 50) return;
  const img = hindDKO ? hindDWreckImg : hindDImg;
  if (img) ctx.drawImage(img, 0x40, 0);
  if (!hindD) return;
  if (hindD.dying != null) { drawBossExplosion(hindD.x, hindD.y, hindD.dying); return; }
  if (airscrewSheet)
    for (const [dy, dx, s] of HINDD_PROPS[hindD.anim % 3])
      ctx.drawImage(airscrewSheet, s * 16, 0, 16, 16,
                    Math.round(hindD.x + dx), Math.round(hindD.y + dy), 16, 16);
}

// The shared big-boss death blast (BossExplosion1/2/3, actorspriteattr.asm:458-464):
// phases <5 / <10 show the SprExplosionB fireball pair at (-32,-16) with SprExplosionS
// puffs at (-48,-8) and (-16,0) (frames 0 then 1, yellow/red, white core); the final
// phase is BossExplosion3's WHITE 2x2 flash block (ExpSprColWhtRed) + the frame-2 puffs.
let explosionBSheet = null, explosionBWSheet = null, explosionSSheet = null;
function drawBossExplosion(x, y, cnt) {
  if (!explosionBSheet || !explosionSSheet) return;
  const pair = (sheet, f, px, py) =>
    ctx.drawImage(sheet, f * 16, 0, 16, 16, Math.round(px), Math.round(py), 16, 16);
  if (cnt < 10) {
    const f = cnt < 5 ? 0 : 1;
    pair(explosionBSheet, f, x - 16, y - 32);
    pair(explosionSSheet, f, x - 8, y - 48);
    pair(explosionSSheet, f, x, y - 16);
  } else {
    if (explosionBWSheet) {                          // BossExplosion3's white core
      pair(explosionBWSheet, 4, x - 24, y - 40); pair(explosionBWSheet, 5, x - 8, y - 40);
      pair(explosionBWSheet, 6, x - 24, y - 24); pair(explosionBWSheet, 7, x - 8, y - 24);
    }
    pair(explosionSSheet, 2, x - 8, y - 48);
    pair(explosionSSheet, 2, x, y - 16);
  }
}

// ---- METAL GEAR (room 118) + BIG BOSS (room 119) ------------------------------------------
// Metal Gear: the towering body (MetalGearTileMap, 64x96, drawn at (0x60,0x08); the bare
// background block replaces it when destroyed) flanked by two laser cameras. It is immune
// to everything except the famous SIXTEEN-BOMB LEG ORDER (damagetoenemy.asm:166-213): an
// EXPLODING plastic bomb near the legs pushes Left(1)/Right(2) — by bomb X vs the centre
// 0x80 — into a 16-deep shift buffer (newest first); when the buffer matches
// PlasticBombOrder (stored last..first), both cameras die and Metal Gear is destroyed —
// setting OpenBigBossDoor (the lock-14 door to Big Boss). Wrong bombs do NOTHING; the
// buffer keeps shifting, so the sequence can always be restarted.
// The PLAY order (the asm comment): R,R,L,R,L,L,R,L,L,R,R,L,R,L,R,R.
// PlasticBombOrder bytes verbatim (damagetoenemy.asm:238-253), newest-first.
const MG_BOMB_ORDER = [2, 2, 1, 2, 1, 2, 2, 1, 1, 2, 1, 1, 2, 1, 2, 2];  // stored last..first
let mgAlive = false, mgDestroyed = false, mgBombBuffer = [];
let mgImg = null, mgBgImg = null;
let bigBoss = null, bigBossDead = false, bigBossSpeechDone = false;
function buildMetalGear(n) {
  mgAlive = n === 118 && !mgDestroyed;
  mgBombBuffer = [];
  applyMetalGearTiles();      // the body's tiles carry its collision (DrawTileBlkTimp)
}
// Called from explodeShot for plastic bombs in room 118.
function chkMetalGearBomb(b) {
  if (!mgAlive || currentRoom !== 118) return;
  if (Math.abs(b.y - 0x70) > 0x18 || Math.abs(b.x - 0x80) > 0x28) return;   // not at the legs
  mgBombBuffer.unshift(b.x <= 0x80 ? 1 : 2);       // Left=1 / Right=2, newest first
  mgBombBuffer = mgBombBuffer.slice(0, 16);
  if (mgBombBuffer.length === 16 && mgBombBuffer.every((v, i) => v === MG_BOMB_ORDER[i]))
    destroyMetalGear(false);
}
// Metal Gear's destruction (BossDefeatedLogic, Banks0123.asm:13388-13401): kill the laser cameras,
// swap to the wreck tiles, ARM THE SELF-DESTRUCT (DestructionTimerOn + the 0x3000 countdown + SFX
// 0x53), and OPEN door 99 (118<->119: DoorOpenArray+62h=0 — open from now on, no push). `silent`
// skips the unskippable EMERGENCY text 150 — used by the ?mgko dev shortcut. OpenBigBossDoor is kept
// as the ChkBigBossDoor fallback.
function destroyMetalGear(silent) {
  mgAlive = false; mgDestroyed = true;
  for (const c of cameras) c.status = 2;         // both laser cameras die
  cameras = [];
  applyMetalGearTiles();                         // RemoveMetalGear: the wreck's tiles
  playBuf(assets.bombExplosionBuf);
  destructionOn = true;
  destructTimer = 3000;                          // 0x3000 BCD = 3000 decimal units
  openBigBossDoor = true;
  forceOpenDoor(99);
  stopAreaMusic(); startAreaMusic();             // SetAreaMusic6: Beyond Big Boss everywhere now
  if (!silent) setText(150, 2);                  // ShowEmergencyText: "EMERGENCY!! ...ESCAPE QUICKLY!!"
}
function drawMetalGear() {
  if (currentRoom !== 118) return;
  const img = mgDestroyed ? mgBgImg : mgImg;
  if (img) ctx.drawImage(img, 0x60, 0x20);   // ChkDrawMetalGear: DE = 6020h (X, Y)
}
// DrawTileBlkTimp writes the body INTO the room's tile map, so its collision IS the
// tiles': these masks are CollTilesMetalGear applied to MetalGearTileMap/TileMap2 —
// the body blocks movement (with the leg-side gaps), the destroyed background keeps
// only the back-wall rows. Applied over tile rect (12,4)..(19,15).
const MG_SOLID = [
  '11111111', '11111111', '11111111', '11111111', '11111110', '00111111',
  '01111111', '11111111', '11111111', '01111100', '01111100', '01111110',
];
const MG_SOLID_BG = [
  '11111111', '11111111', '11111111', '11111111', '00000000', '00000000',
  '00000000', '00000000', '00000000', '00000000', '00000000', '00000000',
];
function applyMetalGearTiles() {
  const c = assets.collision;
  if (!c || currentRoom !== 118) return;
  const mask = mgDestroyed ? MG_SOLID_BG : MG_SOLID;
  for (let r = 0; r < 12; r++)
    for (let col = 0; col < 8; col++)
      c.solid[(4 + r) * c.width + 12 + col] = mask[r][col] === '1' ? 1 : 0;
}

// ---- The destruction countdown (DecNukeTimer / DrawDestrucTimer) --------------------------
// Metal Gear's death arms the base's self-destruct: a 0x3000 countdown that ticks in
// EVERY mode (even the elevators), drawn as red digits in the CALL-sign slot. Reaching
// zero kills Snake with the base. Cigarettes used during the countdown add 2000 units
// (and are consumed); the escape ladders during the countdown are the true ending.
let destructionOn = false, destructTimer = 0;
function destructTick() {
  if (!destructionOn || (tickCounter & 1) !== 0) return;
  if (--destructTimer <= 0) {
    destructionOn = false;
    snake.invulnTimer = 0;
    damage(0xFF);                                  // the base takes Snake with it
  }
}
function drawDestructTimer() {
  if (!destructionOn || !freqDigitsImg) return;    // shares the CALL slot (120,193)
  const s = String(Math.max(0, destructTimer | 0)).padStart(4, '0');   // BCD display
  for (let i = 0; i < 4; i++) drawRedDigit(+s[i], 120 + i * 8, 193);
}

// Big Boss (bigboss.asm): the real 6-state corridor/crate hit-and-run in room 119. He circles a
// rectangular track — vertical corridors at X 24/200, horizontal corridors at Y 56/168 — hiding at
// the crate cover spots (X 0x30/0x70/0xB0 along the horizontal runs, Y 0x58/0x98 along the vertical
// ones), popping out to fire STRAIGHT axis bullets (ID_BULLET_HORIZ/VERT) down the corridor at
// Snake, and running away when Snake closes within 0x48. After the confession (text 147, once).
// Life 0x28 (idxActorLife); death opens the escape door + latches BigBossStat. Spawn: ActorsRoom119
// ID_BIG_BOSS dw 3038h = (X 0x30, Y 0x38). Sprite: SprBigBoss pending — the guard sheet stands in.
const BB_COVER_X = [0x30, 0x70, 0xB0];     // BBChkCovered3 cover spots (horizontal corridors)
const BB_COVER_Y = [0x58, 0x98];           // BBChkCovered cover spots (vertical corridors)
const BB_SPEED = 4;                        // BigBossSetSpeed: SetWalkSpeedFast2 (±2) "Speed x2" = ±4 px per
                                           // ROM iteration (twice player speed — the fast hit-and-run). The
                                           // tick is 30Hz-gated, so this is the literal per-iteration step.
const bbHoriz = (b) => b.y === 56 || b.y === 168;          // BBChkUpDownCorridors: in a horizontal corridor
const bbCovered = (b) => bbHoriz(b) ? BB_COVER_X.includes(b.x) : BB_COVER_Y.includes(b.y);
const bbNear = (b) => Math.abs(snake.x - b.x) <= 0x48 && Math.abs(snake.y - b.y) <= 0x48;  // BBChkPlayerNear
const bbCanShoot = (b) => Math.abs(bbHoriz(b) ? snake.x - b.x : snake.y - b.y) <= 0x30;    // BBChkShoot
const bbOpposite = (d) => ({ left: 'right', right: 'left', up: 'down', down: 'up' })[d];   // GetOppositeDir
const bbRandWait = () => 1 + ((Math.random() * 32) | 0);   // SetRandomWait1_20 (1..32)
function bbAim(b) {                          // BBSetDirToPlayer: move ALONG the corridor toward Snake
  if (bbHoriz(b)) b.dir = snake.x < b.x ? 'left' : 'right';
  else b.dir = snake.y < b.y ? 'up' : 'down';
}
// BBAimToPlayer (bigboss.asm:230): the SHOOT facing — perpendicular/INWARD across the room (by bit7 of
// position), NOT toward Snake: top corridor -> down, bottom -> up, left corridor -> right, right -> left.
// Using the toward-Snake facing here made him reverse ALONG the corridor after firing and jam in a
// corner that isn't a cover spot (the "stuck" report).
function bbAimInward(b) {
  if (bbHoriz(b)) b.dir = (b.y & 0x80) ? 'up' : 'down';
  else b.dir = (b.x & 0x80) ? 'left' : 'right';
}
// Bob back to the NEAREST crate cover spot ALONG the corridor. (The ROM bobs perpendicular = opposite
// of the inward shot, but combined with the showup lunge that can strand him off a cover spot and jam;
// returning along the corridor always re-covers, so he bobs in/out without camping or sticking.)
function bbAimCover(b) {
  if (bbHoriz(b)) {
    const t = BB_COVER_X.reduce((a, c) => Math.abs(c - b.x) < Math.abs(a - b.x) ? c : a);
    b.dir = t < b.x ? 'left' : 'right';
  } else {
    const t = BB_COVER_Y.reduce((a, c) => Math.abs(c - b.y) < Math.abs(a - b.y) ? c : a);
    b.dir = t < b.y ? 'up' : 'down';
  }
}
function bbCalcAway(b) {                     // BigBossCalcAway: run the opposite way down the corridor
  if (bbHoriz(b)) b.dir = snake.x < b.x ? 'right' : 'left';
  else b.dir = snake.y < b.y ? 'down' : 'up';
}
function bbTurnCorner(b) {                   // BBChkTurnCorner: switch axis at the track corners
  if (b.dir === 'up' || b.dir === 'down') {           // moving vertically -> turn at a horizontal corridor
    if (b.y === 56 || b.y === 168) b.dir = (b.x & 0x80) ? 'left' : 'right';
  } else if (b.x === 24 || b.x === 200) {             // moving horizontally -> turn at a vertical corridor
    b.dir = (b.y & 0x80) ? 'up' : 'down';
  }
}
// InitBulletHor / InitBulletVert (logic/actors/bullethv.asm): the straight axis bullet fired by
// AddEnemyShot2 (Big Boss BB_Shoot, the suppressor guards). The speed ALONG the axis is 0x500 in
// 8.8 px TOWARD the screen centre — chosen by bit7 of the SHOOTER's position, not aimed at Snake —
// plus a small random drift on the perpendicular axis (-0x40..+0x3F in 8.8). `dir` only selects
// the axis (left/right = horizontal bullet, up/down = vertical). Sprite 0x72, SFX 5, tile-checked.
// Speeds are halved vs the ROM's 8.8 px because the port steps at 60Hz, not the ROM's 30Hz.
function fireAxisBullet(a, dir) {
  if (bullets.length >= GUARD_MAX_BULLETS) return;
  const SP = (0x500 / 256) / 2;                                  // 5.0 px/iteration -> 2.5 px/frame
  const drift = ((((Math.random() * 0x80) | 0) - 0x40) / 256) / 2;   // -0x40..+0x3F in 8.8, /2
  let vx, vy;
  let srcId;
  if (dir === 'left' || dir === 'right') {                       // InitBulletHor: X by bit7 of X
    vx = (a.x & 0x80) ? -SP : SP; vy = drift; srcId = ID_BULLET_HORIZ;
  } else {                                                       // InitBulletVert: Y by bit7 of Y
    vy = (a.y & 0x80) ? -SP : SP; vx = drift; srcId = ID_BULLET_VERT;
  }
  bullets.push({ x: a.x, y: a.y - 16, vx, vy, tiles: true, srcId });
  playShot();
}
function buildBigBoss(n) {
  bigBoss = (n === 119 && !bigBossDead)
    ? { x: 0x30, y: 0x38, life: 0x28, anim: 0, status: 0, wait: 2, moving: 0, dir: 'right' }
    : null;
  if (bigBoss) startBossMusic();
}
// Big Boss body contact: InitBigBoss leaves COLLISION_CFG=3, so his body deals
// ActorTouchDamage[ID_BIG_BOSS]=8. Touch shape 8 = (0,8,0,0x0C). He flees within ~72px
// (BBChkPlayerNear), so contact is rare but real. (#42)
const BIGBOSS_TOUCH_DMG = actorTouchDmg(ID_BIG_BOSS);
const BIGBOSS_TOUCH_SHAPE = { offY: 0, distY: 8, offX: 0, distX: 0x0C };
function bigBossTick() {
  if ((tickCounter & 1) !== 0 || !bigBoss) return;       // ROM iteration cadence (~30Hz)
  const b = bigBoss;
  if (b.life <= 0) {                                      // DismissActor: open the escape door + latch
    playBuf(assets.guardDeadBuf);
    bigBossDead = true; openBigBossDoor = true;
    forceOpenDoor(107);                                   // DoorOpenArray+6Ah = 0: the ladders' door
    bigBoss = null; stopBossMusic();
    return;
  }
  b.anim = (b.anim + 1) & 0xff;
  if (b.moving) {                                         // UpdateActorPos: step along the current direction
    if (b.dir === 'left') b.x -= BB_SPEED; else if (b.dir === 'right') b.x += BB_SPEED;
    else if (b.dir === 'up') b.y -= BB_SPEED; else if (b.dir === 'down') b.y += BB_SPEED;
    b.x = Math.max(24, Math.min(200, b.x)); b.y = Math.max(56, Math.min(168, b.y));
  }
  if (Math.abs(b.y + BIGBOSS_TOUCH_SHAPE.offY - snake.y) < BIGBOSS_TOUCH_SHAPE.distY &&
      Math.abs(b.x + BIGBOSS_TOUCH_SHAPE.offX - snake.x) < BIGBOSS_TOUCH_SHAPE.distX)
    damage(BIGBOSS_TOUCH_DMG);                            // ChkTouchEnemy: body contact (no armor)
  switch (b.status) {
    case 0:                                               // BigBossSpeech
      if (--b.wait > 0) return;
      b.status = 1; b.wait = bbRandWait();
      if (!bigBossSpeechDone) { bigBossSpeechDone = true; setText(147, 2); }
      return;
    case 1:                                               // BigBossThink
      if (bbNear(b)) { b.status = 2; b.moving = 1; bbCalcAway(b); return; }
      // Show up to shoot: LUNGE toward the player along the corridor (moving=1) so he bobs in/out and
      // doesn't camp a crate; the bob-back (status 5 -> bbAimCover) returns along the corridor to the
      // nearest cover spot, so the lunge can't strand him off-cover -> no jam.
      if (bbCanShoot(b)) { if (--b.wait > 0) return; b.status = 3; b.moving = 1; b.wait = 5; bbAim(b); return; }
      b.status = 2; b.moving = 1; bbAim(b);
      return;
    case 2:                                               // BigBossRun
      bbTurnCorner(b);
      if (!bbCovered(b)) return;
      if (bbNear(b)) { bbCalcAway(b); return; }
      if (!bbCanShoot(b)) return;
      b.status = 1; b.moving = 0; bbAimInward(b);
      return;
    case 3:                                               // BigBossShowUp
      if (--b.wait > 0) return;
      b.status = 4; b.moving = 0; b.wait = 5; bbAimInward(b);
      return;
    case 4:                                               // BB_Shoot: fire ACROSS the room (inward), then bob back
      if (--b.wait > 0) return;
      fireAxisBullet(b, b.dir);
      b.status = 5; b.moving = 1; bbAimCover(b);
      return;
    case 5:                                               // BigBossCover
      if (!bbCovered(b)) return;
      b.status = 1; b.moving = 0; b.wait = bbRandWait(); bbAimInward(b);
      return;
  }
}
let bigBossSheet = null, bigBossMeta = null;
function drawBigBoss() {
  if (!bigBoss) return;
  // SprBigBoss frames (bigboss.png): 4 directions x 2 leg phases, toggled on the anim counter
  // (BigBossSetSpr: SpriteId = Direction*2 + 0x3F, +1 on ANIM_CNT bit 1).
  const key = bigBoss.dir + ((bigBoss.anim & 2) ? '-walk1' : '-walk2');
  if (bigBossSheet && bigBossMeta) {
    const m = bigBossMeta, f = m.frames[key] || m.frames[bigBoss.dir + '-walk1'];
    if (f) ctx.drawImage(bigBossSheet, f.x, f.y, m.frameWidth, m.frameHeight,
                         Math.round(bigBoss.x - m.anchorX), Math.round(bigBoss.y - m.anchorY),
                         m.frameWidth, m.frameHeight);
    return;
  }
  const a = assets.atlas;                           // fallback: the guard sheet stand-in
  if (!a || !assets.sheet) return;
  const f = a.frames[bigBoss.dir + '-walk1'] || a.frames[bigBoss.dir + '-idle'];
  if (f) ctx.drawImage(assets.sheet, f.x, f.y, a.frameWidth, a.frameHeight,
                       Math.round(bigBoss.x - a.anchorX), Math.round(bigBoss.y - a.anchorY),
                       a.frameWidth, a.frameHeight);
}

// ---- Fake Madnar (fakemadnar.asm; room 189) -----------------------------------------------
// Looks like the prisoner you came for — touching him springs the TRAP: text 109 ("YOU
// ARE CAUGHT IN A TRAP... I WILL GET YOU FOXHOUNDER!"), he drops through the floor, a
// PITFALL opens at (0x80,0x60) under Snake's approach, and he never appears again
// (RescuedArray latch). He does no damage and is punchable (the famous fake-check).
let fakeMadnar = null, fakeMadnarDone = false;
function buildFakeMadnar(n) {
  const a = actorsData && actorsData[n];
  fakeMadnar = (a && a.fakemadnar && !fakeMadnarDone)
    ? { x: a.fakemadnar.x, y: a.fakemadnar.y, status: 0, timer: 0x10, anim: 0 }
    : null;
}
function fakeMadnarTick() {
  if ((tickCounter & 1) !== 0 || !fakeMadnar) return;
  const f = fakeMadnar;
  f.anim = (f.anim + 1) & 0xff;
  // FakeMadnadLogic's staging (fakemadnar.asm): touch -> the freed pose; the NEXT
  // iteration speaks (text 109, gameplay pauses); the pitfall is added — with its open
  // SFX — only on the iteration AFTER the text closes; then he SINKS into it
  // (SpeedY 0x100 = 1px/iteration for 0x10 iterations) and is dismissed.
  switch (f.status) {
    case 0:                                        // FakeMadnarWait
      if (Math.abs(snake.y - f.y) < 16 && Math.abs(snake.x - f.x) < 16) f.status = 1;
      return;
    case 1:                                        // FakeMadnarSpeak
      fakeMadnarDone = true;                       // the RescuedArray latch
      setText(109, 2);                             // the trap speech (unskippable)
      f.status = 2;
      return;
    case 2:                                        // FakeMadnarTrap (after the text)
      pitfalls.push({ x: 0x80, y: 0x60, state: 'opening', size: 0 });   // AddEnemy ID_PITFALL
      playBuf(assets.pitfallBuf);
      f.timer = 0x10; f.status = 3;
      return;
    case 3:                                        // FakeMadnarFall: he sinks away
      f.y += 1;
      if (--f.timer <= 0) fakeMadnar = null;
  }
}
function drawFakeMadnar() {
  const f = fakeMadnar;
  if (!f) return;
  const sheet = madnarSheet || prisonerSheet;      // SprMadnar (the white-coat doctor)
  if (sheet && prisonerMeta) {
    const key = f.status === 0 ? ((f.anim & 8) ? 'idle-2' : 'idle-1') : 'rescued';
    const fr = prisonerMeta.frames[key];
    if (fr) { ctx.drawImage(sheet, fr.x, fr.y, prisonerMeta.frameWidth, prisonerMeta.frameHeight,
                            Math.round(f.x - prisonerMeta.anchorX), Math.round(f.y - prisonerMeta.anchorY),
                            prisonerMeta.frameWidth, prisonerMeta.frameHeight); return; }
  }
  ctx.fillStyle = '#d8c060';
  ctx.fillRect(Math.round(f.x - 6), Math.round(f.y - 12), 12, 20);
}

// ---- The moving lorries (ChkLorryMov/LorryMoving, logic/lorry.asm) ------------------------
// Entering one of the MOVING LORRY interiors (199/217/219/213/215/173) starts the ride:
// 0x90 iterations of GameMode 5 — controls dead, the screen SHAKING through the
// VertScrollOffset wobble, the engine SFX looping, and (once per game, LorryMovTextF)
// text 91: "I GOOFED. THE LORRY STARTED TO MOVE". The ride ends back in play — walking
// out of the lorry's door then lands wherever it drove to (the interiors' exit doors).
const MOVING_LORRIES = new Set([199, 217, 219, 213, 215, 173]);
const LORRY_WOBBLE = [2, -1, 1, -2, 2, -3, -1, 0];   // VertScrollOffset
let lorryCnt = 0, lorryTextDone = false;
function chkLorryMov(n) {
  if (!MOVING_LORRIES.has(n)) return;
  lorryCnt = 0x90;
  gameState = 'lorry';
  playLorryEngine();
}
function lorryTick() {
  if ((tickCounter & 1) !== 0) return;
  if (--lorryCnt <= 0) {                           // LorryEnd
    stopLorryEngine();
    gameState = 'play';
    return;
  }
  if (lorryCnt === 0x8E && !lorryTextDone) {       // the I-GOOFED text, once per game
    lorryTextDone = true;
    setText(91, 2);
  }
}
const lorryShakeY = () =>
  gameState === 'lorry' && lorryCnt < 0x80 ? LORRY_WOBBLE[(lorryCnt & 0x0E) >> 1] : 0;
let lorryEngineSrc = null;
function playLorryEngine() {
  stopLorryEngine();
  if (!audioCtx || !assets.lorryBuf) return;
  lorryEngineSrc = audioCtx.createBufferSource();
  lorryEngineSrc.buffer = assets.lorryBuf;
  lorryEngineSrc.loop = true;
  lorryEngineSrc.connect(audioOut());
  lorryEngineSrc.start();
}
function stopLorryEngine() {
  if (lorryEngineSrc) { try { lorryEngineSrc.stop(); } catch (e) {} lorryEngineSrc = null; }
}

function buildPrisoner(n) {
  const real = actorsData && actorsData[n] && actorsData[n].prisoners[0];
  const p = real;
  prisoner = (p && !rescuedRooms.has(n))
    ? { x: p.x, y: p.y, status: 'idle', phase: 0, animTimer: 0, waitTimer: 0, life: PRISONER_LIFE }
    : null;
}

// PrisonerLogic: idle (2-frame animation + touch check) -> wait (2 ticks in the freed pose)
// -> rescued (SetAsRescued + IncRescued; he stays standing until the room changes). A LIFE-0
// prisoner dies on his logic tick (RunEnemyLogic -> KillActor: SFX 0x16 -> KillPrisoner ->
// DowngradeRank). Touching a prisoner causes no damage and no alarm (TouchPlayer exempts
// the prisoner IDs).
function updatePrisoner() {
  const p = prisoner;
  if (!p) return;
  if (p.life === 0) {                                   // KillActor -> KillPrisoner
    playBuf(assets.guardDeadBuf);                       // SFX 0x16 (enemy dead)
    downgradeRank();
    prisoner = null;
    return;
  }
  if (p.status === 'idle') {
    if (++p.animTimer >= 16) { p.animTimer = 0; p.phase ^= 1; }   // Anim2FramesActor (b=0Fh)
    // PrisonerIdle (prisoner.asm:82-88): in the Coward Duck room the prisoner (Jennifer's brother)
    // can't be rescued until CARD8 is taken. The animation still ticks; only the touch check is gated.
    if (currentRoom === 193 && !card8Taken()) return;
    if (Math.abs(p.y + PRISONER_TOUCH_SHAPE.offY - snake.y) < PRISONER_TOUCH_SHAPE.distY &&
        Math.abs(p.x + PRISONER_TOUCH_SHAPE.offX - snake.x) < PRISONER_TOUCH_SHAPE.distX) {
      p.status = 'wait'; p.waitTimer = 2;               // PrisonerIdle2: freed pose + TIMER 2
    }
  } else if (p.status === 'wait' && --p.waitTimer <= 0) {
    p.status = 'rescued';                               // RescuedLogic3
    rescuedRooms.add(currentRoom);                      // SetAsRescued
    incRescued();
    setText(prisonerTextId(p));                         // the room's rescue dialogue
  }
}

// The rescue dialogue id (PrisonerRescued, logic/actors/prisoner.asm:216-260): Ellen's room
// 167 -> text 129; Coward Duck's room 193 -> ChkRescJenBro (the prisoner at Y 0x54 is
// Jennifer's brother -> text 140, any other -> 131); otherwise the PrisonerTexts room table.
// Madnar's special actor logic is out of scope (his rooms aren't exported).
const PRISONER_TEXTS = {   // PrisonerTexts (logic/actors/prisoner.asm:271-289): room -> text id
  129: 90, 134: 52, 136: 54, 144: 78, 145: 131, 146: 32, 148: 28, 152: 28, 159: 27,
  161: 84, 164: 59, 180: 123, 186: 101, 190: 107, 194: 144, 195: 77, 198: 116, 202: 115,
  203: 131,
};
// (DEMO_PRISONER_TEXTS removed — the demo prisoners are gone; real rooms use PrisonerTexts above.)
function prisonerTextId(p) {
  if (currentRoom === 167) return 129;                          // Ellen
  if (currentRoom === 193) return p.y === 0x54 ? 140 : 131;     // ChkRescJenBro
  // Dr. Madnar (182): "save Ellen first" (124) until she's rescued, then the Metal Gear
  // briefing (125) — the Madnar event's Ellen gate.
  if (currentRoom === 182) return rescuedRooms.has(167) ? 125 : 124;
  return PRISONER_TEXTS[currentRoom] ?? 131;
}

// Draw the prisoner (idle-1/idle-2 alternating; the freed pose once touched). Fallback figure
// if the decoded sheet is missing.
function drawPrisoner() {
  const p = prisoner;
  if (!p) return;
  const key = p.status === 'idle' ? (p.phase ? 'idle-2' : 'idle-1') : 'rescued';
  // Room 164's prisoner is Grey Fox (SprPrisoner2, blue), 167's is Ellen (SprElen,
  // tan + the red dress), and 182's is DR. MADNAR (SprMadnar, the white coat) —
  // their sprite sets swap the sheet at the same patterns.
  const sheet = (currentRoom === 164 && greyFoxSheet) ? greyFoxSheet
              : (currentRoom === 167 && ellenSheet) ? ellenSheet
              : (currentRoom === 182 && madnarSheet) ? madnarSheet : prisonerSheet;
  if (sheet && prisonerMeta && prisonerMeta.frames[key]) {
    const f = prisonerMeta.frames[key], m = prisonerMeta;
    ctx.drawImage(sheet, f.x, f.y, m.frameWidth, m.frameHeight,
                  Math.round(p.x - m.anchorX), Math.round(p.y - m.anchorY), m.frameWidth, m.frameHeight);
    return;
  }
  const x = Math.round(p.x), y = Math.round(p.y);       // fallback: small grey figure
  ctx.fillStyle = '#9a9a9a'; ctx.fillRect(x - 6, y - 14, 12, 10);
  ctx.fillStyle = '#caa07a'; ctx.fillRect(x - 4, y - 20, 8, 6);
}

// Floor items drawn from the HUD icon sheet (same GfxItems family as the ROM's dedicated
// WeaponGfxXY/ItemGfxXY bitmaps — documented approximation until a floor-item export exists).
function drawRoomItems() {
  for (const it of roomItems) {
    if (!it) continue;
    if (it.id < ARMOR_ID) drawHudIcon('w', it.id, it.x, it.y);
    else drawHudIcon('i', it.id - SUPRESSOR, it.x, it.y);
  }
}

// Build the active room's door state. The footprint rect and sprite both come from
// the decoded door graphic (door-gfx.json); entry placement uses PLAYER_IN_DOOR_DAT
// (see enterDoor). Doors start closed.
function buildDoors(n) {
  const list = doorsData[String(n)] || [];
  activeDoors = list.map((d) => {
    const g = doorGfx[String(d.type)] || { img: null, w: 16, h: 16, offX: 0, offY: 0, shear: 0 };
    return {
      id: d.id, type: d.type, lock: d.lock || 0, dest: d.dest,
      img: g.img ? doorImages.get(g.img) : null,
      rect: doorCollRect(d.type, d.x, d.y),                          // collision/touch footprint
      // The entry trigger is the per-type DoorOpenEnterDat zone (door-types.json enter* fields),
      // distinct from both the open area and the collision footprint — e.g. the north door (type 1)
      // enters at (X, Y+16) 32x16, and type 6 / type 20 get their DISTINCT enter strips for free
      // (was: the collision footprint for every type but 6/20, cutting some rooms early). (#104)
      enterRect: (() => {
        const t = doorTypes[String(d.type)];
        return (t && t.enterNX != null)
          ? { x: d.x + t.enterOffX, y: d.y + t.enterOffY, w: t.enterNX, h: t.enterNY }
          : doorCollRect(d.type, d.x, d.y);
      })(),
      srect: { x: d.x + g.offX, y: d.y + g.offY, w: g.w, h: g.h },   // sprite draw rect
      shear: g.shear || 0,
      x: d.x, y: d.y,
      // IdDoorsLogic bits 7-6 == 10b (SetDefaultDoorLock): the door STARTS OPEN — never
      // drawn, walked straight through (the lorry backs in room 5; the elevator exits).
      open: !!d.open || openedDoorIds.has(d.id),   // DoorOpenArray: event-opened doors stay open
      opening: false, openTimer: 0, wasInside: false,
    };
  });
}

// Collision footprint per door type, from drawdoors.asm (SetOpenDoorTiles / SetDoorEWColl).
// Render and collision differ — especially the angled E/W doors, whose collision sits 32px
// below the draw anchor and is 16px wide.
function doorCollRect(type, x, y) {
  switch (type) {
    case 1: return { x: x - 4, y: y, w: 32, h: 32 };       // north  (4x4 tiles at X-4)
    case 2: return { x: x, y: y, w: 32, h: 8 };            // south  (4x1 tiles at X,Y)
    case 3: return { x: x - 8, y: y + 32, w: 16, h: 32 };  // west   (2x4 tiles at X-8, Y+32)
    case 4: return { x: x, y: y + 32, w: 16, h: 32 };      // east   (2x4 tiles at X,   Y+32)
    case 5: return { x: x - 4, y: y, w: 32, h: 32 };       // elevator door (DrawDoorElevator: 4x4 at X-4)
    // Elevator-room floor exit (type 6 = DrawDoorDummy, invisible): its zone comes from
    // DoorOpenEnterDat row 6 — open at (X-8, Y+24) and enter through (X+8..X+24, Y+24..Y+40);
    // one rect spanning both keeps the standard push-open-walk-in flow.
    case 6: return { x: x - 8, y: y + 24, w: 32, h: 16 };
    // The breakable walls are tile blocks at the door XY (DrawWall, drawdoors.asm:237-309;
    // sizes = [cols*8 wide, rows*8 tall] from each TilesBasemWall*/TilesWallPrison* table header
    // in data/doors.asm:923-1082). They are solid until bombed (lock 16) or punched (lock 11/15).
    case 7:  return { x, y, w: 32, h: 48 };                // TilesBasemWall60  (6r x 4c)
    case 8:  return { x, y, w: 32, h: 8 };                 // TilesBasemWall61  (1r x 4c)  rooms 61/115
    case 9:  return { x, y, w: 24, h: 104 };               // TilesBasemWall59  (13r x 3c) rooms 59/96
    case 10: return { x, y, w: 40, h: 104 };               // TilesBasemWall58  (13r x 5c)
    case 11: return { x, y, w: 40, h: 96 };                // TilesBasemWall63  (12r x 5c)
    case 12: case 13: return { x, y, w: 32, h: 8 };        // TilesWallPrison2  (1r x 4c) floor walls
    case 14: return { x, y, w: 24, h: 104 };               // TilesWallPrison1  (13r x 3c) Snake's cell
    case 15: return { x, y, w: 16, h: 96 };                // TilesWallPrison   (12r x 2c) 164's side
    case 16: return { x, y, w: 64, h: 80 };                // TilesWallBld3_108 (10r x 8c)
    case 17: return { x, y, w: 16, h: 96 };                // TilesBasemWall93  (12r x 2c) rooms 93/169
    case 18: return { x, y, w: 40, h: 96 };                // TilesBasemWall100 (12r x 5c)
    case 19: return { x, y, w: 48, h: 40 };                // TilesBasemWall112 (5r x 6c)
    default: return { x, y, w: 16, h: 16 };
  }
}
// The active room's connection in `dir`, or null (also null if the neighbor
// isn't a loaded room — a dead end for this slice).
function neighbor(dir) {
  const c = connections[String(currentRoom)];
  const n = c ? c[dir] : null;
  return (n != null && rooms.has(n)) ? n : null;
}

// Decode the SFX WAVs once, after a user gesture (autoplay policy).
async function loadSounds() {
  if (!audioCtx) return;
  const decode = async (url) => {
    try { return await audioCtx.decodeAudioData(await fetch(url).then(r => r.arrayBuffer())); }
    catch (e) { console.warn('Sound unavailable:', url, e); return null; }
  };
  if (!assets.punchBuf)  assets.punchBuf  = await decode('assets/punch.wav');
  if (!assets.doorBuf)   assets.doorBuf   = await decode('assets/door.wav');
  if (!assets.alertBuf)  assets.alertBuf  = await decode('assets/alert.wav');
  if (!assets.redAlertBuf) assets.redAlertBuf = await decode('assets/red-alert.wav');   // distinct Red Alert music
  if (!assets.deadBuf)   assets.deadBuf   = await decode('assets/dead.wav');
  if (!assets.pickupBuf) assets.pickupBuf = await decode('assets/pickup.wav');  // SFX 0x24
  if (!assets.spawnBuf)  assets.spawnBuf  = await decode('assets/spawn.wav');   // SFX 0x25
  if (!assets.handgunBuf)   assets.handgunBuf   = await decode('assets/handgun.wav');    // SFX 0x0C
  if (!assets.silencerBuf)  assets.silencerBuf  = await decode('assets/silencer.wav');   // SFX 0x0E
  if (!assets.clickBuf)     assets.clickBuf     = await decode('assets/click.wav');      // SFX 0x15
  if (!assets.damageBuf)    assets.damageBuf    = await decode('assets/damage.wav');     // SFX 0x10
  if (!assets.guardDeadBuf) assets.guardDeadBuf = await decode('assets/guard-dead.wav'); // SFX 0x16
  if (!assets.rankUpBuf)    assets.rankUpBuf    = await decode('assets/rankup.wav');     // SFX 0x26
  if (!assets.rankDownBuf)  assets.rankDownBuf  = await decode('assets/rankdown.wav');   // SFX 0x27
  if (!assets.textBuf)      assets.textBuf      = await decode('assets/textprint.wav');  // SFX 0x23
  if (!assets.cursorBuf)    assets.cursorBuf    = await decode('assets/cursor.wav');     // SFX 0x20 (menu cursor move)
  if (!assets.useItemBuf)   assets.useItemBuf   = await decode('assets/useitem.wav');    // SFX 0x21 (use item)
  if (!assets.callBuf)      assets.callBuf      = await decode('assets/call.wav');       // SFX 0x22 (incoming radio call)
  if (!assets.radioNoiseBuf) assets.radioNoiseBuf = await decode('assets/radio-noise.wav'); // SFX 0x50 (radio noise)
  if (!assets.elevatorDoorBuf) assets.elevatorDoorBuf = await decode('assets/elevator-door.wav'); // SFX 0x1B
  if (!assets.logoMoveBuf)  assets.logoMoveBuf  = await decode('assets/logo-move.wav');  // SFX 0x47 (logo moving)
  if (!assets.logoStopBuf)  assets.logoStopBuf  = await decode('assets/logo-stop.wav');  // SFX 0x4A (logo stops)
  if (!assets.wallHitBuf)    assets.wallHitBuf    = await decode('assets/wall-hit.wav');    // SFX 0x0A (punch breakable wall)
  if (!assets.punchWallBuf)  assets.punchWallBuf  = await decode('assets/punch-wall.wav');  // SFX 9 (punch solid wall)
  if (!assets.wallBrokenBuf) assets.wallBrokenBuf = await decode('assets/wall-broken.wav'); // SFX 0x1E (wall broken)
  if (!assets.laserBuf)      assets.laserBuf      = await decode('assets/laser.wav');       // SFX 4 (laser shot)
  if (!assets.smgBuf)           assets.smgBuf           = await decode('assets/smg.wav');            // SFX 0x0D
  if (!assets.grenadeThrowBuf)  assets.grenadeThrowBuf  = await decode('assets/grenade-throw.wav');  // SFX 0x12
  if (!assets.rocketBuf)        assets.rocketBuf        = await decode('assets/rocket.wav');         // SFX 0x13
  if (!assets.missileBuf)       assets.missileBuf       = await decode('assets/missile.wav');        // SFX 0x14
  if (!assets.bombSetBuf)       assets.bombSetBuf       = await decode('assets/bomb-set.wav');       // SFX 0x17
  if (!assets.explosionBuf)     assets.explosionBuf     = await decode('assets/explosion.wav');      // SFX 0x1A
  if (!assets.bombExplosionBuf) assets.bombExplosionBuf = await decode('assets/bomb-explosion.wav'); // SFX 0x1C
  if (!assets.bulletShotBuf)    assets.bulletShotBuf    = await decode('assets/bullet-shot.wav');    // SFX 5
  if (!assets.mercenaryBuf)     assets.mercenaryBuf     = await decode('assets/mercenary.wav');      // boss music 0x3E
  if (!assets.taraBuf)          assets.taraBuf          = await decode('assets/tara.wav');           // area music 0 (Theme of Tara + intro)
  if (!assets.sneakingBuf)      assets.sneakingBuf      = await decode('assets/sneaking.wav');       // area music 1 (Sneaking Mission)
  if (!assets.tx55Buf)          assets.tx55Buf          = await decode('assets/tx55.wav');           // area music 2 (TX-55 Metal Gear)
  if (!assets.escapeBuf)        assets.escapeBuf        = await decode('assets/escape.wav');         // area music 4 / the countdown (Beyond Big Boss)
  if (!assets.foxhunterBuf)     assets.foxhunterBuf     = await decode('assets/foxhunter.wav');      // 0x41 Return of Fox Hunter (the ending music)
  if (!assets.endingExplosionBuf) assets.endingExplosionBuf = await decode('assets/ending-explosion.wav'); // SFX 0x56 (ending explosion)
  if (!assets.shotgunBuf)       assets.shotgunBuf       = await decode('assets/shotgun.wav');        // SFX 0x0F
  if (!assets.pitfallBuf)       assets.pitfallBuf       = await decode('assets/pitfall.wav');        // SFX 7
  if (!assets.barrelHitBuf)     assets.barrelHitBuf     = await decode('assets/barrel-hit.wav');     // SFX 0x1D
  if (!assets.electricBuf)      assets.electricBuf      = await decode('assets/electric.wav');       // SFX 0x18
  if (!assets.airflowBuf)       assets.airflowBuf       = await decode('assets/airflow.wav');        // roof air push
  if (!assets.barkBuf)          assets.barkBuf          = await decode('assets/bark.wav');           // SFX 3
  if (!assets.boomerangBuf)     assets.boomerangBuf     = await decode('assets/boomerang.wav');      // SFX 6
  if (!assets.propellerBuf)     assets.propellerBuf     = await decode('assets/propeller.wav');      // SFX 2
  if (!assets.lorryBuf)         assets.lorryBuf         = await decode('assets/lorry-moving.wav');   // SFX 0x1F
}
function playBuf(buf) {
  if (!audioCtx || !buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioOut());
  src.start();
}
const playPunch = () => playBuf(assets.punchBuf);
const playDoor  = () => playBuf(assets.doorBuf);
const playElevatorDoor = () => playBuf(assets.elevatorDoorBuf);   // SFX 0x1B (DoorOpenSfxs types 5/6)
const playCursor  = () => playBuf(assets.cursorBuf);    // SFX 0x20 (MenuWeaponMove/MenuEquipMove)
const playUseItem = () => playBuf(assets.useItemBuf);   // SFX 0x21 (UseItemSfx)

// The incoming-call ring (SFX 0x22) is a TRACKED source, unlike the fire-and-forget playBuf
// sounds: SetAreaMusic6 (Banks0123.asm:1609-1612) cuts it when a room is entered. The
// retrigger uses SetSoundEntryChk semantics (DrawCallTimer, logic/hud.asm:45): a ring that
// is STILL PLAYING is left alone — never cut and restarted (the same lesson as the
// wall-punch buzz; restarting mid-burst chopped the tail).
let callRingUntil = 0;
function playCallRing() {
  if (!audioCtx || !assets.callBuf) return;
  if (callRingSrc && audioCtx.currentTime < callRingUntil) return;   // Chk: already playing
  stopCallRing();
  callRingSrc = audioCtx.createBufferSource();
  callRingSrc.buffer = assets.callBuf;
  callRingSrc.connect(audioOut());
  callRingSrc.start();
  callRingUntil = audioCtx.currentTime + assets.callBuf.duration;
}
function stopCallRing() {
  if (callRingSrc) { try { callRingSrc.stop(); } catch (e) {} callRingSrc = null; }
}

// ---- Input -----------------------------------------------------------------
// ROM controls: punch = Fire2/M (chkPunch, bit 5), weapon fire = Fire/Space (ChkHandGunShot, bit 4).
const held = new Set();
const PUNCH_KEYS = new Set(['m', 'M']);            // Fire2 / M -> punch
const FIRE_KEYS = new Set([' ', 'Spacebar']);      // Fire / Space -> fire the selected weapon
const DIR_KEYS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};
// Recency of pressed directions so multi-key input resolves to one facing.
const dirRecency = [];
let punchQueued = false;
let fireQueued = false;

function pushRecency(dir) {
  const i = dirRecency.indexOf(dir);
  if (i >= 0) dirRecency.splice(i, 1);
  dirRecency.push(dir);
}
function currentDir() {
  for (let i = dirRecency.length - 1; i >= 0; i--) {
    const d = dirRecency[i];
    if (held.has('dir:' + d)) return d;
  }
  return null;
}

// Equipment menus (DrawWeaponMenu/DrawEquipMenu): Q opens the weapon screen, E the item screen
// (F1/F2/F3 are browser-reserved — documented binding). In a menu the d-pad moves the cursor —
// and moving IS selecting (CtrlMenuWeapon/MenuEquipLogic; no confirm press) — Space (Fire) uses
// the selected item on the item screen (ChkUseItem), and Q/E/Esc close. Keydown only latches the
// triggers; menuTick() consumes them so held directions repeat like the ROM (ControlHoldWait).
window.addEventListener('keydown', (e) => {
  if (gameState === 'menu') {
    e.preventDefault();
    const d = DIR_KEYS[e.key];
    if (d) { if (!e.repeat) menuDirTrigger = d; held.add('dir:' + d); pushRecency(d); }
    // ChkUseItem triggers on Fire (ControlsTrigger bit 4, menuequipment.asm:52-54); Enter is
    // accepted too as this port's confirm key (input-binding divergence, like R for radio).
    else if (FIRE_KEYS.has(e.key) || e.key === 'Enter') { if (!e.repeat) menuFireTrigger = true; }
    else if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
      closeMenu();
      // If this close just entered binoculars, stop the SAME keypress from reaching the binoculars
      // input listener below (it shares Esc/Q/E as its exit keys) and bouncing straight back out.
      if (gameState === 'binoculars') e.stopImmediatePropagation();
    }
    return;
  }
  if (e.repeat) return;
  if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); openMenu('weapon'); }
  else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); openMenu('item'); }
});

// Title keys (ChkAnykeyStart, Banks0123.asm:10617): any key before the menu skips to the
// finished title; on the menu only Fire 1 / Fire 2 (Space / M) starts — others do nothing.
window.addEventListener('keydown', (e) => {
  if (gameState !== 'title') return;
  e.preventDefault();
  if (e.repeat) return;
  if (titlePhase === 'gate') return;        // the audio gate consumes the very first press
  if (titlePhase === 'playstart') return;   // GS_PlayStart: ChkAnykeyStart is gone (GameStatus 3)
  titleIdle = 0;                            // any key resets the idle->demo countdown
  if (titlePhase !== 'ready') { titleSkip(); return; }
  if (FIRE_KEYS.has(e.key) || PUNCH_KEYS.has(e.key)) titleStartGame();
});

window.addEventListener('keydown', (e) => {
  if (gameState === 'title') return;                 // the title listener owns boot input
  if (gameState === 'gameover') {                    // GS_GameOver: ChkContinueKey watches F5 only
    if (e.key === 'F5') { e.preventDefault(); continueArmed = true; }
    return;
  }
  if (demoActive) { e.preventDefault(); endDemo(); return; }   // a key aborts the attract demo
  if (gameState === 'ending') { e.preventDefault(); return; }  // the ending cinematic ignores input
  if (gameState === 'intro') { e.preventDefault(); return; }  // CONTROL_INTRO ignores the player
  if (gameState === 'menu') return;                  // menu handles its own input
  if (gameState === 'text') {                        // text window keys, faithful to the ROM:
    // TW_PrintChar/TW_Wait check exactly Fire2 (M) and RET (Enter) — Space/Fire is NOT a
    // text key in the ROM. A press mid-print skips to the next page; waiting advances.
    // Arrows/Space still get preventDefault so the BROWSER page doesn't scroll while the
    // window is open (user-reported: the screen "jumped" on stray presses).
    if (DIR_KEYS[e.key] || FIRE_KEYS.has(e.key)) { e.preventDefault(); return; }
    if (PUNCH_KEYS.has(e.key) || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) dismissText(); }
    return;
  }
  if (gameState === 'radio') {                       // RadioIdle input: latch for radioTick
    const d = DIR_KEYS[e.key];
    if (d) {
      e.preventDefault();
      held.add('dir:' + d); pushRecency(d);          // ControlsHold for the tune repeat
      if (!e.repeat) {
        if (d === 'up') radioUpTrigger = true;       // SEND
        else if (d === 'left' || d === 'right') radioDirTrigger = d;
      }
    }
    return;
  }
  if (gameState === 'binoculars') {                  // BinocularLogic input (F3 exits, d-pad peeks)
    e.preventDefault();
    if (e.repeat) return;
    const d = DIR_KEYS[e.key];
    if (d) { if (binoc && binoc.mode === 'idle') binocDirTrigger = d; }   // ControlsTrigger, idle only
    else if (e.key === 'Escape' || e.key === 'e' || e.key === 'E' || e.key === 'q' || e.key === 'Q')
      exitBinoculars();                              // ExitBinocularMode (the ROM's F3)
    return;
  }
  if (PUNCH_KEYS.has(e.key)) { e.preventDefault(); if (!e.repeat) punchQueued = true; }
  if (FIRE_KEYS.has(e.key)) { e.preventDefault(); if (!e.repeat) fireQueued = true; held.add('fire'); }
  const dir = DIR_KEYS[e.key];
  if (dir) { e.preventDefault(); held.add('dir:' + dir); pushRecency(dir); }
});
window.addEventListener('keyup', (e) => {
  const dir = DIR_KEYS[e.key];
  if (dir) held.delete('dir:' + dir);
  if (FIRE_KEYS.has(e.key)) held.delete('fire');   // ControlsHold bit 4 (the SMG autofire)
});
// A keyup delivered while the window/tab is unfocused never reaches the listener above,
// leaving the key latched ("stuck") until the next physical press — clear all held state
// whenever focus is lost (user-reported).
window.addEventListener('blur', () => held.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) held.clear(); });

// Weapon/item selection. The ROM uses F1-F7 for weapons (ReadFKeys -> SelectWeapon) and a menu for
// items; browsers reserve the function keys, so this binds weapons to the number keys (1 = handgun)
// and cycles the current item with the 'i' key — a documented input-binding divergence.
window.addEventListener('keydown', (e) => {
  if (e.repeat || gameState === 'menu') return;
  if (e.key >= '1' && e.key <= '7') selectWeapon(+e.key);
  else if (e.key === '0') selectedWeapon = 0;        // holster (no weapon -> unarmed walk + can't fire)
  else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); cycleItem(); }
});

// Pause toggle (P).
window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
});

// Password / SAVE / LOAD entry: while PAUSED, typed letters/digits roll into the password buffer
// (the ROM checks it on ExitPauseMode). 'p' is the pause toggle, not a buffer char.
window.addEventListener('keydown', (e) => {
  if (paused && gameState === 'play' && e.key !== 'p' && e.key !== 'P') passwordKey(e.key);
});

// ---- In-game bug reporter (DEV/QA tool — NOT a ROM feature) -----------------------------------
// Press B to file a GitHub issue with the last ~20s of gameplay attached. Two MediaRecorders run
// in "ping-pong": each captures a 40s window, staggered by 20s, so at any instant one of them has
// already been recording >=20s ending now. That recorder's chunks are a single, self-contained,
// in-order WebM (header + complete 1s clusters, nothing dropped) — so the delivered clip always
// plays. The stream is canvas video PLUS the audio-bus tap (captureDest), so the clip has sound.
// On B the clip is frozen, then a small form lets the user add a short description or cancel; on
// submit the clip + room/state metadata are POSTed to serve.js /report, which uploads the clip as
// a release asset and opens the issue via the GitHub API (token in web/.env). See web/serve.js.
const BUG_CLIP_MS = 20000;              // we want at least this many ms of footage before the press
const BUG_WINDOW_MS = 2 * BUG_CLIP_MS;  // each recorder fills a full window, then restarts
let bugSlots = null, bugBusy = false, bugToastTimer = 0, bugVideoStream = null;
let bugFormOpen = false, bugPending = null;   // { blob, meta } frozen at B-press, awaiting submit
let bugPrevPaused = false;                     // the pause state to restore when the form closes

function bugReporterAvailable() {
  return typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
}
function pickBugMime() {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
const bugSafeStop = (rec) => { try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {} };
// Video (canvas) + audio (the bus tap, once the AudioContext exists) as one recorded stream.
function bugStream() {
  const tracks = bugVideoStream.getVideoTracks();
  if (captureDest) for (const t of captureDest.stream.getAudioTracks()) tracks.push(t);
  return new MediaStream(tracks);
}
function initBugReporter() {
  if (!bugReporterAvailable()) return;            // headless / unsupported browser: no-op
  bugVideoStream = canvas.captureStream(30);       // a 30fps mirror of the visible canvas
  const mime = pickBugMime();
  const makeSlot = () => {
    const slot = { rec: null, chunks: [], startedAt: 0 };
    slot.begin = () => {
      slot.chunks = [];
      slot.startedAt = performance.now();
      slot.rec = new MediaRecorder(bugStream(), mime ? { mimeType: mime } : undefined);
      slot.rec.ondataavailable = (e) => { if (e.data && e.data.size) slot.chunks.push(e.data); };
      slot.rec.onstop = () => slot.begin();        // auto-restart -> next window / audio refresh
      slot.rec.start(1000);                        // 1s timeslice: chunks flush without stopping
    };
    return slot;
  };
  const a = makeSlot(), b = makeSlot();
  bugSlots = [a, b];
  a.begin();
  setInterval(() => bugSafeStop(a.rec), BUG_WINDOW_MS);               // A: windows at 0,40,80…
  setTimeout(() => {                                                  // B: staggered by 20s
    b.begin();
    setInterval(() => bugSafeStop(b.rec), BUG_WINDOW_MS);            // B: windows at 20,60,100…
  }, BUG_CLIP_MS);
  bugWireForm();
}
// The AudioContext (and its capture tap) only exists after the first user gesture; restart the
// rolling recorders so the next segments include the audio track (onstop -> begin -> bugStream).
function bugRefreshAudio() {
  if (!bugSlots) return;
  for (const s of bugSlots) bugSafeStop(s.rec);
}
function bugBestSlot() {                            // the slot covering >=20s ending now (tightest)
  const now = performance.now();
  let ready = null, fallback = null;
  for (const s of bugSlots) {
    if (!s.rec || !s.chunks.length) continue;
    const el = now - s.startedAt;
    if (el >= BUG_CLIP_MS && (!ready || el < now - ready.startedAt)) ready = s;
    if (!fallback || el > now - fallback.startedAt) fallback = s;   // early game: the longest one
  }
  return ready || fallback;
}
function bugToast(msg, kind, href) {
  const t = document.getElementById('report-toast');
  if (!t) return;
  t.textContent = msg;
  if (href) { t.append('  '); const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.textContent = 'open ↗'; t.append(a); }
  t.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(bugToastTimer);
  bugToastTimer = setTimeout(() => { t.className = ''; }, kind === 'ok' ? 9000 : 5000);
}

// --- the description form (add a note + Submit, or Cancel) ---
function bugWireForm() {
  const form = document.getElementById('report-form');
  if (!form) return;
  const doSubmit = () => { const ta = document.getElementById('report-desc'); submitBugReport(ta ? ta.value : ''); };
  const cancel = document.getElementById('report-cancel');
  const submit = document.getElementById('report-submit');
  if (cancel) cancel.addEventListener('click', cancelBugReport);
  if (submit) submit.addEventListener('click', doSubmit);
  // Keep keystrokes inside the form (typing, Esc, Ctrl/Cmd+Enter) from reaching the game's
  // window-level handlers: stopPropagation prevents the bubble to window without blocking the
  // textarea's own text input. Esc cancels, Ctrl/Cmd+Enter submits.
  form.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancelBugReport(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSubmit(); }
  });
  form.addEventListener('keyup', (e) => e.stopPropagation());
  form.addEventListener('mousedown', (e) => { if (e.target === form) cancelBugReport(); }); // backdrop
}
function showBugForm(blob, meta) {
  const form = document.getElementById('report-form');
  if (!form) { submitBugReport(''); return; }       // no UI -> submit without a description
  const info = document.getElementById('report-info');
  if (info) info.textContent = `room ${meta.room} · ${meta.state} · ${(blob.size / 1024).toFixed(0)} KB`
    + (captureDest ? ' · with audio' : ' · video only (start the game so audio is captured)');
  const ta = document.getElementById('report-desc');
  if (ta) ta.value = '';
  form.classList.remove('hidden');
  bugFormOpen = true;
  held.clear();                                     // stop Snake walking while the form is up
  // Freeze the sim while the modal form is up (guards/bullets/damage keep running otherwise — the
  // form is a DOM overlay that doesn't gate the loop). Reuse the existing `paused` flag (loop()
  // returns early on it); remember the prior value so closing restores a manual pause instead of
  // clobbering it. No redrawStatic()/PAUSED overlay here — the form covers the canvas.
  bugPrevPaused = paused;
  paused = true;
  if (ta) setTimeout(() => ta.focus(), 0);
}
function closeBugForm() {
  const form = document.getElementById('report-form');
  if (form) form.classList.add('hidden');
  bugFormOpen = false;
  paused = bugPrevPaused;                            // restore the pre-form pause state
  if (!paused) { last = 0; acc = 0; requestAnimationFrame(loop); }   // restart the stopped loop (as togglePause does)
}
function cancelBugReport() {
  if (!bugFormOpen && !bugPending) return;
  bugPending = null;
  closeBugForm();
  bugToast('Bug report cancelled');
}
async function submitBugReport(desc) {
  if (!bugPending) return;
  const { blob, meta } = bugPending;
  bugPending = null;
  meta.description = String(desc || '').trim().slice(0, 1000);   // short note; header-sized
  closeBugForm();
  bugBusy = true;
  bugToast('Filing bug report…');
  try {
    const res = await fetch('/report', {
      method: 'POST',
      headers: { 'Content-Type': blob.type, 'X-MG-Meta': encodeURIComponent(JSON.stringify(meta)) },
      body: blob,
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out.ok) bugToast('Issue #' + out.number + ' filed ✓', 'ok', out.url);
    else bugToast('Report failed: ' + (out.error || ('HTTP ' + res.status)), 'err');
  } catch (e) {
    bugToast('Report failed: ' + ((e && e.message) || e), 'err');
  } finally {
    bugBusy = false;
  }
}
// B-press: freeze the last ~20s as a blob, then open the description form.
async function openBugReport() {
  if (bugBusy || bugFormOpen) return;
  if (!bugSlots) { bugToast('Recording unavailable in this browser', 'err'); return; }
  const slot = bugBestSlot();
  if (!slot) { bugToast('No footage captured yet — try again in a moment', 'err'); return; }
  bugBusy = true;
  bugToast('Capturing clip…');
  try {
    try { if (slot.rec.state !== 'inactive') slot.rec.requestData(); } catch (e) {}  // flush <1s tail
    await new Promise((r) => setTimeout(r, 90));
    const blob = new Blob(slot.chunks, { type: (slot.chunks[0] && slot.chunks[0].type) || 'video/webm' });
    bugPending = {
      blob,
      meta: {
        room: currentRoom, previousRoom, state: gameState,
        life: snake.life, maxLife: snake.maxLife, class: snake.class,
        pos: { x: Math.round(snake.x), y: Math.round(snake.y) }, dir: snake.dir,
        alert: !!alertMode, when: new Date().toISOString(),
        url: location.href, ua: navigator.userAgent,
      },
    };
    showBugForm(blob, bugPending.meta);
  } catch (e) {
    bugToast('Capture failed: ' + ((e && e.message) || e), 'err');
  } finally {
    bugBusy = false;
  }
}

// Bug report (B). Skipped while paused (there 'b' is a password-buffer char, like the ROM's typed
// SAVE/LOAD/cheat entry) so the two never collide. While the form is open the 'b' goes to the
// textarea (the form stops it bubbling here), so this won't re-trigger.
window.addEventListener('keydown', (e) => {
  if (e.repeat || (e.key !== 'b' && e.key !== 'B')) return;
  if (paused && gameState === 'play') return;
  e.preventDefault();
  openBugReport();
});

// Radio toggle (R — the ROM's F4 key; browsers reserve the F-keys, a documented binding
// divergence like Q/E). Faithful F4 semantics: it also exits from INSIDE a printing radio
// text (TextBoxLogic checks F4 first, Banks0123.asm:7842 → TextBoxExit + ExitRadio).
window.addEventListener('keydown', (e) => {
  if (e.repeat || (e.key !== 'r' && e.key !== 'R')) return;
  e.preventDefault();
  if (gameState === 'play') openRadio();
  else if (gameState === 'radio') closeRadio();
  else if (gameState === 'text' && textReturnState === 'radio') { textBox = null; closeRadio(); }
});

// ---- Player control modes --------------------------------------------------
// Snake runs through the ROM's control-mode state machine (PlayerControlLogic dispatches on
// PlayerControlMod; Banks0123.asm), and the drawn sprite follows PlayerAnimation. This slice
// implements NORMAL (walk) and PUNCH; later changes plug in ladder-walk (6) / ladder-climb (7) /
// water / box as new branches. CONTROL_* / PlayerAnimation values are from constants/Enums.asm.
const CONTROL_NORMAL = 0, CONTROL_PUNCH = 1, CONTROL_ELEVATOR = 2, CONTROL_DEAD = 3,
      CONTROL_PARACHUTE = 4, CONTROL_AIRFLOW = 5,
      CONTROL_LADDER_WALK = 6, CONTROL_LADDER_CLIMB = 7;        // CONTROL_* (8 = intro)
const SELECTED_ARMOR = 1;                           // Enums.asm:84 (the bullet-proof vest: halves damage)
const SELECTED_BOMB_SUIT = 2;                       // Enums.asm:85 (the roof air-flow gate)
const SELECTED_PARACHUTE = 0x0C;                    // Enums.asm (the roof fall gate)
const ANIM_NORMAL = 0, ANIM_PUNCH = 1, ANIM_WATER = 2, ANIM_PARACHUTE = 3, ANIM_DEEP_WATER = 4,
      ANIM_LADDER = 5, ANIM_DEAD = 6, ANIM_BOX = 7;              // PlayerAnimation (2/4/7 reserved)

// ---- Escape ladders (rooms 224-226; guardalert-style escape, Banks0123.asm) ----------------
// The building-2 roof escape. Entered via SetLadderRoomEntry (here: the ?room=224 dev hook, as the
// door is end-game). Walk the floor left/right; Up on a ladder tile (0x08) climbs; the top of 226
// is the escape. ROM Y constants map directly to our 0..191 (floor 0x9E, climb-floor 0x99, top<16,
// bottom>=186). Climb is half walk speed (ROM PlayerMovSpeed climb 0x0100 vs walk 0x0200).
const LADDER_ROOMS = new Set([224, 225, 226]);
const LADDER_WALK_FLOOR_Y = 0x9E, LADDER_CLIMB_FLOOR_Y = 0x99;   // SetLadderRoomEntry / ChkStartClimb
const LADDER_ENTRY_X = 0xD8;                                     // SetLadderRoomEntry entrance X
const LADDER_TOP_Y = 16, LADDER_BOTTOM_Y = 186, ESCAPE_TOP_Y = 0x10;  // ChkNextLadderRoom / room-226
const LADDER_CLIMB_SPEED = SPEED / 2;                            // climb = half walk (0x0100 vs 0x0200)
let escaped = false;                                             // LeavedOuterHeaven
let endingStatus = 0, endingCnt = 0, endingTimer = 0;            // EndingStatus / EndingCnt / DestructTimer
let endingRadio = false;                                        // the ending's radio segment
let endExplodeImg = null, endExplodeFlashImg = null, endExplodeMeta = null;   // EndingExplosion tile atlas (+ flash variant)

// ---- Water (ChkWater/ChkWaterTiles, Banks0123.asm) -----------------------------------------
// Water mode is GATED on the room being a water room (RoomsWater) — the tile check only runs
// there, so tile numbers that look like water in other tilesets don't trigger it. Inside a water
// room, the tile under Snake sets shallow (anim 2, tiles 0x73-0x74 + brick 0x6D + shadow in a
// non-deep room) or deep (anim 4, 0x75-0x76 + shadow in a deep room). Control stays normal walk.
const ROOMS_WATER = new Set([70, 73, 74, 77, 78, 105, 106, 107, 211, 212]);  // RoomsWater (DEEP_WATER_ROOMS ⊂ this)
const DEEP_WATER_DRAIN = 2;          // DecrementLife_2: deep water without oxygen loses 2 life...
const DEEP_WATER_DELAY = 8;          // ...every 8 frames (DecrementLife_C, c=8, via DamageDelayTimer)
// SELECTED_OXYGEN — the scuba/oxygen tank that prevents the drain (SetInWaterMode3, Banks0123.asm).
// Now wired to the inventory; oxygen isn't an ownable item yet, so this is still always false in
// practice (you always drain in deep water) until the oxygen item is added.
const hasScubaTank = () => selectedItem === SELECTED_OXYGEN;
let deepWaterDraining = false;       // true while taking deep-water damage (suppresses the i-frame blink)
// ---- Gas rooms (ChkGasRooms, logic/damagegas.asm) -------------------------------------------
// In a gas room without the GAS MASK selected, Snake loses 2 life every 0x10 frames
// (DecrementLife_C via the shared damage-delay timer). Rooms: GasRooms (:53) — 29 is in the
// 2F corridor loop; 112/114 are building 3's. The mask (pickup 13) sits in room 138, behind
// room 8's CARD1 door.
const GAS_ROOMS = new Set([29, 94, 96, 97, 98, 100, 101, 112, 114]);
const SELECTED_GAS_MASK = 5;
// The DARK rooms (SetRoomPal, Banks0123.asm:2946-2964): black without the FLASHLIGHT.
const DARK_ROOMS = new Set([123, 124, 125, 220, 221]);
const SELECTED_FLASHLIGHT = 3;
let gasDraining = false;
function chkGasRooms() {
  gasDraining = GAS_ROOMS.has(currentRoom) && selectedItem !== SELECTED_GAS_MASK;
  if (gasDraining && snake.invulnTimer === 0) {
    snake.invulnTimer = 0x10;                  // the gas damage delay
    snake.life = Math.max(0, snake.life - 2);
    if (snake.life === 0) enterDead();
  }
}

// ---- HUD: life bar, rank, weapon/item (logic/hud.asm RenderHUD) ------------
// MaxLife grows with rank (Class) per UpdateLevels (Banks0123.asm): rank 1->24, 2->32, 3->40, 4->48.
// The bar's full scale is 0x30 = 48 (DrawLife). Class caps at 3 (IncClassLv) -> 1..4 stars (DrawClass).
const RANK_MAX_LIFE = [24, 32, 40, 48];   // MaxAmmo/UpdateLevels life levels per Class 0..3
const LIFE_BAR_SCALE = 0x30;              // DrawLife full-bar width (48)
// ---- Pickup data (logic/items.asm + data/itemtakeamount.asm + logic/maxammo.asm) -----------
// Pickup ids: weapons 1..7, SUPRESSOR 8, equipment 9+ (inventory id = pickup id - 8).
const P_RATION = 0x1E, P_AMMO_CRATE = 0x23;                  // RATION / AMMO_CRATE (Enums.asm)
// ItemTakeAmount[id-1] (data/itemtakeamount.asm): guns 1-4 grant 0 (ammo comes from crates),
// explosives 5-7 grant 5, a card's "units" hold its identification number (31h..38h), ration +1.
const ITEM_TAKE_AMOUNT = [
  0, 0, 0, 0, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 1, 0, 0,
  0, 0, 0];
// MaxAmmoLv1-4 + per-rank ration caps (logic/maxammo.asm SetMaxAmmoVals, BCD-read): the
// ammo/ration ceilings grow with Class. Indexed [snake.class][weapon id].
const MAX_AMMO_LV = [
  { 1: 50, 2: 50, 3: 15, 4: 5, 5: 5, 6: 5, 7: 5 },          // MaxAmmoLv1 (Class 0)
  { 1: 100, 2: 100, 3: 30, 4: 10, 5: 10, 6: 10, 7: 10 },    // MaxAmmoLv2
  { 1: 200, 2: 200, 3: 60, 4: 20, 5: 15, 6: 15, 7: 15 },    // MaxAmmoLv3
  { 1: 300, 2: 300, 3: 90, 4: 30, 5: 20, 6: 20, 7: 20 },    // MaxAmmoLv4
];
const MAX_RATIONS_LV = [3, 6, 9, 18];                        // SetMaxAmmoVals ration caps
// WeaponGfxXY/ItemGfxXY odd-X rule (DrawRoomItems): weapons 1-4 are 32x16, everything else 16x16.
const itemIsWide = (id) => id >= HAND_GUN && id <= ROCKET_LAUNCHER;

let tickCounter = 0;   // free-running frame counter (TickCounter) — drives the red damage flash

// ---- Game state ------------------------------------------------------------
const snake = {
  x: SPAWN_X, y: SPAWN_Y, dir: 'down', state: 'idle', animTimer: 0, walkPhase: 0, punchTimer: 0,
  life: SNAKE_MAX_LIFE, maxLife: SNAKE_MAX_LIFE, invulnTimer: 0,
  class: 0,                                        // Class (rank): 0..3 -> 1..4 stars; sets maxLife
  controlMod: CONTROL_NORMAL, anim: ANIM_NORMAL,   // PlayerControlMod / PlayerAnimation
};

// ---- Player inventory / selection (Weapons / Equipment arrays, Banks0123.asm; Enums.asm) ----
// The REAL inventory: Snake starts with NOTHING (the infiltration starts empty) and entries
// exist only once picked up (ChkTakeItem, logic/items.asm). The ROM fills the first empty slot
// (GetWeapon3 / AddItemInventory), so inventory order = pickup order — a JS Map's insertion
// order matches for free. Ammo/units are plain integers (the ROM stores BCD via `daa`; same
// values — documented divergence).
const HAND_GUN = 1, SUB_MACHINE_GUN = 2, GRENADE_LAUNCHER = 3, ROCKET_LAUNCHER = 4, SUPRESSOR = 8;
const SELECTED_BOX = 0x19, SELECTED_OXYGEN = 0x0A, SELECTED_RATION = 0x16;   // constants/Enums.asm
const SELECTED_GOGGLES = 4;   // the infrared goggles (Enums.asm:87) — reveal the laser beams
const SELECTED_ANTENNA = 8;   // Enums.asm:91 — the radio antenna (AddItemInventory3 forces a pending call)
const SELECTED_BINOCULARS = 0x09;   // Enums.asm:92 — the recon telescope (BinocularMode)
// Keycards (constants/Enums.asm): SELECTED_CARDn = 0x0D + n (CARD1=0x0E .. CARD8=0x15). A door's lock
// value L (2..9, from IdDoorsLogic & 0x1F) requires card (L-1), i.e. item id 0x0C + L (ChkCard1..8).
const cardItemForLock = (lock) => 0x0C + lock;            // lock 5 -> 0x11 (CARD4), lock 6 -> 0x12 (CARD5)
const SELECTED_CARD1 = 0x0E, SELECTED_CARD4 = 0x11, SELECTED_CARD5 = 0x12;
const weapons = new Map();        // Weapons array: weapon id (1..7) -> ammo
const items = new Map();          // Equipment array: SELECTED id (pickup id - 8) -> units
let invSuppressor = false;        // InvSupressor — the suppressor is a flag, not a weapon slot
let selectedWeapon = 0;           // SelectedWeapon (0 = unarmed)
let selectedItem = 0;             // SelectedItem (0 = none)

const ownedWeaponIds = () => [...weapons.keys()];          // pickup order (CompactWeapons)
const ownedItemIds = () => [0, ...items.keys()];           // none + owned (CompactEquipment)
const selectWeapon = (id) => { if (!equipRemoved && weapons.has(id)) selectedWeapon = id; };  // SelectWeapon (EquipRemoved -> 0)
const selectItem = (id) => { if (!equipRemoved && items.has(id)) selectedItem = id; };
const cycleItem = () => {
  if (equipRemoved) return;                       // captured: nothing selectable
  const list = ownedItemIds();
  selectedItem = list[(list.indexOf(selectedItem) + 1) % list.length];
};

// Can Snake occupy (x,y) when moving in `dir`? Test the two direction probes.
// `allowOff` lets probe pixels outside the room count as open (used only when
// stepping toward a connected edge, so Snake can reach and cross a doorway —
// in-room solids still block, so a wall beside the doorway is honored).
function blocked(x, y, dir, allowOff = false, probes = PROBES) {
  for (const [oy, ox] of probes[dir]) {
    const px = Math.round(x + ox), py = Math.round(y + oy);
    if (inOpenDoor(px, py)) continue;       // an open doorway is passable, even over wall tiles
    if (closedWallSolid(px, py)) return true;   // a closed breakable wall blocks until bombed/punched
    const c = assets.collision;
    const tx = px >> 3, ty = py >> 3;
    const off = tx < 0 || ty < 0 || tx >= c.width || ty >= c.height;
    if (off) { if (allowOff) continue; return true; }
    if (c.solid[ty * c.width + tx] !== 0) return true;
  }
  return false;
}

const pointInRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
function inOpenDoor(px, py) {
  for (const d of activeDoors) if (d.open && pointInRect(d.rect, px, py)) return true;
  return false;
}
// A CLOSED breakable wall (DrawWall render types 7-19) is a solid tile block at the door XY until
// it is bombed/punched open — the ROM's DrawWall writes the wall's tiles into the room collision
// map and EraseBasemWall removes them on break. Several of these walls sit over an otherwise-OPEN
// passage in the exported room collision, so without this they were walk-through without bombing.
function closedWallSolid(px, py) {
  for (const d of activeDoors) {
    if (d.open || d.opening) continue;
    if (d.type < 7 || d.type > 19) continue;
    if (pointInRect(d.rect, px, py)) return true;
  }
  return false;
}

// Is Snake clear (no probe solid) at (x,y) in the active room, in every direction?
function freeAt(x, y) {
  return !['up', 'down', 'left', 'right'].some((d) => blocked(x, y, d));
}

// True if the active room's boundary tile Snake would pass through (a doorway) is open.
function edgeDoorOpen(dir, x, y) {
  const c = assets.collision;
  const clampTx = (v) => Math.max(0, Math.min(c.width - 1, v >> 3));
  const clampTy = (v) => Math.max(0, Math.min(c.height - 1, v >> 3));
  let tx, ty;
  if (dir === 'left')  { tx = 0; ty = clampTy(y); }
  else if (dir === 'right') { tx = c.width - 1; ty = clampTy(y); }
  else if (dir === 'up')    { ty = 0; tx = clampTx(x); }
  else { ty = c.height - 1; tx = clampTx(x); }      // down
  return c.solid[ty * c.width + tx] === 0;
}


// ---- Tile classification (room-tile-types) --------------------------------
// The room collision data carries a per-tile tile-number grid (`tiles`) alongside `solid`, so
// movement modes can recognise gameplay tiles. ROM tile constants (Banks0123.asm): ladder = 0x08;
// shallow water = 0x73-0x74 plus brick-in-water 0x6D; deep water = 0x75-0x76; shadow water
// 0x6F-0x72 is deep in the deep-water rooms, else shallow (RoomsWater = 70,73,74,77,78,105,106,
// 107,211,212; the deep ones are 105,106,211,212). Consumed by snake-ladders / snake-water.
const DEEP_WATER_ROOMS = new Set([105, 106, 211, 212]);
function tileAt(tx, ty) {
  const c = assets.collision;
  if (!c || !c.tiles || tx < 0 || ty < 0 || tx >= c.width || ty >= c.height) return -1;
  return c.tiles[ty * c.width + tx];
}
const isLadder = (tx, ty) => tileAt(tx, ty) === 0x08;
function isShallowWater(tx, ty) {
  const t = tileAt(tx, ty);
  if (t === 0x6D || t === 0x73 || t === 0x74) return true;
  if (t >= 0x6F && t <= 0x72) return !DEEP_WATER_ROOMS.has(currentRoom);   // shadow: shallow unless a deep room
  return false;
}
function isDeepWater(tx, ty) {
  const t = tileAt(tx, ty);
  if (t === 0x75 || t === 0x76) return true;
  if (t >= 0x6F && t <= 0x72) return DEEP_WATER_ROOMS.has(currentRoom);
  return false;
}
// RoomGfxSetIds (data/roomtileset.asm): each room's tileset id, nibble-packed two rooms per byte.
// GetNibbleRoom: even room = high nibble (byte>>4), odd room = low nibble (byte&0xF). Tileset 0 =
// Building — the only tileset whose tiles include the see-through handrails (ChkViewObstacles). (#101)
const ROOM_TILESET_IDS = [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x22,0x22,0x20,0x02,0x22,0x52,0x22,0x11,0x11,0x11,0x11,0x11,0x11,0x11,0x11,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x22,0x22,0x21,0x11,0x11,0x11,0x11,0x11,0x10,0x00,0x00,0x01,0x11,0x11,0x12,0x60,0x10,0x41,0x11,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x44,0x34,0x44,0x11,0x10,0x04,0x44,0x44,0x44,0x11,0x10,0x33,0x30,0x00,0x00,0x00,0x00,0x00,0x00,0x33,0x33,0x33,0x33,0x33,0x37];
const roomTileset = (n) => { const b = ROOM_TILESET_IDS[n >> 1] || 0; return (n & 1) ? (b & 0x0f) : (b >> 4); };

// Hard cut to the neighbor room and place Snake at the matching (mirrored) entry edge.
function transition(dir, neighborRoom) {
  // SetNextRoom (nextroom.asm:34-47): leaving the desert (room 103) WITHOUT the compass selected
  // and NOT heading south (DIR_DOWN) sends Snake straight back to 103 — "get lost in the desert".
  // (Room 103's left/right already self-loop to 103; this gates the up→208 exit to building 2.) (#32)
  if (currentRoom === 103 && selectedItem !== SELECTED_COMPASS && dir !== 'down') neighborRoom = 103;
  enterDir = DIR_TO_PD[dir] || 0;     // NextRoomDirect — for HideGuards (which guard to remove)
  setRoom(neighborRoom);              // (buildGuard reads enterDir during setRoom)
  enterDir = 0;
  let x = snake.x, y = snake.y;
  if (dir === 'right') x = ENTRY_RIGHT_X;
  else if (dir === 'left')  x = ENTRY_LEFT_X;
  else if (dir === 'down')  y = ENTRY_DOWN_Y;
  else if (dir === 'up')    y = ENTRY_UP_Y;

  // Settle onto open floor: if the mirrored point is solid, scan along the entry
  // edge for the nearest open spot to the preserved coordinate.
  if (!freeAt(x, y)) {
    const along = (dir === 'left' || dir === 'right') ? 'y' : 'x';
    const base = along === 'y' ? y : x;
    for (let d = 1; d <= VIEW_H; d++) {
      for (const s of [base + d, base - d]) {
        const cx = along === 'x' ? s : x, cy = along === 'y' ? s : y;
        if (cx >= 0 && cx < VIEW_W && cy >= 0 && cy < VIEW_H && freeAt(cx, cy)) {
          snake.x = cx; snake.y = cy; return;
        }
      }
    }
  }
  snake.x = x; snake.y = y;
}

// ---- Doors -----------------------------------------------------------------
// A closed door Snake's probes would push into when moving to (x,y), else null.
function closedDoorBlocking(x, y, dir) {
  for (const d of activeDoors) {
    if (d.open) continue;
    const r = doorBlockRect(d);
    for (const [oy, ox] of PROBES[dir])
      if (pointInRect(r, Math.round(x + ox), Math.round(y + oy))) return d;
  }
  return null;
}
// The prison walls block by their DRAWN tiles' collision bits (the tileset CollTiles bitmap),
// not their full footprint. Snake's cell wall (type 14, columns 0x14/0x33/0x35): the RIGHT
// column 0x35 is WALKABLE — Snake steps 8px into the drawn wall and stops where ChkTouchDoor's
// open area passes (PlayerX 56 - 32 = 24 < 26; with the full 24px solid his left probe would
// park him at 64 and the punch could never connect). The other walls' tiles are fully solid
// (type 15: 0x32/0x13; types 12/13: 0x17) and their open areas extend OUTSIDE the footprint.
function doorBlockRect(d) {
  if (d.lock === 15 && d.type === 14) return { x: d.x, y: d.y, w: 16, h: 104 };
  return d.rect;
}
// PlayerDirection per facing (1=Up,2=Down,3=Left,4=Right); a door's render `type` equals the facing
// required to open it (ChkCard/ChkPunchDoor compare door type to PlayerDirection).
const DIR_TO_PD = { up: 1, down: 2, left: 3, right: 4 };

// ChkOpenDoor: may Snake open door `d` right now? Plain doors (lock 0) open on contact; keycard doors
// (lock 2..9) need the matching card selected AND Snake facing the door; lock 1 is the elevator pair
// (ChkElevatorDoor, logic/doors/opendoor.asm:51: type 5 — the floor room's door — opens pushing UP,
// type 6 — the elevator room's exit — pushing RIGHT); other locks (punch/lorry/walls) aren't supported
// yet. No door opens while under the cardboard box (PlayerAnimation 7).
function canOpenDoor(d) {
  if (snake.anim === ANIM_BOX) return false;
  // ChkDoors (enterdoor.asm:31-39): once Metal Gear is destroyed and the self-destruct is
  // running (MetalGear_KO), the CARD1 door 0x62 just before Metal Gear stays LOCKED — Snake
  // can't go back the way he came. Keyed on the door ID exactly like the ROM (cp 62h).
  if (destructionOn && d.id === 0x62) return false;
  const lock = d.lock || 0;
  if (lock === 0) return true;                                   // plain door
  if (lock === 1)                                                // ChkElevatorDoor
    return d.type === 5 ? snake.dir === 'up' : snake.dir === 'right';
  if (lock >= 2 && lock <= 9)                                    // keycard ChkCard1..8
    return selectedItem === cardItemForLock(lock) && d.type === DIR_TO_PD[snake.dir];
  if (lock === 12) {                          // ChkDesertDoorBuild2 (opendoor.asm:213-236)
    if (currentRoom === 73) return snake.dir === 'down';         // from inside: walk south
    if (doorBuild2Open) { doorBuild2Open = false; return true; } // the guards opened it
    return false;                             // (the uniform/desert-security event sets it)
  }
  if (lock === 13) {                          // ChkCompassDoor: Jennifer's radio event
    if (jeniOpenDoor) { jeniOpenDoor = false; return true; }
    return false;
  }
  if (lock === 14) {                          // ChkBigBossDoor: Metal Gear's destruction
    if (openBigBossDoor) { openBigBossDoor = false; return true; }   // (and the escape door)
    return false;
  }
  return false;       // punch locks (10/15) open from chkPunchOpenDoors; others unsupported
}
// One-shot door flags (cleared when consumed, like the ROM's xor a stores): the desert
// guards open building 2's entrance seeing the ENEMY UNIFORM (DoorBuild2LockedF), and
// Jennifer opens the compass room over the radio (JeniOpenDoorF).
let doorBuild2Open = false, jeniOpenDoor = false, openBigBossDoor = false;
// DoorOpenArray writes (0 = open): events that fling doors open PERMANENTLY by id —
// Metal Gear's death opens door 99 (+62h), Big Boss's death opens door 107 (+6Ah).
const openedDoorIds = new Set();
function forceOpenDoor(id) {
  openedDoorIds.add(id);
  const d = activeDoors.find((x) => x.id === id);
  if (d && !d.open) openDoor(d);
}

// PunchWallDirs (logic/doors/opendoor.asm:380): the facing required to punch wall render
// type 7+ (index = type - 7); 1=Up 2=Down 3=Left 4=Right.
const PUNCH_WALL_DIRS = [2, 2, 3, 4, 3, 1, 2, 3, 4, 1, 4, 4, 1, 3];

// PlayBreakableSfx goes through SetSoundEntryChk — the "Chk" means an already-playing
// instance is NOT restarted. ChkPrisonWalls hits every punching frame, so without this the
// SFX would stack into a buzz; the ROM plays it once through per contact stretch.
let wallHitUntil = 0;
function playWallHit() {
  if (!audioCtx || !assets.wallHitBuf) return;
  if (audioCtx.currentTime < wallHitUntil) return;
  wallHitUntil = audioCtx.currentTime + assets.wallHitBuf.duration;
  playBuf(assets.wallHitBuf);
}

// ChkTouchDoor (logic/doors/opendoor.asm:402): the player is "at" a door when (PlayerY -
// openAreaY) < openNY and (PlayerX - openAreaX) < openNX (unsigned) — the per-type OPEN
// area from DoorOpenEnterDat (door-types.json, finally consumed at runtime).
function touchDoor(d) {
  const t = doorTypes[String(d.type)];
  if (!t) return pointInRect(d.rect, snake.x, snake.y);
  const dy = snake.y - (d.y + t.openOffY), dx = snake.x - (d.x + t.openOffX);
  return dy >= 0 && dy < t.openNY && dx >= 0 && dx < t.openNX;
}

// The punch-opened locks, checked every play frame like the ROM's ChkDoors (CommonLogic):
// lock 10 (ChkPunchDoor, opendoor.asm:143) opens on ONE punch facing the door (render type =
// direction); lock 15 (ChkPrisonWalls :286) needs the PunchWallDirs facing and decrements the
// wall's life per punching frame — SFX 0x0A per hit (PlayBreakableSfx) — opening at 0. Door
// ID 0x0C is Grey Fox's wall (PrisonWall2Life); everything else uses PrisonWall1Life. Both
// walls start at 0x28 (Banks0123.asm:11798).
function chkPunchOpenDoors() {
  if (snake.controlMod !== CONTROL_PUNCH) return;     // PlayerControlMod must be PUNCH (1)
  for (const d of activeDoors) {
    if (d.open || d.opening) continue;
    const lock = d.lock || 0;
    if (lock !== 10 && lock !== 11 && lock !== 15 && lock !== 16) continue;
    const need = lock === 10 || lock === 11 ? d.type : PUNCH_WALL_DIRS[d.type - 7];
    if (DIR_TO_PD[snake.dir] !== need) continue;
    if (!touchDoor(d)) continue;
    if (lock === 10) { openDoor(d); d.playerOpening = true; continue; }   // ChkPunchDoor: ONE punch opens (-> freeze, #105)
    if (lock === 11 || lock === 16) { playWallHit(); continue; }  // ChkDoorLorry (PlayBreakableSfx) /
                                                      //   ChkPunchBaseWall: a punch only SOUNDS the wall;
                                                      //   these open by plastic bomb only (#103)
    const broke = d.id === 0x0C ? --prisonWall2Life <= 0 : --prisonWall1Life <= 0;
    if (broke) openDoor(d);
    else playWallHit();                               // SFX 0x0A: punching a breakable wall
  }
}

// Open SFX per render type (DoorOpenSfxs + InitOpenDoor, logic/doors/erasedoor.asm:65-88):
// types 1-4 play the door SFX 0x19, types 5/6 the ELEVATOR door SFX 0x1B, and every type
// >= 7 (the breakable/prison walls) plays "wall broken" 0x1E. Type 6 has no opening
// animation (EraseDoorDummy) and the walls erase by tile-restore — both open instantly.
function openDoor(d) {
  if (d.open || d.opening) return;       // don't replay on an opening/open door
  if (d.type >= 7) playBuf(assets.wallBrokenBuf);
  else if (d.type >= 5) playElevatorDoor();
  else playDoor();
  if (d.type === 6 || d.type >= 7) { d.open = true; return; }
  d.opening = true;
  d.openTotal = DOOR_OPEN_TICKS_BY_TYPE[d.type] || DOOR_OPEN_TICKS;
  d.openTimer = d.openTotal;
}
// Advance door animations and refresh the "was Snake inside last tick" latch.
function updateDoors() {
  for (const d of activeDoors) {
    if (d.opening && --d.openTimer <= 0) { d.opening = false; d.open = true; d.playerOpening = false; }
    d.wasInside = pointInRect(d.enterRect, snake.x, snake.y);
  }
}
// Entering an open door (rising edge into its enter zone) cuts to its destination room.
function maybeEnterDoor() {
  for (const d of activeDoors) {
    // ChkEnterDoor (enterdoor.asm:64-70): two "hidden" doors that are wired to room 204 in the
    // ROM data but explicitly NOT enterable (the disassembly's own "(?!)" doors) — 0x40 in room 6
    // and 0x6C in room 5. They start open, so Snake walks over them harmlessly; never teleport.
    if (d.id === 0x40 || d.id === 0x6C) continue;
    // ChkEnterDoor2 (enterdoor.asm:80-83): a broken wall INSIDE a room (the 0x20 logic bit; the
    // basement/building walls in rooms 58/60/63/100/108) opens a passage but does NOT teleport —
    // its destination is the same room. Let Snake walk through the opening without a room reload.
    if (d.type >= 7 && d.dest === currentRoom) continue;
    if (d.open && !d.wasInside && pointInRect(d.enterRect, snake.x, snake.y)) { enterDoor(d); return; }
  }
}
// PlayerInDoorDat (logic/nextroom.asm:463-481), copied verbatim: per door RENDER TYPE (1-19),
// how to center the player in the door — [offset Y, offset X, direction]. The offsets are
// 8-bit signed-by-wrap values (0xF8 = -8, 0xF6 = -10); direction 1=up 2=down 3=left 4=right.
const PLAYER_IN_DOOR_DAT = [
  [0x28, 0x0C, 2],
  [0xF8, 0x10, 1],
  [0x30, 0x10, 4],
  [0x30, 0xF6, 3],
  [0x28, 0x0C, 2],
  [0x00, 0x00, 0],
  [0x28, 0x10, 2],
  [0xF8, 0x10, 1],
  [0x30, 0x18, 4],
  [0x30, 0x10, 4],
  [0x30, 0xF6, 3],
  [0x28, 0x10, 2],
  [0xF8, 0x10, 1],
  [0x30, 0x18, 4],
  [0x30, 0xF8, 3],
  [0x30, 0xF6, 3],
  [0x30, 0xF6, 3],
  [0x30, 0xF6, 3],
  [0x30, 0x10, 2],
];
const PD_TO_DIR = [null, 'up', 'down', 'left', 'right'];   // PlayerDirection 1-4

// SetPlayerInDoor2..4 (logic/nextroom.asm:397-453): find the entered door ID in the destination
// room's DoorsList, then center the player on it — PlayerY/X = the door's draw YX plus the
// PlayerInDoorDat offsets for its render type (8-bit adds, so 0xF8 wraps to -8), and
// PlayerDirection comes from the same table entry. Exact and deterministic: no free-tile scan,
// no clamping — round trips land on identical pixels every time.
function enterDoor(d) {
  // The ROOF JUMP (ChkDoorDestination, nextroom.asm:106-118): room 117's edge door 0x91
  // (dest 204) is the fall — ChkParachute decides the brick-wall drift or the free fall.
  if (d.dest === 204 && currentRoom === 117) { startFall(3); return; }
  if (d.dest >= 240) { enterElevator(d.dest); return; }   // dest >= 0xF0 -> SetElevatorPosY path
  const enteredId = d.id;
  const fromElevator = currentRoom >= 240;
  setRoom(d.dest);                         // rebuilds activeDoors for the destination
  if (fromElevator) snake.controlMod = CONTROL_NORMAL;    // SetPlayerInDoor: mode 0 on leaving an elevator
  // LocatePlayerEntry (nextroom.asm:307): IdDoorEnter 0x6B (door 107, the Big Boss room <-> escape
  // ladders) routes to SetLadderRoomEntry. Entering the ladder rooms (224-226) drops Snake into
  // ladder-walk mode (mode 6, X 0xD8, Y 0x9E, facing left) — NOT generic door centring; the reverse
  // (entering room 119) falls through to normal centring, matching SetLadderRoomEntry's Room==119 branch.
  if (LADDER_ROOMS.has(d.dest)) { enterLadderRoom(); return; }
  // SetPlayerInDoor (nextroom.asm:393-395): a generic door entry resets the player to NORMAL
  // (walk) control via DisableControls + PlayerControlMod=0. Without this a special mode like
  // ladder-walk persisted into the next room — stepping from the escape ladders (224) back
  // through door 107 into Big Boss room 119 left Snake free-walking across the screen, no longer
  // climbing. Water/air-flow re-engage from the tile under Snake (chkWater/chkRoofAirFlow).
  snake.controlMod = CONTROL_NORMAL;
  snake.anim = ANIM_NORMAL;
  const dest = activeDoors.find((x) => x.id === enteredId);
  if (!dest) {
    // Divergence: the ROM's door tables always pair up; missing data here is an export bug —
    // land in the room centre rather than off-screen.
    console.warn('No matching door id', enteredId, 'in room', d.dest, '— using room centre');
    snake.x = VIEW_W / 2; snake.y = VIEW_H / 2;
    return;
  }
  const [offY, offX, pd] = PLAYER_IN_DOOR_DAT[dest.type - 1] || [0, 0, 0];
  snake.y = (dest.y + offY) & 0xFF;
  snake.x = (dest.x + offX) & 0xFF;
  if (PD_TO_DIR[pd]) snake.dir = PD_TO_DIR[pd];
  // Arrive with the destination door already open + latched so we don't bounce back.
  dest.open = true; dest.wasInside = true;
}

// ---- Boot / title sequence (logic/konamilogo.asm + logic/mainmenu.asm) ----------------------
// GS_KonamiLogo: the Konami logo on WHITE, revealed one pixel line every TWO ROM iterations
// (DrawKonamiLogo — 49 lines), then a 0x20-iteration hold (WaitCounter). Then MenuLogoLogic:
// SFX 0x47, the METAL GEAR logo drawn at the MGLogoYpos steps one per iteration WITHOUT
// erasing (the ROM's smear trail), EraseLogoRests wipes and parks it (METAL (0x20,0x20),
// GEAR (0x88,0x28)), and after 12 more iterations txtPushSpace prints. ChkAnykeyStart
// (Banks0123.asm:10617): any key before the menu skips to the parked title (DrawMenuNow +
// SFX 0x4A); on the menu only Fire 1/Fire 2 (Space/M) starts the game.
const KONAMI_LINES = 49;                 // DrawKonamiLogo line counter (0x31)
const KONAMI_XY = { x: 0x28, y: 0x40 };  // the logo buffer/screen position (FillRect 2840h)
const MG_LOGO_YPOS = [0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xB0, 0xC0]; // MGLogoYpos

// The swoop intentionally accumulates on an offscreen surface — the ROM never erases between
// scroll steps, leaving the trail. (Created lazily; absent in the headless harness.)
function titleSurface() {
  if (titleCtx) return titleCtx;
  try {
    titleCanvas = document.createElement('canvas');
    titleCanvas.width = VIEW_W;
    titleCanvas.height = VIEW_H + HUD_H;
    titleCtx = titleCanvas.getContext('2d');
  } catch (e) { titleCtx = null; }
  return titleCtx;
}
function titleClear() {
  const t = titleSurface();
  if (t) { t.fillStyle = '#000'; t.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H); }
}
function drawSwoopStep(cnt) {            // LogoScroll: METAL at (0x20,Y), GEAR at (0x88,Y+8)
  const t = titleSurface();
  if (!t) return;
  const y = MG_LOGO_YPOS[cnt - 1];
  if (metalImg) t.drawImage(metalImg, 0x20, y);
  if (gearImg) t.drawImage(gearImg, 0x88, y + 8);
}
function drawLogoParked() { drawSwoopStep(1); }   // EraseLogoRests draws at MGLogoYpos[0]

function titleTick() {
  if ((tickCounter & 1) !== 0) return;            // ROM iteration boundary
  switch (titlePhase) {
    case 'konami-reveal':                         // one line per two iterations
      if (++titleCnt >= KONAMI_LINES * 2) { titlePhase = 'konami-hold'; titleCnt = 0x20; }
      return;
    case 'konami-hold':                           // WaitCounter 0x20
      if (--titleCnt <= 0) {
        titlePhase = 'swoop'; titleCnt = 12;      // LogoSfx: MenuCnt = 0x0C
        titleClear();
        playBuf(assets.logoMoveBuf);              // SFX 0x47 "Metal Gear logo moving"
      }
      return;
    case 'swoop':                                 // LogoScroll: dec, draw at [cnt-1]
      if (--titleCnt <= 0) titlePhase = 'wipe';
      else drawSwoopStep(titleCnt);
      return;
    case 'wipe':                                  // EraseLogoRests: clear + park
      titleClear();
      drawLogoParked();
      titlePhase = 'text-wait'; titleCnt = 12;
      return;
    case 'text-wait':                             // PrintPushSpace waits MenuCnt then prints
      if (--titleCnt <= 0) titlePhase = 'ready';
      return;
    case 'ready':                                 // GS_WaitMenu: idle, then the attract demo
      if (++titleIdle >= DEMO_IDLE) startDemo();   // GS_DemoPlay
      return;
    case 'playstart':                             // GS_PlayStart: blink 0x50, then the intro
      if (--titleCnt <= 0) { titlePhase = null; startIntro(); }
      return;
  }
}

// GoToMenu + DrawMenuNow: any key during the boot skips straight to the finished title.
function titleSkip() {
  titleClear();
  drawLogoParked();
  titlePhase = 'ready';
  playBuf(assets.logoStopBuf);                    // SFX 0x4A "Metal Gear logo end"
}
// GS_PlayStart (Banks0123.asm:10270): pressing Fire on the title first blinks
// "  PLAY START" over the PUSH SPACE KEY line for 0x50 iterations (WaitCounter bit 2 =
// the draw/erase phase), with keys inert (ChkAnykeyStart only runs while GameStatus < 3);
// then GS_StartGame clears the screen and the intro scene begins.
function titleStartGame() { titlePhase = 'playstart'; titleCnt = 0x50; }

// ---- Attract / demo mode (GS_DemoPlay, logic/gamedemo.asm) ---------------------------------
// When the title idles (~256 ROM iterations — GS_WaitMenu's WaitCounter wraps 0->0xFF), the game
// plays itself: SetupDemoPlay loads a room + Snake spot and DemoControler replays a recorded
// [holdTime, control] byte stream. Control bits (ReadControls): 1 Up · 2 Down · 4 Left · 8 Right ·
// 0x10 Fire (Space) · 0x20 Fire2 (M / punch). The ROM cycles gameplay1 / radio-tutorial /
// gameplay2 / tutorial; we replay the two GAMEPLAY demos (the self-playing attract) and alternate
// between them — the radio-tutorial scenes are a documented gap. Demo data verbatim from
// data DemoGameplay1/2 (non-Japanese). Divergence: a keypress aborts back to the title (the ROM
// ignores input until the demo's 0xFF terminator); the demo also ends if Snake dies.
const DEMO_GAMEPLAY1 = [
  0x23,8, 4,0, 2,2, 0xA8,0, 0x0B,2, 0x0C,8, 5,1, 0x10,0, 0x0E,4, 6,1, 0x14,4, 0x42,0,
  0x28,8, 0x0A,0, 0x49,4, 9,2, 0x4E,0, 2,0x20, 0x0A,0, 3,0x20, 0x0A,0, 0x10,0x20, 6,2,
  0x49,4, 0x42,1, 0xFF,
];
const DEMO_GAMEPLAY2 = [
  0x1F,0, 0x3A,2, 0x0D,8, 0x10,4, 0x5E,2, 0x1A,4, 0x10,1, 0x16,4, 0x1C,1, 0x1E,0, 5,2,
  0x18,0x12, 0x12,4, 2,8, 4,8, 1,0x10, 9,8, 0xFF,
];
// The ROM cycle (DemoPlayId 1,2,3,0): gameplay1, radio-tutorial, gameplay2, radio-tutorial.
// SetDemoPlay1/2: gameplay 1 = room 5 at (0x10,0x70); gameplay 2 = room 31 at (0x70,0x28) w/ handgun.
// SetTutorialDemo: the radio screen at Big Boss's frequency, the 12-LED climb, then tutorial text 36.
const DEMO_SCENES = [
  { data: DEMO_GAMEPLAY1, room: 5,  x: 0x10, y: 0x70, weapon: 0 },
  { tutorial: true },
  { data: DEMO_GAMEPLAY2, room: 31, x: 0x70, y: 0x28, weapon: HAND_GUN },
  { tutorial: true },
];
const DEMO_IDLE = 256;        // GS_WaitMenu idle iterations before GS_DemoPlay
let demoActive = false, demoSceneIdx = 0, demoData = null, demoPtr = 0, demoHold = 0, demoPrevCtrl = 0;
let titleIdle = 0;            // idle counter while the title sits in the 'ready' phase

function applyDemoControl(ctrl) {
  held.clear();
  if (ctrl & 1) { held.add('dir:up'); pushRecency('up'); }
  if (ctrl & 2) { held.add('dir:down'); pushRecency('down'); }
  if (ctrl & 4) { held.add('dir:left'); pushRecency('left'); }
  if (ctrl & 8) { held.add('dir:right'); pushRecency('right'); }
  if (ctrl & 0x10) held.add('fire');
  const newly = ctrl & ~demoPrevCtrl;        // ControlsTrigger: bits newly pressed this iteration
  if (newly & 0x10) fireQueued = true;       // Fire edge
  if (newly & 0x20) punchQueued = true;      // Fire2 / punch edge
  demoPrevCtrl = ctrl;
}
function demoControlTick() {                  // DemoControler — one ROM iteration of replay
  if (--demoHold > 0) { applyDemoControl(demoData[demoPtr]); return; }
  const hold = demoData[demoPtr + 1];
  if (hold === 0xFF || hold === undefined) { endDemo(); return; }   // 0xFF -> EndDemoMode
  demoHold = hold; demoPtr += 2;
  applyDemoControl(demoData[demoPtr]);
}
function startDemo() {
  const s = DEMO_SCENES[demoSceneIdx % DEMO_SCENES.length];
  demoActive = true;
  // ClearGameVars_: a clean slate for the attract run.
  weapons.clear(); items.clear(); selectedItem = 0; selectedWeapon = 0;
  alertMode = false; redAlertFlag = false; transmiTaken = false; poisoned = false;
  bullets.length = 0; playerShots.length = 0;
  held.clear(); fireQueued = false; punchQueued = false;
  snake.life = snake.maxLife;
  if (s.tutorial) { startTutorialDemo(); return; }          // SetTutorialDemo (radio)
  demoData = s.data; demoPtr = 1; demoHold = demoData[0]; demoPrevCtrl = 0;
  selectedWeapon = s.weapon || 0; if (s.weapon) weapons.set(s.weapon, 30);
  gameState = 'play';
  setRoom(s.room);
  snake.x = s.x; snake.y = s.y; snake.dir = 'left';
  snake.controlMod = CONTROL_NORMAL; snake.anim = ANIM_NORMAL; snake.invulnTimer = 0;
  snake.state = 'idle';
  applyDemoControl(demoData[demoPtr]);
}
// SetTutorialDemo / GameDemoLogic (tutorial path): the radio screen tuned to Big Boss, the 12-LED
// RadioSignalUp climb, then the unskippable tutorial text 36; ends back at the title afterwards.
function startTutorialDemo() {
  gameState = 'radio';
  radioFreq = 0x85;                  // FREQ_BIGBOSS
  radioState = 2; radioLedCnt = 0; radioLedDelay = 0x10;   // RadioSignalUp + RadioLedDelay
  stopAreaMusic(); playRadioNoise();
}
function demoTutorialTick() {         // GameDemoLogic tutorial: LED climb -> text 36 -> end
  if (radioState === 2) {            // RadioSignalUp: light the 12 LEDs
    if (--radioLedDelay > 0) return;
    radioLedDelay = 2;
    if (++radioLedCnt === 12) { radioState = 4; stopRadioNoise(); setText(36, 2); }  // unskippable tutorial text
    return;
  }
  endDemo();                         // text 36 closed (back to radio) -> demo over
}
function endDemo() {
  demoActive = false;
  demoSceneIdx = (demoSceneIdx + 1) % DEMO_SCENES.length;   // SetupDemoPlay cycles the scene
  held.clear(); fireQueued = false; punchQueued = false;
  stopAreaMusic(); stopAlert(); stopBossMusic(); stopRadioNoise();
  alertMode = false; redAlertFlag = false;
  gameState = 'title'; titlePhase = 'ready'; titleIdle = 0;
  titleClear(); drawLogoParked();                          // restore the parked title screen
}

// ---- The intro scene (IntroSceneLogic, logic/introscene.asm; init Banks0123.asm:8422) -------
// Starting the game plays the ROM's scripted infiltration in room 121 (the shore below
// room 0): Snake dives in from the right (deep water at (0xC0,0xB8), 1px speed), surfaces,
// dives again toward the wall, surfaces facing the shore — then the CALL sign rings, the
// transceiver opens, the 12 LEDs climb and Big Boss delivers text 2 ("OPERATION INTRUDE
// N313"); the radio closes, Snake swims to the fence (2px), climbs it (the ladder
// animation, the ROM's scripted Y snaps through the solid fence band) and hops down the
// far side (BounceOffsets). Control then passes to the player; the death checkpoint is
// this landing spot (ChkSaveGameStatus).
let introStatus = 0, introCnt = 0, introRadio = false;
let introCheckpoint = null;                     // { x, y } — set when the intro completes
const INTRO_BOUNCE = [2, 1, 0, -2, -2, -2, -3, -5, -7, -5, -3, -2];

function startIntro() {
  setRoom(121);
  snake.x = 0xC0; snake.y = 0xB8;               // PlayerXdec/Ydec init (:8430-8433)
  snake.dir = 'left'; snake.anim = ANIM_DEEP_WATER; snake.state = 'idle';
  snake.controlMod = CONTROL_NORMAL;
  // GS_StartGame: ClearScreen + InitGame — the music starts ("set Theme of Tara music",
  // Banks0123.asm:10305) while the screen is still BLACK; the shore appears only after
  // the screen-off tileset/room load. Status -1 models that beat (~0x20 iterations).
  introStatus = -1; introCnt = 0x20; introRadio = false;
  // InitGame (Banks0123.asm:11775-11780): a fresh start carries CIGARETTES, selected
  // (Equipment slot 0 + SelectedItem + CigarsTaken/units 1). Dev-hook boots bypass this
  // like they bypass the whole intro.
  items.set(SELECTED_CIGARETTES, 1);
  selectedItem = SELECTED_CIGARETTES;
  gameState = 'intro';
  startAreaMusic();               // the game start brings up the area music (Theme of Tara)
}

// A scripted swim step (IntroSceneControls: the fed direction through the normal
// collision-checked movement).
function introMove(dir, px) {
  snake.dir = dir;
  const nx = snake.x + DELTA[dir].dx * px, ny = snake.y + DELTA[dir].dy * px;
  if (!blocked(nx, ny, dir)) { snake.x = nx; snake.y = ny; }
  snake.state = 'walk';
  // Called per ROM iteration (30Hz), not per tick — half WALK_TICKS keeps the stroke rate
  // matching the normal 60Hz walk animation.
  if (++snake.animTimer >= WALK_TICKS / 2) { snake.animTimer = 0; snake.walkPhase ^= 1; }
}

function introTick() {
  // The first keypress (the title's Space) only STARTS the async audio unlock — the music
  // buffer may decode a moment into the swim, so the early states retry until it plays.
  if (introStatus <= 3) startAreaMusic();
  switch (introStatus) {
    case -1:                                    // GS_StartGame's black beat (music playing)
      if (--introCnt <= 0) { introStatus = 0; introCnt = 0x40; }
      return;
    case 0:                                     // IntroScene1: dive left
      if (--introCnt <= 0) { snake.anim = ANIM_WATER; snake.dir = 'up'; snake.state = 'idle';
                             introCnt = 0x30; introStatus = 1; return; }
      introMove('left', 1);
      return;
    case 1:                                     // IntroScene2: float, then submerge
      if (--introCnt <= 0) { snake.anim = ANIM_DEEP_WATER; snake.dir = 'left';
                             introCnt = 0x50; introStatus = 2; }
      return;
    case 2:                                     // IntroScene3: dive left
      if (--introCnt <= 0) { introCnt = 0x20; introStatus = 3; return; }
      introMove('left', 1);
      return;
    case 3:                                     // IntroScene4: dive north, then emerge facing right
      if (--introCnt <= 0) { snake.anim = ANIM_WATER; snake.dir = 'right'; snake.state = 'idle';
                             introCnt = 0x40; introStatus = 4; return; }
      introMove('up', 1);
      return;
    case 4:                                     // IntroScene5: the incoming call mid-wait
      // DrawCallTimer (logic/hud.asm:39-45): the CALL blink + ring SFX run off TickCounter
      // (introTick is already on the iteration boundary).
      callTickCounter = (callTickCounter + 1) & 0xff;
      if (radioCallFlag === 1 && (callTickCounter & 15) === 0) playCallRing();
      if (--introCnt <= 0) {                    // 5b: answer — the radio screen opens
        stopCallRing();
        stopAreaMusic();                        // IntroScene5b: 0x59 + RestoreSoundData —
        radioCallFlag = 2;                      // the music pauses for the radio noise
        introRadio = true;
        radioState = 2; radioLedCnt = 0; radioLedDelay = 0x10;
        playRadioNoise();
        introStatus = 5;
        return;
      }
      if (introCnt === 0x20) {                  // IntroScene5: flag + an IMMEDIATE first ring
        radioCallFlag = 1;                      // (`jp SetSoundEntry__` with 0x22) — the
        playCallRing();                         // DrawCallTimer cadence adds the re-rings
      }
      return;
    case 5:                                     // IntroScene6: RadioSignalUp (iteration-paced)
      if (--radioLedDelay <= 0) {
        radioLedDelay = 2;
        if (++radioLedCnt === 12) introStatus = 6;
      }
      return;
    case 6:                                     // IntroScene7: the briefing
      stopRadioNoise();                         // SFX 0x5C mutes the noise for the text
      introStatus = 7;
      setText(2);                               // THIS IS BIG BOSS... OPERATION INTRUDE N313
      return;
    case 7:                                     // IntroScene8: exit the radio
      introRadio = false;
      radioState = 1; radioLedCnt = 0;
      startAreaMusic();                         // ExitRadio: RestoreSoundData resumes the music
      introCnt = 0x28; introStatus = 8;
      return;
    case 8:                                     // IntroScene9: swim right (speed now 0x200)
      if (--introCnt <= 0) { introCnt = 0x30; introStatus = 9; return; }
      introMove('right', 2);
      return;
    case 9:                                     // IntroScene10: swim up to the fence
      if (--introCnt <= 0) {                    // 10b: snap to the fence base, start climbing
        snake.y = 0x88;
        snake.anim = ANIM_LADDER; snake.dir = 'up'; snake.state = 'idle';
        introCnt = 0x1C; introStatus = 10;
        return;
      }
      introMove('up', 2);
      return;
    case 10:                                    // IntroScene11: climb (speed 0x188 ≈ 1.5px)
      if (--introCnt <= 0) {                    // 11b: over the top
        snake.y = 0x66;
        snake.anim = ANIM_NORMAL; snake.dir = 'up'; snake.state = 'idle';
        introCnt = 0x0C; introStatus = 11;
        return;
      }
      snake.dir = 'up';
      snake.y -= 1.5;                           // the ROM 0x0188 climb speed, per iteration
      snake.state = 'walk';
      if (++snake.animTimer >= WALK_TICKS / 2) { snake.animTimer = 0; snake.walkPhase ^= 1; }
      return;
    case 11:                                    // IntroScene12: the landing hop
      if (--introCnt <= 0) { introStatus = 12; return; }
      if (introCnt & 1) snake.y += INTRO_BOUNCE[introCnt];
      snake.state = 'idle'; snake.dir = 'up';
      return;
    case 12:                                    // IntroScene13 + ChkSaveGameStatus: control mode 0,
      introCheckpoint = { x: snake.x, y: snake.y };   // the landing spot is the death checkpoint
      punchQueued = false; fireQueued = false;  // drop any latches pressed during the script
      gameState = 'play';
      chkSaveGameStatus(currentRoom);           // IntroScene13 calls ChkSaveGameStatus: the landing
      takePendingCheckpoint();                  // pair (room 121, previousRoom 0) arms + stores it
      return;
  }
}

function drawTitle() {
  if (titlePhase === 'konami-reveal' || titlePhase === 'konami-hold') {
    ctx.fillStyle = '#fff';                       // InitKonamiLogo: white backdrop
    ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
    const lines = titlePhase === 'konami-hold' ? KONAMI_LINES
                                               : Math.min(KONAMI_LINES, titleCnt >> 1);
    if (konamiLogoImg && lines > 0)
      ctx.drawImage(konamiLogoImg, 0, 0, konamiLogoImg.width, lines,
                    KONAMI_XY.x, KONAMI_XY.y, konamiLogoImg.width, lines);
    return;
  }
  ctx.fillStyle = '#000';                         // LoadIntroGfx: black backdrop
  ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
  if (titleCanvas) ctx.drawImage(titleCanvas, 0, 0);
  if (titlePhase === 'ready') {                   // txtPushSpace (logic/mainmenu.asm:170)
    drawText(String.fromCharCode(0x3A), 0x4E, 0x60);   // the (C) glyph
    drawText('KONAMI 1987', 0x58, 0x60);
    drawText('PUSH SPACE KEY', 0x48, 0x88);
  } else if (titlePhase === 'playstart') {        // GS_PlayStart: txtPlayStart "  PLAY START"
    drawText(String.fromCharCode(0x3A), 0x4E, 0x60);   // at (0x48,0x88), replacing PUSH SPACE
    drawText('KONAMI 1987', 0x58, 0x60);               // KEY; visible while bit 2 is clear
    if ((titleCnt & 4) === 0) drawText('PLAY START', 0x58, 0x88);
  }
}

// PrintGameOver (Banks0123.asm:10458): ClearScreen + GAME OVER / CONTINUE F5. The ROM coords are
// txtGameOver (0x58,0x58) and txtContinue (0x50,0x70) (data/hudstartendtexts.asm). "CONTINUE F5"
// is erased (ChkContinueKey) once F5 arms the continue. (#35)
function drawGameOver() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
  drawText('GAME  OVER', 0x58, 0x58);
  if (!continueArmed) drawText('CONTINUE  F5', 0x50, 0x70);
}

// ---- Laser beams (InitLaserRoom / ChkTouchLaser / DrawLaserBeams / DrawMovingLasers) --------
// Rooms 24/25/72 carry beam tables (LasersRoom*, data/laserconfig.asm). The beams are
// INVISIBLE unless the infrared goggles are the selected item (DrawLaserBeams,
// logic/drawlaserbeams.asm:8-14); crossing one — seen or unseen — raises the RED alert
// (SetAlertMode5 treats ID_LASER like cameras) and burns the room's beams away
// (TouchLaserAlarm + RemoveLaserBeans); none spawn during an alert (Banks0123.asm:5654).
// Axis semantics follow ChkTouchLaser's MATH (the asm comments are swapped): axis 0 = a
// column at X spanning Y+8..Y+8+len; axis 1 = a row at Y spanning X..X+len.

// InitLaserRoom (Banks0123.asm:5653): build the room's beams; none in alert mode.
function buildLasers(n) {
  const t = lasersData && lasersData[n];
  lasers = (!t || alertMode) ? [] : t.map((b) => ({ ...b }));
}

// ChkTouchLaser (logic/laserbeams.asm): ON beams only; the ROM's exact inequalities.
function chkTouchLasers() {
  for (const b of lasers) {
    if (!(b.on & 1)) continue;
    const half = b.len >> 1;
    const hit = b.axis === 0
      ? Math.abs(snake.x - b.x) < 4 && Math.abs(b.y + 8 + half - snake.y) < half
      : Math.abs(snake.y - b.y) < 4 && Math.abs(b.x + half - snake.x) < half;
    if (!hit) continue;
    raiseAlarm(currentRoom, true, 0x5A);   // TouchLaserAlarm: `ld a,5Ah` -> RED alert music + reinforcements
    lasers = [];                       // RemoveLaserBeans: every beam in the room dismissed
    return;
  }
}

// DrawMovingLasers (Banks0123.asm:5785): room 72 ONLY, goggles selected ONLY — the cycle
// itself pauses when not watching. 0xC0 iterations per step through the five LasersOnOff
// patterns; LaserRoomCnt persists across rooms (reset at game init, :11527).
function movingLasersTick() {
  if (currentRoom !== 72 || selectedItem !== SELECTED_GOGGLES) return;
  if (++laserRoomTimer < 0xC0) return;
  laserRoomTimer = 0;
  laserRoomCnt = (laserRoomCnt + 1) % 5;
  const seq = lasersData && lasersData.seq && lasersData.seq[laserRoomCnt];
  if (seq) lasers.forEach((b, i) => { b.on = seq[i] || 0; });
}

// DrawLaserBeams: only while the goggles are selected and no alert (the same gate the ROM
// uses). The beam is the ROM's exact VDP LINE — 1px in the laser red (palette 8 = 70h/0),
// drawn from the beam's (X, Y) for `len` pixels (DrawLineVert/DrawLineHoriz: N = len-1, no
// offset — the +8 in ChkTouchLaser is the COLLISION band only, where PlayerY is the foot
// origin).
function drawLasers() {
  if (selectedItem !== SELECTED_GOGGLES || alertMode) return;
  ctx.fillStyle = '#ff0000';
  for (const b of lasers) {
    if (!(b.on & 1)) continue;
    if (b.axis === 0) ctx.fillRect(b.x, b.y, 1, b.len);
    else ctx.fillRect(b.x, b.y, b.len, 1);
  }
}

// ---- Cameras (InitCamera / CameraLogic / LaserCameraLogic — logic/actors/camera.asm) --------
// Surveillance cameras (ID_CAMERA, rooms 14/21/27/28/31/36): patrol their ROM path points,
// look through ChkSeePlayer from the lens offset (CameraDrawOffsets), and on sighting Snake
// flash red for 0x20 iterations while the RED alert rises (SetAlertMode5); during an alert
// they freeze (CamameraMove -> RenderCamera). Laser cameras (ID_CAMERA_LASER, rooms
// 111/115/118/149): ceiling-mounted, patrol on X, and when Snake passes underneath
// (PlayerY >= camY, |playerX - camX| <= 4) they stop and fire a laser shot straight down
// (SFX 4); while he stays within 0x60 they shadow his X (CameraChkContinue), else resume.
const CAMERA_DIRS = ['up', 'down', 'left', 'right'];          // BASE_SPR_ID 0-3
const CAMERA_EYE = [[-0x0C, 0], [0x2B, 0], [0, -0x11], [0, 0x10]];   // CameraDrawOffsets (dy,dx)

function buildCameras(n) {
  let list = (camerasData && camerasData[n]) || [];
  // InitCameraLaser (camera.asm:7-14): in room 118, once Metal Gear is destroyed (MetalGear_KO)
  // the laser cameras are DismissActor0'd — they don't re-init on re-entry and never fire again.
  if (n === 118 && mgDestroyed) list = list.filter((c) => !c.laser);
  cameras = list.map((c, i) => ({
    x: c.x, y: c.y, dir: c.dir, laser: c.laser, path: c.path,
    idx: i,                                        // IDX_SAME_ID - 1 (checkpoint table index)
    pt: 0, moving: true, wait: 0,                  // InitCamera: Moving=1, Wait=random (R reg)
    status: 0, flashCnt: 0, laserWait: 0,          // 0=move/scan, 1=flash, 2=frozen
    koLatch: false,                                // KO_POINTER_H: paused at a checkpoint
  }));
  laserShots = [];
}

// The laser cameras' checkpoint Xs (the data tucked after LaserCameraShot9,
// camera.asm:400-403, indexed by IDX_SAME_ID): the camera pauses momentarily when its
// patrol crosses these columns while the player is near.
const LASER_CAM_CHECKPOINTS = [[0x10, 0x58], [0xC0, 0xF0]];

function cameraTick() {
  for (const c of cameras) {
    if (c.laser) { laserCameraTick(c); continue; }    // LaserCameraLogic has NO alert freeze
    if (c.status === 1) {                             // CamAlertAnim: 0x20 iterations of red
      if (--c.flashCnt <= 0) c.status = 2;            // then frozen (RenderCamera)
      continue;
    }
    if (c.status === 2) continue;
    if (alertMode) continue;                          // CamameraMove: no movement in alert
    camPatrol(c);
    // TOUCHING the camera body (shape-8 box, ActorTouchDamage[ID_CAMERA-1] = 0x10) zaps
    // Snake AND raises the alarm (ChkSeePlayer's TOUCH_INFO bit-7 branch) — the near-wall
    // "blind spot" of the lens never applies to contact (user-reported).
    if (Math.abs(snake.y - c.y) < 8 && Math.abs(snake.x - c.x) < 12) {
      if (snake.invulnTimer === 0) damage(0x10);
      c.status = 1; c.flashCnt = 0x20; c.moving = false;
      raiseAlarm(currentRoom, true, 0x28);                 // camera: 0x28 — the surveillance centre calls guards
      continue;
    }
    const eye = CAMERA_EYE[c.dir];
    const seer = { x: c.x + eye[1], y: c.y + eye[0], dir: CAMERA_DIRS[c.dir], touched: false };
    if (camSees(seer)) {
      c.status = 1; c.flashCnt = 0x20; c.moving = false;   // stop + colour animation
      raiseAlarm(currentRoom, true, 0x28);                 // camera forces RED + 0x28 reinforcements (ChkViewObstacles)
    }
  }
  laserShotsTick();
}

// The shared patrol step (GetPathPoint/SetDirToPoint/ChkReachPoint): 1px toward the current
// path point; on arrival wait a pseudo-random 0-127 iterations (SetCamRndWait halves the R
// register for cameras: ld a,r / srl a / inc a if zero).
function camPatrol(c) {
  if (!c.moving) {
    if (--c.wait > 0) return;
    c.moving = true;
    c.pt = (c.pt + 1) % c.path.length;
  }
  const p = c.path[c.pt];
  c.x += Math.sign(p.x - c.x);
  c.y += Math.sign(p.y - c.y);
  if (c.x === p.x && c.y === p.y) {
    // The LASER cameras sweep back and forth NONSTOP (their path entries carry no
    // stop — ChkReachPoint -> UpdateActorPath just turns them around).
    if (c.laser) { c.pt = (c.pt + 1) % c.path.length; return; }
    c.moving = false;
    c.wait = ((Math.random() * 128) | 0) || 1;        // SetCamRndWait: (ld a,r / srl a) = R>>1, min 1 (inc a if zero)
  }
}

// ChkSeePlayer from the camera lens — same rules, but a camera's horizontal sight band is the
// narrower 4 (ChkViewHorizontal's ID_CAMERA branch) and a camera can't be touched.
function camSees(seer) {
  if (!losGates()) return false;
  return losDirectional(seer, LOS_BAND_LR_CAM);
}

// LaserCameraMove / LaserCameraShot (camera.asm:265-395).
function laserCameraTick(c) {
  const inRange = snake.y >= c.y && snake.x - 4 < c.x && snake.x + 4 >= c.x;   // LaserCamChkShot
  if (c.status === 0) {
    camPatrol(c);
    if (inRange) {                                    // detected: stop and fire
      c.status = 1;
      c.laserWait = 0x20;                             // LASER_WAIT before firing again
      c.moving = false;
      fireLaserShot(c);
    }
    return;
  }
  // Status 1 (LaserCameraShot): the camera KEEPS PATROLLING its own path while the player
  // is near — CameraChkContinue moves toward ACTOR.DestinationX (the path point, NOT the
  // player) — pausing while the shot timer runs, momentarily at its checkpoint columns
  // (KO_POINTER_H), and while the player stands exactly underneath; refiring whenever he
  // passes under. Only |dx| >= 0x60 re-inits the path (InitCamera3) back to normal patrol.
  if (c.laserWait > 0 && --c.laserWait > 0) return;
  if (inRange) { c.laserWait = 0x20; fireLaserShot(c); return; }   // fires again
  if (Math.abs(snake.x - c.x) >= 0x60) {              // out of reach: path re-init + patrol
    c.status = 0; c.moving = true; c.pt = 0;
    return;
  }
  const cps = LASER_CAM_CHECKPOINTS[c.idx & 1];
  if (!c.koLatch && (c.x === cps[0] || c.x === cps[1])) { c.koLatch = true; return; }
  if (snake.x === c.x) return;                        // CameraChkContinue: hold under the player
  c.koLatch = false;
  const p = c.path[c.pt];                             // 1px toward the path point (ChkReachPoint)
  c.x += Math.sign(p.x - c.x);
  c.y += Math.sign(p.y - c.y);
  if (c.x === p.x && c.y === p.y) c.pt = (c.pt + 1) % c.path.length;
}

// InitLaserShot (logic/actors/lasershot.asm): SpriteId 0x61 (SprLaser, a 1px column),
// growing one 16px segment per iteration to 11 segments — 3 in room 111, whose lasers are
// shorter (NumSprites=3) — then shrinking away. SFX 4.
function fireLaserShot(c) {
  laserShots.push({ x: c.x, y: c.y, segs: 0, max: currentRoom === 111 ? 3 : 11, phase: 0 });
  playBuf(assets.laserBuf);
}

function laserShotsTick() {
  for (const sh of laserShots) {
    if (sh.phase === 0) { if (++sh.segs >= sh.max) sh.phase = 1; }   // LaserIncrease
    else if (--sh.segs <= 0) { sh.dead = true; continue; }           // LaserDecrease
    // ChkLaserShot (logic/damagelaser.asm): |playerX - shotX| < 8, then the LaserLenghts
    // span (centre = shotY + half, half = table[grown-1] * 8; room 111 caps at 7).
    if (Math.abs(snake.x - sh.x) >= 8) continue;
    let g = sh.segs;
    if (currentRoom === 111 && g >= 8) g = 7;
    const half = LASER_LENGTHS[Math.min(g, LASER_LENGTHS.length) - 1] * 8;
    if (Math.abs(sh.y + half - snake.y) < half) damage(LASER_SHOT_DAMAGE);
  }
  laserShots = laserShots.filter((sh) => !sh.dead);
}
const LASER_LENGTHS = [1, 1, 2, 3, 4, 5, 6, 7, 8, 9];   // LaserLenghts (damagelaser.asm:72)
const LASER_SHOT_DAMAGE = 0x10;   // ActorTouchDamage[ID_LASER_SHOT-1] (data/shapes.asm:39)

function drawCameras() {
  if (!cameraImg) return;
  for (const c of cameras) {
    // CamAlertAnim alternates the normal colour and red on bit 2 of the countdown.
    const red = c.status === 1 && (c.flashCnt & 4) !== 0;
    ctx.drawImage(cameraImg, c.dir * 16, red ? 16 : 0, 16, 16,
                  Math.round(c.x - 8), Math.round(c.y - 8), 16, 16);
  }
  ctx.fillStyle = '#ff0000';
  // SprLaser decodes to a 2px column through the sprite centre (rows of 0x01|0x80 — pixels
  // at cell x 7 and 8), one 16px-tall sprite per segment, centred on the camera's X.
  // The CameraLaser attr rows hang the segments at offY +8..+0x8F BELOW the shot actor —
  // the beam starts at the camera's BOTTOM EDGE, not its centre, and reaches at most
  // 0x8F+16 px down.
  for (const sh of laserShots)
    if (sh.segs > 0) ctx.fillRect(sh.x - 1, sh.y + 8, 2, Math.min(sh.segs * 16, 0x8F + 16 - 8));
}

// ---- The capture flow (GAME_MODE_CAPTURED — logic/common.asm:26 + logic/capturescene.asm) ---
// Once per game (EquipBagTaken), standing in room 8 at X 0xC0-0xD0 triggers the scripted
// scene: guard A appears beside Snake ("DON'T MOVE!", text 6, unskippable), guard B marches
// in fast and homes onto Snake's row ("YOU ARE CAPTURED", text 7), the music mutes, the
// screen fades to black (FadeOutLogic), and PutInPrison drops Snake in cell room 165 with
// his equipment flagged removed.

// The trigger (CommonLogic :26-47), checked in the play frame after the item pickups.
function chkCaptured() {
  if (equipBagTaken || currentRoom !== 8) return;
  if (snake.x < 0xC0 || snake.x >= 0xD0) return;
  gameState = 'capture';
  captureStatus = 0;
  captureTimer = 2;                                 // guard A's InitCaptureScene wait
  captureFade = 0;
  captureGuards = [];
  stopAlert();
}

// One scene iteration (CaptureSceneLogic + CaptureGuardsLogic merged, ROM-iteration paced).
function captureTick() {
  if ((tickCounter & 1) !== 0) return;
  const b = captureGuards[1];
  switch (captureStatus) {
    case 0:                                         // AddCaptureGuard: guard A beside Snake
      captureGuards.push({ x: 0xF0, y: snake.y, dir: 'left', walk: false, phase: 0 });
      captureStatus = 1;
      return;
    case 1:                                         // CaptureDelay then "DON'T MOVE!" + guard B
      if (--captureTimer > 0) return;
      setText(6, 2);                                // TEXT: DON'T MOVE! (SetTextUnskippable)
      captureGuards.push({                          // AddCaptureGuardB: below, or above past Y 0x98
        x: 0xF0, y: snake.y < 0x98 ? 0xB0 : 0x88, dir: 'left', walk: true, phase: 0,
      });
      captureStatus = 2;
      return;
    case 2:                                         // CaptureGuardBX: walk left fast to X 0xB8
      b.x -= 2;                                     // SetWalkSpeedFast
      animateCaptureGuard(b);
      if (b.x > 0xB8) return;
      b.x = 0xB8;
      b.dir = b.y === 0x88 ? 'down' : 'up';         // turn toward Snake's row
      captureStatus = 3;
      return;
    case 3:                                         // CaptureGuardBY: close onto Snake's (even) Y
      b.y += b.dir === 'down' ? 2 : -2;
      animateCaptureGuard(b);
      if (b.y !== (snake.y & 0xFE)) return;
      // SpriteId 0x0B = GuardRight (idxSprites, data/actorspriteattr.asm:148 — the
      // capturescene.asm comment says "left" but the table is authoritative): guard B
      // stops on Snake's LEFT (X 0xB8) and faces RIGHT, toward him.
      b.dir = 'right';
      b.walk = false;
      captureTimer = 2;
      captureStatus = 4;
      return;
    case 4:                                         // CaptureGuardBSpeak: "YOU ARE CAPTURED"
      if (--captureTimer > 0) return;
      setText(7, 2);
      captureTimer = 0x1E;
      captureStatus = 5;
      return;
    case 5:                                         // CaptureWaitText then CaptureSetup (mute)
      if (--captureTimer > 0) return;
      stopAlert();
      stopCallRing();
      captureTimer = 0x3C;
      captureStatus = 6;
      return;
    case 6:                                         // CaptureWait
      if (--captureTimer > 0) return;
      captureStatus = 7;
      return;
    case 7:                                         // CaptureFadeOut: 3-bit palette steps -> black.
      // FadeOutColors steps only when TickCounter & 3 == 0 (Banks0123.asm:11707-11709) —
      // one of every FOUR iterations, so the full fade takes ~28 iterations (~0.9s), not 7.
      if ((tickCounter & 7) !== 0) return;          // captureTick runs on even ticks: &7 = every 4th iteration
      if (++captureFade < 7) return;
      captureTimer = 0x10;
      captureStatus = 8;
      return;
    case 8:                                         // PutInPrison after the post-fade wait
      if (--captureTimer > 0) return;
      putInPrison();
      return;
  }
}
function animateCaptureGuard(g) {
  g.animTimer = (g.animTimer || 0) + 1;
  if (g.animTimer >= GUARD_WALK_TICKS / 2) { g.animTimer = 0; g.phase ^= 1; }   // fast walk
}

// PutInPrison (logic/capturescene.asm:87): equipment flagged removed (the ARRAYS keep their
// contents — the bag restores by clearing the flag), selections zeroed, alert killed, Snake
// at (0x80, 0x50) in cell room 165.
function putInPrison() {
  equipRemoved = true;
  selectedWeapon = 0;
  selectedItem = 0;
  alertMode = false; redAlertFlag = false; redAlertMusic = false; roomAlert = -1;
  stopAlert();
  captureGuards = [];
  captureFade = 0;
  setRoom(165);
  snake.x = 0x80; snake.y = 0x50;
  snake.dir = 'down'; snake.state = 'idle'; snake.controlMod = CONTROL_NORMAL;
  gameState = 'play';
}

// RecoverEquipment (logic/items.asm:295): the equipment bag (pickup 34, room 168) clears the
// flag, latches the scene off, and APPENDS THE TRANSMITTER — the bag is bugged: the alarm
// never ends while TransmiTaken is set (ChkAlarmEnd, Banks0123.asm:6636), until the player
// drops it from the equipment menu.
function recoverEquipment() {
  equipRemoved = false;
  equipBagTaken = true;
  items.set(SELECTED_TRANSMITTER, 1);               // AddTransmitter (1 unit)
  transmiTaken = true;
}

// Draw the scripted capture guards (guard sheet left/vertical frames) + the fade overlay.
function drawCaptureGuards() {
  if (!guardSheet || !guardAtlas) return;
  for (const g of captureGuards) {
    const key = g.walk ? (g.dir + (g.phase ? '-walk2' : '-walk1')) : (g.dir + '-idle');
    const f = guardAtlas.frames[key] || guardAtlas.frames['left-idle'];
    if (!f) continue;
    ctx.drawImage(guardSheet, f.x, f.y, guardAtlas.frameWidth, guardAtlas.frameHeight,
                  Math.round(g.x - guardAtlas.anchorX), Math.round(g.y - guardAtlas.anchorY),
                  guardAtlas.frameWidth, guardAtlas.frameHeight);
  }
}
function drawCaptureFade() {
  if (captureFade <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, captureFade / 7) + ')';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
}

// ---- Elevators (logic/nextroom.asm + logic/elevatorroom.asm + Banks0123.asm) ----------------
// A floor room reaches its elevator through a type-5 door (dest >= 0xF0); the elevator room's
// floor exits are invisible type-6 doors at X 0xE0 — paired by door ID (data/doors.asm; see
// docs/rom-data-formats.md "Elevators"). Riding: stand in the cabin, hold up/down.

// Entering an elevator room by door (SetDoorDestination -> SetElevatorPosY, logic/nextroom.asm:
// 152-193): the player parks at (0xD8, the entry floor's player Y) and the cabin at (0x70, the
// floor's elevator Y), from the elevator data for the room being left; movement limits load
// (GetElevatorRoomDat); then SetElevatorCtrl (:374): control mode 2, facing left.
function enterElevator(room) {
  const prev = currentRoom;
  setRoom(room);
  const ed = elevatorsData ? elevatorsData[room] : null;
  const fl = ed ? ed.floors.find((f) => f.room === prev) : null;
  elevatorLimitUp = ed ? ed.up : 0x38;
  elevatorLimitDown = ed ? ed.down : 0xB8;
  elevatorY = fl ? fl.elevY : elevatorLimitDown;
  elevatorX = 0x70;
  snake.x = 0xD8;
  snake.y = fl ? fl.playerY : elevatorLimitDown - 4;
  snake.dir = 'left';
  snake.state = 'idle';
  snake.anim = ANIM_NORMAL;
  snake.controlMod = CONTROL_ELEVATOR;
}

// ElevatorCtrl (control mode 2, Banks0123.asm:8541): check the ride start, else walk
// horizontally only — left clamp at X 104 (ChkLimitXElevator :9448; the right side is
// intercepted by the type-6 floor doors at X 0xE0 — room 240 has no connections for the
// ROM's X>=244 ExitRoom, so the clamp at 243 stands in for that undefined exit).
function elevatorControl() {
  punchQueued = false; fireQueued = false;     // no punching/shooting in the elevator room
  chkCtrlElevator();
  if (gameState === 'elevator') { snake.state = 'idle'; return; }   // riding: stand still
  const dir = currentDir();
  if (dir !== 'left' && dir !== 'right') { snake.state = 'idle'; return; }
  snake.dir = dir;
  const nx = snake.x + (dir === 'right' ? SPEED : -SPEED);
  const closed = closedDoorBlocking(nx, snake.y, dir);
  if (closed) {
    if (canOpenDoor(closed)) openDoor(closed);
  } else {
    snake.x = Math.max(104, Math.min(243, nx));
    maybeEnterDoor();                          // through a floor door -> back to the floor room
    if (snake.controlMod !== CONTROL_ELEVATOR) return;
  }
  snake.state = 'walk';
  if (++snake.animTimer >= WALK_TICKS) { snake.animTimer = 0; snake.walkPhase ^= 1; }
}

// ChkCtrlElevator (Banks0123.asm:9082): standing inside the cabin (X < 0x78) and holding an
// allowed direction starts the ride toward that limit. Direction masks per room: 240-242 and
// >= 247 move both ways, 243-244 up only, 245-246 down only.
function chkCtrlElevator() {
  if (snake.x >= 0x78) return;
  let mask = 3;
  if (currentRoom >= 243 && currentRoom < 245) mask = 1;
  else if (currentRoom >= 245 && currentRoom < 247) mask = 2;
  const dir = currentDir();
  const up = dir === 'up' && (mask & 1) !== 0;
  const down = dir === 'down' && (mask & 2) !== 0;
  if (!up && !down) return;
  if (elevatorY === (up ? elevatorLimitUp : elevatorLimitDown)) return;   // already there
  elevatorDir = up ? 1 : 2;
  elevatorStatus = 0;
  gameState = 'elevator';                      // GAME_MODE_ELEVATOR (6)
}

// The moving elevator (GameMode 6 — ElevatorRoomLogic, logic/elevatorroom.asm), one step per
// ROM iteration: status 0 moves cabin + player 1px and checks the floor stops (Y 0x38/0x78/
// 0xB8; the express shafts skip stops while the direction stays held — the per-room quirks
// are ported verbatim) and the shaft ends (Y < 24 / >= 208); status 1 = floor reached
// (control returns, the held left/right becomes the facing); status 2 = exit into the next
// elevator room of the shaft.
function elevatorTick() {
  if ((tickCounter & 1) !== 0) return;         // ROM iteration boundary
  if (elevatorStatus === 1) {                  // floor reached
    gameState = 'play';
    const d = currentDir();
    if (d === 'left' || d === 'right') snake.dir = d;
    return;
  }
  if (elevatorStatus >= 2) { elevatorShaftExit(); return; }

  const up = elevatorDir === 1;
  elevatorY += up ? -1 : 1;
  snake.y += up ? -1 : 1;
  if (up ? elevatorY < 24 : elevatorY >= 208) { elevatorStatus = 2; return; }
  const held = currentDir();
  if (up) {                                    // MoveElevator's up path
    if (currentRoom >= 248 && currentRoom <= 250 && held === 'up') return;   // ChkDoNotStop
    if (elevatorY === 0x38) { elevatorStatus = 1; return; }
    if (currentRoom === 247 && held === 'up') return;
    if (elevatorY === 0x78 || elevatorY === 0xB8) elevatorStatus = 1;
  } else {                                     // ElevatorDown
    if (currentRoom >= 247 && currentRoom <= 249 && held === 'down') return; // ChkDoNotStop2
    if (elevatorY === 0xB8) { elevatorStatus = 1; return; }
    if (currentRoom === 250 && held === 'up') return;          // ElevatorDown3 room 0xFA: `rra` tests the Up bit (#99)
    if (elevatorY === 0x78 || elevatorY === 0x38) elevatorStatus = 1;
  }
}

// Leaving the shaft (ElevatorNextRoom -> NextRoomLogic -> SetNextRoomElev, logic/nextroom.asm:
// 64-97): the connection in the ride direction is the next elevator room; arriving going UP
// parks the cabin at the bottom (0xD0), going DOWN at the top (0x18), player Y = cabin Y - 4,
// limits reloaded, and the ride continues. No cluster shaft spans rooms — if the neighbour
// isn't exported, stop in place instead of cutting to a missing room.
function elevatorShaftExit() {
  const c = connections[String(currentRoom)];
  const next = c ? c[elevatorDir === 1 ? 'up' : 'down'] : null;
  if (next == null || !rooms.has(next)) { elevatorStatus = 1; return; }
  setRoom(next);
  const ed = elevatorsData ? elevatorsData[next] : null;
  elevatorLimitUp = ed ? ed.up : 0x38;
  elevatorLimitDown = ed ? ed.down : 0xB8;
  elevatorY = elevatorDir === 1 ? 0xD0 : 0x18;
  snake.y = elevatorY - 4;
  elevatorStatus = 0;
}

// Draw the cabin (SetElevatorSpr: 12 sprites anchored at ElevatorY/X) in elevator rooms.
function drawElevator() {
  if (!elevatorsData || !elevatorsData[currentRoom]) return;
  if (!elevatorImg || !elevatorMeta) return;
  ctx.drawImage(elevatorImg, elevatorX - elevatorMeta.anchorX, elevatorY - elevatorMeta.anchorY);
}

// ---- Incoming radio call (ChkIncomingCall, logic/incomingcall.asm) -------------------------
// The call life cycle, run from the play tick like PlayModeLogic (Banks0123.asm:12162) does.
// Verbatim port including the start-of-ring fall-through: when the pending countdown hits 0 the
// timer is set to 0x58 and the SAME iteration already decrements it, so the ring lasts 0x57.
//
// PACING — ROM iterations vs our 60Hz ticks: on the MSX, UpdateSound runs on EVERY 60Hz VDP
// interrupt, but the game logic (GameStatusLogic, which increments TickCounter) is SKIPPED
// while the previous iteration is still in progress (TickInProgress, Banks0123.asm:456-463).
// During gameplay an iteration spans two frames, so TickCounter-paced logic effectively runs
// at ~30Hz on real hardware while the SFX engine keeps true 60Hz time. This port ticks update()
// at a fixed 60Hz, so the call system advances on every OTHER tick (callTickCounter counts ROM
// iterations) — keeping the ROM's constants (32 pending, 0x58 ring, bit-3 blink, mod-16 SFX)
// at the cadence the player actually hears/sees: the 0.31s ring burst re-rings every ~0.53s
// with silence between ("ring… ring… ring…"), not a continuous beep.
//
// The ring SFX lives here rather than in the HUD draw: DrawCallTimer (logic/hud.asm:39-45)
// fires SFX 0x22 when TickCounter ≡ 0 (mod 16) — bit 3 clear (visible blink phase) and the low
// three bits zero — a pure function of the tick counter, moved off the render path so a frame
// that draws less often than it ticks misses no beat. Menus pause the tick, so the ring and
// cycle pause there exactly like the ROM (GameMode 2/3 never reaches PlayModeLogic).
function chkIncomingCall() {
  if ((tickCounter & 1) !== 0) return;            // ROM iteration boundary (every other 60Hz tick)
  callTickCounter = (callTickCounter + 1) & 0xff;
  if (incomingCallTimer === 0) return;            // incoming call not in progress
  if (radioCallFlag === 2) return;                // stop incoming call
  if (radioCallFlag === 0) {                      // pending: delay before the call starts
    if (--incomingCallTimer !== 0) return;
    incomingCallTimer = 0x58;                     // set incoming call timer
    radioCallFlag = 1;                            // start incoming call (falls through)
  }
  if (--incomingCallTimer === 0) {                // ringing: decrement the call timer
    radioCallFlag = 2;                            // stop incoming call
    return;
  }
  if ((callTickCounter & 15) === 0) playCallRing();   // DrawCallTimer's SFX 0x22 cadence
}

// ---- Radio / transceiver (RadioLogic, GameMode 4 — Banks0123.asm:10675) ---------------------
// The five EquipRadioStatus states ported on the ROM-iteration pacing (see chkIncomingCall):
// DrawRadio (open), RadioIdle (tune / SEND / receive check), RadioSignalUp (12 LEDs),
// SetupRadioReply (the caller's text), RadioSignalOFF (reset to idle, auto-reply latched).

// The looping radio-noise ambience (SFX 0x50; SetSoundEntryChk 0x5C mutes it for texts).
function playRadioNoise() {
  stopRadioNoise();
  if (!audioCtx || !assets.radioNoiseBuf) return;
  radioNoiseSrc = audioCtx.createBufferSource();
  radioNoiseSrc.buffer = assets.radioNoiseBuf;
  radioNoiseSrc.loop = true;
  radioNoiseSrc.connect(audioOut());
  radioNoiseSrc.start();
}
function stopRadioNoise() {
  if (radioNoiseSrc) { try { radioNoiseSrc.stop(); } catch (e) {} radioNoiseSrc = null; }
}

// Open the transceiver (DrawRadio, Banks0123.asm:10695): STOPS the incoming call + ring
// (RadioCallFlag = 2 — answering silences the CALL sign), erases the radio variables
// (the RadioCmd..+0x10 block ldir, which re-arms auto-reply), noise ambience on.
function openRadio() {
  if (gameState !== 'play' || fkeysBlocked()) return;   // the ladder/elevator/204 room gate
  gameState = 'radio';
  stopCallRing();
  stopAreaMusic();                    // DrawRadio: 0x59 + RestoreSoundData (noise replaces music)
  radioCallFlag = 2;
  radioState = 1; radioCmd = 0; radioLedCnt = 0; radioLedDelay = 0;
  replyRequested = false; autoReplyDone = false; replyPerson = null;
  radioHoldWait = 8; radioDirTrigger = null; radioUpTrigger = false;
  playRadioNoise();
}
// ExitRadio → RenderScreen: back to play.
function closeRadio() {
  stopRadioNoise();
  startAreaMusic();                   // ExitRadio: RestoreSoundData brings the music back
  gameState = 'play';
}

// One radio iteration (every other 60Hz tick — the ROM-iteration gate).
function radioTick() {
  if ((tickCounter & 1) !== 0) return;
  if (demoActive) { demoTutorialTick(); return; }   // the attract radio-tutorial (scripted, no input)
  const up = radioUpTrigger; radioUpTrigger = false;
  const trig = radioDirTrigger; radioDirTrigger = null;
  switch (radioState) {
    case 1: {                                     // RadioIdle (Banks0123.asm:10742)
      if (up) {                                   // SetRadioSend: SEND + "your reply, please"
        radioCmd = 1;
        replyRequested = true;
        stopRadioNoise();                         // SFX 0x5C: mute radio noise
        setText(10);                              // THIS IS SOLID SNAKE... YOUR REPLY,PLEASE.
        return;
      }
      radioCmd = 0;
      chgRadioFreq(trig);
      chkRadioReceiv();
      return;
    }
    case 2: {                                     // RadioSignalUp: light the 12 LEDs
      if (--radioLedDelay > 0) return;
      radioLedDelay = 2;
      if (++radioLedCnt === 12) radioState = 3;
      return;
    }
    case 3:                                       // SetupRadioReply: show the caller's text
      radioState = 4;
      stopRadioNoise();
      setText(replyPerson ? replyPerson.textId : 0);
      return;
    case 4:                                       // RadioSignalOFF: reset, latch auto-reply
      replyRequested = false;
      radioLedCnt = 0;
      autoReplyDone = true;
      radioState = 1;
      radioCmd = 0;
      playRadioNoise();
      return;
  }
}

// ChgRadioFreq (Banks0123.asm:10906): left/right tune the BCD frequency ±1, clamped at
// 00/99. A TRIGGER moves immediately, clears the auto-reply latch (ChgRadioFreq2 — so
// retuning to the right frequency re-rings), and sets the hold delay to 8; a HELD direction
// repeats every 2 once the delay runs out (the hold path does NOT clear the latch).
function chgRadioFreq(trig) {
  let dir = null;
  if (trig === 'left' || trig === 'right') {
    autoReplyDone = false;
    radioHoldWait = 8;
    dir = trig;
  } else {
    const h = currentDir();
    if (h !== 'left' && h !== 'right') return;
    if (--radioHoldWait > 0) return;
    radioHoldWait = 2;
    dir = h;
  }
  const dec = (radioFreq >> 4) * 10 + (radioFreq & 15);      // BCD ± 1 with daa
  if (dir === 'right') { if (dec < 99) radioFreq = Math.floor((dec + 1) / 10) * 16 + (dec + 1) % 10; }
  else                 { if (dec > 0)  radioFreq = Math.floor((dec - 1) / 10) * 16 + (dec - 1) % 10; }
}

// ChkRadioReceiv (Banks0123.asm:10968): is someone on the selected frequency? Auto-reply
// entries answer at once (unless latched by AutoReplyDone); wait-call entries answer only
// after SEND (ReplyRequested). ChkRadioReply's gates — the antenna for MapZone >= 5,
// Schneider captured, Jennifer's rank/brother, the SwitchOffMSX / transmitter-bugged Big
// Boss overrides — reference systems outside this slice and pass for every exported room.
function chkRadioReceiv() {
  for (const p of radioPersons) {
    if (p.freq !== radioFreq) continue;
    if (!p.waitCall) {
      if (autoReplyDone) return;                  // latched until the frequency changes
    } else if (!replyRequested) continue;         // try another entry (ChkRadioReceiv3)
    const reply = radioReplyGate(p);
    if (reply == null) continue;                  // NoRadioReply: this contact won't answer now
    replyPerson = { freq: p.freq, textId: reply, waitCall: p.waitCall, autoTune: p.autoTune };
    radioState = 2;                               // radio signal up
    radioLedDelay = 0x10;                         // delay before the first LED
    return;
  }
}
// ChkRadioReply (Banks0123.asm): gate (and sometimes override) a contact's reply by game state.
// Big Boss (0x85 / building-2 0x13): after room 111 he orders "switch off your MSX" (text 136);
// else if Snake is bugged (the transmitter) he warns to check the equipment (text 50). Schneider
// (0x79 / 0x26) goes silent once captured. Jennifer (0x48) needs rank class >= 3. Returns the (maybe
// overridden) text id, or null for no reply. Divergences: the MapZone>=5 ANTENNA gate, Jennifer's
// dead-brother gate, and the Madnar/text-15 gate reference systems not modelled here (they pass).
const FREQ_BIGBOSS = 0x85, FREQ_BIGBOSS_B2 = 0x13, FREQ_SCHNEIDER = 0x79, FREQ_SCHNEIDER_B2 = 0x26, FREQ_JENIFFER = 0x48;
function radioReplyGate(p) {
  const f = p.freq;
  if (f === FREQ_BIGBOSS || f === FREQ_BIGBOSS_B2) {
    if (switchOffMsx) return 136;                 // ChkReplyBigBoss2: "Stop operation. Switch off your MSX"
    if (transmiTaken) return 50;                  // ChkReplyBigBoss4: "...check if you have been bugged..."
    return p.textId;
  }
  if (f === FREQ_SCHNEIDER || f === FREQ_SCHNEIDER_B2) return schneiderCaptured ? null : p.textId;
  if (f === FREQ_JENIFFER) return snake.class >= 3 ? p.textId : null;
  return p.textId;
}

// ---- Global alarm (AlertMode), ported from logic/setalert.asm + chkdiscover.asm + checkweaponalert.asm
// + Banks0123.asm ChkAlarmEnd. The alarm is game-wide, not per-guard: raised by being seen
// (GuardSetAlarm) or by noise (an unsuppressed shot in a non-secure room, ChkAlertTrigger). A red alert
// (RedAlertRooms bit) arms reinforcements; the alarm ends via ChkAlarmEnd/StopAlert (alert room
// cleared/left, or an elevator) restoring patrol. Single guard per room → reinforcements respawn that
// one guard up to NumRespawnGuards times (the ROM spawns distinct actors — documented divergence).
const RED_ALERT_ROOMS = [1, 0x1C, 3, 0, 0xA3, 0x10, 0x58, 0, 4, 1, 0x9F, 0, 0, 8, 0, 1];  // chkdiscover.asm (128 bits)
const ROOM_SHOT_SECURE = new Set([                                                        // checkweaponalert.asm
  5, 6, 9, 10, 20, 29, 37, 50, 64, 65, 66, 67, 68, 71, 83, 102, 103, 110, 119, 120, 150, 193, 208, 209,
  54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 93, 94, 95, 96, 97, 98, 99, 100, 101, 111, 112, 113, 114, 115,
  116, 118, 123, 124, 125, 220, 221]);
const SLEEPY_AWAKE_TICKS = 0xC0;      // ChkSleepyGuard/GuardWakeUp: awake span before dozing off (192)
const SLEEPY_SLEEP_TICKS = 256;       // GuardSleeping: SleepingTime (ld (SleepingTime),0 -> 256)
const ZZZ_FRAMES = [0, 1, 2, 1];      // AnimZzzFrames cycle (the Zzz rising)
const ZZZ_ANIM_TICKS = 16;            // ticks per Zzz frame (AnimZzzSign mask 0x0F, SnoringSymbolLogic)
const ELEVATOR_ROOM = 240;            // ChkAlarmEnd: room >= 0xF0 (elevator) ends the alarm

// GuardSetAlarm bit read: room < 128 → RedAlertRooms bit (MSB-first within the byte); else low alert.
const redAlertBit = (room) => room < 128 && ((RED_ALERT_ROOMS[room >> 3] >> (7 - (room & 7))) & 1) === 1;

let alertMode = false;        // AlertMode — the game-wide alarm flag
let redAlertFlag = false;     // RedAlertFlag — high alert for the trigger room (RedAlertRooms): red sign + reinforcements
let redAlertMusic = false;    // SetAlertMode5: the distinct Red Alert TRACK — only a camera/laser trigger (#59)
let roomAlert = -1;           // RoomAlert — the room where the alarm was triggered

// Raise the global alarm (GuardSetAlarm → SetAlert → SetAlertMode). No-op if already up. Sets the
// alert level from RedAlertRooms, records the trigger room, plays the alert music, and pulls the
// current room's guard into the chase. (Reinforcements — the ROM's NumRespawnGuards spawning NEW
// guards from room exits — need the multi-actor system and are deferred; red alert here = the red
// alert sign, not in-place respawns.)
function raiseAlarm(room, forceRed, respawnSeed) {
  if (alertMode) return;
  alertMode = true;
  // RedAlertFlag (red SIGN + reinforcements) is set by a RedAlertRooms bit OR a camera/laser. The
  // distinct Red Alert MUSIC (SetAlertMode5, setalert.asm:52-64), though, plays ONLY for a camera/
  // laser trigger — a plain guard sighting in a red-alert room still plays the normal Alert track. (#59)
  redAlertFlag = !!forceRed || devForceRed || redAlertBit(room);
  redAlertMusic = !!forceRed || devForceRed;
  roomAlert = room;
  numRespawnGuards = (room === 216) ? 0 : highestCardOwned() + 3;   // SetAlertMode2/3/4 (card-based)
  // AlertRespawnTimer seed (SetAlertModeRespawn). Each trigger SOURCE supplies its own ROM seed:
  // gunfire noise / laser = 0x5A, camera = 0x28, desert = 0x1E, elevator ceremony = 0x3C. A plain
  // guard SIGHTING passes none and uses GuardSetAlarm6: 0x1E in a red-alert room, else 0 (no
  // reinforcements). Previously every red alert was flattened to 0x28 and noise to 0 — issue #28.
  alertRespawnTimer = (respawnSeed != null) ? respawnSeed : (redAlertFlag ? 0x1E : 0);
  playAlert();                                        // SetAlertMode: alert music (0x32)
  if (guard && guard.state !== 'alert') enterAlert(guard);
}

// ChkAlertTrigger: an unsuppressed shot raises the alarm unless the room is secure or the alarm is
// already up. (No isolated-room/binocular state here; IsolatedRoom is treated as none.)
function chkAlertTrigger() {
  // ChkAlertTrigger (checkweaponalert.asm): no alarm if IsolatedRoom==1 OR the room is in the
  // RoomShotSecure table (or the alarm is already up).
  if (alertMode || roomIsolated(currentRoom) || ROOM_SHOT_SECURE.has(currentRoom)) return;
  raiseAlarm(currentRoom, false, 0x5A);   // ChkAlertTrigger: `ld a,5Ah` -> reinforcements even in a normal room
}

// ChkAlarmEnd / StopAlert: clear the alarm when the alert room is cleared/left, or on entering an
// elevator — returning guards to patrol and stopping the music.
function chkAlarmEnd() {
  if (transmiTaken) return;     // ChkAlarmEnd :6636: the alarm NEVER ends while bugged
  if (!alertMode) return;
  if (currentRoom >= ELEVATOR_ROOM) { stopAlarm(); return; }   // elevator ends the alarm
  // ChkAlarmEnd: while reinforcements are armed (red/camera/roof alerts), the alarm PERSISTS — in
  // any room — until their kill budget (NumRespawnGuards) is spent; only then does respawning shut
  // off and the room/empty check below take over. A normal alert has no budget (timer 0) and ends
  // as soon as the trigger room is left or cleared.
  if (alertRespawnTimer > 0) {
    if (numRespawnGuards > 0) return;                          // budget remains -> the alarm holds
    alertRespawnTimer = 0; roomAlert = currentRoom;            // budget spent -> disable respawn, re-home
    return;
  }
  if (currentRoom !== roomAlert) { stopAlarm(); return; }      // left the trigger room (ChkAlarmEnd2)
  // ChkAlarmEnd2 ends the alarm when CountEnemyType of the room's RespawnInfo id reaches 0 — i.e.
  // when no reinforcement-type enemies remain, NOT when every actor is dead. A room with no respawn
  // entry has no respawn type, so fall back to "all guards cleared". (Was: any guard alive kept a
  // red-alert room's alarm up forever, since reinforcements re-spawned faster than guards.length
  // could reach 0 — issue #22.)
  const info = respawnData && respawnData[roomAlert];
  const remaining = info ? guards.filter((g) => g.respawnKill).length : guards.length;
  if (remaining === 0) { stopAlarm(); return; }                // alert room cleared of its alert enemies
}

// RoomsNoAlert (Banks0123.asm:1756): rooms where the transmitter doesn't re-raise the alert.
const NO_ALERT_ROOMS = new Set([6, 9, 10, 20, 102, 103, 120, 173, 174, 175, 208, 209, 135, 199, 133, 129, 143]);

// StopAlert: clear all alarm state, stop the alert music, and drop the current guard back to patrol.
function stopAlarm() {
  alertMode = false; redAlertFlag = false; redAlertMusic = false; roomAlert = -1;
  alertRespawnTimer = 0; numRespawnGuards = 0;                 // disarm the reinforcements + budget
  stopAlert();                                                 // stop the alert music
  startAreaMusic();                                            // the area music returns
  if (guard && guard.state === 'alert') {                      // revert the guard to its patrol
    guard.state = 'patrol'; guard.waitTimer = 0; guard.lookPhase = 0; guard.animTimer = 0; guard.walkPhase = 0;
    // Re-home onto the patrol path so it doesn't try to walk back from an off-path chase position
    // (and can't cut through walls getting there).
    if (guard.path && guard.path.length) {
      guard.x = guard.path[0][0]; guard.y = guard.path[0][1];
      guard.target = guard.path.length > 1 ? 1 : 0;
    }
  }
}


// ---- Guard -----------------------------------------------------------------
// Build the active room's guards from actors.json (or none). State machine:
// 'patrol' (walks the path) -> 'alert' (saw Snake: stops, faces him). Orthogonal to state,
// a punch sets `stunnedCnt` > 0: the guard freezes (just bounces) until it counts back to 0,
// then resumes; `punchesCnt` accumulates and the 3rd punch kills him (guard -> null).
// Build the guard object for room n (or null), without touching the alarm — used by both the room
// change and a reinforcement respawn.
function makeGuard(g) {
  const m = {
    x: g.x, y: g.y, speed: g.speed || (SPEED / 2),  // patrol = ½ Snake (DirectionSpeeds ±1)
    dir: g.shooter ? ((g.y & 0x80) ? 'up' : 'down') : (g.switch ? 'right' : (g.dir || 'left')),  // shooter faces the room interior
    isSwitch: !!g.switch, swStatus: 0, swWait: 0,          // room-16 GuardSwitchLogic state
    silState: 0, silWait: 1,                               // room-150 GuardSilencerLogic state
    waitTimer: 0, lookPhase: 0, lookSaved: null,   // ChkWaitPathPoint stop + GuardPatrolTurn/Wait look-around (#39)
    path: (g.path && g.path.length ? g.path : [[g.x, g.y]]),
    target: 1, state: 'patrol', animTimer: 0, walkPhase: 0, stepping: false,
    // ACTOR.LIFE / ActorTouchDamage seeded per actor ID from the ROM tables (SetupActor; issue #48).
    // Most guards are ID_GUARD_SLOW (life 2, touch 2); the room-150 suppressor guard is
    // ID_GUARD_SILENCER (life 4, touch 4) — issue #33.
    id: g.id || ID_GUARD_SLOW,
    life: actorLife(g.id || ID_GUARD_SLOW),
    touchDmg: actorTouchDmg(g.id || ID_GUARD_SLOW),
    touched: false,                            // TOUCH_INFO bit 7 (set by chkTouchGuard each frame)
    stunnedCnt: 0, punchesCnt: 0, alertIconTimer: 0,
    status: 'walk', counter: 0, moving: false, walkAwayDir: 'left',   // alert AI (guardalert.asm)
    // Sleepy guard (ChkSleepyGuard): cycles awake<->asleep on timers. Rooms 26/85/138 (InitGuard
    // sleepy-by-room) start AWAKE then doze (sleepAwake); room 140's ID_SLEEPING_SIGN guard starts asleep.
    sleepy: !!g.sleeping, asleep: !!g.sleeping && !g.sleepAwake,
    awakeTimer: SLEEPY_AWAKE_TICKS, sleepTimer: SLEEPY_SLEEP_TICKS, zzzFrame: 0, zzzTimer: 0,
    alertSpawn: !!g.alert,                     // ID_GUARD_ALERT/REDALERT: born chasing
    redalert: !!g.redalert,                    // ID_GUARD_REDALERT: keeps its distance + double-shoots
    // DecRespawnGuards (Banks0123.asm:13214) spends a reinforcement from the kill budget ONLY when
    // the killed actor is a reinforcement type — ID_GUARD_ALERT/REDALERT, ID_SHOOTER, ID_JETPACK —
    // NOT a plain patrol guard. Tag those (+ respawnTick's reinforcements) so the budget tracks the
    // ROM and the alarm becomes clearable (issue #22).
    respawnKill: !!g.alert || !!g.shooter || !!g.reinforcement,
    silencer: !!g.silencer,                    // the room-150 suppressor counter
    // Sentinel (SentinelLogic): a STATIONARY guard cycling its look direction through a
    // per-actor list every SENTINEL_WAIT iterations; the alarm transforms it into a
    // normal chaser (TransformAlertGuard).
    sentinel: !!g.sentinel,
    sentinelDirs: g.dirs || null, sentinelIdx: 0, sentinelWait: 0x40,
    // Lorry guard (rooms 5/7, guardlorry.asm) + lorry shooter (room 104, lorryshooter.asm). Both
    // start HIDDEN inside the lorry: the shooter on a random think timer, the guard on the 0x64
    // emerge timer (InitGuardLorry2's LORRY_TIMER).
    lorry: !!g.lorry, lorryIdx: g.lorryIdx != null ? g.lorryIdx : -1,
    lorryShooter: !!g.lorryShooter, lorryStat: 0,
    lorryWait: g.lorry ? 0x64 : 1 + ((Math.random() * 16) | 0),
    lorryHidden: !!g.lorryShooter || !!g.lorry, lorrySpeedY: 0, lorryHomeY: g.y,
    // Ambush shooter (shooter.asm; rooms 88/90/91/206): strafe-and-pop-out, fires vertical bullets,
    // transforms into a chaser after 3 cycles / when the player closes in.
    shooter: !!g.shooter, shStat: 0, shWait: 1 + ((Math.random() * 64) | 0), shTransform: 3,
    shStartX: g.x, shWalkDir: 'left',
  };
  // The ROM's GetPathPoint (Banks0123.asm:6956) sets the guard's FIRST destination to path point
  // 0 — it heads toward the first listed point, not the second. Starting at index 1 sent guards the
  // wrong way for one leg (e.g. the demo's room-1 guard doubled back, arriving late at the punch).
  m.target = 0;
  return m;
}

// Build the room's guards: a DEMO entry (room 0) stays a single guard; otherwise EVERY
// guard in the ROM's room actor list spawns (data/actorsinrooms.asm via actors.json) with
// his real patrol path — the EnemyList holds them all, like the ROM.
// The room's guard DEFINITIONS — pure (no globals touched, no enterAlert side effect). Shared by
// buildGuardRaw (play) and the binoculars peek (binocSnapshot). Returns null for room 3 (its
// elevator-ceremony pair are owned by elevRelief and are not normal patrols).
function guardDefsFor(n) {
  const demo = guardsData[String(n)];
  if (demo) return [demo];
  if (n === 3) return null;
  const defs = [];
  if (actorsData && actorsData[n]) {
    for (const r of actorsData[n].guards) {
      const path = r.path ? r.path.map(([y, x]) => [x, y]) : null;   // ROM points are (Y, X)
      let dir = 'left';
      if (path && path.length > 0) {
        // GetPathPoint -> SetDirToPoint (Banks0123.asm:6956): the guard's INITIAL facing is set
        // from its spawn position toward path point 0 (the first destination) — NOT from p0->p1.
        // (A guard facing the wrong way on entry caused instant false alerts — issue #18.)
        let dx = path[0][0] - r.x, dy = path[0][1] - r.y;
        if (dx === 0 && dy === 0 && path.length > 1) {                // spawn == p0: use the next leg
          dx = path[1][0] - path[0][0]; dy = path[1][1] - path[0][1];
        }
        if (dx !== 0 || dy !== 0)
          dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      }
      defs.push({
        x: r.x, y: r.y, dir,
        id: r.silencer ? ID_GUARD_SILENCER : ID_GUARD_SLOW,   // ROM actor ID -> life/touch (#48/#33)
        // Guard variants: slow/silencer 0.5, medium 0.75, fast/alert 1.0 (per type);
        // ALERT/REDALERT types spawn already chasing; SILENCER guards feed the room-150
        // suppressor drop (DismissActor8); SENTINELS stand still cycling look dirs.
        speed: r.speed != null ? r.speed * SPEED : (r.fast ? SPEED : SPEED / 2),
        path, alert: !!r.alert, silencer: !!r.silencer,
        sentinel: !!r.sentinel, dirs: r.dirs, sleeping: !!r.sleeping, sleepAwake: !!r.sleepAwake, switch: !!r.switch,
        lorry: !!r.lorry, lorryIdx: r.lorryIdx, lorryShooter: !!r.lorryShooter, shooter: !!r.shooter,
      });
    }
  }
  return defs;
}
function buildGuardRaw(n) {
  const defs = guardDefsFor(n);
  if (defs === null) { guards.length = 0; guard = null; return; }   // room 3: no normal patrols
  guards = defs.map(makeGuard);
  for (const g of guards) if (g.alertSpawn) enterAlert(g);   // ID_GUARD_ALERT/REDALERT
  guard = guards[0] || null;
}

// ---- Alert reinforcements (ChkRespawnEnemy, Banks0123.asm:6559-6627) ----------------------
// While the alarm is up AND AlertRespawnTimer is armed (the RED alert and a CAMERA sighting
// arm it — the camera sets 0x28: "the surveillance centre alerts other guards"), the room's
// RespawnInfo entry spawns reinforcements: every elapsed timer a new alerted guard appears
// at one of the room's two packed spawn spots (TickCounter bit 0 picks), capped at 3 of the
// red-alert type (4 otherwise), never from room 188 on. The next timer is 0x14 + rnd&0xF.
let respawnData = null;          // respawn.json: room -> { id, locs: [[x,y],[x,y]] }
let alertRespawnTimer = 0;       // AlertRespawnTimer (0 = respawning disarmed)
// NumRespawnGuards (setalert.asm SetAlertMode2/3/4): the reinforcement KILL budget for this alert —
// the count of reinforcement-eligible enemies that must be killed before the alarm can end. Set at
// the alarm: 0 in room 216 (the 4th desert lorry — no respawn), else the highest keycard owned + 3.
let numRespawnGuards = 0;
function highestCardOwned() {     // SetAlertMode2: scan Card8..Card1 for the highest one taken
  for (let c = 8; c >= 1; c--) if (items.has(SELECTED_CARD1 + c - 1)) return c;
  return 0;
}
function respawnTick() {
  if ((tickCounter & 1) !== 0) return;             // ROM iteration boundary
  if (!alertMode || alertRespawnTimer <= 0) return;
  if (currentRoom >= 188) return;                  // "From this room on, there is no respawning"
  if (--alertRespawnTimer > 0) return;
  alertRespawnTimer = 0x14 + ((Math.random() * 16) | 0);   // next respawn time (r ^ tick)
  const info = respawnData && respawnData[currentRoom];
  if (!info) return;
  // ChkRespawnEnemy CountEnemyType cap: max simultaneous of the respawn type — 3 for the RED-ALERT
  // guard / jetpack, 4 otherwise (the budget that ends the alarm is NumRespawnGuards, on kills).
  if (guards.length >= (redAlertFlag ? 3 : 4)) return;
  const [x, y] = info.locs[tickCounter & 2 ? 1 : 0];
  const g = makeGuard({ x, y, dir: 'down', speed: SPEED, path: [[x, y]], redalert: redAlertFlag,
                        reinforcement: true });   // ID_GUARD_ALERT/REDALERT: spends the kill budget
  guards.push(g);
  enterAlert(g);                                   // reinforcements arrive chasing (red = stand-off)
  guard = guards[0] || null;
  playBuf(assets.spawnBuf);                        // SFX 0x25
}

// Room-change build: clear in-flight bullets and build the guard. The alarm is NOT cleared here (it is
// game-wide; chkAlarmEnd ends it). If the alarm will persist in this room, the guard starts alerted —
// faithful to entering an alarmed room (guards aren't patrolling).
// HideGuards (logic/actors/hideguards.asm): in nine rooms, the guard sitting at the edge Snake
// enters through is REMOVED so the player doesn't materialise on an enemy. Keyed on the entry
// direction (enterDir) and/or the previous room; each entry returns the guard coord to cull
// ({axis, val, eq} — eq:false removes the guards that DON'T match, per ChkCoordN). From the ROM's
// per-room HideGuardRoom1/13/15/17/18/19/22/35/39 conditions.
const HIDE_GUARDS = {
  1:  (d) => ({ axis: 'y', val: d === 1 ? 0xB0 : 0x18, eq: true }),
  13: (d, p) => p === 137 ? { axis: 'x', val: 0x88, eq: true } : null,
  15: (d) => d === 4 ? { axis: 'x', val: 0x10, eq: true } : null,
  17: (d) => ({ axis: 'y', val: 0x30, eq: d !== 1 }),
  18: (d) => ({ axis: 'y', val: 0x13, eq: d !== 1 }),
  19: (d, p) => p === 141 ? { axis: 'y', val: 0x78, eq: true } : (d === 1 ? { axis: 'y', val: 0xA8, eq: true } : null),
  22: (d, p) => ({ axis: 'x', val: p === 20 ? 0x20 : 0xF0, eq: true }),
  35: (d, p) => p === 156 ? { axis: 'y', val: 0x28, eq: true } : (p === 0x21 ? { axis: 'x', val: 0x18, eq: true } : null),
  39: (d, p) => ({ axis: 'y', val: p === 242 ? 72 : 176, eq: true }),
};
function hideGuardsOnEntry(n) {
  const f = HIDE_GUARDS[n];
  if (!f) return;
  const spec = f(enterDir, previousRoom);
  if (!spec) return;
  guards = guards.filter((g) => {
    const c = spec.axis === 'x' ? g.x : g.y;
    return !(spec.eq ? c === spec.val : c !== spec.val);   // drop the matching guard(s)
  });
  guard = guards[0] || null;
}
function buildGuard(n) {
  bullets.length = 0;                     // room change clears any in-flight bullets
  // SetSprPal: recolour the guard sheet to this room's sprite palette (SpritesetRooms -> SprsetPal).
  activeGuardSheet = guardPalettes ? guardSheetFor(guardPalettes.rooms[n] || guardPalettes.fallback) : guardSheet;
  buildGuardRaw(n);
  hideGuardsOnEntry(n);                   // HideGuards: cull the entry-edge guard
  if (alertMode && currentRoom === roomAlert)
    for (const g of guards) if (g.state !== 'alert') enterAlert(g);
}

// The guard is a ~16px-wide actor on the floor like Snake, so it reuses Snake's collision
// footprint. A chasing guard is blocked by solid tiles exactly as Snake is (open doorways pass).
const GUARD_PROBES = PROBES;
const guardBlocked = (x, y, dir) => blocked(x, y, dir, false, GUARD_PROBES);

// ChkViewObstacles: walk the tiles from the seer toward Snake along the facing axis; an obstacle
// (a solid tile that isn't a see-through railing — only in the building/water tilesets) blocks LOS.
function losClear(g, s, dir) {
  const c = assets.collision;
  const seethrough = roomTileset(currentRoom) === 0;   // handrails see-through only in the Building tileset (#101)
  const gx = g.x >> 3, gy = g.y >> 3, sx = s.x >> 3, sy = s.y >> 3;
  const blockedTile = (i) => c.solid[i] !== 0 && !(seethrough && LOS_SEETHROUGH.has(c.tiles[i]));
  if (dir === 'left' || dir === 'right') {
    const step = dir === 'left' ? -1 : 1;
    for (let tx = gx + step; tx !== sx; tx += step) {
      if (tx < 0 || tx >= c.width) break;            // same column / off-map: no intervening tiles
      if (blockedTile(gy * c.width + tx)) return false;
    }
  } else {
    const step = dir === 'up' ? -1 : 1;
    for (let ty = gy + step; ty !== sy; ty += step) {
      if (ty < 0 || ty >= c.height) break;
      if (blockedTile(ty * c.width + gx)) return false;
    }
  }
  return true;
}

// ChkSeePlayer pre-checks: Snake in deep water (the water-shadow frames) is never seen; Snake under
// the cardboard box is seen only while the box is MOVING (a still box hides him).
function losGates() {
  const s = snake;
  if (s.anim === ANIM_DEEP_WATER) return false;
  if (s.anim === ANIM_BOX && s.state !== 'walk') return false;
  return true;
}
// ChkLook<dir> + ChkView<axis> + ChkViewObstacles: Snake must be on the FACING side and inside the
// perpendicular sight band, with a clear line of sight. The facing test mirrors the ROM's signed
// compare — up/left include the exactly-level case (ret c), down/right exclude it (ret nc).
function losDirectional(seer, lrBand) {
  const s = snake, dir = seer.dir;
  if (dir === 'up')        { if (s.y > seer.y  || Math.abs(s.x - seer.x) >= LOS_BAND_UD) return false; }
  else if (dir === 'down') { if (s.y <= seer.y || Math.abs(s.x - seer.x) >= LOS_BAND_UD) return false; }
  else if (dir === 'left') { if (s.x > seer.x  || Math.abs(s.y - seer.y) >= lrBand)      return false; }
  else                     { if (s.x <= seer.x || Math.abs(s.y - seer.y) >= lrBand)      return false; }
  return losClear(seer, s, dir);
}
// Faithful to chkdiscover.asm ChkSeePlayer: the gates, then ChkSeePlayer2 (a TOUCH discovers Snake
// regardless of facing), then the directional LOS (guard horizontal band = 6).
function guardSeesSnake(g = guard) {
  if (!losGates()) return false;
  if (g.touched) return true;                                    // ChkSeePlayer2: touch discovers
  return losDirectional(g, LOS_BAND_LR);
}

// ListenShotsChkTouch (chkdiscover.asm): the touch/noise discovery used by SLEEPING guards
// (GuardSleeping) and SENTINELS — independent of facing/LOS. Discovered if the guard is being
// touched, OR a player shot is currently EXPLODING (the ROM's status==1; our explosion frame is
// status 2) UNLESS the noise is a silenced handgun/SMG (the suppressor gate; loud weapons always
// carry). Plain unsuppressed gun-fire noise is handled separately by chkAlertTrigger on the shot.
function listenShotsChkTouch(g) {
  if (g.touched) return true;                                  // ChkSeePlayer2 / touch
  if ((selectedWeapon === HAND_GUN || selectedWeapon === SUB_MACHINE_GUN) && invSuppressor) return false;
  return playerShots.some((s) => s.status === 2);              // an active exploding shot is heard
}

// EnemiesLogic: while StunnedCnt > 0 the enemy is frozen and only does the little bounce
// (StunnedBounce), skipping all patrol/detection; at 0 it resumes normal logic.
function stunnedBounce(g) {
  if (g.stunnedCnt === 0x3F || g.stunnedCnt === 0x3D) g.y -= 4;
  else if (g.stunnedCnt === 0x3B || g.stunnedCnt === 0x39) g.y += 4;
}

// Guard1/2/3ExitedLorry (set by the lorry-ride guard logic, guardlorry.asm rooms 5/7): a lorry
// soldier is "out" (1) or "in" (0). The lorry-ride emerge/return system isn't ported, so these
// stay 0 — documented divergence; lorryGuardExitDismiss() is the ready guard-side hook for it.
let guardExitedLorry = [false, false, false];
// InitGuardAlert2/3 + ChkDismissGuard: when a guard in a lorry-interior room (127/131/132) would
// become an alert guard and its lorry soldier has already exited, it is dismissed (deduped) instead
// of spawning — but ONLY when the alarm isn't already up (InitGuardAlert checks AlertMode first).
function lorryGuardExitDismiss() {
  if (alertMode) return false;
  if (currentRoom === 127) return guardExitedLorry[0];
  if (currentRoom === 131) return guardExitedLorry[1];
  if (currentRoom === 132) return guardExitedLorry[2];
  return false;
}

// Enter the alert state once: play the alert music and flash the "!" icon briefly (the icon is
// a momentary discovery cue in the ROM, not a persistent badge).
function enterAlert(g) {
  if (lorryGuardExitDismiss()) {                 // ChkDismissGuard: this lorry soldier already left
    const i = guards.indexOf(g);
    if (i >= 0) guards.splice(i, 1);
    guard = guards[0] || null;
    return;
  }
  g.state = 'alert';
  g.alertIconTimer = ALERT_ICON_TICKS;
  // InitGuardAlert: face the player (GetDirToPlayer), commit Counter=0x14, then start in the
  // status-4 wait-check-alert beat (GuardWaitChkAlert) before the full chase.
  g.dir = dirToPlayer(g).far;
  g.walkAwayDir = g.dir;
  g.status = 'waitalert';
  g.alertWait = 1;                // InitGuardAlert sets WalkAwayDir=1 (the status-4 countdown)
  g.counter = 0x14;
  g.moving = true;
  g.animTimer = 0; g.walkPhase = 0;
  setRespawnTime();              // SetRespawnTime: per-room reinforcement-schedule override
  playAlert();
}

// SetRespawnTime (guardalert.asm): when an alert guard initialises, a few rooms override the
// reinforcement schedule that SetAlertMode set at the alarm. The ROM stores a WORD into
// AlertRespawnTimer whose high byte is NumRespawnGuards: room 216 -> 0 (no respawn); rooms 187 /
// 154 / 88-92 (roof building 2) -> a fresh random timer (0x10..0x1F) and a budget of 10. Every
// other room keeps the card-based budget. (Re-run on each alert-guard init, as in the ROM.)
function setRespawnTime() {
  const r = currentRoom;
  if (r === 216) { alertRespawnTimer = 0; numRespawnGuards = 0; return; }
  if (r === 187 || r === 154 || (r >= 88 && r <= 92)) {
    alertRespawnTimer = 0x10 + (rndByte() & 0x0F);
    numRespawnGuards = 0x0A;
  }
}

let devForceAlert = false;   // ?alert dev hook: force the guard into alert for a screenshot
let devForceRed = false;     // ?red dev hook: force any raised alarm to be a RED alert (reinforcements)
let devShowCollision = false;// ?collision dev hook: tint solid tiles to inspect the collision footprint
// EnemiesLogic: run every guard's logic tick; the `guard` alias tracks guards[0] for the
// single-guard call sites and the suites.
function updateGuard() {
  for (const g of [...guards]) updateGuardOne(g);
  guard = guards[0] || null;
}

function updateGuardOne(guard) {
  if (!guard) return;   // no guard in this room (no in-place respawn — reinforcements are a future system)
  if (guard.stunnedCnt > 0) { guard.stunnedCnt--; stunnedBounce(guard); return; }  // frozen
  // RunEnemyLogic (Banks0123.asm:12660): LIFE 0 kills the actor at the top of its logic tick.
  // EnemiesLogic skips the logic entirely while stunned (the branch above), so — as in the ROM —
  // a guard shot to 0 life mid-stun dies only when the stun expires.
  if (guard.life === 0) { killGuard(guard); return; }

  // Sleepy guard (ChkSleepyGuard/GuardSleeping/GuardWakeUp): cycles awake<->asleep on timers. While
  // asleep it holds the sleep pose (no patrol/LOS) with an animated "Zzz" sign, and wakes on the alarm
  // or on Snake's noise/touch (then it raises the alarm). While awake it patrols/detects normally,
  // dozing off again after AwakeTime.
  if (guard.sleepy) {
    // The sleepy AwakeTime (0xC0) / SleepingTime (256) are ROM iteration counts; gate their decrements
    // to the ~30Hz boundary like the alert/sentinel/respawn code (updateGuard runs at 60Hz). (#100)
    const romTick = (tickCounter & 1) === 0;
    if (guard.asleep) {
      animateZzz(guard);                                                    // AnimZzzSign (cosmetic, 60Hz)
      if (alertMode) guardWake(guard);                                      // GuardWakeUp on alarm
      else if (listenShotsChkTouch(guard)) {
        // GuardSleeping -> ListenShotsChkTouch: a touch OR the noise of an exploding (unsuppressed)
        // shot wakes the guard and raises the alarm. Plain gun-fire noise still comes via
        // chkAlertTrigger (which sets the alarm, waking him through the AlertMode branch above).
        guardWake(guard); raiseAlarm(currentRoom);
      } else if (romTick && --guard.sleepTimer <= 0) { guardWake(guard); setText(34, 2); }  // GuardSleeping: SleepingTime elapsed -> GuardWakeUp: TEXT 34 "OVERSLEPT" (only the natural wake says it; alarm/noise/touch wakes don't)
      if (guard.asleep) { guard.dir = 'down'; return; }                     // still asleep: no patrol/LOS
    } else if (romTick && --guard.awakeTimer <= 0) {                        // ChkSleepyGuard: AwakeTime elapsed -> doze off
      guard.asleep = true; guard.sleepTimer = SLEEPY_SLEEP_TICKS; guard.zzzFrame = 0; guard.zzzTimer = 0;
      setText(33, 2);                                                       // ChkSleepyGuard: TEXT 33 "I'M SLEEPY" via SetTextUnskippable
      guard.dir = 'down'; return;
    }
  }

  // Room-16 switch guard (GuardSwitchLogic): its own patrol/alarm/power-the-floor/guard-the-switch
  // state machine — it doesn't use the generic chase.
  if (guard.isSwitch) { switchGuardLogic(guard); return; }

  // Room-104 lorry shooter (LorryShooterLogic): its own hide/show/pop-out shooting machine.
  if (guard.lorryShooter) { lorryShooterLogic(guard); return; }

  // Lorry guards (rooms 5/7, GuardLorryLogic): the emerge/patrol/return cycle — until it's OUT and
  // the alarm transforms it into a chaser (then it falls through to the generic alert branch).
  if (guard.lorry && guard.state !== 'alert') { lorryGuardLogic(guard); return; }

  // Ambush shooters (rooms 88/90/91/206, ShooterLogic): strafe/shoot/return — runs even with the
  // alarm up, until it self-transforms into a chaser (then the generic alert branch takes over).
  if (guard.shooter && guard.state !== 'alert') { shooterLogic(guard); return; }

  if (devForceAlert && guard.state !== 'alert') raiseAlarm(currentRoom);

  // An alarm raised anywhere pulls this guard into the chase; LOS discovery raises the global alarm.
  if (alertMode && guard.state !== 'alert') enterAlert(guard);
  if (guard.state !== 'alert' && guardSeesSnake(guard)) raiseAlarm(currentRoom);

  if (guard.state === 'alert') {
    if (guard.alertIconTimer > 0) guard.alertIconTimer--;   // count down the discovery flash
    guardAlertLogic(guard);                 // GuardAlertLogic state machine (chase / shoot / avoid)
    return;
  }

  // Room-150 suppressor guards (GuardSilencerLogic): the bespoke move-then-shoot cross-fire +
  // ChkChasePlayer transform-to-alert when Snake enters their lane.
  if (guard.silencer) { silencerLogic(guard); return; }

  // Sentinel (SentinelLogic): stands still cycling its LOOK DIRECTION through its list
  // every SENTINEL_WAIT iterations — the LOS checks above already use guard.dir, so only
  // the facing rotates. The alarm path transforms it into a normal chaser (handled above).
  if (guard.sentinel) {
    guard.stepping = false;
    if (listenShotsChkTouch(guard)) { raiseAlarm(currentRoom); return; }   // SentinelLogic: noise/touch
    if ((tickCounter & 1) === 0 && --guard.sentinelWait <= 0) {
      guard.sentinelWait = 0x40;
      const dirs = guard.sentinelDirs && guard.sentinelDirs.length ? guard.sentinelDirs : [1, 4, 2, 3];
      guard.sentinelIdx = (guard.sentinelIdx + 1) % dirs.length;
      guard.dir = ['up', 'up', 'down', 'left', 'right'][dirs[guard.sentinelIdx]] || 'down';
    }
    return;
  }

  // Patrol toward the current waypoint. `stepping` records whether the guard actually moved this
  // tick — a paused/standing guard shows the dedicated standing frame (GuardPatrolTurn/Wait).
  guard.stepping = false;
  if (guard.path.length < 2) return;
  // GuardPatrolTurn (status 1) / GuardPatrolWait (status 2): the two-phase stop-and-look. The guard
  // stands (no step); LOS still runs above on guard.dir, so the turned facing in phase 2 can detect.
  if (guard.lookPhase > 0) {
    guard.walkPhase = 0; guard.animTimer = 0;
    if ((tickCounter & 1) !== 0) return;                     // advance the 0x10 look timer at ~30Hz only (#100)
    if (--guard.waitTimer > 0) return;                       // hold the current facing for 0x10
    if (guard.lookPhase === 1) {                             // GuardPatrolTurn: turn ±90° and look again
      guard.lookSaved = guard.dir;                           // PreviousDirection
      guard.dir = PATROL_TURN[guard.dir] || guard.dir;
      guard.waitTimer = GUARD_LOOK_TICKS; guard.lookPhase = 2;
    } else {                                                 // GuardPatrolWait: restore facing + resume
      guard.dir = guard.lookSaved || guard.dir; guard.lookPhase = 0;
    }
    return;
  }
  const t = guard.path[guard.target];
  const dx = t[0] - guard.x, dy = t[1] - guard.y;
  if (Math.abs(dx) + Math.abs(dy) <= guard.speed) {
    guard.x = t[0]; guard.y = t[1];
    guard.target = (guard.target + 1) % guard.path.length;
    // SetDirToPoint: face the NEW destination, so the look (if any) holds that facing first.
    const nt = guard.path[guard.target], ndx = nt[0] - guard.x, ndy = nt[1] - guard.y;
    if (ndx !== 0 || ndy !== 0)
      guard.dir = Math.abs(ndx) >= Math.abs(ndy) ? (ndx < 0 ? 'left' : 'right') : (ndy < 0 ? 'up' : 'down');
    // ChkWaitPathPoint (`ld a,r; rra; ret nc`): ~50% chance to NOT stop and keep walking; else stop+look.
    if (Math.random() < 0.5) { guard.lookPhase = 1; guard.waitTimer = GUARD_LOOK_TICKS; }
    return;
  }
  // ROM guards NEVER move diagonally — GuardsInfo scripts walk one axis at a time. The
  // waypoint homing must do the same: COMMIT to the current axis until it's exhausted,
  // then turn. (Recomputing the max axis every tick flip-flopped when |dx|~|dy|,
  // staircasing into a visual diagonal.)
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const horiz = guard.dir === 'left' || guard.dir === 'right';
  const stepDir = (horiz && ax > 0) || ay === 0 ? (dx < 0 ? 'left' : 'right')
                                                : (dy < 0 ? 'up' : 'down');
  guard.dir = stepDir;
  // never overshoot the axis (a fractional-speed remainder would re-trigger the flip)
  const step = Math.min(guard.speed, (stepDir === 'left' || stepDir === 'right') ? ax : ay);
  const nx = guard.x + DELTA[stepDir].dx * step, ny = guard.y + DELTA[stepDir].dy * step;
  // Patrol is collision-checked too (same probes as Snake), so a guard can never cross a solid the
  // player can't — even if it ended up off its path (e.g. after the alarm calmed down). If the step is
  // blocked, aim at the next waypoint instead of beelining through the wall.
  if (guardBlocked(nx, ny, stepDir)) { guard.target = (guard.target + 1) % guard.path.length; return; }
  guard.x = nx; guard.y = ny;
  guard.stepping = true;
  if (++guard.animTimer >= GUARD_WALK_TICKS) { guard.animTimer = 0; guard.walkPhase ^= 1; }
}

// ---- Alert AI, ported from guardalert.asm (GuardAlertLogic state machine) -------------------
// The guard does NOT home in every frame. It picks a direction toward Snake and commits to it
// for `counter` frames, then re-aims; on each re-aim it has a ~75% chance to STOP and shoot,
// waiting a beat before resuming (GuardWalk -> GuardShot -> GuardWaitShot). When the direct path
// is blocked it freezes that goal direction and detours on the perpendicular until it reopens
// (GuardAvoidObstacle). Normal guards chase right onto Snake — the stand-off/walk-away is a
// red-alert-only behaviour (ChkNearPlayer), out of scope here.

// GuardWakeUp: leave the sleep state and reset the awake span. The "OVERSLEPT" text (TEXT 34) is
// part of the ROM's GuardWakeUp status, which is only reached on the natural SleepingTime-elapsed
// wake — so it's emitted at that call site, not here (alarm/noise/touch wakes share this helper but
// must stay silent).
function guardWake(g) { g.asleep = false; g.awakeTimer = SLEEPY_AWAKE_TICKS; }
// AnimZzzSign: advance the floating "Zzz" frame on the ROM cadence.
function animateZzz(g) {
  if (++g.zzzTimer >= ZZZ_ANIM_TICKS) { g.zzzTimer = 0; g.zzzFrame = (g.zzzFrame + 1) % ZZZ_FRAMES.length; }
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const rndByte = () => Math.floor(Math.random() * 256);                  // stands in for `ld a,r`
// SetGuardRndCounter: rnd&0xF + base — base 0x0A for the faster RED-ALERT guard, else 0x14.
const guardWalkCounter = (g) => (rndByte() & 0x0F) + (g && g.redalert ? 0x0A : 0x14);
// True if the guard can move one fast step in `dir` (ChkTileCollision, shape 0).
const guardCanGo = (g, dir) => !guardBlocked(g.x + DELTA[dir].dx * GUARD_CHASE_SPEED,
                                             g.y + DELTA[dir].dy * GUARD_CHASE_SPEED, dir);

function dirToPlayer(g) {                                              // GetDirToPlayer: far axis + near axis
  const dx = snake.x - g.x, dy = snake.y - g.y;
  const horiz = dx < 0 ? 'left' : 'right', vert = dy < 0 ? 'up' : 'down';
  return Math.abs(dx) < Math.abs(dy) ? { far: vert, near: horiz } : { far: horiz, near: vert };
}
// ChkNearPlayer: ONLY a RED-ALERT guard keeps its distance — true when Snake is within 0x30 on
// BOTH axes (max(|dx|,|dy|) < 0x30). A normal alert guard chases right onto Snake.
function guardNearPlayer(g) {
  return !!g.redalert && Math.max(Math.abs(snake.x - g.x), Math.abs(snake.y - g.y)) < 0x30;
}

// ChkGuardWater (guardalert.asm): reads the two tiles under the guard's feet — at (X-4, Y) and the
// next column. Tile 1 is an EXIT (door / lorry / chasm); the guard turns 180° instead of walking
// out of the room (MoveAwayExit). The cosmetic in-water sprite (BASE_SPR_ID 0x49 on the water tiles
// 0x6D / 0x6F..0x76 in rooms >= 70) is a documented omission — no in-water guard frames are exported.
function chkGuardWater(g) {
  const tx = (g.x - 4) >> 3, ty = g.y >> 3;
  if (tileAt(tx, ty) === 1 || tileAt(tx + 1, ty) === 1) moveAwayExit(g);
}
// MoveAwayExit: back to chase status, turn 180°, and commit to that heading for a short spell
// (ACTOR.Wait = 0x0A; the port aliases it onto the chase counter — documented interpretation).
function moveAwayExit(g) {
  g.status = 'walk';
  g.dir = OPPOSITE[g.dir];
  g.moving = true;
  g.counter = 0x0A;
}

// Status 0 — chase: keep the current heading for `counter` frames, then (or on hitting a wall) re-aim.
function guardWalk(g) {
  if (guardCanGo(g, g.dir) && --g.counter > 0) return;   // keep walking the same way
  if (guardNearPlayer(g)) { guardSetWalkAway(g); return; }   // GuardWalk2 -> ChkNearPlayer (red alert)
  guardChasePlayer(g);
}

// GuardChasePlayer2: commit to `dir`, then ~1/4 keep walking / ~3/4 stop and shoot. Shared by the
// chase (toward Snake) and the walk-away (opposite of Snake), exactly as the ROM reuses it.
function guardChasePlayer2(g, dir) {
  g.dir = dir; g.moving = true;
  const b = 0x0F + (rndByte() & 7);                       // ROM shoot roll: 0x0F..0x16
  if ((b & 3) === 0) { g.status = 'walk'; g.counter = guardWalkCounter(g); }   // ~1/4: keep walking
  else guardShoot(g, b);                                  // ~3/4: stop and shoot for `b` frames
}

// Re-aim toward Snake; if that direction is clear, maybe shoot, else detour around the obstacle.
function guardChasePlayer(g) {
  const { far, near } = dirToPlayer(g);
  if (guardCanGo(g, far)) { guardChasePlayer2(g, far); return; }
  g.status = 'avoid';                                     // primary blocked: detour on the other axis
  g.walkAwayDir = far;                                    // remember the goal direction
  g.dir = near; g.moving = true; g.counter = guardWalkCounter(g);
}

// SetGuardWalkAway: head in the OPPOSITE-of-Snake direction (red-alert stand-off). If that's clear
// it reuses the chase-move (and may shoot while retreating); if blocked it detours on the other
// axis in the dedicated walk-away status.
function guardSetWalkAway(g) {
  const { far, near } = dirToPlayer(g);
  const away = OPPOSITE[far];
  if (guardCanGo(g, away)) { guardChasePlayer2(g, away); return; }
  g.status = 'walkaway'; g.walkAwayDir = away; g.dir = OPPOSITE[near];
  g.moving = true; g.counter = guardWalkCounter(g);
}

function guardShoot(g, waitFrames) {
  g.counter = waitFrames;
  g.status = 'waitshot';
  g.moving = false;
  fireGuardBullet(g);
}

// Status 1 — wait after a shot: face Snake, hold, then resume the chase. A RED-ALERT guard fires
// AGAIN the moment it resumes (GuardWaitShot's AddEnemyShot tail).
function guardWaitShot(g) {
  g.dir = dirToPlayer(g).far;                            // GuardLookDirection2: face the player
  if (--g.counter > 0) return;
  g.counter = guardWalkCounter(g);
  g.status = 'walk';
  g.moving = true;
  if (g.redalert) fireGuardBullet(g);                    // GuardWaitShot: REDALERT shoots again
}

// Status 2 — avoid obstacle: follow the wall until the frozen goal direction reopens.
function guardAvoidObstacle(g) {
  if (guardCanGo(g, g.walkAwayDir)) { g.dir = g.walkAwayDir; guardResumeChase(g); return; }
  if (guardCanGo(g, g.dir)) return;                      // keep sliding along the wall
  const back = OPPOSITE[g.walkAwayDir];
  if (guardCanGo(g, back)) { g.dir = back; guardResumeChase(g); return; }
  g.dir = OPPOSITE[g.dir]; guardResumeChase(g);          // dead end: turn around
}

// Status 3 — GuardWalkAwayShot: keep retreating for `counter` frames, then shoot; if still too
// near, walk away again; if the retreat is walled, chase instead.
function guardWalkAwayShot(g) {
  if (!guardCanGo(g, g.dir)) { guardChasePlayer(g); return; }   // can't retreat: chase the player
  if (--g.counter > 0) return;                                   // keep walking away
  if (guardNearPlayer(g)) { guardSetWalkAway(g); return; }       // still near: keep the distance
  guardShoot(g, 0x14);                                           // far enough: shoot
}

function guardResumeChase(g) {
  g.status = 'walk';
  g.moving = true;
  g.counter = guardWalkCounter(g);
}

// Status 4 — GuardWaitChkAlert: a freshly-alerted guard heads toward Snake for a beat (moving in
// the init direction), then starts the full chase and, if the alarm isn't up yet, triggers it.
function guardWaitChkAlert(g) {
  if (--g.alertWait > 0) return;
  g.status = 'walk';
  g.moving = true;
  if (!alertMode) raiseAlarm(currentRoom);              // GuardWaitChkAlert -> SetAlertMode
}

// One alert tick: run the current status, then apply movement/animation (the generic actor
// mover moves by the fast speed while Moving=1, as the ROM does outside the status routine).
function guardAlertLogic(g) {
  // The ROM's GuardAlertLogic runs once per game ITERATION (~30Hz), and its shot/wait/walk counters
  // (0x0F..0x16, 0x14, ...) are iteration counts. updateGuard() runs every 60Hz frame, so gate the
  // DECISION/SHOOT state machine to the iteration boundary — otherwise the counters tick twice as
  // fast and guards re-aim and fire ~2x too quick (issue #21). MOVEMENT stays at 60Hz below so chase
  // speed still equals Snake (GUARD_CHASE_SPEED is the per-frame step, like the player's).
  if ((tickCounter & 1) === 0) {
    chkGuardWater(g);                        // ChkGuardWater: turn away from door/lorry/chasm exits
    if (g.status === 'waitshot') guardWaitShot(g);
    else if (g.status === 'avoid') guardAvoidObstacle(g);
    else if (g.status === 'walkaway') guardWalkAwayShot(g);
    else if (g.status === 'waitalert') guardWaitChkAlert(g);
    else guardWalk(g);
  }

  if (g.moving && guardCanGo(g, g.dir)) {
    g.x += DELTA[g.dir].dx * GUARD_CHASE_SPEED;
    g.y += DELTA[g.dir].dy * GUARD_CHASE_SPEED;
    g.stepping = true;
    if (++g.animTimer >= GUARD_WALK_TICKS) { g.animTimer = 0; g.walkPhase ^= 1; }
  } else {
    g.animTimer = 0; g.walkPhase = 0; g.stepping = false;   // standing (e.g. shooting) shows the standing frame
  }
}

// ---- The ROM's aimed-shot math (CalcShot2 + CalcQuadrantDegree + CalShootSpeed,
// Banks0123.asm:7610-7760; tables from data/maths.asm) -------------------------------
// The aim angle is NOT exact: source->target distance is QUANTIZED to 32x32-PIXEL
// BLOCKS per axis (0-7 each) and looked up in QuadrantDegrees — so there is a coarse
// set of reachable angles, and standing at the right offsets (the crate corners in
// room 50, classically) puts Snake genuinely outside all of them. A level target
// (dyBlock 0) still gets degree 8 = a slight downward slant — the ROM's famous drift.
const QUADRANT_DEGREES = [
  32,  8,  4,  3,  2,  2,  1,  1,
  56, 32, 21, 15, 12,  9,  8,  7,
  59, 43, 32, 25, 20, 16, 14, 12,
  61, 49, 39, 32, 26, 22, 19, 17,
  61, 52, 44, 37, 32, 28, 24, 21,
  62, 54, 47, 41, 36, 32, 28, 25,
  62, 56, 50, 44, 40, 35, 32, 29,
  62, 57, 52, 47, 42, 38, 35, 32,
];
const SIN_TABLE = [
  0, 6, 12, 18, 25, 31, 38, 44, 50, 56, 62, 68, 74, 80, 86, 92,
  98, 104, 109, 115, 121, 126, 132, 137, 142, 147, 153, 158, 162, 167, 172, 177,
  181, 185, 190, 194, 198, 202, 206, 209, 213, 216, 220, 223, 226, 229, 231, 234,
  237, 239, 241, 243, 245, 247, 248, 250, 251, 252, 253, 254, 254, 255, 255, 255,
];
// Returns the PER-ITERATION (30Hz) velocity: axisSpeed = shotSpeed * sin(degree) * 8
// >> 8, as 8.8 fixed -> shotSpeed*sin/8192 px/iteration; cos uses index 0x3F-degree.
function calcShot(srcX, srcY, shotSpeed) {
  const rdy = Math.round(snake.y) - Math.round(srcY);
  const rdx = Math.round(snake.x) - Math.round(srcX);
  const sy = rdy < 0 ? -1 : 1, sx = rdx < 0 ? -1 : 1;        // ShotDirectionV / H
  const deg = QUADRANT_DEGREES[((Math.abs(rdy) >> 5) & 7) * 8 + ((Math.abs(rdx) >> 5) & 7)];
  return { vy: sy * shotSpeed * SIN_TABLE[deg] / 8192,
           vx: sx * shotSpeed * SIN_TABLE[0x3F - deg] / 8192 };
}

// Spawn a bullet from the guard's torso aimed at Snake (InitShotToPlayer: CalcShot2
// with ShotSpeed 0x90), capped at the ROM pool. The velocity is the quantized-angle
// ROM aim, halved to our 60Hz ticks.
// `tiles`: which dispatch class the bullet is. ID_GUARD_BULLET (0x2F, alert guards) and
// ID_BULLET_VERT (0x3B, shooters/suppressors/BIG BOSS) run BulletLogic = tile-checked;
// ID_BULLET (0x3D, jetpacks/Hind D/lorry shooters) and ID_TANK_BULLET (0x3E) run
// DummyLogic2 = they fly THROUGH walls.
// (Named fireGuardBullet — a same-named player fireBullet was silently SHADOWING this
// since the weapons slice, killing every aimed guard shot. Found via the Hind D port.)
function fireGuardBullet(g, tiles = true) {
  if (bullets.length >= GUARD_MAX_BULLETS) return;
  const ox = g.x, oy = g.y - 16;                         // from the torso
  const v = calcShot(ox, oy, 0x90);
  bullets.push({ x: ox, y: oy, vx: v.vx / 2, vy: v.vy / 2, tiles, srcId: tiles ? ID_GUARD_BULLET : ID_BULLET });
  playShot();
}

// Advance bullets; remove any that leave the room or strike Snake (dealing damage if he's
// vulnerable — the bullet is consumed either way so it can't linger inside him).
// Tile-checked bullets (b.tiles — the 0x2F/0x3B classes) run BulletLogic
// (collisions.asm:180): railing tiles pass, and a hit only removes the bullet when the
// tile TWO ROWS DOWN is also solid (the anti-railing double probe). The 0x3A/0x3C/
// 0x3D/0x3E classes (sgunner/MGK/aimed/tank) have no tile check at all (DummyLogic2).
function updateBullets() {
  const c = assets.collision;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy;
    if (b.sgAge != null) b.sgAge++;           // the shotgun blast expands as it flies
    if (b.x < 0 || b.x >= VIEW_W || b.y < 0 || b.y >= VIEW_H) { bullets.splice(i, 1); continue; }
    if (b.tiles && c) {
      const tx = b.x >> 3, ty = b.y >> 3;
      const t1 = c.tiles[ty * c.width + tx];
      if (t1 !== RAILING_LEFT && t1 !== RAILING_RIGHT && c.solid[ty * c.width + tx]) {
        const t2 = c.tiles[(ty + 2) * c.width + tx];
        if (t2 !== RAILING_LEFT && t2 !== RAILING_RIGHT && c.solid[(ty + 2) * c.width + tx]) {
          bullets.splice(i, 1); continue;
        }
      }
    }
    if (hitsSnake(b.x, b.y)) { damage(b.dmg || BULLET_DAMAGE, b.srcId); bullets.splice(i, 1); }
  }
}

// ---- Machine Gun Kid (MachGunKidLogic, logic/actors/machinegunkid.asm) ----------------------
// Room 20's boss: he slides along the top corridor (X 0x20-0xE0 at ±4/iteration, Y fixed
// 0x34) above the three pillar columns, raining 8-damage bullet bursts down the lanes
// (speedY 5, X fan ±0.5/iteration) while Snake takes cover. MachGunStatus bit 0 = dead
// (permanent), bit 1 = the intro speech shown once (text 79, unskippable). Boss music =
// "Mercenary" (SetBossMusic, tank.asm:30), restored to area silence on death/exit.
let mgkDead = false, mgkSpeechDone = false;   // MachGunStatus bits
let boss = null;
let mgkSheet = null, mgkMeta = null;
let bossMusicSrc = null;
const MGK_LIFE = 0x14;                        // idxActorLife[ID_MACH_GUN_KID-1] = 20
const MGK_BULLET_DMG = 8;                     // ActorTouchDamage[ID_SHOT_M_GUN_KID-1]
const MGK_EXPL_SHAPE = { offY: 0, distY: 0x14, offX: 0, distX: 0x10 };  // ActorShapeExpl 0x1B
// MGK body contact: InitMachGunKid leaves COLLISION_CFG=3, so his body deals
// ActorTouchDamage[ID_MACH_GUN_KID]=4. Touch shape 0x1A = (-4,8,0,0x0C). (#42)
const MGK_TOUCH_DMG = actorTouchDmg(ID_MACH_GUN_KID);
const MGK_TOUCH_SHAPE = { offY: -4, distY: 8, offX: 0, distX: 0x0C };

function buildBoss(n) {
  stopBossMusic();
  if (n === 20 && !mgkDead) {                 // ActorsRoom020: ID_MACH_GUN_KID at (0xE0, 0x34)
    boss = { kind: 'mgk', x: 0xE0, y: 0x34, status: 0, timer: 2, wait: 0, burst: 0, vx: 0,
             sprite: 'fire', anim: 0, life: MGK_LIFE };
  } else if (n === 57 && !sgDead) {           // ActorsRoom057: ID_SHOT_GUNNER at (0x90, 0x38)
    boss = { kind: 'sg', x: 0x90, y: 0x38, status: 0, timer: 2, wait: 0, vx: 0, dir: 'left',
             sprite: 'stand', anim: 0, life: SG_LIFE, inv: false };
  } else boss = null;
}

function startBossMusic() {
  stopAreaMusic();                              // SetBossMusic replaces the area music
  if (!audioCtx || !assets.mercenaryBuf || bossMusicSrc) return;
  bossMusicSrc = audioCtx.createBufferSource();
  bossMusicSrc.buffer = assets.mercenaryBuf;
  applyMusicLoop(bossMusicSrc, assets.mercenaryBuf);   // intro once, then loop the body — issue #16
  bossMusicSrc.connect(audioOut());
  bossMusicSrc.start();
}
function stopBossMusic() {
  if (!bossMusicSrc) return;
  try { bossMusicSrc.stop(); } catch (e) {}
  bossMusicSrc = null;
  startAreaMusic();                             // the area music returns after the boss
}

// One boss iteration, dispatched by kind.
function bossTick() {
  const b = boss;
  if (!b) return;
  if (b.life <= 0) {                          // KillActor -> DismissActor7/8: the dead latch
    if (b.kind === 'mgk') mgkDead = true; else sgDead = true;
    playBuf(assets.guardDeadBuf);             // enemy-dead SFX 0x16
    stopBossMusic();
    boss = null;
    return;
  }
  if (b.kind === 'sg') { sgTick(b); return; }
  b.anim++;
  if (Math.abs(b.y + MGK_TOUCH_SHAPE.offY - snake.y) < MGK_TOUCH_SHAPE.distY &&
      Math.abs(b.x + MGK_TOUCH_SHAPE.offX - snake.x) < MGK_TOUCH_SHAPE.distX)
    damage(MGK_TOUCH_DMG);                       // ChkTouchEnemy: MGK body contact (no armor)
  switch (b.status) {
    case 0:                                   // MachGunKidIntro
      if (--b.timer > 0) return;
      if (!mgkSpeechDone) { mgkSpeechDone = true; setText(79, 2); }   // "I'm Machine Gun..."
      startBossMusic();
      mgChoseDir(b);
      return;
    case 1: {                                 // MG_ThinkMovement
      if (--b.wait <= 0) {
        b.vx = Math.random() < 0.5 ? -4 : 4;  // ld a,r — random direction
        b.sprite = 'walk'; b.wait = 8; b.status = 2;
        return;
      }
      const dxp = snake.x - b.x + 8;          // MG_ChkSameWall: hiding in his column?
      if (dxp >= 0 && dxp < 0x11) return;     // yes: keep waiting
      b.vx = snake.x < b.x ? -4 : 4;          // no: move toward the player
      b.sprite = 'walk'; b.wait = 8; b.status = 2;
      return;
    }
    case 2:                                   // MG_MoveToShot: walk 8 iterations, then stop
      b.x += b.vx;
      if (--b.wait > 0) return;
      b.sprite = 'fire'; b.wait = 0x28; b.status = 3; b.vx = 0;
      return;
    case 3: {                                 // MG_Shooting
      if (Math.abs(snake.x - b.x) > 0x30) { mgChoseDir(b); return; }  // out of his arc
      if (--b.wait <= 0) { mgChoseDir(b); return; }
      if ((b.wait & 3) !== 0) { b.sprite = 'fire'; return; }          // every 4th iteration
      b.sprite = 'recoil';
      b.burst = (b.burst + 1) & 7;
      let d = b.burst;
      if (d >= 5) d = 8 - d;                  // the 0..4..0 fan cycle
      // ID_SHOT_M_GUN_KID: speedX = (d*0x40 - 0x80)/256 px/iteration, speedY = 5 —
      // halved to our per-tick bullet units (the guard-bullet convention).
      bullets.push({ x: b.x, y: b.y, vx: (d - 2) * 0.125, vy: 2.5, dmg: MGK_BULLET_DMG, srcId: ID_SHOT_M_GUN_KID });
      playBuf(assets.bulletShotBuf);          // SFX 5 "Bullet shot"
      return;
    }
    case 4:                                   // MG_MoveToHide
      b.x += b.vx;
      if (--b.wait > 0) return;
      b.status = 1; b.vx = 0; b.wait = 0x2D; b.sprite = 'fire';
      return;
  }
}

// ---- Shotgunner (ShotGunnerLogic, logic/actors/shotgunner.asm) ------------------------------
// Room 57's boss (the basement on the prison-escape route): INVULNERABLE somersault rolls
// (±4/iteration until a wall or the 0x0B timer), then a standing window (0x2D iterations)
// firing an aimed expanding shotgun blast every 16th iteration (CalcShot2 speed 0x90 —
// the guard-bullet rate — SFX 0x0F, 8 damage) — unless Snake hides in the crate corner
// (PlayerY >= 166 AND PlayerX >= 170). ShotGunnerStat bit 0 = dead (permanent), bit 1 =
// the intro speech (text 61, unskippable, once).
let sgDead = false, sgSpeechDone = false;     // ShotGunnerStat bits
let sgSheet = null, sgMeta = null;
const SG_LIFE = 0x14;                         // idxActorLife[ID_SHOT_GUNNER-1] = 20
const SG_SHOT_DMG = 8;                        // ActorTouchDamage[ID_SGUNNER_SHOT-1]
const SG_TOUCH_DMG = 4;                       // ActorTouchDamage[ID_SHOT_GUNNER-1]

function sgTick(b) {
  b.anim++;
  switch (b.status) {
    case 0:                                   // ShotGunnerIntro
      if (--b.timer > 0) return;
      if (!sgSpeechDone) { sgSpeechDone = true; setText(61, 2); }   // "I'M SHOOT GUNNER!..."
      startBossMusic();
      sgStartRoll(b);
      return;
    case 1: {                                 // ShotGunnerRoll: invulnerable, no touch
      b.sprite = 'roll' + ([1, 2, 3, 2][(b.anim >> 1) & 3]);        // SGunnerRollSpr cycle
      const nx = b.x + b.vx;
      if (blocked(nx, b.y, b.dir) || --b.wait <= 0) {               // ChkTileCollision / timer
        b.vx = 0; b.sprite = 'stand'; b.wait = 0x2D; b.status = 2; b.inv = false;
        return;
      }
      b.x = nx;
      return;
    }
    case 2: {                                 // SGunnerShotLogic: stand and shoot
      if (--b.wait <= 0) { sgStartRoll(b); return; }                // SGunnerThinkDir
      // standing touch (the rolls disable collisions entirely)
      if (Math.abs(b.y + GUARD_TOUCH_SHAPE.offY - snake.y) < GUARD_TOUCH_SHAPE.distY &&
          Math.abs(b.x + GUARD_TOUCH_SHAPE.offX - snake.x) < GUARD_TOUCH_SHAPE.distX)
        damage(SG_TOUCH_DMG);
      if (snake.y >= 166 && snake.x >= 170) return;                 // safe behind the boxes
      if ((b.anim & 0x0F) !== 0) return;                            // shoot every 16th iteration
      const dx = snake.x - b.x, dy = (snake.y - 12) - (b.y - 16);
      const len = Math.hypot(dx, dy) || 1;                          // CalcShot2: aimed, speed 0x90
      bullets.push({ x: b.x, y: b.y - 16, vx: dx / len * GUARD_BULLET_SPEED,
                     vy: dy / len * GUARD_BULLET_SPEED, dmg: SG_SHOT_DMG, sgAge: 0, srcId: ID_SGUNNER_SHOT });
      playBuf(assets.shotgunBuf);                                   // SFX 0x0F
      return;
    }
  }
}

// SGunnerThinkDir / InitShotGunner2: roll toward the player at ±4 for 0x0B iterations.
function sgStartRoll(b) {
  b.vx = snake.x < b.x ? -4 : 4;
  b.dir = b.vx < 0 ? 'left' : 'right';
  b.wait = 0x0B;
  b.status = 1;
  b.inv = true;                               // COLLISION_CFG 0: shots pass through, no touch
}

// MG_ChoseDir: bounce off the X limits (0x20 / 0xE0), else head toward the player.
function mgChoseDir(b) {
  if (b.x >= 0xE0) b.vx = -4;
  else if (b.x <= 0x20) b.vx = 4;
  else b.vx = snake.x < b.x ? -4 : 4;
  b.sprite = 'walk'; b.wait = 8; b.status = 4; // MOVING -> hide status
}

function drawBoss() {
  const b = boss;
  if (!b) return;
  const sheet = b.kind === 'sg' ? sgSheet : mgkSheet;
  const m = b.kind === 'sg' ? sgMeta : mgkMeta;
  if (!sheet || !m) return;
  const key = b.sprite === 'walk' ? ((b.anim & 4) ? 'walk2' : 'walk1') : b.sprite;
  const f = m.frames[key];
  if (!f) return;
  ctx.drawImage(sheet, f.x, f.y, f.w || m.frameWidth, f.h || m.frameHeight,
                Math.round(b.x - m.anchorX), Math.round(b.y - m.anchorY),
                f.w || m.frameWidth, f.h || m.frameHeight);
}

// KillActor (Banks0123.asm:13192): play the enemy-dead SFX (0x16, decoded guard-dead.wav) and
// dismiss the actor (the guard's kill logic, KillEnemy, just removes him). In-flight guard
// bullets are independent actors (BulletLogic) and keep flying — they are NOT cleared by a
// kill. The alarm is NOT stopped here either — it is game-wide and ends only via chkAlarmEnd
// (the alert room being cleared counts). (NumRespawnGuards needs the multi-actor system.)
// ---- Room-16 switch guard (GuardSwitchLogic, logic/actors/guardswitch.asm) -----------------
// Patrols X 0x50..0xD0 (pausing to look north at 0x50/0x98/0xD0); on sighting Snake — or on any
// alarm — runs left to the switch (X<0x25), powers the electric floor (ID_POWER_SWITCH at
// 0x24/0x70 + SFX click), then steps right and guards it, firing through-wall ID_BULLET shots.
function swGoToSwitch(g) { g.swStatus = 2; g.dir = 'left'; g.moving = true; }
function swAlarm(g) {
  raiseAlarm(currentRoom);
  g.alertIconTimer = ALERT_ICON_TICKS;                  // DrawAlertSign flash
  g.swStatus = 6; g.swWait = 0x0F; g.dir = snake.x < g.x ? 'left' : 'right';
}
// GuardSwChkBox: the cardboard box hides Snake from the switch guard only while STILL — a MOVING box
// still alarms (matches GuardSwChkBox testing PlayerSpeedX/Y).
function swBoxOk() { return !(snake.anim === ANIM_BOX && snake.state !== 'walk'); }
// GuardSwChkSeeY: the lower-half tripwire — the switch guard does NOT use a directional LOS; Snake at
// PlayerY >= 0x80 is "inline" and triggers the alarm regardless of the guard's facing/X (box-aware). (#94)
function swChkSeeY() { return snake.y >= 0x80 && swBoxOk(); }
// GuardSwChkPlayer (look-north): at the right limit (0xD0), Snake far-right (PlayerX >= 0xC0) is seen;
// otherwise at 0x98/0x50 Snake within ~8px of the guard's X is seen; else the Y tripwire applies. (#94)
function swChkPlayer(g) {
  if (g.x >= 0xD0) return snake.x >= 0xC0 ? swBoxOk() : swChkSeeY();
  if (Math.abs(snake.x - g.x) <= 8) return swBoxOk();   // GuardSwChkSee: |PlayerX - GuardX + 8| < 0x11
  return swChkSeeY();
}
function switchGuardLogic(g) {
  if ((tickCounter & 1) !== 0) return;                  // ROM iteration rate
  g.stepping = false;
  switch (g.swStatus) {
    case 0:                                             // GuardSwPatrol
      if (alertMode) { swGoToSwitch(g); return; }
      if (swChkSeeY()) { swAlarm(g); return; }          // GuardSwChkSeeY: lower-half tripwire (#94)
      g.stepping = true;
      g.x += g.dir === 'right' ? 1 : -1;
      if (g.x <= 0x50) { g.x = 0x50; g.dir = 'right'; }
      else if (g.x === 0x98 || g.x >= 0xD0) {           // GuardSwPatrol2: stop + look north
        if (g.x > 0xD0) g.x = 0xD0;
        g.swTravelDir = g.dir;                          // GuardSwLookNorth resumes the SAME travel dir (#95)
        g.swStatus = 1; g.swWait = 0x1E; g.dir = 'up'; g.stepping = false; return;
      }
      return;
    case 1:                                             // GuardSwLookNorth
      if (alertMode) { swGoToSwitch(g); return; }
      if (--g.swWait > 0) { if (swChkPlayer(g)) swAlarm(g); return; }   // GuardSwChkPlayer while looking (#94)
      // wait expired: resume — only the right limit (0xD0) turns left; elsewhere keep the travel dir (#95)
      g.swStatus = 0; g.dir = g.x >= 0xD0 ? 'left' : (g.swTravelDir || 'right');
      return;
    case 2:                                             // GuardSwGoToSw
      g.stepping = true; g.dir = 'left'; g.x -= 3;
      if (g.x < 0x25) {
        g.x = 0x25; g.swStatus = 3; g.swWait = 0x0A; g.dir = 'up';
        playBuf(assets.clickBuf);                        // SFX 0x15
        powerSwitch = { x: 0x24, y: 0x70, life: 2, dmgTable: POWER_SWITCH_DMG, shotShape: { offY: 0, distY: 8, offX: 0, distX: 8 } };
        powerSwitchOn = true;                            // AddEnemy ID_POWER_SWITCH: the floor goes LIVE
      }
      return;
    case 3:                                             // GuardSwWait
      if (--g.swWait <= 0) { g.swStatus = 4; g.swWait = 0x10; g.dir = 'right'; }
      return;
    case 4:                                             // GuardSwRight: step off the switch
      g.stepping = true; g.x += 1;
      if (--g.swWait <= 0) { g.swStatus = 5; g.swWait = 1; g.dir = 'right'; }
      return;
    case 5:                                             // GuardSwShot
      if (snake.y < 0x80) return;                       // `ld a,(PlayerY); rla; ret nc`: fire only when PlayerY>=0x80 (#69)
      g.dir = snake.x < g.x ? 'left' : 'right';
      if (--g.swWait <= 0) { g.swWait = 0x10; fireGuardBullet(g, false); }   // ID_BULLET (through walls)
      return;
    case 6:                                             // GuardSwWaitSwitch
      if (--g.swWait <= 0) swGoToSwitch(g);
      return;
  }
}

// ---- Room-150 suppressor guards (GuardSilencerLogic, logic/actors/guardsupressor.asm) --------
// Four guards: the upper two slide LEFT/RIGHT and fire VERTICAL bullets; the lower two slide
// UP/DOWN and fire HORIZONTAL — a cross-fire. Idle -> move -> shoot -> turn -> walk back, on a
// random cadence. ChkChasePlayer: Snake entering the guard's lane (within 0x21 on the
// perpendicular axis) transforms the guard into a normal alert chaser.
// GuardSilencIdle/GuardSilencTurn both `jp SetWalkSpeedFast` -> DirectionSpeeds2 = ±2px/iteration. (#96)
const SIL_MOVE = { up: [0, -2], down: [0, 2], left: [-2, 0], right: [2, 0] };
function silencerLogic(g) {
  if ((tickCounter & 1) !== 0) return;                  // ROM iteration rate
  const horiz = (g.y & 0x80) === 0;                     // bit7 Y: upper move L/R, lower U/D
  if (horiz ? Math.abs(snake.y - g.y) < 0x21 : Math.abs(snake.x - g.x) < 0x21) { enterAlert(g); return; }
  g.stepping = false;
  const rnd = (n) => 1 + ((Math.random() * n) | 0);
  const move = () => { const [dx, dy] = SIL_MOVE[g.dir]; g.x += dx; g.y += dy; g.stepping = true; };
  switch (g.silState) {
    case 0:                                             // GuardSilencIdle: a direction in the axis
      if (--g.silWait > 0) return;
      g.silState = 1; g.silWait = 0x0E;
      g.dir = horiz ? (Math.random() < 0.5 ? 'left' : 'right') : (Math.random() < 0.5 ? 'up' : 'down');
      return;
    case 1:                                             // GuardSilencMovShot: move, then fire across
      move();
      if (--g.silWait > 0) return;
      g.silState = 2; g.silWait = rnd(8);
      fireAxisBullet(g, horiz ? (snake.y < g.y ? 'up' : 'down') : (snake.x < g.x ? 'left' : 'right'));
      return;
    case 2:                                             // GuardSilencTurn: wait, then reverse
      if (--g.silWait > 0) return;
      g.silState = 3; g.silWait = 0x0E; g.dir = bbOpposite(g.dir);
      return;
    case 3:                                             // GuardSilencWalk: walk back
      move();
      if (--g.silWait > 0) return;
      g.silState = 0; g.silWait = rnd(16);
      return;
  }
}

// LorryShooterLogic (lorryshooter.asm; room 104 desert ambush): a guard hidden in a parked lorry
// that, on a random timer, either shoots an aimed bullet FROM INSIDE (staying hidden), SHOWS itself
// for a beat and shoots, or WALKS OUT (down), shoots, waits, and walks back IN. The aimed shot is
// ID_BULLET (CalcShot2 toward the player) — our fireGuardBullet. Hidden = no draw, no collisions.
const lorryRndWait = () => 1 + (rndByte() & 0x0F);     // LorrySetRndWait: rnd&0xF + 1 (1..16)
function lorryShooterLogic(g) {
  if ((tickCounter & 1) !== 0) return;                  // ROM iteration rate
  switch (g.lorryStat) {
    case 0:                                             // LorryShooterThink
      if (--g.lorryWait > 0) return;
      { const r = rndByte() & 3;                        // GetRandom3 (0..3)
        if (r < 1) { fireGuardBullet(g); g.lorryWait = 0x100; return; }   // shot from INSIDE (Wait wraps -> long lull)
        if (r === 1) { g.lorryStat = 1; g.lorryWait = 0x1E; g.lorryHidden = false; g.dir = 'down'; fireGuardBullet(g); return; }
        g.lorryStat = 2; g.lorrySpeedY = 2; g.lorryWait = 0x0A; g.lorryHidden = false; g.dir = 'down'; }   // exit the lorry
      return;
    case 1:                                             // LorryShooterWait (after showing)
      if (--g.lorryWait > 0) return;
      g.lorryStat = 0; g.lorryHidden = true; g.lorryWait = lorryRndWait();
      return;
    case 2:                                             // LorryShooterWalkOut: walk down, then shoot
      g.stepping = true; g.y += g.lorrySpeedY;
      if (--g.lorryWait > 0) return;
      g.lorryStat = 3; g.lorrySpeedY = 0; g.lorryWait = 0x19; g.dir = dirToPlayer(g).far; fireGuardBullet(g);
      return;
    case 3:                                             // LorryShooterWaitOut
      if (--g.lorryWait > 0) return;
      g.lorryStat = 4; g.lorrySpeedY = -2; g.dir = 'up'; g.lorryWait = 0x0A;
      return;
    case 4:                                             // LorryShooterWalkIn: walk up, then hide
      g.stepping = true; g.y += g.lorrySpeedY;
      if (--g.lorryWait > 0) return;
      g.lorryStat = 0; g.lorrySpeedY = 0; g.dir = 'down'; g.lorryHidden = true; g.lorryWait = lorryRndWait();
      return;
  }
}

// GuardLorryLogic (guardlorry.asm; rooms 5/7): a guard parked inside a lorry that, on the emerge
// timer, walks DOWN out (setting Guard1/2/3ExitedLorry), patrols its path ONCE, then walks back UP
// in (clearing the flag) and re-arms. While OUT (patrolling) the alarm transforms it into a chaser
// (GuardLorryWalk -> TransformAlertGuard). lorryStat: 0 in-lorry, 1 emerging, 2 patrolling, 3 entering.
function lorryGuardLogic(g) {
  // Cases 0/1/3 are ROM-iteration timers (the 0x64 wait + the 0x200 = 2px/iteration emerge & enter),
  // so they run on the 30Hz gate. The PATROL (case 2) is the ROM's normal GuardLogic
  // (guardlorry.asm GuardLorryWalk -> GuardLogic), so it must run at the same 60Hz rate as every
  // other guard (updateGuard runs each tick). Gating the patrol too made it walk at HALF a normal
  // slow guard's speed.
  if (g.lorryStat !== 2 && (tickCounter & 1) !== 0) return;   // 30Hz for the timers/emerge/enter only
  switch (g.lorryStat) {
    case 0:                                             // in the lorry, waiting (status 0)
      g.lorryHidden = true; g.stepping = false;
      if (--g.lorryWait > 0) return;
      setGuardExitedLorry(g.lorryIdx, true);            // SetGuardExitsLorry
      g.lorryStat = 1; g.lorryWait = 8; g.lorryHidden = false; g.dir = 'down';
      return;
    case 1:                                             // GuardExitingLorry: walk down out
      g.stepping = true; g.y += 2;                       // SetActorSpeed Y 0x200 (2px/iteration)
      if (--g.lorryWait > 0) return;
      g.lorryStat = 2; g.target = 0; g.lorryVisited = 0;   // GetPathPoint_: first destination is point 0
      return;
    case 2:                                             // GuardLorryWalk: patrol the path once
      if (alertMode) { enterAlert(g); return; }          // out + alarm -> TransformAlertGuard
      if (g.path.length < 2) { g.lorryStat = 3; g.lorryWait = 8; g.dir = 'up'; return; }
      {
        const t = g.path[g.target], dx = t[0] - g.x, dy = t[1] - g.y;
        if (Math.abs(dx) + Math.abs(dy) <= g.speed) {    // reached this waypoint
          g.x = t[0]; g.y = t[1];
          if (++g.lorryVisited >= g.path.length) { g.lorryStat = 3; g.lorryWait = 8; g.dir = 'up'; return; }
          g.target = (g.target + 1) % g.path.length;
          return;
        }
        const horiz = g.dir === 'left' || g.dir === 'right';
        const stepDir = (horiz && Math.abs(dx) > 0) || dy === 0 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        g.dir = stepDir;
        const step = Math.min(g.speed, (stepDir === 'left' || stepDir === 'right') ? Math.abs(dx) : Math.abs(dy));
        const nx = g.x + DELTA[stepDir].dx * step, ny = g.y + DELTA[stepDir].dy * step;
        if (guardBlocked(nx, ny, stepDir)) { g.target = (g.target + 1) % g.path.length; return; }
        g.x = nx; g.y = ny; g.stepping = true;
        if (++g.animTimer >= GUARD_WALK_TICKS) { g.animTimer = 0; g.walkPhase ^= 1; }
      }
      return;
    case 3:                                             // GuardEnterLorry: walk up into the lorry
      g.stepping = true; g.y -= 2;
      if (--g.lorryWait > 0) return;
      setGuardExitedLorry(g.lorryIdx, false);           // GuardEnterLorry2: back inside
      g.lorryStat = 0; g.lorryHidden = true; g.lorryWait = 0x64; g.y = g.lorryHomeY; g.dir = 'down';
      return;
  }
}
function setGuardExitedLorry(idx, val) {                  // Guard1/2/3ExitedLorry (idx 0/1/2)
  if (idx >= 0 && idx < 3) guardExitedLorry[idx] = val;
}

// ShooterLogic (shooter.asm; rooms 88/90/91/206): an ambush guard that strafes sideways, stops to
// fire VERTICAL bullets (ID_BULLET_VERT, our fireAxisBullet), then walks back to its start —
// transforming into a normal alert chaser after 3 cycles (TransformTimer) or when the player closes
// in vertically (|PlayerY - Y| < 0x11). The strafe is the fast 2px walk; it looks up/down by half.
const shRandWait = () => 1 + (rndByte() & 0x3F);         // SetRandomWait: r&0x3F + 1
function shooterLogic(g) {
  if ((tickCounter & 1) !== 0) return;                   // ROM iteration rate
  if (Math.abs(snake.y - g.y) < 0x11) { enterAlert(g); return; }   // player vertically close -> chase
  switch (g.shStat) {
    case 0:                                              // ShooterWait
      if (--g.shWait > 0) return;
      if (--g.shTransform <= 0) { enterAlert(g); return; }          // after 3 cycles -> alert guard
      g.shStat = 1; g.moving = true; g.shWait = 0x0A;
      g.shWalkDir = Math.random() < 0.5 ? 'left' : 'right'; g.dir = g.shWalkDir;
      return;
    case 1:                                              // ShooterWalk: strafe sideways
      g.stepping = true; g.x += g.shWalkDir === 'left' ? -2 : 2;    // SetWalkSpeedFast
      if (--g.shWait > 0) return;
      g.shStat = 2; g.moving = false; g.shWait = shRandWait(); g.shShotCnt = 0;
      g.dir = (g.y & 0x80) ? 'up' : 'down';              // look up/down by the screen half
      return;
    case 2:                                              // ShooterShot: fire vertical bullets, then return
      if (--g.shWait <= 0) { g.shStat = 3; g.moving = true; return; }   // ShooterTurnBack
      if ((g.shShotCnt++ & 0x0F) === 0) fireAxisBullet(g, g.dir);       // shoot every 0x10 iterations
      return;
    case 3: {                                            // ShooterHide: walk back to the start X
      const back = OPPOSITE[g.shWalkDir]; g.dir = back; g.stepping = true;
      g.x += back === 'left' ? -2 : 2;
      if (Math.abs(g.x - g.shStartX) < 2) {
        g.x = g.shStartX; g.shStat = 0; g.moving = false;
        g.dir = (g.y & 0x80) ? 'up' : 'down'; g.shWait = shRandWait();
      }
      return;
    }
  }
}

function killGuard(g = guard) {
  playBuf(assets.guardDeadBuf);
  // DecRespawnGuards spends from the budget ONLY for reinforcement-type kills (not a plain patrol
  // guard punched/shot dead) — see makeGuard's respawnKill. (Was: EVERY kill spent — issue #22.)
  if (g.respawnKill && numRespawnGuards > 0) numRespawnGuards--;
  const i = guards.indexOf(g);
  if (i >= 0) guards.splice(i, 1);
  guard = guards[0] || null;
  // DismissActor8 (Banks0123.asm:13028-13039): the LAST of room 150's four SILENCER
  // guards drops the SUPPRESSOR at (0x62, 0x24) — SpawnItem into slot 0.
  if (g.silencer && !guards.some((x) => x.silencer)) {
    roomItems[0] = { id: 8, x: 0x62, y: 0x24 };           // SUPRESSOR pickup
    playBuf(assets.spawnBuf);                             // SFX 0x25 (SpawnItem)
  }
}

// A punch lands on the guard if he sits in Snake's directional punch area (ChkArea), and
// he isn't still inside the post-punch re-hit lockout. Each hit freezes (stuns) him; the
// third kills him. Faithful to ChkPunchEnemy + ChkKillPunching.
function tryPunchGuard() {
  const area = PUNCH_AREA[snake.dir];
  for (const g of [...guards]) {
    if (Math.abs(g.x + area.xoff - snake.x) >= PUNCH_RADIUS) continue;   // out of X range
    if (Math.abs(g.y + area.yoff - snake.y) >= PUNCH_RADIUS) continue;   // out of Y range
    if (g.stunnedCnt >= GUARD_REPUNCH_LOCK) continue;                    // can't punch too fast
    if (++g.punchesCnt >= GUARD_PUNCHES_TO_KILL) {
      chkDropItem(g);                                                    // ChkKillPunching -> ChkDropItem (punch kills only)
      killGuard(g);
    } else {
      g.stunnedCnt = GUARD_STUN_TICKS;                                   // freeze; recovers at 0
    }
    return;                                                              // one victim per punch
  }
}

// Start the ROM's Alert music (looping) on detection; falls back to a two-tone sting if
// the decoded track isn't available. Latched so it isn't retriggered every frame.
function playAlert() {
  if (alertPlaying) return;
  alertPlaying = true;
  stopAreaMusic();                    // the alert track replaces the area music (SetAreaMusic)
  if (!audioCtx) return;
  // SetAlertMode5: only a camera/laser trigger plays the distinct "Red Alert" track; everything
  // else (incl. a guard sighting in a red-alert room) plays the normal "Alert" track. (#59)
  const buf = (redAlertMusic && assets.redAlertBuf) ? assets.redAlertBuf : assets.alertBuf;
  if (buf) {
    alertSource = audioCtx.createBufferSource();
    alertSource.buffer = buf;
    applyMusicLoop(alertSource, buf);   // intro once, then loop the body — issue #16
    alertSource.connect(audioOut());
    alertSource.start();
    return;
  }
  const t0 = audioCtx.currentTime;            // fallback sting
  for (const [i, freq] of [[0, 988], [0.14, 740], [0.28, 988]]) {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, t0 + i);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + i + 0.12);
    osc.connect(gain); gain.connect(audioOut());
    osc.start(t0 + i); osc.stop(t0 + i + 0.13);
  }
}
function stopAlert() {
  alertPlaying = false;
  if (alertSource) { try { alertSource.stop(); } catch (e) {} alertSource = null; }
}

// Area music (SetAreaMusic6, RoomsMusic high nibble — data/musicradioconfig.asm):
// 0 = Theme of Tara, 1 = Sneaking Mission (the basements), 2 = TX-55 Metal Gear
// (room 118 and the final ladders 224-226), 4 = Beyond Big Boss (rooms 88-92 and 186-
// 187) — and while DestructionTimerOn the ROM forces Beyond Big Boss EVERYWHERE.
// The alert/boss tracks REPLACE the area track like the ROM's music switches, and the
// radio pauses it (resumed from the top here — a small divergence; the ROM driver
// resumes from the saved position).
// The FULL RoomsMusic byte table, verbatim from data/musicradioconfig.asm (non-Japanese branch).
// High nibble = music id (0 Tara / 1 Sneaking / 2 TX-55 / 4 Beyond Big Boss); bit 3 = incoming
// call (also in radio.json); bits 2-0 = IsolatedRoom (==1 -> shooting raises no alarm + binoculars
// disabled). Generated/verified by Tools/audit/audit-sound.mjs.
const ROOMS_MUSIC = [
  8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,
  0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,8,16,16,16,16,16,16,16,16,16,16,
  0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,64,64,64,64,64,16,16,16,
  16,16,16,24,16,16,0,0,8,0,0,0,8,0,0,24,
  16,16,16,24,24,0,32,24,0,0,17,16,16,24,1,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,1,1,1,17,25,17,17,17,17,17,17,17,1,1,1,
  1,1,9,1,1,1,1,1,1,1,65,65,17,17,17,17,
  9,9,17,1,17,17,1,1,17,1,1,17,1,1,1,17,
  0,0,0,0,0,1,1,1,1,1,1,1,16,16,0,0,
  33,33,33,0,0,0,0,0,0,0,0,0,0,0,0,0,
  1,1,1,1,1,1,1,1,1,1,1,
];
// IsolatedRoom (ChkIsolatedRoom, Banks0123.asm:1038): RoomsMusic[room] & 7 == 1 -> shooting does
// not trigger the alarm (and binoculars are disabled). Used by chkAlertTrigger alongside RoomShotSecure.
const roomIsolated = (n) => ((ROOMS_MUSIC[n] || 0) & 7) === 1;
let areaMusicSrc = null, areaMusicBuf = null;
// The ROM plays each theme's one-time intro once, then loops an internal body marker — it never
// replays the intro (issue #16). Web Audio's whole-buffer loop replayed the intro every cycle ("the
// song restarts"). music-loops.json gives the body [start,end] per track; loop just that span so the
// intro plays once. Tracks with no entry fall back to looping the whole buffer (unchanged).
const MUSIC_LOOP_KEYS = new Map();   // buffer -> music-loops.json key, populated lazily once assets load
function musicLoopKeyFor(buf) {
  if (!MUSIC_LOOP_KEYS.size) {
    MUSIC_LOOP_KEYS.set(assets.taraBuf, 'tara');
    MUSIC_LOOP_KEYS.set(assets.sneakingBuf, 'sneaking');
    MUSIC_LOOP_KEYS.set(assets.tx55Buf, 'tx55');
    MUSIC_LOOP_KEYS.set(assets.escapeBuf, 'escape');
    MUSIC_LOOP_KEYS.set(assets.mercenaryBuf, 'mercenary');
    MUSIC_LOOP_KEYS.set(assets.foxhunterBuf, 'foxhunter');
    MUSIC_LOOP_KEYS.set(assets.alertBuf, 'alert');
    MUSIC_LOOP_KEYS.set(assets.redAlertBuf, 'red-alert');
  }
  return MUSIC_LOOP_KEYS.get(buf) || null;
}
function applyMusicLoop(src, buf) {
  src.loop = true;
  const L = musicLoops && musicLoops[musicLoopKeyFor(buf)];
  if (L && L.end > L.start && L.end <= src.buffer.duration + 0.05) {
    src.loopStart = L.start;
    src.loopEnd = Math.min(L.end, src.buffer.duration);
  }
}
function areaTrackFor(n) {
  if (destructionOn) return assets.escapeBuf || assets.taraBuf;   // the countdown override
  // InitLorryShooter forces the Alert track (0x32) in the lorry-ambush room without raising AlertMode.
  if (n === currentRoom && guards.some((g) => g.lorryShooter)) return assets.alertBuf || assets.taraBuf;
  const nib = (ROOMS_MUSIC[n] || 0) >> 4;                          // RoomsMusic high nibble (SetAreaMusic6)
  return (nib === 1 ? assets.sneakingBuf : nib === 2 ? assets.tx55Buf
        : nib === 4 ? assets.escapeBuf : assets.taraBuf) || assets.taraBuf;
}
function startAreaMusic() {
  if (!audioCtx || !assets.taraBuf || areaMusicSrc) return;
  if (alertPlaying || bossMusicSrc) return;        // those tracks replace the area music
  areaMusicBuf = areaTrackFor(currentRoom);
  if (!areaMusicBuf) return;
  areaMusicSrc = audioCtx.createBufferSource();
  areaMusicSrc.buffer = areaMusicBuf;
  applyMusicLoop(areaMusicSrc, areaMusicBuf);     // loop the body span (intro plays once) — issue #16
  areaMusicSrc.connect(audioOut());
  areaMusicSrc.start();
}
function stopAreaMusic() {
  if (areaMusicSrc) { try { areaMusicSrc.stop(); } catch (e) {} areaMusicSrc = null; areaMusicBuf = null; }
}
// Re-tune on room changes / the countdown arming: restart only when the track differs.
function updateAreaMusic() {
  if (!areaMusicSrc) return;
  if (areaMusicBuf !== areaTrackFor(currentRoom)) { stopAreaMusic(); startAreaMusic(); }
}

// ---- Snake damage, death + restart -----------------------------------------
// Snake's body box (anchor at the feet, sprite ~16 wide x ~28 tall above it) — used for
// bullet hits and guard contact.
function hitsSnake(px, py) {
  return px >= snake.x - 7 && px <= snake.x + 7 && py >= snake.y - 30 && py <= snake.y + 2;
}

// Apply n damage unless Snake is in his post-hit i-frames (DamageDelayTimer). Life clamps at 0
// (DecrementLife_B); reaching 0 triggers the dead state (SetDead), else a hit blip + the i-frame
// blink (drawn in draw()) give feedback (the ROM has no blink — added here for legibility).
function damage(n, srcId) {
  if (snake.invulnTimer > 0) return;
  // ChkUsingArmor (logic/touchenemy.asm:181-187): the vest halves damage ONLY for enemy bullets
  // (ARMOR_HALVES: ID_SGUNNER_SHOT, ID_GUARD_BULLET, ID_BULLET_HORIZ..ID_TANK_BULLET). Body contact,
  // mines, explosions, and the boomerang (0x3F) are full damage even with armor on. (Issue #27.)
  if (selectedItem === SELECTED_ARMOR && ARMOR_HALVES.has(srcId)) n >>= 1;
  snake.life = Math.max(0, snake.life - n);
  snake.invulnTimer = INVULN_TICKS;
  if (snake.life === 0) { enterDead(); return; }
  playHit();
}

// ChkTouchEnemies → ChkTouchEnemy → TouchPlayer (logic/touchenemy.asm): each frame, clear the
// touched flag, then test Snake against the guard's ROM touch box. A STUNNED guard registers no
// touch at all (no flag, no damage — touchenemy.asm:103). A touch sets TOUCH_INFO bit 7 (read by
// the discovery paths: ChkSeePlayer2 for awake guards, ListenShotsChkTouch for sleeping ones) and
// damages Snake by ActorTouchDamage — damage() already models the DamageDelayTimer i-frames and
// the damage SFX. No alert-state gate: patrol, alert, and sleeping guards all hurt on contact.
function chkTouchGuard() {
  for (const g of guards) {
    g.touched = false;                                         // ChkTouchEnemy clears bit 7 each scan
    if (g.lorryHidden) continue;                               // hidden in the lorry: COLLISION_CFG 0
    if (g.stunnedCnt > 0) continue;                            // stunned: no touch, no damage
    if (Math.abs(g.y + GUARD_TOUCH_SHAPE.offY - snake.y) >= GUARD_TOUCH_SHAPE.distY) continue;
    if (Math.abs(g.x + GUARD_TOUCH_SHAPE.offX - snake.x) >= GUARD_TOUCH_SHAPE.distX) continue;
    g.touched = true;                                          // TOUCH_INFO bit 7
    damage(g.touchDmg);                                        // TouchPlayer: ActorTouchDamage (body contact, no armor)
  }
}

// SetDead: lock control, clear bullets, stop the alert, play the death tune, start the timer.
function enterDead() {
  gameState = 'dead';
  snake.controlMod = CONTROL_DEAD; snake.anim = ANIM_DEAD;   // control mode 3 / death animation
  deadTimer = DEAD_TICKS;
  bullets.length = 0;
  playerShots.length = 0;
  stopAlert();
  stopAreaMusic();                    // SetDead: the death tune replaces the music
  playDead();
}

// GS_GameOver (Banks0123.asm:10410): once the dead animation (DeadTimer) ends, the PLAYING flag
// clears and the GAME OVER / CONTINUE F5 screen shows while the death music plays. F5 arms a
// continue (RestoreGameFlag); when the music finishes the game continues from the last checkpoint
// or RebootGames to the title. The "music finished" wait is approximated by GAME_OVER_TICKS. (#35)
function enterGameOver() {
  gameState = 'gameover';
  gameOverTimer = GAME_OVER_TICKS;
  continueArmed = false;
}
// RebootGame -> ResetGameStat: no continue -> stop the music and return to the title (a fresh start).
function rebootToTitle() {
  stopAreaMusic(); stopAlert(); stopBossMusic(); stopRadioNoise();
  alertMode = false; redAlertFlag = false;
  gameState = 'title'; titlePhase = 'ready'; titleIdle = 0;
  titleClear(); drawLogoParked();
}

// DeadLogic end / RestoreGameStat: continue from the last checkpoint. The ROM reverts the whole
// progress (room, position, doors, equipment, ammo, rank) to the last SaveStatRooms snapshot — so
// items/doors/rank gained since the checkpoint are LOST — then respawns there with a fresh body.
function restart() {
  deadTimer = 0;
  bullets.length = 0;
  playerShots.length = 0;
  if (checkpointSnapshot) {                  // RestoreGameStat: roll back to the checkpoint
    restoreProgress(checkpointSnapshot);     // sets gameState='play', setRoom, position, control mode
    // RestoreGameStat (checkpoints.asm:44-50) restores the buffered GameDataAreas — including the
    // checkpoint-time Life — and only zeroes DamageDelayTimer. NO refill: Snake resumes at the
    // (possibly damaged) life he had when he crossed into the checkpoint room. (#36)
    snake.invulnTimer = 0;                   // zero DamageDelayTimer (restoreProgress kept snake.life)
    snake.animTimer = 0; snake.walkPhase = 0; snake.punchTimer = 0;
    poisoned = false; escaped = false;       // the continue clears Poisoned (DamageDelayTimer=0)
    stopAlarm();
    startAreaMusic();
    return;
  }
  // No checkpoint yet (the intro was bypassed via ?room/#auto, or a dev spawn): the legacy respawn
  // at the intro landing / start room, keeping the current inventory.
  gameState = 'play';
  if (introCheckpoint) { snake.x = introCheckpoint.x; snake.y = introCheckpoint.y; snake.dir = 'up'; }
  else { snake.x = SPAWN_X; snake.y = SPAWN_Y; snake.dir = 'down'; }
  snake.state = 'idle';
  snake.animTimer = 0; snake.walkPhase = 0; snake.punchTimer = 0;
  snake.maxLife = RANK_MAX_LIFE[snake.class];
  snake.life = snake.maxLife; snake.invulnTimer = 0;
  snake.controlMod = CONTROL_NORMAL; snake.anim = ANIM_NORMAL;   // back to walk (mode 0)
  escaped = false;
  poisoned = false;
  stopAlarm();
  setRoom(introCheckpoint ? 121 : manifest.start);   // rebuilds the guard/patrol, clears the alert
  startAreaMusic();
}

// Guard shot SFX 5 = Sfx_BulletShot (sounddata.asm:49, confirmed by InitMGunKidShot's
// `ld a,5` — decoded bullet-shot.wav); the old synth blip stays as the fallback.
function playShot() {
  if (!audioCtx) return;
  if (assets.bulletShotBuf) { playBuf(assets.bulletShotBuf); return; }
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = 'square'; osc.frequency.setValueAtTime(420, t0);
  osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.08);
  gain.gain.setValueAtTime(0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
  osc.connect(gain); gain.connect(audioOut());
  osc.start(t0); osc.stop(t0 + 0.1);
}

// Damage SFX 0x10 (PlayDamageSfx, decoded damage.wav); a short synth blip if unavailable.
function playHit() {
  if (!audioCtx) return;
  if (assets.damageBuf) { playBuf(assets.damageBuf); return; }
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = 'square'; osc.frequency.setValueAtTime(180, t0);
  osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
  gain.gain.setValueAtTime(0.18, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
  osc.connect(gain); gain.connect(audioOut());
  osc.start(t0); osc.stop(t0 + 0.14);
}

// Pickup SFX 0x24 (decoded pickup.wav); a short two-note synth chime if it isn't available.
function playPickup() {
  if (!audioCtx) return;
  if (assets.pickupBuf) { playBuf(assets.pickupBuf); return; }
  const t0 = audioCtx.currentTime;
  for (const [i, freq] of [[0, 660], [0.07, 990]]) {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, t0 + i);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + i + 0.06);
    osc.connect(gain); gain.connect(audioOut());
    osc.start(t0 + i); osc.stop(t0 + i + 0.07);
  }
}

// Enemy-drop spawn SFX 0x25 (decoded spawn.wav); falls back to the pickup chime.
function playSpawn() {
  if (assets.spawnBuf) { playBuf(assets.spawnBuf); return; }
  playPickup();
}

// Empty-gun "click" when firing with no ammo (ChkHandGunShot SFX 0x15, decoded click.wav);
// a short synth tick if unavailable.
function playClick() {
  if (!audioCtx) return;
  if (assets.clickBuf) { playBuf(assets.clickBuf); return; }
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.type = 'square'; osc.frequency.setValueAtTime(1200, t0);
  gain.gain.setValueAtTime(0.06, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.03);
  osc.connect(gain); gain.connect(audioOut());
  osc.start(t0); osc.stop(t0 + 0.04);
}

// Death tune (decoded dead.wav, played once); a short descending sting if it isn't available.
function playDead() {
  if (!audioCtx) return;
  if (assets.deadBuf) { playBuf(assets.deadBuf); return; }
  const t0 = audioCtx.currentTime;
  for (const [i, freq] of [[0, 440], [0.18, 330], [0.36, 220]]) {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, t0 + i);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + i + 0.16);
    osc.connect(gain); gain.connect(audioOut());
    osc.start(t0 + i); osc.stop(t0 + i + 0.17);
  }
}

// Draw the guard from its decoded spritesheet (guard.png/guard.json). A stunned guard is
// drawn upright in his frozen pose (the bounce comes from his shifted Y); a dead guard is
// already gone (guard === null). The "!" alert icon sits above an alerted guard.
function drawGuard() {
  for (const g of guards) drawGuardOne(g);
}
// Recolour guard.png for a room's sprite palette (ROM SetSprPal): the sheet is baked with ONE
// palette, but the ROM colours the guard via the room's SprsetPal — slot 2 (uniform) and 0x0D
// (face). guard-palettes.json gives the per-room target RGBs; swap the baked uniform/face pixels
// (the outline 0x0F is not set by any SprsetPal, so it stays). Cached per distinct palette.
const GUARD_SRC_UNIFORM = [40, 120, 40];    // WebExporter ExportGuard baked uniform (slot 2)
const GUARD_SRC_FACE = [216, 176, 104];     // baked face/hands (slot 0x0D)
function guardSheetFor(pal) {
  if (!guardSheet || !pal || (!pal.u && !pal.f)) return guardSheet;
  const key = (pal.u || []).join(',') + '|' + (pal.f || []).join(',');
  if (guardSheetCache.has(key)) return guardSheetCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = guardSheet.width; cv.height = guardSheet.height;
  const c = cv.getContext('2d');
  c.drawImage(guardSheet, 0, 0);
  const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
  const u = pal.u || GUARD_SRC_UNIFORM, f = pal.f || GUARD_SRC_FACE;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (d[i] === GUARD_SRC_UNIFORM[0] && d[i + 1] === GUARD_SRC_UNIFORM[1] && d[i + 2] === GUARD_SRC_UNIFORM[2]) {
      d[i] = u[0]; d[i + 1] = u[1]; d[i + 2] = u[2];
    } else if (d[i] === GUARD_SRC_FACE[0] && d[i + 1] === GUARD_SRC_FACE[1] && d[i + 2] === GUARD_SRC_FACE[2]) {
      d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2];
    }
  }
  c.putImageData(img, 0, 0);
  guardSheetCache.set(key, cv);
  return cv;
}
function drawGuardOne(g) {
  if (g.lorryHidden) return;                  // hidden inside the lorry: no sprite
  const a = guardAtlas;
  const sheet = activeGuardSheet || guardSheet;
  if (!a || !sheet) { drawGuardFallback(g); return; }

  // ROM walk is a 2-frame Anim2FramesActor toggle: GuardWalk1 (walk1) <-> GuardWalk2 (walk2)
  // (ChangeGuardSprDir keeps SpriteId inside the walk pair). A stopped guard shows the dedicated
  // standing frame Guard<Dir> — phase-1 legs — set by GuardPatrolTurn (guard.asm:154,
  // SpriteId = Direction + 8); exported as '<dir>-idle'. Both patrol and alert (chase) animate
  // the walk; a frozen/stunned guard stands. A sleeping guard holds a static down pose
  // (GuardSleeping) with an animated "Zzz" sign.
  const moving = !g.asleep && g.stunnedCnt === 0 && g.stepping;
  const dir = g.asleep ? 'down' : g.dir;
  const state = moving ? (g.walkPhase ? 'walk2' : 'walk1') : 'idle';
  const f = a.frames[dir + '-' + state] || a.frames[dir + '-idle'];
  if (!f) { drawGuardFallback(g); return; }
  const fw = a.frameWidth, fh = a.frameHeight;

  ctx.drawImage(sheet, f.x, f.y, fw, fh,
                Math.round(g.x - a.anchorX), Math.round(g.y - a.anchorY), fw, fh);
  // Animated "Zzz" sign above the sleeping guard's head (ChkSleepyGuard's sign actor; SprZzz frames
  // cycled by AnimZzzSign — frame 0 fills the cell, 1/2 shrink as they drift up-and-right). The ROM
  // places the sign actor at d=guard.X (same column), e=guard.Y - 0x23 — i.e. its top sits 0x23 (35)
  // px above the guard sprite top, centred on the guard's x. (Was drawn ~19px too low — issue #15.)
  if (g.asleep && zzzImg && zzzMeta) {
    const zf = ZZZ_FRAMES[g.zzzFrame] % zzzMeta.frames, zw = zzzMeta.frameWidth, zh = zzzMeta.frameHeight;
    ctx.drawImage(zzzImg, zf * zw, 0, zw, zh,
                  Math.round(g.x) - (zw >> 1), Math.round(g.y) - a.anchorY - 0x23, zw, zh);
  }
  if (g.state === 'alert' && g.alertIconTimer > 0 && gameState !== 'dead') drawAlertIcon(g);
}

// ?collision debug: tint every solid tile so the collision footprint is visible vs. the room art.
function drawCollisionOverlay() {
  const c = assets.collision;
  if (!c) return;
  ctx.fillStyle = 'rgba(255,0,0,.35)';
  for (let ty = 0; ty < c.height; ty++)
    for (let tx = 0; tx < c.width; tx++)
      if (c.solid[ty * c.width + tx]) ctx.fillRect(tx * 8, ty * 8, 8, 8);
}

function drawAlertIcon(g) {
  const x = Math.round(g.x), y = Math.round(g.y);
  const icon = redAlertFlag ? (alertIconRed || alertIcon) : alertIcon;   // red sign for a red alert
  if (icon) { ctx.drawImage(icon, x - 8, y - 48); return; }              // decoded "!" above head
  ctx.fillStyle = redAlertFlag ? '#ff0000' : '#ff3030';
  ctx.fillRect(x - 1, y - 40, 3, 6);
  ctx.fillRect(x - 1, y - 32, 3, 3);
}

// Fallback figure if the guard spritesheet is missing.
function drawGuardFallback(g) {
  const x = Math.round(g.x), y = Math.round(g.y);
  const top = y - 18 + (g.walkPhase ? 1 : 0);
  ctx.fillStyle = '#2f5a2f'; ctx.fillRect(x - 6, top + 4, 12, 10);
  ctx.fillStyle = '#caa07a'; ctx.fillRect(x - 4, top, 8, 6);
  if (g.state === 'alert' && g.alertIconTimer > 0 && gameState !== 'dead') drawAlertIcon(g);
}

// ---- The full arsenal (ChkWeaponShot, logic/weaponuse.asm + logic/weapon/*.asm) -------------
// Every weapon fires into the shared 6-slot pool. Per-tick movement keeps the bullets'
// established literal-pixel convention (geometry exact, flight time 2x the 30Hz ROM);
// stationary fuses/explosions run at x2 tick counts so their REAL durations match the ROM.
const LAND_MINE = 6, MISSILE = 7;        // Enums.asm weapon ids (PLASTIC_BOMB declared above)
const WEAPON_MAX = [0, 6, 6, 2, 1, 1, 3, 1];   // data/weapondamage.asm headers (+ the
                                               //   slot-0-only rules for rocket/bomb/missile)
const WEAPON_DMG = [0, 2, 2, 5, 0x0A, 5, 5, 5];   // damage vs guards (weapondamage.asm)
// ActorShapeExpl=1 -> ImpactAreasInfo row 1 (0,14h,0,14h): grenade/bomb/mine hits use a
// +-20px box; bullets/rocket/missile keep the projectile shape (GUARD_SHAPE).
const EXPL_SHAPE = { offY: 0, distY: 0x14, offX: 0, distX: 0x14 };
// Per-enemy weapon damage (idxWeaponPow, data/weapondamage.asm): each weapon's table is
// indexed by ACTOR ID. Actors carrying their own dmgTable row override the guard-class
// WEAPON_DMG default — e.g. the Hind D is damaged ONLY by the grenade launcher.
function weaponDamage(t, type) {
  return (t.dmgTable && t.dmgTable[type] != null) ? t.dmgTable[type] : WEAPON_DMG[type];
}
// SMG_BulletSpeeds (logic/weapon/smg.asm:139, 8.8 fixed-point): the 8-step burst fan —
// straight, +-1.5, +-3 px drift across the facing axis.
const SMG_DRIFT = [0, -1.5, -3, -1.5, 0, 1.5, 3, 1.5];
// GrenadeYOffsets (grenade.asm:131): the visual parabola indexed by the remaining timer.
const GRENADE_ARC = [16, 8, 0, -4, -8, -12, -16, -20, -24, -28, -32, -36, -38, -40,
                     -38, -36, -32, -28, -24, -20, -16, -12, -8, -4, 0];
// PBombDirOffset (plasticbomb.asm:80): bomb placement offset from the player, per facing.
const PBOMB_OFFSET = { up: [0, -0x10], down: [0, 8], left: [-0x0C, 0], right: [0x0C, 0] };
let smgTimer = 0, smgBurst = 0;   // SubMachGunTimer / BurstCnt
let shotsSheet = null, shotsMeta = null;   // shots.png / shots.json

const activeShotsOf = (t) => playerShots.filter((s) => (s.type || HAND_GUN) === t).length;

// ChkWeaponShot (weaponuse.asm:8): the per-frame fire dispatch. No weapons in elevators
// (rooms >= 224), water, or the box; fireQueued = ControlsTrigger, held 'fire' = ControlsHold.
function chkWeaponShot() {
  const trig = fireQueued; fireQueued = false;
  if (!selectedWeapon) return;
  if (currentRoom >= 224) return;
  if (snake.anim === ANIM_WATER || snake.anim === ANIM_DEEP_WATER || snake.anim === ANIM_BOX) return;
  switch (selectedWeapon) {
    case HAND_GUN:         if (trig) fireBullet(HAND_GUN, 0); break;
    case SUB_MACHINE_GUN:  chkSmgShot(); break;
    case GRENADE_LAUNCHER: if (trig) fireGrenade(); break;
    case ROCKET_LAUNCHER:  if (trig) fireRocket(); break;
    case PLASTIC_BOMB:     if (trig) placeBomb(); break;
    case LAND_MINE:        if (trig) placeMine(); break;
    case MISSILE:          if (trig) fireMissile(); break;
  }
}

// Common ammo/pool gate: returns true when one unit was consumed and a slot is free.
function takeAmmo(id, consumable) {
  const ammo = weapons.get(id) || 0;
  if (ammo <= 0) { if (id <= SUB_MACHINE_GUN) playClick(); return false; }  // click only for guns
  if (activeShotsOf(id) >= WEAPON_MAX[id]) return false;
  if (playerShots.length >= PLAYER_SHOT_MAX) return false;
  weapons.set(id, ammo - 1);                          // DecItemUnits
  if (consumable && ammo - 1 <= 0) weapons.delete(id);   // use type 1: removed when empty
  return true;
}

// ChkHandGunShot / chkSMGShot's shared bullet (range 0x10, kills by contact, suppressor SFX).
function fireBullet(id, drift) {
  if (!takeAmmo(id, false)) return;
  const d = DELTA[snake.dir];
  const vertical = snake.dir === 'up' || snake.dir === 'down';
  playerShots.push({
    type: id, status: 0, dir: snake.dir,
    x: snake.x, y: snake.y - PLAYER_SHOT_GUN_Y,
    yAlt: snake.y,                       // "Player shots use two Ys (Y and Y - 14)"
    vx: vertical ? drift : d.dx * PLAYER_SHOT_SPEED,
    vy: vertical ? d.dy * PLAYER_SHOT_SPEED : drift,
    range: PLAYER_SHOT_RANGE,
  });
  playBuf(invSuppressor ? assets.silencerBuf
                        : (id === SUB_MACHINE_GUN ? assets.smgBuf : assets.handgunBuf));
  if (gameState === 'play' && !invSuppressor) chkAlertTrigger();
}

// ChkSMGShot (smg.asm:25): fire HELD -> a bullet every 2 iterations, the burst counter
// cycling 1..8 through the SMG_BulletSpeeds fan; releasing fire resets both counters.
function chkSmgShot() {
  if (!held.has('fire')) { smgTimer = 0; smgBurst = 0; return; }
  if ((tickCounter & 1) !== 0) return;        // ChkSMGShot runs per ROM iteration
  if (++smgTimer < 2) return;
  smgTimer = 0;
  smgBurst = (smgBurst % 8) + 1;
  fireBullet(SUB_MACHINE_GUN, SMG_DRIFT[smgBurst - 1]);
}

// ChkGrenadeShot (grenade.asm:8): a lobbed grenade — the REAL position (yAlt) moves at +-3
// on the facing axis; the DRAWN Y adds the GrenadeYOffsets parabola; flies over tiles.
function fireGrenade() {
  if (!takeAmmo(GRENADE_LAUNCHER, false)) return;
  const d = DELTA[snake.dir];
  playerShots.push({
    type: GRENADE_LAUNCHER, status: 0, timer: 0x18,
    x: snake.x, y: snake.y - 16, yAlt: snake.y - 16,
    vx: d.dx * 3, vy: d.dy * 3,
  });
  playBuf(assets.grenadeThrowBuf);                    // SFX 0x12
}

// ChkFireRocket (rocket.asm:8): one at a time, +-5 straight, kills by contact in flight.
function fireRocket() {
  if (activeShotsOf(ROCKET_LAUNCHER) > 0) return;     // "already a rocket in the room"
  if (!takeAmmo(ROCKET_LAUNCHER, false)) return;
  const d = DELTA[snake.dir];
  playerShots.push({
    type: ROCKET_LAUNCHER, status: 0, dir: snake.dir,
    x: snake.x, y: snake.y - 16, yAlt: snake.y,
    vx: d.dx * 5, vy: d.dy * 5,
  });
  playBuf(assets.rocketBuf);                          // SFX 0x13
}

// ChkPBombShot (plasticbomb.asm:7): placed one step ahead, fused 0x30 iterations.
function placeBomb() {
  if (activeShotsOf(PLASTIC_BOMB) > 0) return;        // only one set at a time
  if (!takeAmmo(PLASTIC_BOMB, true)) return;
  const o = PBOMB_OFFSET[snake.dir];
  playerShots.push({
    type: PLASTIC_BOMB, status: 0, timer: 0x30,       // the ROM's 0x30-iteration fuse
    x: snake.x + o[0], y: snake.y + o[1], vx: 0, vy: 0,
  });
  playBuf(assets.bombSetBuf);                         // SFX 0x17
}

// ChkLMineShot (mine.asm:7): armed at Snake's spot, passive, kills by contact (max 3).
function placeMine() {
  if (!takeAmmo(LAND_MINE, true)) return;
  playerShots.push({ type: LAND_MINE, status: 0, x: snake.x, y: snake.y, vx: 0, vy: 0 });
  playBuf(assets.bombSetBuf);                         // SFX 0x17 (shared set sound)
}

// ChkMissileShot (missile.asm:8): one remote missile; the direction keys steer it
// (ControlMissile) and Snake FREEZES while it flies (NormalCtrl returns on shot ID 7).
function fireMissile() {
  if (activeShotsOf(MISSILE) > 0) return;
  if (!takeAmmo(MISSILE, true)) return;
  const d = DELTA[snake.dir];
  playerShots.push({
    type: MISSILE, status: 0, dir: snake.dir,
    x: snake.x, y: snake.y - 0x10, yAlt: snake.y,
    vx: d.dx * 4, vy: d.dy * 4,
  });
  playBuf(assets.missileBuf);                         // SFX 0x14
}

// A target (guard/prisoner/boss) inside the shot's impact shape, or null (ChkEneHitByShot's
// |actorY+offY−shotY| < distY then the X test, both strict). `explosion` picks the
// ActorShapeExpl shapes (guards/prisoners shape 1 = ±20; MGK shape 0x1B = ±20/±16) vs the
// projectile shape 0 box.
function shotTargetsAll(b, explosion) {
  const out = [];
  for (const t of [...guards, prisoner, boss, ...scorpions, powerSwitch,
                   ...jetpacks, ...dogs, duck, ...midBosses, hindD, bigBoss]) {
    if (!t) continue;
    if (t === boss && boss.inv) continue;     // the Shotgunner's rolls disable collisions
    if (t.shotsOff || t.lorryHidden) continue; // COLLISION_CFG bit1 off (Arnold's bounce / hidden lorry shooter)
    // explosions use the actor's ActorShapeExpl box when it has its own (e.g. the Hind
    // D's shape 5); bullets use ActorShapeProject (shotShape).
    const shape = explosion ? (t.explShape ||
                               (t === boss && boss.kind === 'mgk' ? MGK_EXPL_SHAPE : EXPL_SHAPE))
                            : (t.shotShape || GUARD_SHAPE);
    if (Math.abs(t.y + shape.offY - b.y) < shape.distY &&
        Math.abs(t.x + shape.offX - b.x) < shape.distX) out.push(t);
  }
  return out;
}
// ChkHitEnemies (logic/damagetoenemy.asm:57-77) runs ChkEneHitByShot for EVERY one of the 16
// EnemyList slots, so a single shot can hit multiple overlapping actors. A bullet is removed
// after its hit (small ActorShapeProject box → effectively one), but the grenade/plastic-bomb
// blast box is large and damages ALL enemies inside it — see explodeShot (#30).
function shotTarget(b, explosion) { return shotTargetsAll(b, explosion)[0] || null; }

// The explode transition. ONLY the grenade and the plastic bomb open the ROM's
// one-iteration blast window (GrenadeExplode/PBombTimer set KILL_BY_CONTACT=1 around the
// status change); the contact-triggered explosions (RocketExplode / MineExplode /
// MissileExplode) CLEAR it — their damage was the contact hit itself, no double hit.
function explodeShot(b, medium) {
  b.status = 2;
  b.medium = medium;
  b.timer = 0x0F;                                      // explosion frames (ROM 0xF iterations)
  playBuf(b.type === PLASTIC_BOMB || b.type === LAND_MINE ? assets.bombExplosionBuf  // SFX 0x1C
                                                          : assets.explosionBuf);    // SFX 0x1A
  if (gameState === 'play') chkAlertTrigger();         // explosions are loud
  if (b.type === GRENADE_LAUNCHER || b.type === PLASTIC_BOMB) {
    // ChkHitEnemies: the 1-frame blast window damages EVERY enemy whose body overlaps the box,
    // not just the first (the grenade/plastic bomb are the game's two real AoE weapons — #30).
    for (const t of shotTargetsAll(b, true)) {
      t.life = Math.max(0, t.life - weaponDamage(t, b.type)); t.hitBy = b.type;
    }
  }
  if (b.type === PLASTIC_BOMB) {
    chkBombWalls(b);                                   // ChkBasementWall
    chkMetalGearBomb(b);                               // the 16-bomb leg order (room 118)
  }
}

// ChkBasementWall (logic/doors/opendoor.asm:332-348, the LOCK-16 dispatch entry): an
// EXPLODING plastic bomb whose position sits in the wall's zone (ChkBombLocation — the
// open area) opens it. The one lock-16 wall in the game's data: 166⇄167 (Ellen's cell).
function chkBombWalls(b) {
  for (const d of activeDoors) {
    const lock = d.lock || 0;
    if (d.open || d.opening || (lock !== 16 && lock !== 11)) continue;   // 11 = ChkDoorLorry (bomb only)
    const t = doorTypes[String(d.type)];
    if (!t) continue;
    const dy = b.y - (d.y + t.openOffY), dx = b.x - (d.x + t.openOffX);
    if (dy >= 0 && dy < t.openNY && dx >= 0 && dx < t.openNX) openDoor(d);
  }
}

// PlayerShotsLogic (weaponuse.asm:169) — per-type shot ticks in the shared pool.
function updatePlayerShots() {
  const c = assets.collision;
  const solidAt = (x, y) => {
    const tx = x >> 3, ty = y >> 3;
    const tnum = (c && c.tiles) ? c.tiles[ty * c.width + tx] : 0;
    if (tnum === RAILING_LEFT || tnum === RAILING_RIGHT) return false;   // railings don't stop shots
    return !!(c && c.solid[ty * c.width + tx]);
  };
  const offscreen = (b) => b.x < 9 || b.x >= 248 || b.y < 0 || b.y >= 184;  // ChkShotBoundaries
  // ChkShotCollision/A (weaponuse.asm:338-356) for the rocket/missile: probe the shape-2
  // LEADING-EDGE points in the travel direction (BoxColliderDat size 2), and detonate only
  // when BOTH rows — the sprite Y AND the ground Y_Alt — collide (RocketMove falls through
  // unless the first check hits, then requires the second). A point-test OR'ed across the
  // rows made a missile fired sideways from under a wall explode instantly (the wall
  // overhead collided at the sprite row; user-reported — not the original behaviour).
  const SHOT_PROBES = {                     // size/shape 2: [oy, ox] pairs per direction
    up:    [[-5, -4], [-5, 3]],
    down:  [[4, -4], [4, 3]],
    left:  [[-4, -5], [3, -5]],
    right: [[-4, 4], [3, 4]],
  };
  const shotHits = (b, y) =>
    (SHOT_PROBES[b.dir] || []).some(([oy, ox]) => solidAt(b.x + ox, y + oy));

  for (let i = playerShots.length - 1; i >= 0; i--) {
    const b = playerShots[i];
    const type = b.type || HAND_GUN;

    // The explosion animation (Small/MedExplosionLogic): frames at timer >= 0xA / >= 5 / else.
    if (b.status === 2) {
      if (--b.timer <= 0) playerShots.splice(i, 1);
      continue;
    }

    switch (type) {
      case HAND_GUN:
      case SUB_MACHINE_GUN: {                          // PlayerBulletLogic: the same BOTH-rows
        b.x += b.vx; b.y += b.vy;                      // directional probe as the rocket
        if (b.yAlt != null) b.yAlt += b.vy;            // (ChkShotCollision + ChkShotCollisionA)
        const wall = b.yAlt != null ? (shotHits(b, b.y) && shotHits(b, b.yAlt))
                                    : solidAt(b.x, b.y);   // synthetic probes: point test
        if (--b.range <= 0 || offscreen(b) || wall) { playerShots.splice(i, 1); break; }
        const t = shotTarget(b, false);
        if (t) { t.life = Math.max(0, t.life - weaponDamage(t, type)); t.hitBy = type; playerShots.splice(i, 1); }
        break;
      }
      case GRENADE_LAUNCHER: {                         // MoveGrenade: the visual parabola
        if (--b.timer <= 0) { explodeShot(b, false); break; }   // GrenadeExplode
        b.x += b.vx; b.yAlt += b.vy;
        b.y = b.yAlt + GRENADE_ARC[Math.min(b.timer, GRENADE_ARC.length - 1)];
        if (offscreen(b)) playerShots.splice(i, 1);    // no tile collision, no contact kill
        break;
      }
      case ROCKET_LAUNCHER:
      case MISSILE: {                                  // RocketMove / ControlMissile
        b.x += b.vx; b.y += b.vy; b.yAlt += b.vy;
        // ChkEneHitByShot is an INDEPENDENT pass from the wall-collision move, so a missile steered
        // into a wall-embedded target (the room-37/110 power switch, set in the wall tiles) hits it
        // BEFORE detonating on the surrounding wall. Check the target first. (The switch was
        // unreachable — the missile always blew up on the wall around it — issue #26.)
        const t = shotTarget(b, false);          // kills by contact -> damage + explode
        if (t) { t.life = Math.max(0, t.life - weaponDamage(t, type)); t.hitBy = type; explodeShot(b, true); break; }
        if (shotHits(b, b.y) && shotHits(b, b.yAlt)) { explodeShot(b, true); break; }
        if (offscreen(b)) { playerShots.splice(i, 1); break; }
        break;
      }
      case PLASTIC_BOMB: {                             // PBombTimer -> PBombExplode
        if (--b.timer <= 0) explodeShot(b, true);
        break;
      }
      case LAND_MINE: {                                // MineDummy: armed until contact
        const t = shotTarget(b, true);
        if (t && t !== prisoner) {                     // an enemy steps on it
          t.life = Math.max(0, t.life - weaponDamage(t, type));
          t.hitBy = type;
          explodeShot(b, false);
        }
        break;
      }
    }
  }
}

// ControlMissile (missile.asm:112): a direction TRIGGER re-aims the flying missile.
function steerMissile(dir) {
  const m = playerShots.find((s) => s.type === MISSILE && s.status === 0);
  if (!m) return;
  m.dir = dir;
  const d = DELTA[dir];
  m.vx = d.dx * 4; m.vy = d.dy * 4;                    // MissileIniSpeed +-4
}

// SetGrenaTargetSpr (Banks0123.asm:9937): with the GRENADE LAUNCHER selected, a white
// crosshair (SprGrenade's "target point" sprite, pattern 0x18) marks the landing spot at
// the TargetXYOffsets per facing. Hidden in cardboard-box mode, in rooms >= 224 (the
// ladder/elevator set — and room 204's parachute wall), and when Snake stands too close
// to the throw's room edge (the per-facing bound checks).
const GRENADE_TARGET = {        // [offX, offY, visible?] (TargetXYOffsets, signed bytes)
  up:    [-7, -84, (s) => s.y >= 0x38],
  down:  [-7,  54, (s) => s.y < 0x80],
  left:  [-78, -16, (s) => s.x >= 0x50],
  right: [ 60, -16, (s) => s.x < 0xC0],
};
function drawGrenadeTarget() {
  if (selectedWeapon !== GRENADE_LAUNCHER) return;
  if (currentRoom === 204 || currentRoom >= 224) return;
  if (snake.anim === ANIM_BOX) return;
  const t = GRENADE_TARGET[snake.dir];
  if (!t || !t[2](snake)) return;
  const f = shotsMeta && shotsMeta.frames.target;
  if (f && shotsSheet)
    ctx.drawImage(shotsSheet, f.x, f.y, f.w, f.h,
                  Math.round(snake.x + t[0]), Math.round(snake.y + t[1]), f.w, f.h);
}

// Draw the shots from shots.png (bullets stay the small dot, like the ROM's tiny pattern).
function drawPlayerShots() {
  for (const b of playerShots) {
    const type = b.type || HAND_GUN;
    const x = Math.round(b.x), y = Math.round(b.y);
    if (type <= SUB_MACHINE_GUN) {
      ctx.fillStyle = '#e8f8ff';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      continue;
    }
    let key;
    if (b.status === 2) {                              // explosion frames (timer >= 0xA / 5)
      const f = b.timer >= 0x0A ? 1 : (b.timer >= 5 ? 2 : 3);
      key = (b.medium ? 'mexp-' : 'sexp-') + f;
    } else if (type === GRENADE_LAUNCHER) key = 'grenade';
    else if (type === ROCKET_LAUNCHER) key = 'rocket-' + b.dir;
    else if (type === PLASTIC_BOMB) key = 'bomb';
    else if (type === LAND_MINE) key = 'mine';
    else key = 'missile-' + b.dir;
    const f = shotsMeta && shotsMeta.frames[key];
    if (f && shotsSheet) {
      ctx.drawImage(shotsSheet, f.x, f.y, f.w, f.h, x - (f.w >> 1), y - (f.h >> 1), f.w, f.h);
    } else {
      ctx.fillStyle = '#f8d030';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
}

// Draw each guard bullet from the decoded sprite (centered on its position), or a small
// fallback dot if guard-bullet.png isn't available. Shotgun blasts (sgAge) draw their
// expanding pellet frame four times, spreading apart (the ROM's 4-copy attr rows —
// ShotGunShot1-3 — at growing offsets; the spread distance approximates idxSprOffsets).
function drawBullets() {
  for (const b of bullets) {
    const x = Math.round(b.x), y = Math.round(b.y);
    if (b.sgAge != null && sgSheet && sgMeta) {
      const f = sgMeta.frames['pellet' + (b.sgAge < 14 ? 1 : (b.sgAge < 28 ? 2 : 3))];
      const s = Math.min(8, b.sgAge >> 2);    // the spread grows with age
      for (const [ox, oy] of [[-s, -s], [s, -s], [-s, s], [s, s]])
        ctx.drawImage(sgSheet, f.x, f.y, f.w, f.h, x - 8 + ox, y - 8 + oy, f.w, f.h);
      continue;
    }
    if (guardBulletImg) {
      ctx.drawImage(guardBulletImg, x - (guardBulletImg.width >> 1), y - (guardBulletImg.height >> 1));
    } else {
      ctx.fillStyle = '#f8f0a8';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

function update() {
  tickCounter = (tickCounter + 1) & 0xff;   // TickCounter — bit 0 drives the red damage flash
  if (gameState === 'title') { titleTick(); return; }      // the boot sequence (GameStatus 0/1)
  if (gameState === 'menu') { menuTick(); return; }   // equipment menu open (GameMode 2/3): play paused
  if (gameState === 'text') { updateTextBox(); return; }   // GAME_MODE_TEXT_BOX: play is paused
  if (gameState === 'radio') { radioTick(); return; } // GameMode 4: the transceiver runs instead of play
  if (gameState === 'binoculars') { binocularsTick(); return; }  // GameMode 8: the recon telescope
  if (gameState === 'elevator') { elevatorTick(); return; }  // GameMode 6: the moving elevator
  // GAME_MODE_OPEN_DOOR (enterdoor.asm:53): while a door the player walked/punched into erases, the
  // whole game is paused (it is not GS_Playing) — only the door animates — until SetDoorOpen. (#105)
  if (gameState === 'opendoor') {
    updateDoors();
    if (!activeDoors.some((d) => d.opening && d.playerOpening)) gameState = 'play';   // SetDoorOpen -> resume
    return;
  }
  if (gameState === 'capture') { captureTick(); return; }    // GameMode 0xB: the capture scene
  if (gameState === 'lorry') { lorryTick(); return; }        // GameMode 5: the moving lorry
  if (gameState === 'ending') { endingTick(); return; }      // EndingLogic: the escape cinematic
  // GS_GameOver: its own GameStatus (PlayModeLogic does NOT run — no incoming-call cycle here). Wait
  // the F5 window, then continue from the checkpoint (RestoreGameFlag) or RebootGame to the title. (#35)
  if (gameState === 'gameover') {
    if (--gameOverTimer <= 0) { if (continueArmed) restart(); else rebootToTitle(); }
    return;
  }
  // CONTROL_INTRO: the scripted infiltration. IntroSceneLogic runs in ROM ITERATIONS (the
  // ~30Hz game-logic rate — see chkIncomingCall's pacing note), and its counts and speeds
  // (0x100 dive / 0x200 swim / 0x188 climb, the 0x40-style waits) are literal per-iteration
  // values — so the tick is gated to every other 60Hz frame, not halved per-tick.
  if (gameState === 'intro') { if ((tickCounter & 1) === 0) introTick(); return; }
  chkIncomingCall();   // PlayModeLogic (Banks0123.asm:12162) runs the call cycle BEFORE the dead
                       // dispatch — it keeps ticking while Snake dies, pauses in menus/text.
  // Attract demo (GS_DemoPlay): replay the recorded controls at the ROM iteration rate before the
  // control dispatch reads them; demoControlTick may end the demo (0xFF) -> back to the title.
  if (demoActive && (tickCounter & 1) === 0) { demoControlTick(); if (!demoActive) return; }
  // Dead = control mode 3 (Dead/DeadLogic): input is inert; count down, then restart the slice.
  if (gameState === 'dead') {
    if (demoActive) { endDemo(); return; }       // Snake died mid-demo -> abort to the title
    if (--deadTimer <= 0) enterGameOver();        // DeadLogicEnd -> GS_GameOver (the GAME OVER screen)
    return;
  }

  updateDoors();   // advance door open animations + refresh the enter latch
  if (snake.invulnTimer > 0) snake.invulnTimer--;   // post-hit i-frames (DamageDelayTimer)

  // PlayerControlLogic: dispatch on the player's control mode (Banks0123.asm; CONTROL_* Enums.asm).
  // NORMAL (walk) and PUNCH are implemented here; ladder/water/box modes plug in as later branches.
  switch (snake.controlMod) {
    case CONTROL_PUNCH:        punchControl(); break;     // PunchLogic
    case CONTROL_ELEVATOR:     elevatorControl(); break;  // ElevatorCtrl (elevator room)
    case CONTROL_PARACHUTE:    parachuteControl(); break; // ParachuteLogic (room 204)
    case CONTROL_AIRFLOW:      airFlowControl(); break;   // AirFlowLogic (room 53)
    case CONTROL_LADDER_WALK:  laddersWalk();  break;     // LaddersWalk
    case CONTROL_LADDER_CLIMB: laddersClimb(); break;     // LaddersClimb
    default:                   normalControl(); break;    // NormalCtrl
  }
  chkRoofAirFlow();     // ChkRoofAirFlow runs after the move (room 53's wind band)

  chkWeaponShot();      // ChkWeaponShot runs in the play loop (fires/places the selected weapon)
  chkGasRooms();        // ChkGasRooms runs in CommonLogic (gas drains without the mask)
  scorpionTick();       // ScorpionLogic (the desert rooms)
  mineTick();           // InitMines contact (the buried mine fields)
  shellSpawnerTick();   // SpawnTankShell (the desert barrage)
  desertSecurityTick(); // DesertSecurityLogic (room 69 uniform door)
  elevReliefTick();     // SpawnGuardElev (room 3 relieve ceremony)
  gasCloudTick();       // GasLogic (ambience)
  barrelTick();         // RollingBarrelLogic
  powerSwitchTick();    // the destructible switch gates the electric floor
  chkElectricFloor();   // ChkElectricFloor (CommonLogic)
  respawnTick();        // ChkRespawnEnemy (alert reinforcements)
  bridgeTick();         // BridgeLogic + ChkOnBridge (the roof walkways + the fall)
  jetpackTick();        // the jetpack guards (descend/takeoff/hover/snipe)
  dogTick();            // DogLogic (room 207)
  duckTick();           // CowardDuckLogic (room 193)
  boomerangTick();      // BoomerangLogic
  midBossTick();        // Tank / Bulldozer / Arnolds / Fire Trooper
  hindDTick();          // Hind D (room 50)
  bigBossTick();        // Big Boss (room 119)
  fakeMadnarTick();     // the room-189 trap
  destructTick();       // DecNukeTimer (the self-destruct countdown)
  // Poison (GS_Playing, Banks0123.asm:12197-12206): `TickCounter & 3Fh == 0` -> DecrementLife 1,
  // i.e. 1 life every 0x40 iterations. Poison lives in the SAME PlayModeLogic loop as the i-frame
  // timer (DamageDelayTimer 0x20) — exactly 2× its interval. The port runs this loop at 60Hz and
  // uses the literal ROM counts for the rest of the damage subsystem (i-frames 0x20, gas 0x10,
  // electric 8), so poison must too: mask 0x3F (was 0x7F = half-rate — broke the 2:1 ratio). (#29)
  if (poisoned && (tickCounter & 0x3F) === 0) {
    snake.life = Math.max(0, snake.life - 1);
    if (snake.life === 0) { enterDead(); return; }
  }
  chkTakeItems();       // ChkTakeItems runs in the player phase (logic/common.asm) after the move
  chkCaptured();        // the capture trigger follows the item checks (CommonLogic :26)
  if (gameState !== 'play') return;   // captured this frame: the scene takes over
  chkPunchOpenDoors();  // ChkDoors covers the punch-opened locks every frame (10 / 15)
  // A door opened by walking/punching into it pauses the world while it erases (GAME_MODE_OPEN_DOOR). (#105)
  if (activeDoors.some((d) => d.opening && d.playerOpening)) { gameState = 'opendoor'; return; }
  chkTouchLasers();     // ChkTouchEnemies covers the laser beams (ID_LASER) every frame
  if ((tickCounter & 1) !== 0) {      // the actor phase runs on ROM iterations
    cameraTick();       // CameraLogic / LaserCameraLogic + the live laser shots
    movingLasersTick(); // DrawMovingLasers (room 72's cycling patterns)
    bossTick();         // MachGunKidLogic (room 20)
    pitfallTick();      // PitfallLogic + ChkSayHelpMe (room 166's traps)
  }
  chkTouchGuard();      // ChkTouchEnemies runs in the player phase: sets the touched flag + damage
  chkAlarmEnd();        // PlayModeLogic calls ChkAlarmEnd first: clear the alarm when its conditions are met
  updateGuard();        // guard patrols / detects / chases after Snake's move this tick (reads touched)
  updatePrisoner();     // prisoner idles / rescues on touch / dies to gunfire (PrisonerLogic)
  updateBullets();      // advance guard bullets (may damage Snake)
  // PlayerShotsLogic runs in ROM ITERATIONS (~30Hz; the shot speeds ±5/±6, the fuses 0x18/
  // 0x30 and the explosion frames are literal per-iteration values — ticking them at 60Hz
  // doubled every projectile's speed and halved every fuse; user-reported on the rockets
  // and missiles).
  if ((tickCounter & 1) === 0) updatePlayerShots();
  takePendingCheckpoint();   // snapshot once the entry position has settled (StoreGameStat)
}

// PunchLogic (control mode 1): hold the punch frame, then return to walk. Presses are ignored
// mid-punch. (Behaviour unchanged from the previous inline punch-lockout branch.)
function punchControl() {
  punchQueued = false;
  fireQueued = false;                  // can't fire mid-punch
  if (--snake.punchTimer <= 0) { snake.state = 'idle'; snake.controlMod = CONTROL_NORMAL; }
}

// ChkWater (NormalCtrl): in a water room, the tile under Snake sets shallow (anim 2) / deep
// (anim 4); otherwise normal. The ROM reads the two straddled tiles (GetTilePlayer H at X-4, L at
// X+4). Movement stays under normal control — only the animation changes. (Deep-water oxygen
// drain and the box-floats case are deferred to later changes.)
function chkWater() {
  if (!ROOMS_WATER.has(currentRoom)) {
    if (snake.anim === ANIM_WATER || snake.anim === ANIM_DEEP_WATER) snake.anim = ANIM_NORMAL;
    return;
  }
  const ty = snake.y >> 3, hx = (snake.x - 4) >> 3, lx = (snake.x + 4) >> 3;
  // ChkWaterTiles (Banks0123.asm:9162): classify the H tile (X-4) across the 0x6F-0x76 water ranges
  // FIRST — whatever it is (shallow OR deep) wins outright; the L tile (X+4) is consulted only when H
  // is non-water; bricks (0x6D) are checked LAST, shallow only when NEITHER tile is 0x6F-0x76. (#107)
  const waterKind = (tx) => {                       // 0x6F-0x76 only (brick handled below)
    const t = tileAt(tx, ty);
    if (t === 0x75 || t === 0x76) return 'deep';
    if (t === 0x73 || t === 0x74) return 'shallow';
    if (t >= 0x6F && t <= 0x72) return DEEP_WATER_ROOMS.has(currentRoom) ? 'deep' : 'shallow';  // shadow split
    return null;
  };
  const kind = waterKind(hx) || waterKind(lx)
    || (tileAt(hx, ty) === 0x6D || tileAt(lx, ty) === 0x6D ? 'shallow' : null);   // ChkWaterTiles3 bricks
  if (kind === 'deep') snake.anim = ANIM_DEEP_WATER;
  else if (kind === 'shallow') snake.anim = ANIM_WATER;
  else if (snake.anim === ANIM_WATER || snake.anim === ANIM_DEEP_WATER) snake.anim = ANIM_NORMAL;

  // Deep water without the oxygen tank drains life (SetInWaterMode3 -> DecrementLife_C): lose
  // DEEP_WATER_DRAIN every DEEP_WATER_DELAY frames, gated by the shared damage-delay (invuln)
  // timer — which also makes Snake blink (drawn red while hurting).
  deepWaterDraining = snake.anim === ANIM_DEEP_WATER && !hasScubaTank();
  if (deepWaterDraining && snake.invulnTimer === 0) {
    snake.invulnTimer = DEEP_WATER_DELAY;
    snake.life = Math.max(0, snake.life - DEEP_WATER_DRAIN);
    if (snake.life === 0) enterDead();
  }
}

// Dev-hook placement for a water room: spawn Snake on an open water tile (the normal entry would
// be via a connecting room; this just drops you in the water so ?room=<water> is demonstrable).
function enterWaterRoom() {
  const c = assets.collision;
  for (let ty = 0; ty < c.height; ty++)
    for (let tx = 0; tx < c.width; tx++) {
      if (!(isShallowWater(tx, ty) || isDeepWater(tx, ty))) continue;
      const x = tx * 8 + 4, y = ty * 8 + 4;
      if (freeAt(x, y)) { snake.x = x; snake.y = y; return; }
    }
}

// NormalCtrl (control mode 0): a queued punch starts a punch (-> mode 1); otherwise Snake
// walks/collides/opens+enters doors/traverses rooms — identical to the previous inline walk path.
function normalControl() {
  // NormalCtrl (Banks0123.asm:8468-8470): while the remote missile flies (shot ID 7 in the
  // pool), player controls are IGNORED — the direction keys steer the missile instead
  // (ControlMissile); Snake stands frozen until it explodes.
  if (playerShots.some((s) => s.type === MISSILE && s.status === 0)) {
    const dir = currentDir();
    if (dir) steerMissile(dir);
    punchQueued = false;
    snake.state = 'idle';
    return;
  }
  chkWater();   // set the water animation from the tile under Snake (NormalCtrl calls ChkWater)
  // Cardboard box (NormalCtrl): on land (not in water), show the box when it is the selected item,
  // else normal walk. Water keeps its animation (set by chkWater); punch overrides below; death is
  // handled separately. Box movement is identical to walking — it is only a sprite/flag.
  if (snake.anim !== ANIM_WATER && snake.anim !== ANIM_DEEP_WATER) {
    snake.anim = (selectedItem === SELECTED_BOX) ? ANIM_BOX : ANIM_NORMAL;
  }
  if (punchQueued) {
    punchQueued = false;           // ControlsTrigger is per-frame: the press is consumed either way
    // chkPunch (Banks0123.asm:8939): can't punch in water, deep water, or inside the box
    // (PlayerAnimation 2/4/7 -> `ret z`). (#106)
    if (snake.anim !== ANIM_WATER && snake.anim !== ANIM_DEEP_WATER && snake.anim !== ANIM_BOX) {
      snake.state = 'punch';
      snake.controlMod = CONTROL_PUNCH;
      snake.anim = ANIM_PUNCH;       // punch overrides the box/walk animation (chkPunch sets it)
      snake.punchTimer = PUNCH_TICKS;
      playPunch();
      // ChkPunchColl (Banks0123.asm:9017): probe the tile one cell ahead in the facing direction;
      // on a solid tile play SFX 9 "punch wall" (distinct from the 0x0A breakable-wall sound). (#108)
      if (blocked(snake.x, snake.y, snake.dir)) playBuf(assets.punchWallBuf);
      tryPunchGuard();
      return;
    }
  }

  const dir = currentDir();
  if (dir) {
    snake.dir = dir;
    const { dx, dy } = DELTA[dir];
    const nx = snake.x + dx * SPEED;
    const ny = snake.y + dy * SPEED;

    // Pushing into a closed door opens it — but only if its lock allows (ChkOpenDoor). The step is
    // blocked by the door's footprint either way (a locked door stays shut).
    const closed = closedDoorBlocking(nx, ny, dir);
    if (closed) {
      if (canOpenDoor(closed)) { openDoor(closed); closed.playerOpening = true; }   // ChkDoors2 -> GAME_MODE_OPEN_DOOR (#105)
    } else {
      // Can Snake leave through this edge here? Needs a connected neighbor and an
      // open boundary tile (doorway) at his position.
      const exit = neighbor(dir);
      const canCross = exit != null && edgeDoorOpen(dir, snake.x, snake.y);

      if (!blocked(nx, ny, dir, canCross)) {
        if (canCross && crossesEdge(dir, nx, ny)) {   // ChkExitRoom edge reached -> change room
          transition(dir, exit);        // hard cut to the neighbor room
        } else {
          snake.x = Math.max(0, Math.min(VIEW_W - 1, nx));
          snake.y = Math.max(0, Math.min(VIEW_H - 1, ny));
          maybeEnterDoor();             // walked into an open door -> its destination
        }
      }
    }
    // Walk animation advances whether or not a wall blocks the step.
    snake.state = 'walk';
    if (++snake.animTimer >= WALK_TICKS) { snake.animTimer = 0; snake.walkPhase ^= 1; }
  } else {
    snake.state = 'idle';
    snake.animTimer = 0;
  }
}

// ---- Escape ladders (LaddersWalk / LaddersClimb, Banks0123.asm) ------------
// Put Snake into ladder-walk at the floor on entering a ladder room (SetLadderRoomEntry).
function enterLadderRoom() {
  snake.controlMod = CONTROL_LADDER_WALK;
  snake.anim = ANIM_NORMAL;
  snake.x = LADDER_ENTRY_X; snake.y = LADDER_WALK_FLOOR_Y; snake.dir = 'left';
  snake.state = 'idle'; snake.animTimer = 0; snake.walkPhase = 0;
}

// LaddersWalk (mode 6): move left/right on the floor; Up on a ladder tile starts a climb.
function laddersWalk() {
  const dir = currentDir();
  if (dir === 'left' || dir === 'right') {
    snake.dir = dir;
    const nx = snake.x + DELTA[dir].dx * SPEED;
    if (!blocked(nx, snake.y, dir)) snake.x = Math.max(0, Math.min(VIEW_W - 1, nx));
    snake.state = 'walk';
    if (++snake.animTimer >= WALK_TICKS) { snake.animTimer = 0; snake.walkPhase ^= 1; }
  } else {
    snake.state = 'idle'; snake.animTimer = 0;
  }
  chkStartClimb();
  if (snake.controlMod !== CONTROL_LADDER_CLIMB) snake.anim = ANIM_NORMAL;
}

// ChkStartClimb: on a ladder tile (0x08) with Up pressed, mount the ladder. The ROM tests the
// tile at PlayerX-4 (`GetTilePlayer` does `sub 4`; the "ladder left tile") — testing the centre
// tile instead only let you mount from the ladder's left edge. The ROM snaps Y to 0x99 and keeps
// PlayerX (no X snap).
function chkStartClimb() {
  const tx = (snake.x - 4) >> 3, ty = snake.y >> 3;
  if (!isLadder(tx, ty) || !held.has('dir:up')) return;
  snake.y = LADDER_CLIMB_FLOOR_Y;       // ROM snaps PlayerY to 0x99 on mount (X unchanged)
  snake.controlMod = CONTROL_LADDER_CLIMB;
  snake.anim = ANIM_LADDER;
  snake.dir = 'up';
}

// LaddersClimb (mode 7): vertical-only at half walk speed; exit at floor; room/escape limits.
function laddersClimb() {
  const dir = currentDir();
  if (dir === 'up' || dir === 'down') {
    snake.dir = dir;
    snake.y += DELTA[dir].dy * LADDER_CLIMB_SPEED;
    snake.state = 'walk';
    if (++snake.animTimer >= WALK_TICKS) { snake.animTimer = 0; snake.walkPhase ^= 1; }
  } else {
    snake.state = 'idle';
  }
  chkExitLadders();
  if (snake.controlMod !== CONTROL_LADDER_CLIMB) return;   // stepped off onto the floor
  snake.anim = ANIM_LADDER;
  chkLadderLimits();
}

// ChkExitLadders (room 224 only): when back at the climb floor, Left/Right steps off. (Climbing
// up immediately drops below the floor, so this only fires at the floor — compare raw Y, the
// clamp pins it exactly to the floor.)
function chkExitLadders() {
  if (currentRoom !== 224 || snake.y < LADDER_CLIMB_FLOOR_Y) return;
  const d = currentDir();
  if (d !== 'left' && d !== 'right') return;
  snake.dir = d;
  snake.y = LADDER_WALK_FLOOR_Y;
  snake.controlMod = CONTROL_LADDER_WALK;
  snake.anim = ANIM_NORMAL;
}

// ChkLadderLimits / ChkNextLadderRoom: clamp room 224's bottom; cross to the next/prev ladder
// room past the top/bottom; the top of room 226 is the escape (SetLeavedOuterH). Uses raw Y
// (the ROM compares the integer Y; rounding a fractional climb step would mis-clamp).
function chkLadderLimits() {
  const y = snake.y;
  if (currentRoom === 226 && y < ESCAPE_TOP_Y) { escapeEnding(); return; }
  if (currentRoom === 224 && y >= LADDER_CLIMB_FLOOR_Y) { snake.y = LADDER_CLIMB_FLOOR_Y; return; }
  if (y < LADDER_TOP_Y) ladderToRoom('up');
  else if (y >= LADDER_BOTTOM_Y) ladderToRoom('down');
}

// Cross to the vertically-adjacent ladder room (224<->225<->226), keeping the climb going.
function ladderToRoom(dir) {
  const next = neighbor(dir);
  if (next == null) { snake.y = dir === 'up' ? LADDER_TOP_Y : LADDER_BOTTOM_Y - 1; return; }
  setRoom(next);
  snake.y = dir === 'up' ? LADDER_BOTTOM_Y - 2 : LADDER_TOP_Y + 2;   // enter at the opposite edge
  snake.controlMod = CONTROL_LADDER_CLIMB;
  snake.anim = ANIM_LADDER;
  snapToLadderColumn();
}

// Keep Snake on the ladder column after a room change (the shaft may sit at a different X).
function snapToLadderColumn() {
  const ty = snake.y >> 3, tx = snake.x >> 3;
  if (isLadder(tx, ty)) { snake.x = tx * 8 + 4; return; }
  for (let d = 1; d < 32; d++) {
    if (isLadder(tx + d, ty)) { snake.x = (tx + d) * 8 + 4; return; }
    if (isLadder(tx - d, ty)) { snake.x = (tx - d) * 8 + 4; return; }
  }
}

// SetLeavedOuterH: reaching the top of room 226 escapes Outer Heaven (flag + banner; the full
// ending scene is out of scope). Freeze control.
// SetLeavedOuterH -> EndingSetup (logic/ending.asm): reaching the top of room 226 ends the game.
// The ROM cinematic, ported faithfully in sequence (assets approximated where we lack them — the
// ExploxionTiles frames are a flash, and the ending "room 251" tileset is a black backdrop):
//   run + the final countdown -> Outer Heaven explodes -> Snake's radio report (text 155) ->
//   auto-tune to the news 120.77 -> KNK news (text 31) -> ending music + STAFF (text 45) ->
//   fade -> Big Boss's threat (text 15) -> back to the title.
function escapeEnding() {
  escaped = true;
  gameState = 'ending';
  endingStatus = 0; endingCnt = 0; endingTimer = 200;   // DestructTimer 0x200 (the ending run)
  endingRadio = false;
  radioFreq = 0x13; radioLedCnt = 0; radioCmd = 0;       // FREQ_BIGBOSS_BUILDING2
  snake.x = 0x80; snake.y = 0x80; snake.dir = 'left'; snake.state = 'walk';
  stopAreaMusic(); stopAlert(); stopBossMusic();
}
const bcdInc = (b) => { let lo = (b & 15) + 1, hi = b >> 4; if (lo > 9) { lo = 0; hi++; } return ((hi > 9 ? 0 : hi) << 4) | lo; };
function endExplode() { playBuf(assets.endingExplosionBuf || assets.bombExplosionBuf); }   // EndingExplosion SFX 0x56 (fallback 0x1C)
function playEndingMusic() {                            // SetSoundEntry 0x41 (Return of Fox Hunter)
  stopAreaMusic();
  if (!audioCtx || !assets.foxhunterBuf) return;
  areaMusicSrc = audioCtx.createBufferSource();
  areaMusicSrc.buffer = assets.foxhunterBuf; applyMusicLoop(areaMusicSrc, assets.foxhunterBuf);
  areaMusicSrc.connect(audioOut()); areaMusicSrc.start();
  areaMusicBuf = assets.foxhunterBuf;
}
function endEnding() {
  escaped = false; endingRadio = false; captureFade = 0;
  stopAreaMusic();
  gameState = 'title'; titlePhase = 'ready'; titleIdle = 0;
  titleClear(); drawLogoParked();
}
// EndingLogic (logic/ending.asm) — runs at the ROM iteration rate. The text states fire setText
// and advance the status; while the text plays gameState is 'text' and resumes here on close.
function endingTick() {
  if ((tickCounter & 1) !== 0) return;
  switch (endingStatus) {
    case 0:                                             // EndingEscaping: run + the countdown
      endingSnakeRun();
      if (--endingTimer <= 0) { endingTimer = 0; endingStatus = 1; endingCnt = 0x40; endExplode(); }
      return;
    case 1:                                             // explosion 1 (Snake STOPS + turns to watch — SnakeSprId 0)
      if (--endingCnt <= 0) { endingStatus = 2; endingCnt = 0x18; }
      return;
    case 2:                                             // Snake stares back
      if (--endingCnt <= 0) { endingStatus = 3; endingCnt = 0x30; endExplode(); }
      return;
    case 3:                                             // explosion 2; the radio waits ~the SFX length (0x30+0x44 iters ~30Hz ~ the 3.86s wav)
      if (--endingCnt <= 0) { endingStatus = 4; endingCnt = 0x44; }
      return;
    case 4:                                             // draw the radio, then Snake's report
      if (--endingCnt > 0) return;
      endingRadio = true; radioCmd = 1; radioLedCnt = 0;
      setText(155, 2); endingStatus = 5;                // "METAL GEAR'S DESTRUCTION IS A SUCCESS..."
      return;
    case 5:                                             // EndingLogic7: auto-tune to the news 120.77
      radioCmd = 0;
      if ((tickCounter & 3) !== 0) return;
      radioFreq = bcdInc(radioFreq);
      if (radioFreq === 0x77) { endingStatus = 6; radioLedCnt = 0; radioLedDelay = 0x10; }   // FREQ_NEWS
      return;
    case 6:                                             // RadioSignalUp: the 12 LEDs
      if (--radioLedDelay > 0) return;
      radioLedDelay = 2;
      if (++radioLedCnt === 12) { setText(31, 2); endingStatus = 7; }   // "THIS IS RADIO KNK..."
      return;
    case 7:                                             // ending music + the STAFF roll
      playEndingMusic();
      setText(45, 2); endingStatus = 8;
      return;
    case 8:                                             // staff closed: fade out
      endingRadio = false; stopAreaMusic(); captureFade = 1; endingStatus = 9;
      return;
    case 9:                                             // FadeOutLogic (3-bit steps, TickCounter&3)
      if ((tickCounter & 3) === 0 && ++captureFade >= 7) { endingStatus = 10; endingCnt = 0x40; }
      return;
    case 10:                                            // wait, then Big Boss's threat
      if (--endingCnt <= 0) { setText(15, 2); endingStatus = 11; }      // "I'LL NEVER DIE..."
      return;
    case 11:                                            // threat closed: back to the title
      endEnding();
      return;
  }
}
// EndingSnakeRun (ending.asm:401-404): PlayerXdec -= 8 on the 16-bit 8.8 fixed-point X = 0.03125 px per
// iteration — a near-still creep (Snake runs in place), NOT the old 0.5 px/tick (which was 16x too fast).
function endingSnakeRun() { snake.x -= 8 / 256; }

// ---- Rendering -------------------------------------------------------------
// PlayerAnimation -> sprite key (the ROM's SetSpr* selection). NORMAL/PUNCH use the existing
// walk/idle/punch frames; the ladder(5)/water(2,4)/box(7) cases are reserved for later changes,
// which set `snake.anim` and add the corresponding atlas frames.
function playerSpriteKey() {
  switch (snake.anim) {
    case ANIM_LADDER:     return snake.walkPhase ? 'ladder-2' : 'ladder-1';   // climb frames
    case ANIM_PARACHUTE:  return 'parachute-fall';   // SetSprParachute: player sprite 36 (no gun)
    case ANIM_WATER:      return 'water-' + snake.dir;                        // shallow wading (per direction)
    case ANIM_DEEP_WATER: return snake.walkPhase ? 'deepwater-2' : 'deepwater-1';  // swim
    case ANIM_BOX:        return snake.walkPhase ? 'box-2' : 'box-1';         // cardboard box (idle 42 / moving 44)
    default: {                            // ANIM_NORMAL / ANIM_PUNCH
      if (snake.state === 'punch') return snake.dir + '-punch';               // punch sprite is unarmed (SetSprPunch)
      // SetSprWalk4: armed frames whenever a weapon is held (SelectedWeapon != 0), except the plastic
      // bomb (5) / land mine (6). The armed pose is the same for every gun.
      const pre = (selectedWeapon !== 0 && selectedWeapon !== 5 && selectedWeapon !== 6) ? 'armed-' : '';
      if (snake.state === 'walk')  return pre + snake.dir + (snake.walkPhase ? '-walk2' : '-walk1');
      return pre + snake.dir + '-idle';
    }
  }
}

// Snake's death animation, driven by deadTimer (SetSprDead): leaned back, then a spin (the four
// facings cycling, approximating sprites 0x39-0x3C), then the final dead frame.
function deadFrameKey() {
  if (deadTimer > 64) return 'die-lean';
  if (deadTimer > 10) return ['up-idle', 'right-idle', 'down-idle', 'left-idle'][(deadTimer >> 2) % 4];
  return 'die-dead';
}

// ---- Equipment menus (DrawWeaponMenu / DrawEquipMenu, GameMode 2/3) ------------------------------
// The owned entries for the open menu: weapon IDs (weapon menu) or item IDs (item menu; the "none"
// sentinel is omitted — the menu lists real items, like the ROM).
function menuList() {
  // The drawn entries: the open-time snapshot (zeroed slots stay as gaps), plus the suppressor
  // in the weapon menu when owned (DrawWeaponMenu5's dedicated slot — not cursor-navigable).
  // Captured (EquipRemoved): nothing at all, suppressor included.
  if (menuMode === 'weapon' && invSuppressor && !equipRemoved) return [...menuEntries, SUPRESSOR];
  return menuEntries;
}
// Open a menu (ReadFKeys F1=weapon / F2=item): pause play, compact the owned entries into the
// grid slots (CompactWeapons/CompactEquipment), seed the cursor on the current selection
// (GetWeaponCursor/GetMenuCursor; slot 1 if none).
// The F-keys are only read in GameMode 0 with the room gate (Playing, Banks0123.asm:
// 12112-12119): "It is not possible to pause the game, use the radio or select an
// item/weapon in the ladders rooms or while falling in parachute" — rooms >= 224
// (which includes EVERY elevator room 240-250) and room 204 block them all.
const fkeysBlocked = () => currentRoom >= 224 || currentRoom === 204;

function openMenu(mode) {
  if (gameState !== 'play' || fkeysBlocked()) return;
  menuMode = mode; gameState = 'menu';
  // Captured (EquipRemoved): the menus render EMPTY and any move selects 0 — the inventory
  // arrays keep their contents for the bag recovery (DrawWeaponMenu/DrawEquipMenu,
  // Banks0123.asm:1974/2171; MenuWeaponMove :11469).
  menuEntries = equipRemoved ? [] : (mode === 'weapon' ? ownedWeaponIds() : [...items.keys()]);
  const i = menuEntries.indexOf(mode === 'weapon' ? selectedWeapon : selectedItem);
  selectIdx = i >= 0 ? i + 1 : 1;
  menuHoldWait = 8;
  menuDirTrigger = null; menuFireTrigger = false;
}
// Closing keeps the highlighted entry — it was already selected on the last cursor move.
function closeMenu() {
  if (gameState !== 'menu') return;
  const wasItem = menuMode === 'item';
  menuMode = null;
  // ExitEquipMenu (menuequipment.asm:299): closing the EQUIPMENT (item) menu with the binoculars
  // selected enters binoculars mode — unless this is an isolated room (ChkIsolatedRoom: disabled).
  if (wasItem && selectedItem === SELECTED_BINOCULARS && !roomIsolated(currentRoom)) { enterBinoculars(); return; }
  gameState = 'play';
}
// Faithful menu slot geometry (DrawWeaponMenu Banks0123.asm:1968 / DrawEquipMenu :2165, plus the cursor
// tables data/weaponcursorxy.asm + data/itemcursorxy.asm). Native SCREEN-5 pixels; the owned entries are
// compacted (CompactWeapons/CompactEquipment) so entry i fills slot i in iteration order.
//   Weapons: left column X=24 (4 slots), right column X=136 (3 slots), then the suppressor slot (96,168);
//     rows step +24 from Y=40 (0x1828). Name at iconX+32; ammo (Render3Numbers) at iconX+80, iconY+8.
//   Items:   3 columns X=24 / 104 / 184 holding 9 / 9 / 7; rows step +16 from Y=40. Name at iconX+16;
//     the ration count (item 0x16) at iconX+40, iconY+8. The arrow sits at iconX-8, iconY+4.
function menuSlotPos(mode, i) {
  let ix, iy, nameDX;
  if (mode === 'weapon') {
    if (i < 4)      { ix = 24;  iy = 40 + i * 24; }
    else if (i < 7) { ix = 136; iy = 40 + (i - 4) * 24; }
    else            { ix = 96;  iy = 168; }                 // 8th slot = suppressor (DrawWeaponMenu5)
    nameDX = 32;
  } else {
    if (i < 9)       { ix = 24;  iy = 40 + i * 16; }
    else if (i < 18) { ix = 104; iy = 40 + (i - 9) * 16; }
    else             { ix = 184; iy = 40 + (i - 18) * 16; }
    nameDX = 16;
  }
  return { ix, iy, nameX: ix + nameDX, arrowX: ix - 8, arrowY: iy + 4,
           ammoX: ix + (mode === 'weapon' ? 80 : 40), ammoY: iy + 8 };
}
const OPTION_XY = { x: 104, y: 144 };   // txtWeaponSelect's 2nd XY (dw 9068h): the OPTION label

// The ROM cursor is font glyph 0x3C (DrawArrow: "right arrow char" -> DrawChar 0x3C).
function drawArrow(x, y) { drawText(String.fromCharCode(0x3C), x, y); }

// Per-tick menu logic (MenuWeapon/MenuEquip with the screen already drawn): the ROM reads
// ControlsTrigger (new press -> move now) and ControlsHold (held -> repeat after ControlHoldWait
// = 8 frames). Fire is ChkUseItem in the EQUIPMENT menu only — CtrlMenuWeapon never tests the
// Fire bit, so it does nothing on the weapon screen.
function menuTick() {
  const fire = menuFireTrigger; menuFireTrigger = false;
  const trig = menuDirTrigger; menuDirTrigger = null;
  if (fire && menuMode === 'item') { chkUseItem(); return; }   // MenuEquipLogic: bit 4 -> ChkUseItem
  if (trig) { menuHoldWait = 8; menuMove(trig); return; }      // trigger: move immediately
  const dir = currentDir();                                    // ControlsHold direction
  if (!dir) return;
  if (--menuHoldWait > 0) return;                              // delay for repeating the direction
  menuHoldWait = 8;
  menuMove(dir);
}

// Move the cursor over the ROM's fixed grid with its exact edge clamps — no wrapping.
// Weapons (CtrlMenuWeaponUp/Down/Left + right branch, Banks0123.asm:11400-11456): two columns
// of 4+3, SelectIdx 1-7. Items (MenuEquipUp/Down/Left + right branch, logic/menuequipment.asm:
// 67-147): three columns of 9+9+7, SelectIdx 1-25 (slots 17-18 can't move right — the 3rd
// column only holds 7). A clamped press does nothing: no move, no SFX, no re-select.
function menuMove(dir) {
  const idx = selectIdx;
  let next = null;
  if (menuMode === 'weapon') {
    if (dir === 'up')         { if (idx !== 1 && idx !== 5) next = idx - 1; }
    else if (dir === 'down')  { if (idx !== 4 && idx !== 7) next = idx + 1; }
    else if (dir === 'left')  { if (idx >= 5) next = idx - 4; }
    else if (dir === 'right') { if (idx < 4) next = idx + 4; }
  } else {
    if (dir === 'up')         { if (idx !== 1 && idx !== 10 && idx !== 19) next = idx - 1; }
    else if (dir === 'down')  { if (idx !== 9 && idx !== 18 && idx !== 25) next = idx + 1; }
    else if (dir === 'left')  { if (idx >= 10) next = idx - 9; }
    else if (dir === 'right') { if (idx < 17) next = idx + 9; }
  }
  if (next === null) return;
  playCursor();                         // SFX 0x20 (MenuWeaponMove / MenuEquipMove)
  selectIdx = next;
  menuSelect();
}

// Moving IS selecting (MenuWeaponMove -> SelectWeapon sets SelectedWeapon + WeaponInUse;
// MenuEquipMove -> SetSelectedItem). An empty grid slot holds ID 0 -> holstered / no item,
// exactly like the ROM reading a zeroed Weapons/Equipment record. There is no confirm press.
function menuSelect() {
  const id = menuEntries[selectIdx - 1] || 0;
  if (menuMode === 'weapon') selectedWeapon = id;
  else selectedItem = id;
}

// ChkUseItem (logic/menuequipment.asm:208-290): Fire in the EQUIPMENT menu uses the selected
// item. Deep water (PlayerAnimation 4) skips ONLY the ration branch — the ROM falls through to
// the other item checks. A matched branch ends at UseItemSfx (SFX 0x21); anything else (cards,
// binoculars, nothing selected) returns silently.
const SELECTED_TRANSMITTER = 0x17, SELECTED_ANTIDOTE = 0x0D, SELECTED_CIGARETTES = 6;  // Enums.asm
function chkUseItem() {
  if (!selectedItem) return;                                   // no item selected
  // ChkUseItem (menuequipment.asm:215-221): in DEEP WATER it jumps to ChkDropTransmitter with A
  // still = PlayerAnimation (4), which never matches any item id — so NO item is usable in deep
  // water, not just rations. (The ROM's "Can't use rations in deep water" comment understates its
  // own register bug; faithfully, transmitter/antidote/cigarettes are blocked too.) (#41)
  if (snake.anim === ANIM_DEEP_WATER) return;
  if (selectedItem === SELECTED_RATION) {
    useConsume(SELECTED_RATION);
    snake.life = snake.maxLife;                                // fill the energy (Life = MaxLife)
    playUseItem();
    return;
  }
  if (selectedItem === SELECTED_TRANSMITTER) {
    // Drop the transmitter/bug: consumed + TransmiTaken cleared — the alarm can finally
    // end again (the bag recovery planted it; ChkUseItem's transmitter branch).
    useConsume(SELECTED_TRANSMITTER);
    transmiTaken = false;
    playUseItem();
    return;
  }
  if (selectedItem === SELECTED_ANTIDOTE) {
    // ChkUseAntidote clears Poisoned and does NOT consume the antidote (no DecItemUnits
    // in the ROM).
    poisoned = false;
    playUseItem();
    return;
  }
  if (selectedItem === SELECTED_CIGARETTES && destructionOn) {
    // ChkUseCigarettes: during the countdown they buy 2000 units — and are CONSUMED.
    useConsume(SELECTED_CIGARETTES);
    destructTimer += 2000;
    playUseItem();
    return;
  }
  // Every other selected item: the ROM's silent return.
}

// ---- Binoculars (BinocularMode / BinocularLogic / DrawBinocRoom, Banks0123.asm:12256-12604) ----
// The recon telescope. Selecting the binoculars and closing the equipment menu (ExitEquipMenu,
// menuequipment.asm:299) enters a mode that peeks into ADJACENT rooms: the d-pad shows the room in
// that direction for TIMER_BINOC iterations, then returns to the player's room. Disabled in
// isolated rooms (ChkIsolatedRoom). Deliberate divergences (no faithful equivalent in this port):
//   - Exit returns to PLAY, not the equipment menu — the port's "moving is selecting / close = play"
//     menu model would otherwise re-enter binoculars immediately on the menu close.
//   - The ROM saves/restores EnemyList/power/radio/alert because DrawBinocRoom overwrites the shared
//     room RAM; this port renders from a transient snapshot and never mutates play state, so there
//     is nothing to back up.
//   - The crosshair sprite art (LoadSprTarget) isn't an exported asset — drawn here with primitives.
const TIMER_BINOC = 0x80;          // TimerBinocular: iterations an adjacent room is shown (128)
let binoc = null;                  // null = not active; else { home, mode:'idle'|'show', timer, lookDir, snap }
let binocDirTrigger = null;        // ControlsTrigger edge: a direction pressed this frame (idle only)

// Snapshot a room's drawable contents WITHOUT touching play state: build helpers assign globals, so
// capture-and-restore around them; guards come from the pure guardDefsFor + makeGuard.
function binocSnapshot(n) {
  const r = rooms.get(n);
  const saveDoors = activeDoors;
  buildDoors(n);                   // assigns activeDoors
  const doors = activeDoors;
  activeDoors = saveDoors;
  const itemSlots = [null, null, null];   // buildRoomItems inline (avoid its spawnedItemLatch side effect)
  const src = [...(itemsData[String(n)] || [])].filter((it) => !isItemTaken(it.id));
  for (let i = 0; i < Math.min(3, src.length); i++) itemSlots[i] = { id: src[i].id, y: src[i].y, x: src[i].x };
  const gs = (guardDefsFor(n) || []).map(makeGuard);
  return { room: n, img: r ? r.img : null, doors, items: itemSlots, guards: gs };
}
function enterBinoculars() {        // ExitEquipMenu -> GAME_MODE_BINOCULARS (BinoculStatus 0, BinocularDir 1)
  gameState = 'binoculars';
  held.clear();
  binocDirTrigger = null;
  binoc = { home: currentRoom, mode: 'idle', timer: 0, lookDir: null, snap: binocSnapshot(currentRoom) };
}
function exitBinoculars() { gameState = 'play'; binoc = null; binocDirTrigger = null; }   // ExitBinocularMode -> play

// BinocularLogic: idle shows the player's room and polls the d-pad; a press toward a valid neighbour
// shows it for TIMER_BINOC, then returns. A dead-end direction does nothing (GetNextRoomNum FF).
function binocularsTick() {
  if (!binoc) { gameState = 'play'; return; }
  if (binoc.mode === 'idle') {
    const d = binocDirTrigger; binocDirTrigger = null;
    if (!d) return;
    const nb = neighbor(d);        // GetNextRoomNum — relative to the player's room (currentRoom == home)
    if (nb == null) return;        // no room that way: abort the move (stay)
    binoc.mode = 'show'; binoc.lookDir = d; binoc.timer = TIMER_BINOC;
    binoc.snap = binocSnapshot(nb);
  } else if (--binoc.timer <= 0) {   // BinocularShowRoom: timer elapsed -> back to the player's room
    binoc.mode = 'idle'; binoc.lookDir = null;
    binoc.snap = binocSnapshot(binoc.home);
  }
}

// DrawBinocRoom: render the shown room (image + items + doors + enemies) through the existing draw
// helpers (globals swapped to the snapshot for the duration — draw() is synchronous), then overlay
// the crosshair, "TELESCOPE MODE", and the direction arrow.
function drawBinoculars() {
  if (!binoc) return;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const s = binoc.snap;
  if (s.img) ctx.drawImage(s.img, 0, 0, VIEW_W, VIEW_H);
  const sd = activeDoors, si = roomItems, sg = guards;
  activeDoors = s.doors; roomItems = s.items; guards = s.guards;
  drawRoomItems(); drawDoors(); drawGuard();
  activeDoors = sd; roomItems = si; guards = sg;
  drawBinocReticle(VIEW_W >> 1, VIEW_H >> 1);
  drawText('TELESCOPE MODE', 8, 8);                                  // txtTelescope (PrintTextXY)
  if (binoc.mode === 'show' && binoc.lookDir) drawBinocArrow(binoc.lookDir);   // ArrowsChars
}
// Centre target reticle — the ROM's LoadSprTarget crosshair (SprTarget, BinocularSprAtt): a 32x32
// WHITE (BinocularSprCol = colour 0x0E) target laid out 2x2 — four L-shaped corner brackets plus a
// centred cross, no filled centre dot. (Was a green circle — issue #14.)
function drawBinocReticle(cx, cy) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  const px = (x, y, w, h) => ctx.fillRect(Math.round(cx) + x, Math.round(cy) + y, w, h);
  const H = 16, ARM = 8, T = 1;            // 32x32 cell, 8px corner arms, 1px strokes
  // Four corner brackets (L-shapes pointing inward).
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    px(sx < 0 ? -H : H - ARM, sy < 0 ? -H : H - T, ARM, T);   // horizontal arm along the top/bottom edge
    px(sx < 0 ? -H : H - T, sy < 0 ? -H : H - ARM, T, ARM);   // vertical arm along the left/right edge
  }
  // Centred cross with a small gap at the middle.
  px(-ARM, 0, ARM - 2, T); px(2, 0, ARM - 2, T);   // horizontal arms
  px(0, -ARM, T, ARM - 2); px(0, 2, T, ARM - 2);   // vertical arms
  ctx.restore();
}
function drawBinocArrow(dir) {
  const cx = VIEW_W >> 1, cy = (VIEW_H >> 1) + 30, s = 5;
  ctx.save();
  ctx.fillStyle = '#9ef0a0';
  ctx.translate(cx, cy);
  ctx.beginPath();
  if (dir === 'up')        { ctx.moveTo(0, -s); ctx.lineTo(s, s);  ctx.lineTo(-s, s); }
  else if (dir === 'down') { ctx.moveTo(0, s);  ctx.lineTo(s, -s); ctx.lineTo(-s, -s); }
  else if (dir === 'left') { ctx.moveTo(-s, 0); ctx.lineTo(s, s);  ctx.lineTo(s, -s); }
  else                     { ctx.moveTo(s, 0);  ctx.lineTo(-s, s); ctx.lineTo(-s, -s); }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// The equipment-screen consume path of DecItemUnits (Banks0123.asm:1824, type C=2): count -1;
// at zero the item is removed from the inventory (RemoveItem), its menu slot is erased WITHOUT
// recompacting (CompactEquipment only runs on the next open), and SelectedItem is cleared.
function useConsume(id) {
  const left = (items.get(id) || 0) - 1;
  if (left > 0) { items.set(id, left); return; }
  items.delete(id);
  const slot = menuEntries.indexOf(id);
  if (slot >= 0) menuEntries[slot] = 0;    // the FillRect-erased slot stays a gap while open
  selectedItem = 0;                        // SelectedItem = 0 + DrawItemHUD (HUD box empties)
}
// Full-screen menu (DrawWeaponMenu / DrawEquipMenu): black screen, centred title near the top, the owned
// entries as a vertical list of icon + name (+ 3-digit ammo for weapons), the OPTION label on the weapon
// screen, the arrow cursor on the selection, and the gameplay HUD kept at the bottom (the ROM calls
// RenderHUD here). Coordinates come straight from the ROM routines (see menuSlotPos). Names: names.json.
function drawMenu() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
  const isWeapon = menuMode === 'weapon';
  const list = menuList();
  const nameMap = (names && names[isWeapon ? 'weapons' : 'items']) || {};

  // Title (PrintTextXY): "WEAPON  SELECT" @ (72,16) / "EQUIPMENT  SELECT" @ (64,16); the 0/0 between
  // words are blank cells (drawText still advances over the missing glyphs).
  if (isWeapon) drawText('WEAPON  SELECT', 72, 16);
  else          drawText('EQUIPMENT  SELECT', 64, 16);

  // The suppressor always renders in its dedicated slot (DrawWeaponMenu5), regardless of how
  // few weapons precede it in the compacted list.
  const slotOf = (id, i) => (isWeapon && id === SUPRESSOR) ? 7 : i;
  for (let i = 0; i < list.length; i++) {
    const id = list[i];
    if (!id) continue;                     // emptied slot (last unit consumed) — a gap until next open
    const p = menuSlotPos(menuMode, slotOf(id, i));
    drawHudIcon(isWeapon ? 'w' : 'i', id, p.ix, p.iy);          // 32x16 / 16x16 icon (hud-icons.png)
    drawText(nameMap[id] || '', p.nameX, p.iy);                // name to the right (same DY as the icon)
    if (isWeapon && id !== SUPRESSOR) {                        // 3-digit ammo (suppressor shows none)
      drawText(ammo3(weapons.get(id) || 0), p.ammoX, p.ammoY); // real inventory ammo
    } else if (!isWeapon && id === SELECTED_RATION) {          // ration units (DrawEquipMenu)
      drawText(ammo3(items.get(id) || 0), p.ammoX, p.ammoY);
    }
  }
  if (isWeapon) drawText('OPTION', OPTION_XY.x, OPTION_XY.y);  // always-present menu entry

  // Arrow cursor on the SelectIdx grid slot (CalcCursorXYWeapon/CalcCursorXYEquip) — possibly an
  // empty slot; the cursor never reaches the suppressor slot or OPTION (SelectIdx caps at 7/25).
  const cp = menuSlotPos(menuMode, selectIdx - 1);
  drawArrow(cp.arrowX, cp.arrowY);

  renderHud();   // the ROM keeps the HUD (RenderHUD) on screen in the menus
}

// ---- Radio screen render (DrawRadio + the per-frame radio draws) ---------------------------
// Layout from the ROM: RadioTilesMap at (48,24), Snake portrait at (200,40) (DrawRadio,
// Banks0123.asm:10706/10710), TRANSCEIVER/RECV + the static red "120." from txtTransceiv
// (data/menuradiotexts.asm: title (80,8), RECV (56,64), digit chars at (120,33)/(120,41)),
// SEND at (56,56) (txtSend), the live frequency digits at (152,33) (DrawRadioFreq), the LED
// panel at (64,32) (DrawRadioLeds: 12 cells column-major upper-first; the OFF lamps are baked
// into the bg), and the talking portrait frames at (208,48) while Snake's text 10 prints
// (DrawSnakeFrame: SnakePicture1 when (iter & 0x1C)==0, SnakePicture2 when bit 2, else 0).
const RED_DIGIT_TILES = [   // RedDigitTiles (Banks0123.asm:11231): digit -> [top, bottom] chars
  [0xA4, 0xA5], [0xA6, 0xA7], [0xA8, 0xA9], [0xAA, 0xAB], [0xAC, 0xA7],
  [0xAD, 0xAB], [0xAD, 0xA5], [0xAE, 0xA7], [0xAF, 0xA5], [0xAF, 0xAB],
];
// freq-digits.png is the gfxFreqDigits strip, chars 0xA3 ('.') through 0xAF.
function drawRedGlyph(ch, x, y) {
  if (freqDigitsImg) ctx.drawImage(freqDigitsImg, (ch - 0xA3) * 8, 0, 8, 8, x, y, 8, 8);
}
function drawRedDigit(v, x, y) {
  const [t, b] = RED_DIGIT_TILES[v & 15] || RED_DIGIT_TILES[0];
  drawRedGlyph(t, x, y);
  drawRedGlyph(b, x, y + 8);
}
function drawRadioScreen() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);    // ClearPage0
  if (radioBgImg) ctx.drawImage(radioBgImg, 48, 24);
  if (snakePortraitImg) ctx.drawImage(snakePortraitImg, 200, 40);
  if (textBox && (textBox.id === 10 || textBox.id === 155)) {            // Snake is talking
    const it = (tickCounter >> 1) & 0x1C;
    const f = it === 0 ? 1 : (it & 4) ? 2 : 0;
    if (snakeTalkImgs[f]) ctx.drawImage(snakeTalkImgs[f], 208, 48);
  }
  drawText('TRANSCEIVER', 80, 8);
  if (radioCmd === 1) drawText('SEND', 56, 56);
  else drawText('RECV', 56, 64);
  // Static "120." (txtTransceiv digit rows) + the live BCD frequency (DrawRadioFreq).
  drawRedGlyph(0xA6, 120, 33); drawRedGlyph(0xA8, 128, 33); drawRedGlyph(0xA4, 136, 33);
  drawRedGlyph(0xA7, 120, 41); drawRedGlyph(0xA9, 128, 41); drawRedGlyph(0xA5, 136, 41);
  drawRedGlyph(0xA3, 144, 41);
  drawRedDigit(radioFreq >> 4, 152, 33);
  drawRedDigit(radioFreq & 15, 160, 33);
  // DrawRadioLeds (Banks0123.asm:11271): the panel fills in PAIRS — each 8x8 tile holds two
  // LED bars side by side; RadioLedCnt/2 full "ON ON" tiles, then one half-lit "ON OFF"
  // tile when the count is odd; each tile is drawn on BOTH display rows (y 32 and 40).
  for (let col = 0; col < 6; col++) {
    const img = col < (radioLedCnt >> 1) ? ledOnImg
              : (col === (radioLedCnt >> 1) && (radioLedCnt & 1)) ? ledHalfImg : null;
    if (!img) continue;
    ctx.drawImage(img, 64 + col * 8, 32);
    ctx.drawImage(img, 64 + col * 8, 40);
  }
  renderHud();
  drawTextWindow();
}

function draw() {
  if (gameState === 'title') { drawTitle(); return; }
  if (gameState === 'gameover') { drawGameOver(); return; }
  if (gameState === 'menu') { drawMenu(); return; }
  if (gameState === 'binoculars') { drawBinoculars(); return; }   // DrawBinocRoom (the telescope view)
  if (gameState === 'intro' && introStatus < 0) {   // GS_StartGame's ClearScreen: black,
    ctx.fillStyle = '#000';                         // no HUD, the music already playing
    ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
    return;
  }
  // The escape ending (EndingLogic): the radio segments draw the radio UI, the rest a black
  // backdrop with Snake + the explosion flash + the countdown; texts return to 'ending'.
  const inEnding = gameState === 'ending' || (gameState === 'text' && textReturnState === 'ending');
  if (inEnding) { if (endingRadio) drawRadioScreen(); else drawEnding(); return; }
  if (gameState === 'radio' || introRadio || (gameState === 'text' && textReturnState === 'radio')) {
    drawRadioScreen();                            // the text window prints OVER the radio UI
    return;                                       // (introRadio: the intro's scripted call, text 2)
  }
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  // SetRoomPal's draw-time palette picks (re-applied on menu close, so this matches the
  // ROM): a DARK room (123-125/220-221) renders BLACK (RoomPalette11) unless the
  // FLASHLIGHT is selected — checked BEFORE the goggles (ChkFlashLight falls through to
  // ChkGogglesPal only when lit); the goggles grey the room (RoomPalette10) anywhere else.
  let roomImg = assets.room;
  if (DARK_ROOMS.has(currentRoom) && selectedItem !== SELECTED_FLASHLIGHT && assets.roomDark)
    roomImg = assets.roomDark;
  else if (selectedItem === SELECTED_GOGGLES && assets.roomGoggles)
    roomImg = assets.roomGoggles;
  const shakeY = lorryShakeY();                   // the moving lorry's screen wobble
  ctx.save();
  if (shakeY) ctx.translate(0, shakeY);           // the ROM shakes via the scroll register
  if (roomImg) ctx.drawImage(roomImg, 0, 0, VIEW_W, VIEW_H);

  if (devShowCollision) drawCollisionOverlay();   // ?collision: tint solid tiles
  drawMetalGear();                                // ChkDrawMetalGear: the block at (0x60,0x20)
  drawRoomItems();
  drawPitfalls();                                 // the holes sit under everything
  drawDoors();
  drawLasers();                                   // beams under the sprites, goggles only
  drawElevator();                                 // the cabin, in elevator rooms
  drawCameras();                                  // wall cameras + live laser shots
  drawPowerSwitchFloor();                         // the live electric tiles' pulse
  drawBridges();                                  // the roof walkways (under the actors)
  drawBoss();                                     // Machine Gun Kid (room 20)
  drawScorpions();                                // the desert wildlife
  drawMines();                                    // buried mines (revealed by the detector)
  drawElevRelief();                               // room 3's relief guard walking in
  drawBarrels();                                  // the rolling barrels
  drawJetpacks();                                 // the jetpack guards
  drawDogs();                                     // the dogs wing
  drawDuck();                                     // Coward Duck + boomerangs
  drawMidBosses();                                // Tank / Bulldozer / Arnolds / Fire Trooper
  drawHindD();                                    // Hind D (room 50)
  drawBigBoss();                                  // Big Boss (room 119)
  drawFakeMadnar();                               // the room-189 trap
  drawGuard();
  drawPrisoner();
  drawBullets();
  drawPlayerShots();
  drawGasClouds();                                // the gas-room ambience drifts over actors
  drawGrenadeTarget();                            // the grenade-launcher aim crosshair

  // Snake's frame. While the post-hit i-frame timer is non-zero, the sprite flashes red on alternate
  // ticks — faithful to SetSnakeSprCol (Banks0123.asm:5489): TickCounter bit 0 == 0 -> SnakeAttrDamage
  // (the red "damage-" frame), else normal colours. Gated only on the timer, so it covers every damage
  // source (guard contact, bullets, deep-water drain). The ROM never hides the sprite — no blink.
  const a = assets.atlas;
  const dead = gameState === 'dead';
  const key = dead ? deadFrameKey() : playerSpriteKey();
  const flash = !dead && snake.invulnTimer > 0 && (tickCounter & 1) === 0;   // red on even ticks
  const drawKey = flash ? ('damage-' + key) : key;
  const f = a.frames[drawKey] || a.frames[key] || a.frames[snake.dir + '-idle'];
  if (f) {
    const fw = a.frameWidth, fh = a.frameHeight;
    const dx = Math.round(snake.x - a.anchorX);
    const dy = Math.round(snake.y - a.anchorY);
    ctx.drawImage(assets.sheet, f.x, f.y, fw, fh, dx, dy, fw, fh);
  }

  drawCaptureGuards();  // the scripted capture-scene guards (over the play actors)
  ctx.restore();        // end the lorry shake translate
  renderHud();
  drawTextWindow();   // text window over the scene (GAME_MODE_TEXT_BOX)
  drawCaptureFade();  // FadeOutLogic's black-out covers the whole frame, HUD included
}

// The escape ending (EndingLogic) — black backdrop with Snake running, the explosion flash, the
// final countdown, and (status 10-11) Big Boss's threat text. Radio segments go through
// drawRadioScreen instead. The ExploxionTiles explosion is rendered for real (drawEndingExplosion);
// the ending room 251 BACKDROP is still a plain black field (documented).
function drawEnding() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
  drawEndingExplosion();                                       // EndingExplosion: the real ExploxionTiles frames + the palette flash
  if (endingStatus <= 3 && assets.atlas && assets.sheet) {     // EndingSnakeRun: run left (status 0), then
    const a = assets.atlas;                                    // STOP + turn to watch the blast (SnakeSprId 0)
    const key = endingStatus === 0 ? ('left-' + ((tickCounter & 16) ? 'walk1' : 'walk2')) : 'right-idle';
    const f = a.frames[key] || a.frames['left-idle'];
    if (f) ctx.drawImage(assets.sheet, f.x, f.y, a.frameWidth, a.frameHeight,
      Math.round(snake.x - a.anchorX), Math.round(snake.y - a.anchorY), a.frameWidth, a.frameHeight);
  }
  if (endingStatus === 0) {                                    // DrawDestrucTimer (the final count)
    const s = String(Math.max(0, endingTimer)).padStart(4, '0');
    for (let i = 0; i < 4; i++) drawRedDigit(+s[i], 0x70 + i * 8, 0xC0);
  }
  drawTextWindow();                                           // Big Boss's threat (text 15) etc.
}
// EndingExplosion (ending.asm:418): the blast grows ExploxionTiles1->2->3 (small/med/big) at the ROM
// pixel positions, persisting, while the palette strobes RoomPalette13<->15 (slots 1/3/8/9). The port
// runs the two ending blasts in statuses 1 and 3; the frame index grows over each, and the base/flash
// atlases swap on the strobe. Tiles + palettes from RoomViewer --export-ending.
function drawEndingExplosion() {
  if (!endExplodeMeta || !endExplodeImg) return;
  let fi;
  if (endingStatus === 1 || endingStatus === 3) {              // the blast grows small -> big
    const total = endingStatus === 1 ? 0x40 : 0x30;
    const prog = total - endingCnt;                            // ticks elapsed in this blast
    fi = prog < 0x10 ? 0 : prog < (endingStatus === 1 ? 0x20 : 0x18) ? 1 : 2;
  } else if (endingStatus === 4 && !endingRadio) {
    fi = 2;                                                    // the big blast PERSISTS until the radio draws (ROM: the tiles stay in VRAM)
  } else return;
  const img = ((tickCounter & 8) && endExplodeFlashImg) ? endExplodeFlashImg : endExplodeImg;
  const fr = endExplodeMeta.frames[fi]; if (!fr) return;
  const ts = endExplodeMeta.tile || 8, atlas = endExplodeMeta.atlas || {};
  for (let r = 0; r < fr.rows; r++)
    for (let c = 0; c < fr.cols; c++) {
      const id = fr.map[r * fr.cols + c];
      if (!id) continue;                                       // 0 = empty cell
      const a = atlas[id]; if (!a) continue;
      ctx.drawImage(img, a[0], a[1], ts, ts, fr.x + c * ts, fr.y + r * ts, ts, ts);
    }
}

// The HUD (RenderHUD, logic/hud.asm), faithful to the ROM's layout: a bottom strip (screen Y 192-211,
// the MSX2 frame is 212 lines) holding LIFE + CLASS on the left, the CALL sign slot in the middle,
// and the WEAPON (icon + ammo) and ITEM boxes on the right, drawn at the ROM's exact screen
// coordinates. Text uses the game font (font.png / gfxFont). The destruction timer that shares the
// CALL slot is out of scope.
function renderHud() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, VIEW_H, VIEW_W, HUD_H);   // bottom HUD backdrop
  drawCallSign();   // DrawCallTimer runs inside RenderHUD (logic/hud.asm:11)

  // LIFE (DrawLife): "LIFE" at (16,193); white-outline box (49,193,50x8); red fill = Life over the
  // 0x30 (48) scale at (50,194), 6 tall; empty when Life <= 1. Fill colour 88h -> palette index 8 = red.
  drawText('LIFE', 16, 193);
  drawHudBox(49, 193, 50, 8);   // DrawRect NX=50 NY=8: the outline covers rows 193-200
  if (snake.life > 1) {
    ctx.fillStyle = '#ff0000';  // the 6-row fill (194-199) exactly fills the interior
    ctx.fillRect(50, 194, Math.max(0, Math.min(LIFE_BAR_SCALE, snake.life)), 6);
  }

  // CLASS (DrawClass): "CLASS" at (8,201) + (Class+1) rank stars at (52,201), 8px apart. The star is
  // the ROM's own glyph (gfxSymbChars[0] = font glyph 11, drawn yellow — tile 0x3B via DrawChar/0x4B).
  drawText('CLASS', 8, 201);
  for (let i = 0; i <= snake.class; i++) drawStar(52 + i * 8, 201);

  // WEAPON (DrawWeaponHUD): box (159,193,58x18) + weapon icon (160,194) + 3-digit ammo (192,200).
  drawHudBox(159, 193, 58, 18);
  drawHudIcon('w', selectedWeapon, 160, 194);
  if (weapons.has(selectedWeapon)) drawText(ammo3(weapons.get(selectedWeapon)), 192, 200);
  // ITEM (DrawItemHUD): box (222,193,27x18) + item icon (224,194).
  drawHudBox(222, 193, 27, 18);
  drawHudIcon('i', selectedItem, 224, 194);
}

// The blinking CALL sign (DrawCallTimer, logic/hud.asm:25-55): drawn only while a call rings
// (RadioCallFlag == 1), erased in the weapon/equipment menus (GameMode 2/3 — our drawMenu calls
// renderHud too, hence the gameState check), and blinking with TickCounter bit 3 (visible the 8
// iterations it is clear — callTickCounter counts ROM iterations, see chkIncomingCall's pacing
// note). txtCALL (data/hudstartendtexts.asm:74) prints chars 0x9C-0x9E at (120,193) and
// 0x9F-0xA1 at (120,201) — the exported call-sign.png is that 24x16 graphic in one image.
// The ring SFX that DrawCallTimer also fires lives in chkIncomingCall (same TickCounter timing).
function drawCallSign() {
  // The destruction countdown owns the slot once armed (DrawCallTimer -> DrawDestrucTimer).
  if (destructionOn) { drawDestructTimer(); return; }
  if (radioCallFlag !== 1 || gameState === 'menu') return;
  if ((callTickCounter & 8) !== 0) return;   // blink: visible only while bit 3 is clear
  if (callSignImg) ctx.drawImage(callSignImg, 120, 193);
  else drawText('CALL', 120, 193);   // fallback if the export is missing
}

// White HUD box outline (DrawRect, colour 0Eh). The ROM's DrawRect(X,Y,NX,NY) outlines a
// region covering EXACTLY NX x NY pixels (rows Y..Y+NY-1); a canvas strokeRect with
// lineWidth 1 needs w-1/h-1 for the same footprint — passing NX/NY directly painted the
// bottom/right border one pixel outside (user-reported: a black line inside the LIFE bar
// box, and the box bottom touching the CLASS row).
function drawHudBox(x, y, w, h) {
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// Blit a weapon/item icon (hud-icons.png, keyed "w<id>"/"i<id>") at (x,y). No-op if none/missing.
function drawHudIcon(kind, id, x, y) {
  if (!id || !hudIcons || !hudIconsAtlas || !hudIconsAtlas.icons) return;
  const ic = hudIconsAtlas.icons[kind + id];
  if (ic) ctx.drawImage(hudIcons, ic.x, ic.y, ic.w, hudIconsAtlas.frameHeight, x, y, ic.w, hudIconsAtlas.frameHeight);
}

// Format an ammo/amount the way Render3Numbers does (logic/hud.asm:291): three character cells, but the
// hundreds digit is BLANK when zero while the tens and units are always drawn (so 0 -> " 00", 7 -> " 07",
// 150 -> "150"). The blank keeps the tens/units in a fixed column. drawText skips the leading space.
function ammo3(n) {
  n = Math.max(0, Math.min(999, n | 0));
  const h = Math.floor(n / 100);
  return (h ? String(h) : ' ') + String(n % 100).padStart(2, '0');
}

// Draw a string with the game font (font.png / gfxFont; DrawChar): glyph index = charCode - first,
// one 8x8 glyph per character (8px advance). Characters outside the table are skipped.
// The apostrophe (0x97) and dakuten (0x98) advance only 4px (TW_PrintChar5,
// Banks0123.asm:8026-8033) — the next letter merges into the glyph cell; our transparent
// glyph blits compose exactly like the ROM's TIMP copy.
function drawText(str, x, y) {
  if (!fontImg || !fontMeta) return;
  const { charW, charH, first, count } = fontMeta;
  let dx = x;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const gi = code - first;
    if (gi >= 0 && gi < count)
      ctx.drawImage(fontImg, gi * charW, 0, charW, charH, dx, y, charW, charH);
    dx += (code === 0x97 || code === 0x98) ? 4 : charW;
  }
}

// Draw the ROM rank star glyph (the yellow star appended to font.png at fontMeta.starX) at (x,y).
function drawStar(x, y) {
  if (!fontImg || !fontMeta || fontMeta.starX == null) return;
  ctx.drawImage(fontImg, fontMeta.starX, 0, fontMeta.charW, fontMeta.charH, x, y, fontMeta.charW, fontMeta.charH);
}

// Draw the active room's doors using the decoded door graphics. West/East doors are
// sheared into the recessed-wall parallelogram (reproducing the per-column shift in
// drawdoors.asm). While opening, the door is wiped away directionally — revealing the
// room behind it — matching erasedoor.asm (north L->R, south R->L, west/east diagonal,
// approximated here as a vertical wipe). An open door draws nothing.
function drawDoors() {
  // Doors and prison walls are drawn from the room's tile slots, which ChkGogglesPal's
  // grey palette covers — a grayscale filter approximates the exact grey ramp.
  const infrared = selectedItem === SELECTED_GOGGLES;
  if (infrared) { ctx.save(); ctx.filter = 'grayscale(1)'; }
  for (const d of activeDoors) {
    if (d.open || !d.img) continue;
    const s = d.srect, shear = d.shear;
    const prog = d.opening ? 1 - d.openTimer / (d.openTotal || DOOR_OPEN_TICKS) : 0;  // 0 closed .. 1 open

    // Visual bounding box (sheared doors are taller than their footprint).
    const vb = { x: s.x, y: s.y, w: s.w, h: s.h + Math.abs(shear) * s.w };

    // The elevator door (type 5) is a sliding double door: EraseDoorElevator
    // (logic/doors/erasedoor.asm:289) erases one vertical line per frame from the CENTRE
    // outward — both halves recede toward the jambs.
    if (d.type === 5 && prog > 0) {
      const half = vb.w / 2, k = prog * half;
      ctx.save();
      ctx.beginPath();
      ctx.rect(vb.x, vb.y, half - k, vb.h);                 // left slide
      ctx.rect(vb.x + half + k, vb.y, half - k, vb.h);      // right slide
      ctx.clip();
      ctx.drawImage(d.img, s.x, s.y);
      ctx.restore();
      continue;
    }

    // Directional wipe: clip to the not-yet-erased part of the door.
    let cx = vb.x, cy = vb.y, cw = vb.w, ch = vb.h;
    if (prog > 0) {
      if (d.type === 1) { cx = vb.x + prog * vb.w; cw = vb.w * (1 - prog); }       // north: erase L->R
      else if (d.type === 2) { cw = vb.w * (1 - prog); }                            // south: erase R->L
      else if (d.type === 4) { cy = vb.y + prog * vb.h; ch = vb.h * (1 - prog); }   // east: erase top->down
      else { ch = vb.h * (1 - prog); }                                              // west: erase bottom->up
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    if (shear) {
      const baseY = s.y - Math.min(0, shear * s.w);
      ctx.transform(1, shear, 0, 1, s.x, baseY);
      ctx.drawImage(d.img, 0, 0);
    } else {
      ctx.drawImage(d.img, s.x, s.y);
    }
    ctx.restore();
  }
  if (infrared) ctx.restore();
}

// ---- Dev perf HUD (?perf) --------------------------------------------------
// Diagnostic for issue #2 (long-session slowdown that resets on a room change). Opt-in via ?perf,
// like the other dev hooks. Reads the four signals that tell the hypotheses apart:
//   - fps drops but upd/drw stay low + ticks/frame rises  -> the loop is compensating (browser
//     RAF throttling / real-time still correct), not a per-frame-cost leak.
//   - upd or drw ms climbs over a long stay in one room    -> per-frame work is growing; the
//     g/b/s counts below say whether it's guards/bullets/shots.
//   - heap climbs steadily                                 -> a memory leak (GC pressure slowdown).
let devPerf = false;
const perf = { frames: 0, fps: 0, updMs: 0, drwMs: 0, ticks: 0, lastSample: 0 };
function perfSample(now, updMs, drwMs, ticks) {
  perf.frames++;
  perf.updMs = perf.updMs * 0.9 + updMs * 0.1;   // EWMA so the readout doesn't jitter
  perf.drwMs = perf.drwMs * 0.9 + drwMs * 0.1;
  perf.ticks = ticks;
  if (!perf.lastSample) perf.lastSample = now;
  if (now - perf.lastSample >= 500) {            // recompute fps twice a second
    perf.fps = perf.frames * 1000 / (now - perf.lastSample);
    perf.frames = 0; perf.lastSample = now;
  }
}
function drawPerfHud() {
  const m = (typeof performance !== 'undefined' && performance.memory)
    ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + 'M' : 'n/a';
  const lines = [
    'fps ' + perf.fps.toFixed(0) + '  tk/f ' + perf.ticks,
    'upd ' + perf.updMs.toFixed(2) + ' drw ' + perf.drwMs.toFixed(2),
    'g' + guards.length + ' b' + bullets.length + ' s' + playerShots.length + ' r' + currentRoom,
    'heap ' + m,
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.65)';
  ctx.fillRect(0, 0, 92, 4 + lines.length * 9);
  ctx.fillStyle = '#9ef0a0';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 2, 2 + i * 9));
  ctx.restore();
}

// ---- Fixed-timestep loop ---------------------------------------------------
let running = false, paused = false, last = 0, acc = 0;
function loop(now) {
  if (!running || paused) return;
  if (!last) last = now;
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250;          // clamp after tab-out so we don't spiral
  let ticks = 0;
  const t0 = devPerf ? performance.now() : 0;
  while (acc >= TICK_MS) { update(); acc -= TICK_MS; ticks++; }
  const t1 = devPerf ? performance.now() : 0;
  draw();
  if (devPerf) { perfSample(now, t1 - t0, performance.now() - t1, ticks); drawPerfHud(); }
  requestAnimationFrame(loop);
}

// Freeze the sim (keeps the last frame on screen) so the guard can be inspected.
function togglePause() {
  if (!running) return;              // nothing to pause before the game starts
  if (bugFormOpen) return;           // the bug-report form owns the pause flag while it's up — don't desync it
  // The ROM's F1 pause shares the Playing F-key gate: no pausing in the ladder/elevator
  // rooms or room 204 (Banks0123.asm:12112-12119). Unpausing always works.
  if (!paused && gameState === 'play' && fkeysBlocked()) return;
  paused = !paused;
  if (!paused) chkPasswords();        // ExitPauseMode: check a password/SAVE/LOAD typed while paused
  if (pauseBtn) pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  if (paused) redrawStatic();
  else { last = 0; acc = 0; requestAnimationFrame(loop); }
}
// Redraw the held frame plus a PAUSED marker (used while paused, since loop() is stopped).
function redrawStatic() { draw(); if (paused) paintHUD(); }
function paintHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(0, VIEW_H - 11, VIEW_W, 11);
  ctx.fillStyle = '#9ef0a0';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED — ROOM ' + currentRoom, 3, VIEW_H - 5);   // room number: navigation aid (dev overlay)
  ctx.restore();
}

// ---- Boot (the loop starts immediately; the first gesture unlocks audio) ----
function startLoop() {
  if (running) return;
  running = true;
  last = 0; acc = 0;
  requestAnimationFrame(loop);
}
// Browser autoplay policy: audio needs a user gesture. Until the first keypress the boot
// runs silent — which matches the ROM anyway (InitKonamiLogo mutes the sound, 0x5C); the
// title SFX simply join in from the first gesture onward.
async function unlockAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    // Master bus: everything (via audioOut) feeds this, which fans out to the speakers AND a
    // MediaStream tap so the bug-report recorder can capture game audio (captureStream is video-
    // only). Created here, with the context, so the bus exists before any sound plays.
    audioBus = audioCtx.createGain();
    audioBus.connect(audioCtx.destination);
    try { captureDest = audioCtx.createMediaStreamDestination(); audioBus.connect(captureDest); } catch (e) {}
    bugRefreshAudio();           // restart the rolling recorders so new segments include audio
    await loadSounds();
  } catch (e) {
    console.warn('Audio init failed:', e);
  }
}

async function main() {
  try {
    await loadAssets();
  } catch (e) {
    errEl.textContent =
      'Could not load assets from web/assets/.\n' + e.message +
      '\n\nRun the export tools first, then serve this folder over http ' +
      '(e.g. `node serve.js` or `python -m http.server` in web/), ' +
      'since browsers block fetch() for file:// URLs.';
    return;
  }
  // Dev hook: ?room=N jumps to a room (for inspecting doors); snake placed on open floor. A ladder
  // room (224-226) enters ladder-walk mode instead (the ladder door is end-game / unreachable).
  const rn = new URLSearchParams(location.search).get('room');
  // ?capture: drop Snake inside room 8's capture zone (X 0xC0-0xD0). The zone isn't
  // reachable on foot in the exported cluster (room 8's right side is entered from
  // unexported rooms), so this hook exercises the scene until that cluster expansion.
  if (new URLSearchParams(location.search).has('capture')) {
    devCapture = true;
    setRoom(8);
    // The real approach: the bottom corridor (y >= 0x80) is the only strip reaching room
    // 12's edge, so the ROM capture happens walking it leftward past the tank — place
    // Snake there, inside the trigger zone.
    snake.x = 0xC8;
    snake.y = 0xA0;
    if (!freeAt(snake.x, snake.y))
      for (let y = 0x80; y < VIEW_H - 8; y += 4) if (freeAt(snake.x, y)) { snake.y = y; break; }
    snake.dir = 'left';
    gameState = 'play';
  } else if (rn != null && rooms.has(+rn)) {
    setRoom(+rn);
    if (LADDER_ROOMS.has(+rn)) {
      enterLadderRoom();
    } else if (ROOMS_WATER.has(+rn)) {
      enterWaterRoom();
    } else {
      for (let y = 16; y < VIEW_H - 16 && !freeAt(snake.x, snake.y); y += 4)
        for (let x = 16; x < VIEW_W - 16; x += 4) if (freeAt(x, y)) { snake.x = x; snake.y = y; break; }
    }
  }

  // Boot into the title sequence (GS_KonamiLogo) — unless a dev hook jumps into play.
  // Editing the #hash on an open page is only a fragment navigation (no reload, main()
  // never re-runs) — reload so typing #auto into the address bar takes effect.
  window.addEventListener('hashchange', () => location.reload());
  const devSkipTitle = rn != null || devCapture || location.hash === '#auto';
  if (!devSkipTitle) {
    // The boot WAITS for one gesture: the browser autoplay policy blocks audio until a
    // user interaction, and the swoop SFX is due ~3s into the auto-running boot — a
    // mid-boot first keypress reached it too late (user-reported: the swoop was missing
    // or broken). The gesture unlocks the AudioContext AND decodes every buffer before
    // the Konami reveal starts, so the whole boot plays with sound ready.
    gameState = 'title'; titlePhase = 'gate'; titleCnt = 0;
    if (gate) {
      // The game's own metallic logo (gfxMetalGearLogo blocks: metal.png + gear.png) instead of the
      // plain green prompt — more inviting. Cosmetic only; the gesture still unlocks audio and the
      // ROM Konami scroll plays next.
      gate.innerHTML =
        '<div class="mg-logo">' +
          '<img class="mg-metal" src="assets/metal.png" alt="METAL">' +
          '<img class="mg-gear" src="assets/gear.png" alt="GEAR">' +
        '</div>' +
        '<div class="mg-start">Press any key &middot; Tap to start</div>';
      gate.classList.remove('hidden');
    }
    const begin = async () => {
      window.removeEventListener('keydown', begin);
      canvas.removeEventListener('click', begin);
      if (gate) gate.removeEventListener('click', begin);
      await unlockAudio();
      if (gate) gate.classList.add('hidden');
      titlePhase = 'konami-reveal'; titleCnt = 0;
    };
    window.addEventListener('keydown', begin);
    canvas.addEventListener('click', begin);
    if (gate) gate.addEventListener('click', begin);   // the overlay sits over the canvas — catch taps/clicks on it too
  } else {
    if (gate) gate.classList.add('hidden');
    // Dev flows start instantly; audio joins in from the first gesture as before.
    window.addEventListener('keydown', () => unlockAudio(), { once: true });
    canvas.addEventListener('click', () => unlockAudio(), { once: true });
  }
  startLoop();
  initBugReporter();   // dev/QA: start the rolling 20s gameplay recorder for the B bug-report key
  // Dev hooks: ?alert forces the guard alert (for capture).
  if (new URLSearchParams(location.search).has('alert')) devForceAlert = true;
  if (new URLSearchParams(location.search).has('red')) devForceRed = true;   // force red alert (reinforcements)
  if (new URLSearchParams(location.search).has('collision')) devShowCollision = true;   // tint solid tiles
  if (new URLSearchParams(location.search).has('perf')) devPerf = true;   // ?perf: perf HUD for the slowdown bug (#2)
  // ?sleep: make the current room's guard start asleep (no cluster room carries the ROM sleeping flag
  // yet, so this dev hook lets the sleep/wake behaviour be exercised).
  if (new URLSearchParams(location.search).has('sleep') && guard) { guard.sleepy = true; guard.asleep = true; }
  // ?goggles: grant + select the infrared goggles (for the laser rooms — their real pickup
  // room isn't exported; in the cluster the demo goggles sit in room 2).
  if (new URLSearchParams(location.search).has('goggles')) { items.set(SELECTED_GOGGLES, 1); selectedItem = SELECTED_GOGGLES; }
  // ?arsenal: grant every weapon with ammo, the suppressor, 3 rations, and ALL EIGHT
  // keycards — for boss/dev testing without the collection walk (e.g. ?capture&arsenal:
  // the capture strips it all, the equipment bag in room 168 recovers it; or
  // ?room=22&arsenal to open room 22's CARD3 door into Machine Gun Kid's room 20).
  if (new URLSearchParams(location.search).has('arsenal')) {
    for (let w = 1; w <= 7; w++) weapons.set(w, 30);
    invSuppressor = true;
    selectedWeapon = 1;
    items.set(SELECTED_RATION, 3);
    for (let c = 0; c < 8; c++) items.set(SELECTED_CARD1 + c, 1);   // CARD1..CARD8
    items.set(SELECTED_GAS_MASK, 1);     // owned, NOT selected (the gas/dark checks key
    items.set(SELECTED_FLASHLIGHT, 1);   // on the SELECTION, like the ROM)
    items.set(SELECTED_ANTIDOTE, 1);     // the desert (real pickup: room 138)
    items.set(SELECTED_BOMB_SUIT, 1);    // the roof air-flow gate (room 53)
    items.set(SELECTED_PARACHUTE, 1);    // the roof fall (room 117 -> 204)
    items.set(SELECTED_CIGARETTES, 2);   // dev boots bypass the intro grant — needed for the countdown test
    items.set(SELECTED_BINOCULARS, 1);   // owned, NOT selected — for testing binoculars/telescope mode
  }
  // ?mgko: destroy Metal Gear on spawn into room 118 (door 99 open + the self-destruct countdown
  // running) — a dev shortcut to test Big Boss / countdown / escape / ending WITHOUT the 16-bomb leg
  // puzzle. Use with ?room=118 (&arsenal). Silent: no EMERGENCY text.
  if (new URLSearchParams(location.search).has('mgko') && currentRoom === 118) destroyMetalGear(true);
}

main();
