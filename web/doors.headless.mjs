// Headless verification for doors: keycard gating (ChkOpenDoor / ChkCard1..8) and door-entry
// placement (SetPlayerInDoor2..4 + PlayerInDoorDat, logic/nextroom.asm). Loads the REAL
// web/game.js + the real exported doors/door-types/collision data, walks Snake into room 7's
// south lock-5 door, and verifies card gating, the exact ROM landing spot + facing per door
// type, walkability of every cluster door landing, and drift-free round trips.
// Run: node web/doors.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const calls = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect','transform','translate'])
    rec[m] = () => calls.push(m);
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__doors = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'doors.json'), 'utf8'));
sandbox.__dtypes = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'door-types.json'), 'utf8'));
sandbox.__coll7 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '7.collision.json'), 'utf8'));
sandbox.__coll6 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '6.collision.json'), 'utf8'));
sandbox.__coll11 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '11.collision.json'), 'utf8'));
sandbox.__coll60 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '60.collision.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  doorsData = __doors; doorTypes = __dtypes; doorGfx = {};
  assets.collision = __coll7; currentRoom = 7; gameState = 'play';
  // Walk Snake down into room 7's south lock-5 door (id 4, leads to room 6's upper area).
  function push(card) {
    buildDoors(7);
    weapons.clear(); items.clear(); selectedItem = 0;
    if (card) { items.set(card, 0x34); selectedItem = card; }
    snake.x = 208; snake.y = 176; snake.dir = 'down'; snake.anim = ANIM_NORMAL;
    held.clear(); held.add('dir:down'); pushRecency('down');
    const d = activeDoors.find(x => x.id === 4);
    for (let i = 0; i < 50 && !d.open; i++) { normalControl(); updateDoors(); }   // per-type open up to 36 ticks (#105)
    held.clear();
    return d;
  }
  __check('lock 5 needs CARD4 (lock L -> card L-1)', cardItemForLock(5) === SELECTED_CARD4);
  __check('CARD4 selected: pushing opens the lock-5 door', push(SELECTED_CARD4).open === true);
  __check('no card: the door stays shut', push(0).open === false);
  __check('wrong card (CARD5): the door stays shut', push(SELECTED_CARD5).open === false);
  __check('owned but NOT selected: the door stays shut',
          (function(){ buildDoors(7); items.set(SELECTED_CARD4, 0x34); selectedItem = 0;
            snake.x=208; snake.y=176; snake.dir='down';
            held.clear(); held.add('dir:down'); pushRecency('down');
            const d = activeDoors.find(x=>x.id===4);
            for (let i=0;i<50 && !d.open;i++){ normalControl(); updateDoors(); }
            held.clear(); return d.open; })() === false);

  // --- door-entry placement (SetPlayerInDoor2..4 + PlayerInDoorDat, logic/nextroom.asm) ---
  // Cluster door pairs: 7<->6 by id 4 (type 2 south / type 1 north), 7<->11 by id 5
  // (type 4 east / type 3 west). Expected landings = dest door draw YX + the table offsets
  // (8-bit adds): type 1 [0x28,0x0C,down] -> (196+12, 0+40); type 2 [0xF8,0x10,up] ->
  // (192+16, (184+0xF8)&0xFF=176); type 3 [0x30,0x10,right] -> (8+16, 96+48); type 4
  // [0x30,0xF6,left] -> ((240+0xF6)&0xFF=230, 96+48).
  rooms.set(6, { img: null, collision: __coll6 });
  rooms.set(7, { img: null, collision: __coll7 });
  rooms.set(11, { img: null, collision: __coll11 });

  function goThrough(id) {
    const d = activeDoors.find(x => x.id === id);
    enterDoor(d);
    return { room: currentRoom, x: snake.x, y: snake.y, dir: snake.dir, walkable: freeAt(snake.x, snake.y) };
  }
  function at(p, room, x, y, dir) { return p.room===room && p.x===x && p.y===y && p.dir===dir; }

  assets.collision = __coll7; currentRoom = 7; buildDoors(7);
  const p6 = goThrough(4);     // 7 -> 6 through the south door, arrive at 6's NORTH door (type 1)
  __check('type 1 (north) landing: room 6 (208,40) facing down', at(p6, 6, 208, 40, 'down'), JSON.stringify(p6));
  const p7 = goThrough(4);     // 6 -> 7, arrive at 7's SOUTH door (type 2; 0xF8 offY wraps to -8)
  __check('type 2 (south) landing: room 7 (208,176) facing up', at(p7, 7, 208, 176, 'up'), JSON.stringify(p7));
  const p11 = goThrough(5);    // 7 -> 11, arrive at 11's WEST door (type 3)
  __check('type 3 (west) landing: room 11 (24,144) facing right', at(p11, 11, 24, 144, 'right'), JSON.stringify(p11));
  const p7e = goThrough(5);    // 11 -> 7, arrive at 7's EAST door (type 4; 0xF6 offX wraps to -10)
  __check('type 4 (east) landing: room 7 (230,144) facing left', at(p7e, 7, 230, 144, 'left'), JSON.stringify(p7e));
  __check('every cluster door landing is walkable (no relocation scan needed)',
          p6.walkable && p7.walkable && p11.walkable && p7e.walkable,
          JSON.stringify([p6.walkable, p7.walkable, p11.walkable, p7e.walkable]));

  // --- no drift: repeated round trips land on identical pixels every time ---
  let driftEW = false, driftNS = false;
  for (let i = 0; i < 5; i++) {
    const a = goThrough(5), b = goThrough(5);   // 7 -> 11 -> 7
    if (!at(a, 11, 24, 144, 'right') || !at(b, 7, 230, 144, 'left')) driftEW = true;
  }
  for (let i = 0; i < 5; i++) {
    const a = goThrough(4), b = goThrough(4);   // 7 -> 6 -> 7
    if (!at(a, 6, 208, 40, 'down') || !at(b, 7, 208, 176, 'up')) driftNS = true;
  }
  __check('5x E/W round trips (7<->11): pixel-identical landings', !driftEW);
  __check('5x N/S round trips (7<->6): pixel-identical landings', !driftNS);

  // --- lock-16 bomb-wall collision (closedWallSolid + doorCollRect, breakable types 7-19) ---
  // Room 60's door 142 is a type-7 (TilesBasemWall60, 6r x 4c) BOMB wall that sits over an OPEN
  // passage in the exported room collision — before the footprint fix Snake walked through it
  // without bombing (the audit gap). The wall is solid until an exploding plastic bomb opens it.
  assets.collision = __coll60; currentRoom = 60; buildDoors(60);
  const w60 = activeDoors.find(x => x.lock === 16);
  const wx = w60.rect.x + 4, wy = w60.rect.y + 4;     // a point inside the wall footprint
  const baseOpen = __coll60.solid[(wy >> 3) * __coll60.width + (wx >> 3)] === 0;
  __check('the lock-16 wall sits over OPEN room collision (was walk-through)', baseOpen);
  __check('its footprint matches doorCollRect type 7 (32x48 from the tile table)',
          w60.rect.w === 32 && w60.rect.h === 48);
  __check('a CLOSED lock-16 bomb wall blocks movement (closedWallSolid)', closedWallSolid(wx, wy) === true);
  openDoor(w60);                                       // ChkBasementWall: an exploding bomb opens it
  __check('once bombed open the wall is passable again',
          closedWallSolid(wx, wy) === false && inOpenDoor(wx, wy) === true);

  // --- in-room wall (dest === room): opening it does NOT teleport (ChkEnterDoor2's 0x20 bit) ---
  __check('room 60 wall is an IN-ROOM wall (dest === its own room)', w60.dest === 60);
  rooms.set(60, { img:null, collision:__coll60 });
  snake.x = w60.enterRect.x + 2; snake.y = w60.enterRect.y + 2; w60.wasInside = false;
  const px = snake.x, py = snake.y;
  maybeEnterDoor();                                    // walking into the opened passage
  __check('walking through an opened in-room wall does NOT teleport / reload the room',
          currentRoom === 60 && snake.x === px && snake.y === py);

  // --- #103: a lock-11 wall (ChkDoorLorry, e.g. door 0x69) opens by plastic bomb ONLY ---
  const t2 = doorTypes['2'];
  const d11 = { id: 0x69, type: 2, lock: 11, x: 100, y: 100, open: false, opening: false,
                rect: { x: 100, y: 100, w: 16, h: 16 }, enterRect: { x: 100, y: 100, w: 16, h: 16 } };
  activeDoors = [d11];
  audioCtx = null;                                              // silence the wall-hit SFX
  snake.dir = 'down'; snake.controlMod = CONTROL_PUNCH;         // facing the door (type 2), punching
  snake.x = d11.x + t2.openOffX; snake.y = d11.y + t2.openOffY; // inside its open area
  chkPunchOpenDoors();
  __check('#103 punching a lock-11 wall does NOT open it', d11.open === false && d11.opening === false);
  chkBombWalls({ x: d11.x + t2.openOffX, y: d11.y + t2.openOffY });   // an exploding plastic bomb in its zone
  __check('#103 a plastic bomb DOES open the lock-11 wall', d11.open === true || d11.opening === true);

  // --- #104: the entry trigger uses the per-type DoorOpenEnterDat zone, not the collision footprint ---
  doorsData['999'] = [{ id: 0xAA, type: 1, lock: 0, dest: 0, x: 100, y: 50 }];
  buildDoors(999);
  const nd = activeDoors.find(x => x.id === 0xAA);
  __check('#104 type-1 (north) enters at (x, y+16) 32x16 — DoorOpenEnterDat, not the footprint',
    nd.enterRect.x === 100 && nd.enterRect.y === 66 && nd.enterRect.w === 32 && nd.enterRect.h === 16,
    JSON.stringify(nd.enterRect));

  // --- #105: door-open animation length is PER-TYPE (EraseDoor counts), not a flat 18 ---
  openDoor(nd);                                          // the type-1 north door
  __check('#105 north (type 1) opens over 25 ticks', nd.opening && nd.openTotal === 25 && nd.openTimer === 25);
  doorsData['998'] = [{ id: 0xAB, type: 3, lock: 0, dest: 0, x: 50, y: 50 }];
  buildDoors(998); const wd = activeDoors.find(x => x.id === 0xAB); openDoor(wd);
  __check('#105 west (type 3) opens over 36 ticks', wd.openTotal === 36);

  // --- #105: a card door opened by the player pauses the world (GAME_MODE_OPEN_DOOR) until it erases ---
  assets.collision = __coll7; currentRoom = 7; gameState = 'play'; demoActive = false;
  alertMode = false; incomingCallTimer = 0; guardsData = {}; guards.length = 0;
  roomItems = [null, null, null]; bullets.length = 0; playerShots.length = 0;
  buildDoors(7); weapons.clear(); items.clear();
  items.set(SELECTED_CARD4, 0x34); selectedItem = SELECTED_CARD4;
  snake.x = 208; snake.y = 176; snake.dir = 'down'; snake.anim = ANIM_NORMAL; snake.controlMod = CONTROL_NORMAL;
  held.clear(); held.add('dir:down'); pushRecency('down');
  const sd = activeDoors.find(x => x.id === 4);          // the lock-5 SOUTH door (type 2 -> 33 ticks)
  let froze = false, frozenX = null, frozenFrames = 0;
  for (let i = 0; i < 120 && !(froze && gameState === 'play'); i++) {
    update();
    if (gameState === 'opendoor') { if (!froze) { froze = true; frozenX = snake.x; } frozenFrames++; }
  }
  __check('#105 a card-door open enters GAME_MODE_OPEN_DOOR (the world freezes)', froze);
  __check('#105 the freeze lasts the type-2 erase count (~33 ticks)',
    frozenFrames >= 30 && frozenFrames <= 36, 'frames=' + frozenFrames);
  __check('#105 Snake does not move during the freeze, and the door ends OPEN, back in play',
    snake.x === frozenX && sd.open === true && gameState === 'play');
  held.clear();
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
