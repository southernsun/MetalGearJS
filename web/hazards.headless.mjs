// Headless verification for the hazards + reinforcements batch (user-reported during the
// expansion run): gas-cloud ambience (GasLogic), rolling barrels (RollingBarrelLogic),
// the electric floor + power switch (ChkElectricFloor/powerswitch.asm), the camera touch
// (the near-wall detection + zap), the silencer-guard suppressor drop (DismissActor8),
// alert-spawned guard variants, and the reinforcement spawner (ChkRespawnEnemy).
// Run: node web/hazards.headless.mjs
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
sandbox.__respawn = fs.readFileSync(path.join(dir, 'assets', 'respawn.json'), 'utf8');

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  actorsData = JSON.parse(__actors); respawnData = JSON.parse(__respawn);
  gameState='play'; assets.collision=C();
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== Gas clouds (GasLogic) ====
  currentRoom=112; buildGasClouds(112);
  __check('room 112 places its 3 gas-cloud spots', gasClouds.length===3 && gasClouds.every(g=>!g.visible));
  const g0=gasClouds[0]; g0.timer=2;
  iter2(gasCloudTick, 2);
  __check('a cloud appears after its random delay (0x20 visible)', g0.visible===true && g0.timer===0x20);
  iter2(gasCloudTick, 0x20);
  __check('the cloud hides again with a fresh random delay', g0.visible===false && g0.timer>0);

  // ==== Rolling barrels (RollingBarrelLogic) ====
  currentRoom=153; snake.x=40; snake.y=10; buildBarrels(153);
  __check('room 153 places its barrel rolling AWAY from the player', barrels.length===1 && barrels[0].vx===0.5);
  const b0=barrels[0]; b0.x=198; b0.vx=2;
  iter2(barrelTick, 2);                                // move past 200, then the bounce check
  __check('the right wall bounces it (X clamps, speed flips left)', b0.vx<0 && b0.x<200, 'x='+b0.x+' v='+b0.vx);
  const sp = Math.abs(b0.vx);
  iter2(barrelTick, 4);
  __check('it accelerates every iteration (RB_IncrementSpeed)', Math.abs(b0.vx) > sp, 'v='+b0.vx);
  snake.life=24; snake.invulnTimer=0; snake.x=Math.round(b0.x); snake.y=b0.y;
  iter2(barrelTick, 1);
  __check('the crush takes ALL life (damage 0xFF)', snake.life===0 || gameState==='dead');

  // ==== Electric floor + power switch ====
  gameState='play'; snake.life=24; snake.invulnTimer=0;
  currentRoom=37; buildPowerSwitch(37);
  __check('room 37 arms its power switch (the floor is LIVE)', powerSwitch!==null && powerSwitchOn===true);
  assets.collision=C();
  const ti=( (100>>3)*32 + (100>>3) );
  assets.collision.tiles[ti]=0x60;                     // an electric tile under (100,100)
  snake.x=100; snake.y=100;
  chkElectricFloor();
  __check('standing on a live tile zaps 2 life + the 8-frame delay', snake.life===22 && snake.invulnTimer===8);
  chkElectricFloor();
  __check('the delay gates a second zap', snake.life===22);
  // shooting the switch kills the floor — but ONLY the remote missile damages it (weapondamage.asm
  // row for ID_POWER_SWITCH is 0xFF for every weapon except the missile; issue #26).
  powerSwitch.x=60; powerSwitch.y=60;
  playerShots.push({ x:60, y:60, vx:0, vy:0, range:5, type: HAND_GUN });   // a normal shot does nothing
  updatePlayerShots(); powerSwitchTick();
  __check('a non-missile shot leaves the switch (and floor) LIVE', powerSwitch!==null && powerSwitchOn===true);
  playerShots.length=0;
  playerShots.push({ x:60, y:60, vx:0, vy:0, range:5, type: MISSILE });    // the remote missile blows the fuse
  updatePlayerShots();
  powerSwitchTick();
  __check('shooting the switch turns the floor OFF', powerSwitch===null && powerSwitchOn===false);
  snake.invulnTimer=0; chkElectricFloor();
  __check('the dead floor no longer zaps', snake.life===22);

  // ==== Room-116 "Metal Gear floor switch": the electrified floor before Metal Gear (tiles 0x40/0x41) ====
  gameState='play'; snake.life=24; snake.invulnTimer=0;
  currentRoom=116; buildPowerSwitch(116);
  __check('room 116 arms its power switch from actors.json (the Metal Gear floor is LIVE)',
    powerSwitch!==null && powerSwitchOn===true && powerSwitch.x===0x20 && powerSwitch.y===0x10);
  assets.collision=C();
  assets.collision.tiles[(100>>3)*32 + (100>>3)]=0x40;   // a room-116 electrified tile under (100,100)
  snake.x=100; snake.y=100; chkElectricFloor();
  __check('the floor before Metal Gear zaps on the 0x40/0x41 tiles', snake.life===22 && snake.invulnTimer===8);
  playerShots.push({ x:0x20, y:0x10, vx:0, vy:0, range:5, type: MISSILE });   // shoot the switch (missile, #26)
  updatePlayerShots(); powerSwitchTick();
  __check('shooting the Metal Gear floor switch kills the floor (clears the path)',
    powerSwitch===null && powerSwitchOn===false);

  // ==== Camera touch (the near-wall detection) ====
  currentRoom=31; alertMode=false; redAlertFlag=false; alertRespawnTimer=0;
  cameras=[{x:100,y:50,dir:1,laser:false,path:[{x:100,y:50}],idx:0,pt:0,moving:false,wait:99,status:0,flashCnt:0,laserWait:0,koLatch:false}];
  snake.x=104; snake.y=54; snake.life=24; snake.invulnTimer=0;
  guardsData={}; buildGuardRaw(31); actorsData=null; buildGuardRaw(31); actorsData=JSON.parse(__actors);
  cameraTick();
  __check('touching the camera body zaps 0x10 and raises the RED alert',
    snake.life===24-0x10 && alertMode===true && redAlertFlag===true && cameras[0].status===1);
  __check('the camera sighting arms the reinforcements (0x28)', alertRespawnTimer===0x28);

  // ==== Reinforcements (ChkRespawnEnemy) ====
  guards.length=0; guard=null; currentRoom=0; alertMode=true; alertRespawnTimer=2;
  tickCounter=0;
  iter2(respawnTick, 2);
  __check('an alerted reinforcement spawns at a RespawnInfo spot',
    guards.length===1 && guards[0].state==='alert', 'n='+guards.length);
  __check('the next respawn timer re-arms (0x14 + rnd)', alertRespawnTimer>=0x14);
  alertRespawnTimer=2; currentRoom=200;
  iter2(respawnTick, 4);
  __check('no respawning from room 188 on', guards.length===1);
  stopAlarm();
  __check('the alarm end disarms the spawner', alertRespawnTimer===0);

  // ==== Guard variants + the silencer drop ====
  alertMode=false; currentRoom=150; guardsData={}; buildGuard(150);
  __check('room 150 spawns its FOUR silencer guards', guards.length===4 && guards.every(g=>g.silencer));
  currentRoom=154; buildGuard(154);
  __check('room 154 spawns its guard ALREADY chasing (ID_GUARD_ALERT)',
    guards.length===1 && guards[0].state==='alert');
  currentRoom=150; buildGuard(150); buildRoomItems && (roomItems=[null,null,null]);
  const four=[...guards];
  for (const g of four) killGuard(g);
  __check('the LAST silencer kill drops the SUPPRESSOR at (0x62,0x24)',
    roomItems[0] && roomItems[0].id===8 && roomItems[0].x===0x62 && roomItems[0].y===0x24);

  // ==== Suppressor-guard AI (GuardSilencerLogic): move-then-cross-fire + chase-when-near ====
  alertMode=false; redAlertFlag=false; currentRoom=150; guardsData={}; buildGuard(150);
  const up = guards.find(g=>(g.y&0x80)===0);            // an upper guard: slides L/R, fires VERTICAL
  snake.x=8; snake.y=8;                                 // far away (not in his lane)
  up.silState=1; up.silWait=1; up.dir='left'; bullets.length=0;
  const ux=up.x; iter2(()=>silencerLogic(up), 1);
  // InitBulletVert: vy is the full ±2.5 axis speed (down, since the guard is in the upper half);
  // vx is the small random drift (-0x40..+0x3F in 8.8, /2 => |vx| <= 0.125).
  __check('an upper suppressor guard slides along its axis and fires a VERTICAL bullet (down) with drift',
    up.x!==ux && bullets.length>0 && bullets[0].vy===2.5 && Math.abs(bullets[0].vx) <= 0.125, 'v='+bullets[0].vx+','+bullets[0].vy);
  snake.y=up.y; snake.x=up.x;                           // step into his lane (within 0x21 in Y)
  iter2(()=>silencerLogic(up), 1);
  __check('Snake entering the lane transforms the guard into an alert chaser', up.state==='alert');

  // ==== Room-16 switch guard (GuardSwitchLogic): powers the electric floor, then guards it ====
  alertMode=false; redAlertFlag=false; powerSwitch=null; powerSwitchOn=false;
  currentRoom=16; guardsData={}; buildGuard(16);
  __check('room 16 spawns the switch guard (patrolling)', guards.length===1 && guards[0].isSwitch);
  const sw=guards[0]; raiseAlarm(16);                   // sighting/alarm -> run to the switch
  for (let i=0;i<400 && !powerSwitchOn;i++){ tickCounter=(tickCounter+2)&0xff; updateGuardOne(sw); }
  __check('on the alarm it runs to the switch and powers the electric floor',
    powerSwitchOn===true && powerSwitch && powerSwitch.x===0x24, 'sw='+JSON.stringify(powerSwitch));

  // ==== Land mines (InitMines, the buried mine fields) ====
  gameState='play'; assets.collision=C(); currentRoom=9; buildMines(9);
  __check('room 9 places its 12 buried mines', mines.length===12);
  const m0=mines[0]; snake.x=m0.x; snake.y=m0.y; snake.life=24; snake.invulnTimer=0;
  selectedItem=0;
  iter2(mineTick, 1);
  __check('stepping on a mine explodes it (0x10 damage, mine consumed after the blast)',
    snake.life===24-0x10 && m0.exploding>0, 'life='+snake.life);
  iter2(mineTick, 0x10);
  __check('the blast clears the mine from the field', !mines.includes(m0) && mines.length===11);
  // a mine off to the side is NOT triggered just by being in the room
  snake.x=2; snake.y=2; snake.life=24; snake.invulnTimer=0;
  iter2(mineTick, 1);
  __check('mines away from Snake stay armed (no spurious trigger)', mines.length===11 && snake.life===24);

  setText = () => {};   // the harness doesn't load texts; the door/spawn logic is what we test

  // ==== Desert tank-shell barrage (rooms 65/66, BossTank_KO-gated) ====
  gameState='play'; assets.collision=C(); tankKO=false; tankShells.length=0;
  currentRoom=65; buildShellSpawner(65);
  __check('rooms 65/66 arm the shell barrage while the tank lives', shellSpawner!==null);
  shellSpawner.wait=1; shellSpawner.status=1; snake.x=100; snake.y=100;
  iter2(shellSpawnerTick, 1);
  __check('the barrage drops a falling air shell (timer-fused, from the top)',
    tankShells.length===1 && tankShells[0].timer>0 && tankShells[0].y===0);
  tankKO=true; buildShellSpawner(65);
  __check('destroying the desert tank stops the barrage (BossTank_KO)', shellSpawner===null);

  // ==== Desert security (room 69, uniform-gated lock-12 door) ====
  alertMode=false; previousRoom=70; doorBuild2Open=false; desertGuardTextShown=true;
  currentRoom=69; buildDesertSecurity(69);
  __check('room 69 arms desert security (not from building 2)', desertSecurity!==null);
  desertSecurity.timer=0; desertSecurity.status=1; selectedItem=SELECTED_UNIFORM;
  iter2(desertSecurityTick, 1);     // doorStep 0 -> "Come in"
  iter2(desertSecurityTick, 1);     // doorStep 1 -> open the door
  __check('wearing the uniform opens the lock-12 building-2 door', doorBuild2Open===true && desertSecurity===null);
  previousRoom=70; doorBuild2Open=false; alertMode=false; buildDesertSecurity(69);
  desertSecurity.timer=0; desertSecurity.status=1; selectedItem=0;
  iter2(desertSecurityTick, 1);
  __check('no uniform near the guards triggers the alarm', alertMode===true && desertSecurity===null);
  previousRoom=73; buildDesertSecurity(69);
  __check('arriving from building 2 (room 73) dismisses desert security', desertSecurity===null);

  // ==== Elevator relieve ceremony (room 3) — full FSM is in elevator.headless.mjs ====
  alertMode=false; currentRoom=3; previousRoom=0; snake.y=0xC0; buildElevRelief(3);
  __check('room 3 posts the two elevator guards (0x50/0x90) and arms the spawner',
    elevGuards.length===2 && elevGuards[0].x===0x50 && elevGuards[1].x===0x90 && elevSpawner!==null);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nhazards.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
