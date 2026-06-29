// Headless verification for the dogs wing: DogLogic (sleep/listen/charge + the bark and
// the axis flip), Coward Duck (the intro text 139, the sidestep-throw-return loop, the
// elliptical boomerang, the CARD8 drop and gating), and the shooter ambush rooms.
// Run: node web/dogs.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const recCtx = new Proxy({ fillStyle: 0, strokeStyle: 0, lineWidth: 1 }, {
  get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true),
});
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__actors = fs.readFileSync(path.join(dir, 'assets', 'actors.json'), 'utf8');
sandbox.__texts = fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8');

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  actorsData = JSON.parse(__actors); textsData = JSON.parse(__texts);
  gameState='play'; assets.collision=C();
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== Dogs (room 207) ====
  currentRoom=207; buildDogs(207);
  __check('room 207 kennels its TWO dogs, asleep', dogs.length===2 && dogs.every(d=>d.status===0));
  const d0=dogs[0]; d0.wait=1;
  iter2(dogTick, 1);
  __check('waking into the LISTEN pose', d0.status===1);
  d0.wait=1; Math.random; // listen -> 50/50; force the run by retrying
  let runs=0; for (let t=0;t<20 && d0.status!==2;t++) { d0.wait=1; iter2(dogTick, 1); }
  __check('the listen ends into sleep or the CHARGE (eventually charging)', d0.status===2);
  __check('the charge is single-axis at 3px/iteration',
    (Math.abs(d0.vx)===3) !== (Math.abs(d0.vy)===3));
  snake.x=Math.round(d0.x); snake.y=Math.round(d0.y); snake.life=24; snake.invulnTimer=0;
  alertMode=false; guardsData={}; guards.length=0; guard=null;
  iter2(dogTick, 1);
  __check('the bite: 2 damage + the alarm', snake.life===22 && alertMode===true);
  d0.life=0; iter2(dogTick, 1);
  __check('a shot dog leaves on its tick', dogs.length===1);

  // ==== Coward Duck (room 193) ====
  stopAlarm(); gameState='play';
  card8Taken=false; duckSpeechDone=false;
  currentRoom=193; roomItems=[null,null,null]; buildDuck(193);
  __check('Coward Duck guards room 193 (life 0x14, boss music)', duck!==null && duck.life===0x14);
  iter2(duckTick, 3);
  __check('the intro speech (text 139, unskippable, once)',
    gameState==='text' && textBox && textBox.id===139 && textBox.mode===2);
  textBox=null; gameState='play';
  // #42: Coward Duck body contact = ActorTouchDamage[ID_COWARD_DUCK] = 4 (InitCowardDuck COLLISION_CFG=3)
  snake.life=24; snake.invulnTimer=0; snake.x=duck.x; snake.y=duck.y;
  iter2(duckTick, 2);                             // 2 raw ticks = 1 effective (preserves tickCounter parity)
  __check('Coward Duck body contact damages Snake (4, #42)', snake.life===20, 'life='+snake.life);
  snake.invulnTimer=0;
  duck.status=1; duck.timer=1; snake.x=duck.x+60;
  iter2(duckTick, 1);
  __check('he sidesteps TOWARD the player (2px)', duck.status===2 && duck.vx===2,
    'st='+duck.status+' vx='+duck.vx);
  iter2(duckTick, 8);
  __check('after 8 iterations he stops and THROWS the boomerang',
    duck.status===3 && boomerangs.length===1);
  const b=boomerangs[0]; const bx0=b.x;
  iter2(boomerangTick, 8);
  __check('the boomerang arcs (elliptical movement)', b.x!==bx0 || b.y!==b.sy);
  // the full-range sweep dives cos(angY)/2 = up to 127px below the throw point
  b.short=false;
  iter2(boomerangTick, 24);                       // 32 total: angY 64 -> 0 (cos max)
  __check('the full-range arc reaches ~127px deep (GetSinCos /2)', b.y - b.sy > 120,
    'depth='+(b.y-b.sy));
  let guard_=0; while (boomerangs.length && guard_++<300) iter2(boomerangTick, 1);
  __check('the boomerang returns and vanishes', boomerangs.length===0);
  duck.life=0; iter2(duckTick, 1);
  __check('his death drops CARD8 at (0x38,0x70)',
    duck===null && roomItems[0] && roomItems[0].id===0x1D && roomItems[0].x===0x38);
  card8Taken=true; buildDuck(193);
  __check('with CARD8 taken he never reappears (InitCowardDuck gate)', duck===null);

  // ==== Basement dogs (dogbasement.asm; rooms 58-63): free-roaming sleep -> run -> chase ====
  stopAlarm(); guardsData={}; rooms.set(58, { img:null, collision:C() });
  snake.x=200; snake.y=200;                               // far away
  setRoom(58);
  const sleeper = dogs.find(d=>d.basement && d.status===0);
  __check('basement room: a placed dog lies ASLEEP (status 0)', !!sleeper);
  __check('basement room also has a SPAWNED dog already running (status 1)', dogs.some(d=>d.basement && d.status===1));
  sleeper.wait=1; basementDogMove(sleeper);
  __check('the sleeper wakes and runs toward the player in Y (status 1)', sleeper.status===1 && (sleeper.dir===1||sleeper.dir===2));
  const rx=sleeper.x, ry=sleeper.y; basementDogMove(sleeper);
  __check('a running basement dog roams (moves)', sleeper.x!==rx || sleeper.y!==ry);
  sleeper.x=snake.x; sleeper.y=snake.y-0x10; sleeper.dir=1; basementDogMove(sleeper);
  __check('a basement dog near the player starts chasing (status 2)', sleeper.status===2);
  sleeper.wait=1; sleeper.dir=1; basementDogMove(sleeper);
  __check('chase re-arms the bark timer (0x18) on its axis', sleeper.wait===0x18);

  // ==== Ambush shooters (shooter.asm; rooms 88/90/91 alarm, 206 does not) ====
  card8Taken=false; stopAlarm(); alertRespawnTimer=0; numRespawnGuards=0; guardsData={};
  rooms.set(206, { img:null, collision:C() }); rooms.set(88, { img:null, collision:C() });
  manifest={start:206}; snake.x=10; snake.y=10;          // far away (no transform)
  setRoom(206);
  __check('room 206: shooters spawn WITHOUT the alarm (InitShooterElev)',
    alertMode===false && guards.length===2 && guards.every(g=>g.shooter && g.shStat===0), 'n='+guards.length);
  stopAlarm(); setRoom(88);
  __check('rooms 88/90/91: the shooters force the alarm (timer 0x80, budget 0x0A)',
    alertMode===true && alertRespawnTimer===0x80 && numRespawnGuards===0x0A && guards.every(g=>g.shooter));
  // the FSM: wait -> strafe -> stop and fire a VERTICAL bullet -> return to start
  const shg=guards[0]; shg.shStat=0; shg.shWait=1; shg.shTransform=3; snake.x=shg.x; snake.y=shg.y+0x40; tickCounter=0;
  iter2(()=>shooterLogic(shg),1);
  __check('ShooterWait -> Walk (picks a strafe direction)', shg.shStat===1 && (shg.shWalkDir==='left'||shg.shWalkDir==='right'));
  const sx0=shg.x; shg.shWait=1; iter2(()=>shooterLogic(shg),1);
  __check('ShooterWalk strafes, then stops facing up/down', shg.x!==sx0 && shg.shStat===2 && (shg.dir==='up'||shg.dir==='down'));
  shg.shWait=4; shg.shShotCnt=0; bullets.length=0; iter2(()=>shooterLogic(shg),1);
  __check('ShooterShot fires a VERTICAL bullet', bullets.length>0 && Math.abs(bullets[0].vy)===2.5 && Math.abs(bullets[0].vx)<=0.125);
  // the player closing in vertically transforms the shooter into a chaser
  shg.shStat=0; shg.state='patrol'; snake.x=shg.x; snake.y=shg.y; tickCounter=0; iter2(()=>shooterLogic(shg),1);
  __check('a shooter transforms into an alert chaser when the player closes in', shg.state==='alert');
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\ndogs.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
