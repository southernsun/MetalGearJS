// Headless verification for player-shots-hit-enemies (task 3.1). Loads the REAL web/game.js in a
// vm sandbox with mocked DOM, strips the trailing main(), and appends asserts in the same scope so
// they can read game.js's shot/guard state. Run: node web/shots.headless.mjs
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

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  function reset(){ alertMode=false; redAlertFlag=false; roomAlert=-1; gameState='play';
    currentRoom=0; assets.collision=C(); bullets.length=0; playerShots.length=0;
    snake.x=200; snake.y=150; snake.dir='left';
    guardsData = { '0': {x:120,y:100,dir:'left'} }; buildGuardRaw(0); }
  // A stationary probe shot: updatePlayerShots moves by (vx,vy)=0 then tests the guard box.
  const probe = (x,y) => playerShots.push({ x, y, vx:0, vy:0, range: 10 });

  // --- ROM constants (idxActorLife / BulletDamage / ImpactAreasInfo shape 0) ---
  __check('guard life 2 / bullet damage 2', GUARD_LIFE===2 && GUARD_BULLET_DAMAGE===2);
  __check('shape 0 box = (-16,16,0,8)', GUARD_SHAPE.offY===-16 && GUARD_SHAPE.distY===16
                                        && GUARD_SHAPE.offX===0 && GUARD_SHAPE.distX===8);

  // --- a hit in the impact box damages the guard and consumes the shot ---
  reset(); probe(120, 84);                      // dead centre: guard (120,100), box centre y-16
  updatePlayerShots();
  __check('hit: life 2 -> 0', guard.life===0, 'life='+guard.life);
  __check('hit: shot consumed (RemoveShot)', playerShots.length===0);
  __check('hit: guard still present until his logic tick', guard!==null);
  updateGuard();
  __check('kill on the next logic tick (RunEnemyLogic)', guard===null);

  // --- strict < boundaries (ChkEnemyHitByShot2/3) ---
  reset(); probe(128, 84); updatePlayerShots(); // |120-128| = 8 -> not < 8
  __check('X edge 8px is a miss (strict <)', guard.life===2 && playerShots.length===1);
  reset(); probe(127, 84); updatePlayerShots(); // 7 < 8
  __check('X 7px hits', guard.life===0);
  reset(); probe(120, 100); updatePlayerShots(); // |84-100| = 16 -> not < 16
  __check('Y edge 16px is a miss (strict <)', guard.life===2 && playerShots.length===1);
  reset(); probe(120, 99); updatePlayerShots(); // 15 < 16
  __check('Y 15px hits', guard.life===0);

  // --- a wall removes the shot before the guard test ---
  reset(); assets.collision.solid[(84>>3)*32 + (120>>3)] = 1; probe(120, 84);
  updatePlayerShots();
  __check('wall stops the shot; guard unhurt', guard.life===2 && playerShots.length===0);

  // --- a railing tile does NOT remove the shot, so it can still hit (BulletLogic + ChkPlayerShots) ---
  reset(); const ti=(84>>3)*32 + (120>>3);
  assets.collision.solid[ti]=1; assets.collision.tiles[ti]=0x6B; probe(120, 84);
  updatePlayerShots();
  __check('railing passes the shot through to the hit', guard.life===0 && playerShots.length===0);

  // --- death is deferred while stunned (EnemiesLogic skips RunEnemyLogic) ---
  reset(); guard.stunnedCnt=5; probe(120, 84); updatePlayerShots();
  __check('stunned guard takes the damage', guard.life===0);
  for (let i=0;i<5;i++) updateGuard();           // counts the stun down 5 -> 0, no kill yet
  __check('still present while the stun runs', guard!==null, 'stun='+(guard&&guard.stunnedCnt));
  updateGuard();                                 // first non-stunned tick
  __check('dies as the stun expires', guard===null);

  // --- in-flight guard bullets survive a kill (shot and punch) ---
  reset(); bullets.push({x:50,y:50,vx:1,vy:0}); probe(120, 84);
  updatePlayerShots(); updateGuard();
  __check('shot kill keeps in-flight bullets', guard===null && bullets.length===1);
  reset(); bullets.push({x:50,y:50,vx:1,vy:0});
  snake.x=132; snake.y=100; snake.dir='left';    // guard inside PunchLeftDat area
  guard.punchesCnt=2; tryPunchGuard();           // 3rd punch kills (ChkKillPunching)
  __check('punch kill keeps in-flight bullets', guard===null && bullets.length===1);

  // --- shooting the alert-room guard ends the alarm via the lifecycle ---
  reset(); raiseAlarm(0); probe(120, 84);
  updatePlayerShots(); updateGuard(); chkAlarmEnd();
  __check('alarm ends when the alert-room guard is shot', guard===null && alertMode===false);

  // ==== The full arsenal (ChkWeaponShot + logic/weapon/*) ====================================
  const arm = (id, n) => { weapons.set(id, n); selectedWeapon = id; };

  // --- SMG (ChkSMGShot): hold-autofire every 2 ticks, the 8-step fan, ammo per bullet ---
  reset(); arm(SUB_MACHINE_GUN, 20); smgTimer = 0; smgBurst = 0;
  held.add('fire');
  for (let i = 0; i < 8; i++) chkWeaponShot();
  __check('SMG: 8 held ticks fire 4 bullets (every 2)', playerShots.length === 4 && weapons.get(SUB_MACHINE_GUN) === 16,
    'shots='+playerShots.length);
  __check('SMG: the burst fans (different drift per bullet)',
    new Set(playerShots.map((s) => s.vy)).size > 1, JSON.stringify(playerShots.map((s)=>s.vy)));
  held.delete('fire');
  chkWeaponShot();
  __check('SMG: releasing fire resets the burst counters', smgTimer === 0 && smgBurst === 0);

  // --- grenade (MoveGrenade): the parabola rides ABOVE the real Y, flies over walls, explodes ---
  reset(); arm(GRENADE_LAUNCHER, 2);
  const wallTi = (134>>3)*32 + (170>>3);
  assets.collision.solid[wallTi] = 1;                  // a wall in the flight path
  fireQueued = true; chkWeaponShot();
  __check('grenade: fired (1 of max 2)', playerShots.length === 1 && playerShots[0].type === GRENADE_LAUNCHER);
  const g = playerShots[0];
  for (let i = 0; i < 10; i++) updatePlayerShots();
  __check('grenade: still flying mid-arc, drawn above its real Y (the parabola)',
    playerShots[0] === g && g.y < g.yAlt, 'y='+g.y+' yAlt='+g.yAlt);
  for (let i = 0; i < 20 && g.status !== 2; i++) updatePlayerShots();
  __check('grenade: explodes after its 0x18 timer despite the wall (no tile collision)',
    g.status === 2 && g.medium === false);
  // the 1-frame blast window: a guard inside the +-20 box at the explode transition
  reset(); arm(GRENADE_LAUNCHER, 2); snake.x = 185; snake.y = 100; snake.dir = 'left';
  fireQueued = true; chkWeaponShot();
  let gg = playerShots[0], guard0 = guard.life;
  while (gg.status !== 2) updatePlayerShots();         // flies 72px left -> blasts at ~113, near the guard (120,100)
  __check('grenade: the blast window damages a guard within the explosion shape (5)',
    guard.life === Math.max(0, guard0 - 5), 'life='+guard.life+' x='+gg.x);

  // #30: ChkHitEnemies loops ALL enemies -> the blast damages EVERY guard in the +-20 box, not just one
  reset(); guards.push(makeGuard({ x: 108, y: 100, dir: 'left' }));   // 2nd guard beside guard0 (120,100)
  arm(GRENADE_LAUNCHER, 2); snake.x = 185; snake.y = 100; snake.dir = 'left';
  fireQueued = true; chkWeaponShot();
  let gAoE = playerShots[0];
  while (gAoE.status !== 2) updatePlayerShots();        // blasts at ~113 -> both guards within +-20
  __check('grenade: blast damages ALL guards in range, not just the first (AoE, #30)',
    guards.length === 2 && guards[0].life === 0 && guards[1].life === 0,
    'lives=' + guards.map(g => g.life).join(','));

  // --- rocket (RocketMove): contact kill 0x0A, wall -> medium explosion, one at a time ---
  reset(); arm(ROCKET_LAUNCHER, 3); snake.y = 110;     // rocket Y 94: inside the guard's shape-0 box
  fireQueued = true; chkWeaponShot();
  __check('rocket: fired', playerShots.length === 1 && playerShots[0].type === ROCKET_LAUNCHER);
  fireQueued = true; chkWeaponShot();
  __check('rocket: only one at a time', playerShots.length === 1);
  while (playerShots[0] && playerShots[0].status !== 2 && guard.life > 0) updatePlayerShots();
  __check('rocket: hits the guard for 0x0A and explodes (medium)',
    guard.life === 0 && playerShots[0] && playerShots[0].status === 2 && playerShots[0].medium === true);

  // --- plastic bomb (PBombTimer): placed ahead, fused, opens lock-16 walls ---
  reset(); arm(PLASTIC_BOMB, 2); snake.dir = 'left';
  // a synthetic lock-16 wall whose open zone covers the bomb spot (ChkBombLocation)
  doorTypes['7'] = { openOffY: -8, openNY: 32, openOffX: -16, openNX: 32, enterOffY: 0, enterNY: 8, enterOffX: 0, enterNX: 8 };
  activeDoors = [{ id: 9, type: 7, lock: 16, x: snake.x - 12, y: snake.y, dest: 60,
                   open: false, opening: false, rect: {x: snake.x - 20, y: snake.y, w: 16, h: 16} }];
  fireQueued = true; chkWeaponShot();
  const bomb = playerShots[0];
  __check('bomb: placed one step ahead (X-12)', bomb && bomb.type === PLASTIC_BOMB && bomb.x === snake.x - 12);
  __check('bomb: consumable ammo decremented', weapons.get(PLASTIC_BOMB) === 1);
  fireQueued = true; chkWeaponShot();
  __check('bomb: only one set at a time', playerShots.length === 1);
  for (let i = 0; i < 0x30 * 2 && bomb.status !== 2; i++) updatePlayerShots();
  __check('bomb: the fuse runs out and it explodes (medium)', bomb.status === 2 && bomb.medium === true);
  __check('bomb: the exploding bomb OPENS the lock-16 wall (ChkBasementWall)', activeDoors[0].open === true);
  __check('bomb: punching a lock-16 wall does nothing (no life counter)',
    (snake.controlMod = CONTROL_PUNCH, snake.dir = 'left', chkPunchOpenDoors(),
     snake.controlMod = CONTROL_NORMAL, true));

  // --- land mine (MineDummy): armed at the spot, trips on enemy contact ---
  reset(); arm(LAND_MINE, 3); snake.x = 130; snake.y = 110;
  fireQueued = true; chkWeaponShot();
  const mine = playerShots[0];
  __check('mine: armed at Snake\\'s spot', mine && mine.type === LAND_MINE && mine.x === 130 && mine.y === 110);
  updatePlayerShots();                                  // guard (120,100) within the +-20 blast shape
  __check('mine: the guard trips it — damage 5 + the small explosion',
    guard.life === 0 && mine.status === 2 && mine.medium === false, 'life='+guard.life);

  // --- remote missile (ControlMissile): Snake freezes, the keys steer it ---
  reset(); arm(MISSILE, 2); snake.dir = 'right'; snake.x = 60; snake.y = 150;
  fireQueued = true; chkWeaponShot();
  const mis = playerShots[0];
  __check('missile: fired facing right', mis && mis.type === MISSILE && mis.vx === 4 && mis.vy === 0);
  const sx = snake.x;
  held.add('dir:up'); pushRecency('up');
  normalControl();
  __check('missile: Snake is FROZEN while it flies (NormalCtrl shot-7 gate)', snake.x === sx && snake.state === 'idle');
  __check('missile: the direction key STEERED it instead (up)', mis.vy === -4 && mis.vx === 0 && mis.dir === 'up');
  held.delete('dir:up');
  while (playerShots[0] && playerShots[0].status !== 2) updatePlayerShots();   // exits top -> wall? boundary removes it
  normalControl();
  __check('missile: gone -> Snake moves again', playerShots.length === 0 || playerShots[0].status === 2);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
