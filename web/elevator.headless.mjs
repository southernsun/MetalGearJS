// Headless verification for the elevators (SetElevatorPosY/SetElevatorCtrl, ChkCtrlElevator,
// ElevatorRoomLogic — see docs/rom-data-formats.md "Elevators"). Loads the REAL web/game.js +
// the real exported doors/elevatorrooms/collision data and rides the cluster elevator:
// room 3 -> type-5 door -> elevator room 240 (cabin parked at the bottom) -> ride up with the
// middle-floor stop -> exit right through the type-6 door into room 31 -> and back. Express
// skips and shaft chaining are unit-tested on synthetic rooms. Run: node web/elevator.headless.mjs
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
    rec[m] = (...a) => calls.push({ m, a });
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
sandbox.__doors = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'doors.json'), 'utf8'));
sandbox.__dtypes = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'door-types.json'), 'utf8'));
sandbox.__elev = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'elevatorrooms.json'), 'utf8'));
for (const r of [3, 240, 31])
  sandbox['__coll' + r] = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', r + '.collision.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });
sandbox.__calls = calls;

const test = `
;(function(){
  doorsData = __doors; doorTypes = __dtypes; doorGfx = {}; elevatorsData = __elev;
  rooms.set(3, { img: null, collision: __coll3 });
  rooms.set(240, { img: null, collision: __coll240 });
  rooms.set(31, { img: null, collision: __coll31 });
  gameState = 'play';
  const tick = (n) => { for (let i = 0; i < (n || 1); i++) update(); };

  // --- the elevator doors (ChkElevatorDoor: type 5 opens UP, type 6 opens RIGHT) ---
  assets.collision = __coll3; currentRoom = 3; buildDoors(3);
  const d5 = activeDoors.find((d) => d.id === 2);
  __check('room 3 has its type-5 elevator door (dest 240)', d5 && d5.type === 5 && d5.lock === 1 && d5.dest === 240);
  snake.anim = ANIM_NORMAL; snake.dir = 'down';
  __check('type-5 door stays locked unless pushing UP', !canOpenDoor(d5));
  snake.dir = 'up';
  __check('pushing UP opens the type-5 door', canOpenDoor(d5));

  // --- entry (SetElevatorPosY + SetElevatorCtrl): park at the entry floor ---
  enterDoor(d5);
  __check('entering parks Snake at (0xD8, 0xB4) facing left in control mode 2',
    currentRoom === 240 && snake.x === 0xD8 && snake.y === 0xB4 && snake.dir === 'left'
      && snake.controlMod === CONTROL_ELEVATOR,
    'x='+snake.x+' y='+snake.y+' mode='+snake.controlMod);
  __check('the cabin parks at the bottom floor (0x70, 0xB8); limits 0x38/0xB8',
    elevatorX === 0x70 && elevatorY === 0xB8 && elevatorLimitUp === 0x38 && elevatorLimitDown === 0xB8,
    'elevY='+elevatorY);

  // --- elevator-room walk: left clamp at X 104 (ChkLimitXElevator) ---
  held.clear(); held.add('dir:left'); pushRecency('left');
  tick(200);
  __check('walking left stops at X 104', snake.x === 104 && gameState === 'play', 'x='+snake.x);

  // --- ride start gating (ChkCtrlElevator) ---
  held.clear(); held.add('dir:up'); pushRecency('up');
  snake.x = 0x80;                                    // outside the cabin (X >= 0x78)
  tick(4);
  __check('holding up OUTSIDE the cabin does nothing', gameState === 'play');
  snake.x = 0x70;                                    // inside the cabin
  tick(1);
  __check('holding up INSIDE the cabin starts the ride', gameState === 'elevator' && elevatorDir === 1);

  // --- the ride: 1px per iteration, stop at the middle floor 0x78 ---
  const startY = snake.y;
  let guard_ = 0;
  while (gameState === 'elevator' && guard_++ < 400) tick(1);
  __check('first stop at the middle floor (Y 0x78), Snake carried along',
    elevatorY === 0x78 && snake.y === startY - 64 && gameState === 'play',
    'elevY='+elevatorY+' y='+snake.y+' steps='+guard_);
  __check('the stop takes a held left/right as the new facing — none held: unchanged',
    snake.dir === 'left');

  // --- ride again to the top; the up limit refuses further rides ---
  tick(1);                                           // still holding up: ride restarts
  __check('ride restarts toward the top', gameState === 'elevator');
  guard_ = 0;
  while (gameState === 'elevator' && guard_++ < 400) tick(1);
  __check('top floor reached (Y 0x38)', elevatorY === 0x38 && gameState === 'play', 'elevY='+elevatorY);
  tick(4);
  __check('holding up at the up limit starts nothing', gameState === 'play');

  // --- exit right through the type-6 door into room 31 ---
  const d6top = activeDoors.find((d) => d.id === 34);
  __check('type-6 enter zone is the ROM DoorOpenEnterDat row (X+8..X+24), not the touch zone',
    d6top.enterRect.x === 224 + 8 && d6top.enterRect.w === 16, JSON.stringify(d6top.enterRect));
  assets.doorBuf = 'SFX19'; assets.elevatorDoorBuf = 'SFX1B';
  const sfx = [];
  playBuf = (b) => sfx.push(b);
  held.clear(); held.add('dir:right'); pushRecency('right');
  guard_ = 0;
  while (currentRoom === 240 && guard_++ < 600) tick(1);
  __check('the floor exit plays the ELEVATOR door SFX 0x1B (DoorOpenSfxs), not the door SFX',
    sfx.includes('SFX1B') && !sfx.includes('SFX19'), sfx.join(','));
  __check('walking right exits through the top type-6 door into room 31',
    currentRoom === 31 && guard_ < 600, 'room='+currentRoom+' steps='+guard_);
  __check('arrival via SetPlayerInDoor (type-5 offsets): (112,40) facing down, control mode 0',
    snake.x === 112 && snake.y === 40 && snake.dir === 'down' && snake.controlMod === CONTROL_NORMAL,
    'x='+snake.x+' y='+snake.y);

  // --- the return trip: room 31's door enters the elevator at the TOP floor ---
  held.clear();
  const d31 = activeDoors.find((d) => d.id === 34);
  enterDoor(d31);
  __check('room 31 enters elevator 240 at the top floor (player 0x34, cabin 0x38)',
    currentRoom === 240 && snake.y === 0x34 && elevatorY === 0x38, 'y='+snake.y+' elevY='+elevatorY);
  held.add('dir:down'); pushRecency('down');
  snake.x = 0x70;
  guard_ = 0;
  tick(1);
  while (gameState === 'elevator' && guard_++ < 400) tick(1);
  __check('riding down skips nothing in room 240: stop at 0x78', elevatorY === 0x78, 'elevY='+elevatorY);
  held.clear();

  // --- express shafts (unit-level): held direction skips the floor stops ---
  gameState = 'elevator'; currentRoom = 248; elevatorDir = 1; elevatorStatus = 0;
  elevatorY = 0x80; snake.y = 0x7C;
  held.add('dir:up'); pushRecency('up');
  tick(2 * (0x80 - 0x38) + 8);                       // enough iterations to pass Y 0x38
  __check('express room 248: holding up skips the 0x38 stop', gameState === 'elevator' && elevatorY < 0x38,
    'elevY='+elevatorY);
  held.clear();

  // #99: room 250 going DOWN skips the intermediate stops only while UP is held (ElevatorDown3 rra = Up bit)
  gameState = 'elevator'; currentRoom = 250; elevatorDir = 2; elevatorStatus = 0;
  elevatorY = 0x40; snake.y = 0x3C; held.add('dir:up'); pushRecency('up');
  tick(2 * (0x78 - 0x40) + 8);                       // enough iterations to pass Y 0x78
  __check('#99 room 250 down + holding UP skips the 0x78 stop', gameState === 'elevator' && elevatorY > 0x78,
    'elevY='+elevatorY);
  held.clear();
  gameState = 'elevator'; currentRoom = 250; elevatorDir = 2; elevatorStatus = 0;
  elevatorY = 0x40; snake.y = 0x3C; held.add('dir:down'); pushRecency('down');
  guard_ = 0; while (gameState === 'elevator' && guard_++ < 400) tick(1);
  __check('#99 room 250 down + holding DOWN stops at 0x78', elevatorY === 0x78, 'elevY='+elevatorY);
  held.clear();

  // --- shaft exit chaining (unit-level): Y < 24 cuts to the connected elevator room ---
  connections['248'] = { up: 240, down: null, left: null, right: null };
  gameState = 'elevator'; currentRoom = 248; elevatorDir = 1; elevatorStatus = 0;
  elevatorY = 25; snake.y = 21;
  tick(6);                                           // 25->24, 24->23 (status 2), the exit
  __check('leaving the shaft up enters room 240 parked at the bottom (0xD0), still riding',
    currentRoom === 240 && elevatorY === 0xD0 && snake.y === 0xD0 - 4 && gameState === 'elevator',
    'room='+currentRoom+' elevY='+elevatorY);
  gameState = 'play'; elevatorStatus = 1;

  // --- an unexported shaft neighbour stops in place instead of cutting to nothing ---
  delete connections['240'];
  gameState = 'elevator'; currentRoom = 240; elevatorDir = 1; elevatorStatus = 2;
  tick(4);                                           // the exit attempt, then the stop
  __check('missing shaft neighbour: the ride stops in place', currentRoom === 240 && gameState !== 'elevator');
  gameState = 'play';

  // --- elevator-guard relieve ceremony (guardelevator.asm / elevatorguardspawner.asm) ---
  const iterElev = (n) => { for (let i=0;i<(n||1);i++){ tickCounter=(tickCounter+1)&0xff; elevReliefTick(); tickCounter=(tickCounter+1)&0xff; elevReliefTick(); } };
  setText = () => {};                                  // the "Relieve" text print is a no-op here
  currentRoom=3; previousRoom=0; alertMode=false; guards.length=0; guard=null; snake.y=0xC0; snake.x=0x80;
  buildElevRelief(3);
  __check('two guards are posted at X 0x50 / 0x90 (not arriving via the elevator)',
    elevGuards.length===2 && elevGuards[0].x===0x50 && elevGuards[1].x===0x90
      && elevGuards[0].status===ELEV_IDLE && elevGuards[0].dir==='down', 'n='+elevGuards.length);

  previousRoom=240; buildElevRelief(3);               // InitGuardElevat: PreviousRoom == elevator
  __check('arriving via the elevator dismisses the posts and shortens the spawn loop',
    elevGuards.length===0 && elevSpawner.loops===5);

  // SpawnGuardElev marches a fresh guard in from the right (X 0xF2), walking to its post.
  elevSpawner.wait=1; elevSpawner.loops=1; tickCounter=0; iterElev(1);
  __check('the spawner marches a relieve guard in from the right (0xF2 -> post 0x50)',
    elevGuards.length===1 && elevGuards[0].x===0xF2 && elevGuards[0].status===ELEV_WALK && elevGuards[0].destX===0x50);
  const rg=elevGuards[0]; const rx0=rg.x; iterElev(3);
  __check('the relieve guard walks left toward its post (SetWalkSpeed 1px)', rg.x === rx0-3);
  rg.wait=1; iterElev(1);                             // GuardElevatorWalk spawns the second at Wait==0
  __check('the first relieve guard spawns the second (destination 0x90)',
    elevGuards.length===2 && elevGuards[1].destX===0x90 && rg.spawnedSecond===true);

  // GuardElevIdle -> Leave: when the post timer runs out the guard walks off to the right.
  previousRoom=0; buildElevRelief(3); alertMode=false; tickCounter=0;
  const post=elevGuards[0]; post.wait=1;             // about to expire
  iterElev(1);
  __check('a posted guard whose timer expires starts leaving to the right', post.status===ELEV_LEAVE && post.dir==='right');

  // GuardElevSetAlert: the player in the corridor (PlayerY < 0x3D) sounds the alarm; the first
  // guard becomes a chasing alert guard, the second flees right.
  previousRoom=0; buildElevRelief(3); alertMode=false; guards.length=0; guard=null;
  snake.x=0x60; snake.y=0x20; tickCounter=0;
  iterElev(1);
  __check('a player in the corridor sounds the alarm and turns guard 1 into a chaser',
    alertMode===true && guards.length===1 && guards[0].state==='alert');
  __check('the second elevator guard flees to the right', elevGuards.length===1 && elevGuards[0].status===ELEV_FLEE);
  const fleer=elevGuards[0]; const fx0=fleer.x; iterElev(1);
  __check('the fleeing guard sprints right at speed 4', fleer.x === fx0+4);
  alertMode=false; redAlertFlag=false; roomAlert=-1; guards.length=0; guard=null; elevGuards.length=0; currentRoom=240;

  // --- the cabin draws anchored at (ElevatorX-16, ElevatorY-48) in elevator rooms ---
  elevatorImg = { __cab: true }; elevatorMeta = { width: 32, height: 64, anchorX: 16, anchorY: 48 };
  currentRoom = 240; elevatorX = 0x70; elevatorY = 0xB8;
  __calls.length = 0; drawElevator();
  __check('cabin image drawn at the SprElevatorDat origin', __calls.some((c) => c.m === 'drawImage'
    && c.a[0] && c.a[0].__cab && c.a[1] === 0x70 - 16 && c.a[2] === 0xB8 - 48));
  currentRoom = 3; __calls.length = 0; drawElevator();
  __check('no cabin outside elevator rooms', __calls.length === 0);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
