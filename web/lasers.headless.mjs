// Headless verification for the laser systems: the beam corridors (InitLaserRoom /
// ChkTouchLaser / DrawLaserBeams / DrawMovingLasers — rooms 24/25/72, goggles-gated) and the
// cameras (CameraLogic surveillance + LaserCameraLogic turrets firing damaging laser shots —
// rooms 14/31 live, room 111 island). Loads the REAL web/game.js + the exported
// lasers.json/cameras.json/collision. Run: node web/lasers.headless.mjs
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
    rec[m] = (...a) => calls.push({ m, a, fillStyle: rec.fillStyle });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat, String, Number,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__lasers = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'lasers.json'), 'utf8'));
sandbox.__cams = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'cameras.json'), 'utf8'));
for (const r of [24, 31, 111])
  sandbox['__coll' + r] = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', r + '.collision.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });
sandbox.__calls = calls;

const test = `
;(function(){
  lasersData = __lasers; camerasData = __cams; doorsData = {}; doorTypes = {};
  rooms.set(24,  { img: null, collision: __coll24 });
  rooms.set(31,  { img: null, collision: __coll31 });
  rooms.set(111, { img: null, collision: __coll111 });
  rooms.set(72,  { img: null, collision: __coll24 });   // synthetic stand-in for the moving-laser room
  gameState = 'play'; held.clear();
  const tick = (n) => { for (let i = 0; i < (n || 1); i++) update(); };

  // --- spawn (InitLaserRoom): the ROM tables, none during an alert ---
  setRoom(24);
  __check('room 24 spawns its 6 beams', lasers.length === 6 && lasers.every((b) => b.on === 1));
  alertMode = true;
  setRoom(24);
  __check('an alerted entry spawns NO beams (Banks0123.asm:5654)', lasers.length === 0);
  alertMode = false; roomAlert = -1;
  setRoom(24);
  __check('a later quiet entry restores the beams', lasers.length === 6);

  // --- visibility (DrawLaserBeams): goggles-gated ---
  const beamDraws = () => __calls.filter((c) => c.m === 'fillRect' && c.fillStyle === '#ff0000').length;
  __calls.length = 0; selectedItem = 0; drawLasers();
  __check('no goggles: the beams draw NOTHING', beamDraws() === 0);
  items.set(SELECTED_GOGGLES, 1); selectedItem = SELECTED_GOGGLES;
  __calls.length = 0; drawLasers();
  __check('goggles selected: all 6 beams draw red', beamDraws() === 6);

  // --- touch (ChkTouchLaser): the exact inequalities; axis 0 = column at X over Y+8.. ---
  // room 24 beam[2]: on=1, y=0x50, x=0x40, len=0x20, axis=1 (a row at Y 0x50, X 0x40..0x60)
  const b = lasers[2];
  __check('beam 2 is the (0x50, 0x40) row beam', b.y === 0x50 && b.x === 0x40 && b.axis === 1 && b.len === 0x20);
  snake.x = 0x50; snake.y = b.y + 4;       // |dy| = 4: NOT < 4 -> miss
  chkTouchLasers();
  __check('4px above the row beam: no trip (strict <4)', alertMode === false && lasers.length === 6);
  snake.y = b.y + 3;                       // |dy| = 3 and X inside the span
  chkTouchLasers();
  __check('crossing the beam trips the RED alert and burns ALL beams',
    alertMode === true && redAlertFlag === true && lasers.length === 0);
  alertMode = false; redAlertFlag = false; roomAlert = -1;

  // --- the room-72 cycle (DrawMovingLasers): goggles-gated, 0xC0 per step ---
  currentRoom = 72; buildLasers(72);
  __check('room 72 spawns 10 beams (4 ON in the table)', lasers.length === 10
    && lasers.filter((x) => x.on === 1).length === 4);
  laserRoomTimer = 0; laserRoomCnt = 0;
  selectedItem = 0;
  for (let i = 0; i < 0x200; i++) movingLasersTick();
  __check('without the goggles the cycle never advances', laserRoomCnt === 0);
  selectedItem = SELECTED_GOGGLES;
  for (let i = 0; i < 0xC0; i++) movingLasersTick();
  __check('0xC0 watched iterations advance to pattern 1 and apply it',
    laserRoomCnt === 1 && lasers.map((x) => x.on).join('') === lasersData.seq[1].join(''),
    'cnt='+laserRoomCnt);

  // --- surveillance cameras (room 31: a column patrol facing right, a row patrol facing up) ---
  selectedItem = 0; alertMode = false;
  setRoom(31);
  __check('room 31 spawns its 2 cameras', cameras.length === 2
    && cameras[0].dir === 3 && cameras[1].dir === 0 && !cameras[0].laser);
  const cam = cameras[0];
  cam.x = 64; cam.y = 96; cam.moving = true; cam.pt = 1;     // mid-patrol on the X 0x40 column
  snake.x = 200; snake.y = 200;                               // far away, off the lens row
  cameraTick();
  __check('unseen: the camera keeps patrolling (1px steps)', cam.status === 0 && cam.y === 97);
  snake.x = cam.x + 0x10 + 40; snake.y = cam.y;               // on the lens row, to its right
  cameraTick();
  __check('sighted: the camera stops and flashes (0x20) and the RED alert rises',
    cam.status === 1 && cam.flashCnt === 0x20 && alertMode && redAlertFlag);
  for (let i = 0; i < 0x20; i++) cameraTick();
  __check('after the flash the camera freezes (RenderCamera)', cam.status === 2);
  stopAlarm();

  // --- laser cameras (room 111): fire under, damage, shadow, resume ---
  setRoom(111);
  __check('room 111 spawns its 2 ceiling laser cameras',
    cameras.length === 2 && cameras.every((c) => c.laser && c.dir === 1));
  const lc = cameras[0];
  lc.x = 0x60; lc.y = 0x18; lc.moving = true;
  snake.x = lc.x + 0x40; snake.y = 0x60;                      // out of range: patrols
  laserCameraTick(lc);
  __check('out of range: the laser camera patrols', lc.status === 0 && laserShots.length === 0);
  snake.x = lc.x + 2;                                          // passing underneath (|dx| <= 4)
  laserCameraTick(lc);
  __check('passing underneath: it stops and FIRES (LaserCamChkShot)',
    lc.status === 1 && laserShots.length === 1 && lc.laserWait === 0x20);
  const shot = laserShots[0];
  snake.x = lc.x; snake.y = lc.y + 24; snake.invulnTimer = 0; const life0 = snake.life;
  for (let i = 0; i < 4; i++) laserShotsTick();               // the beam grows 1 seg/iteration
  __check('the laser shot grows and DAMAGES Snake under it (0x10, ActorTouchDamage)',
    shot.segs > 0 && snake.life === life0 - 0x10, 'life '+life0+'->'+snake.life);
  // near (within 0x60) but not underneath: the camera keeps to ITS PATH (CameraChkContinue
  // moves toward DestinationX, NOT the player) — here the path point is to its LEFT while
  // Snake stands to its RIGHT.
  lc.laserWait = 0; lc.pt = 0;                                 // path point (0x18, 0x40): left
  snake.x = lc.x + 0x20; snake.y = lc.y + 0x40;
  const x0 = lc.x;
  laserCameraTick(lc);
  __check('near but not under: the camera patrols its PATH, not the player',
    lc.x === x0 - 1, 'x '+x0+'->'+lc.x);
  snake.x = lc.x;                                              // exactly underneath (same X)
  snake.y = lc.y - 8;                                          // but BEHIND the lens (no fire)
  const x1 = lc.x;
  laserCameraTick(lc);
  __check('the camera holds while the player is at its exact X', lc.x === x1);
  snake.x = lc.x + 0x70; snake.y = lc.y + 0x40;                // beyond 0x60: resume patrol
  lc.laserWait = 0;
  laserCameraTick(lc);
  __check('player far away: the camera resumes its patrol', lc.status === 0 && lc.moving === true);

  // --- the shot lifecycle: grows to max then shrinks away ---
  laserShots.length = 0; snake.x = 0; snake.y = 0;
  laserShots.push({ x: 10, y: 10, segs: 0, max: 11, phase: 0 });
  let g = 0;
  while (laserShots.length && g++ < 100) laserShotsTick();
  __check('a shot grows to 11 segments and shrinks away (~22 iterations)', g >= 20 && g <= 26, 'g='+g);
})();
`;

vm.createContext(sandbox);
vm.runInContext(src + '\n' + test, sandbox, { filename: 'game.js+test' });

let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) { pass++; console.log('  ok  ' + r.name); }
  else { fail++; console.log('FAIL  ' + r.name + (r.extra ? '  [' + r.extra + ']' : '')); }
}
console.log(`\nlasers.headless: ${pass}/${results.length} checks passed`);
if (fail) process.exit(1);
