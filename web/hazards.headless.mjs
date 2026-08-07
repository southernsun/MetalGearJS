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
// barrel.json is written by `--export-barrel` straight from RollBarrels1/2 + SprOffsets7 (#111).
sandbox.__barrelMeta = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'barrel.json'), 'utf8'));

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

  // ==== actors.json patrol-path integrity (#122) ====
  // The ROM assigns a path only to guards that actually reach InitGuardPath/GetPathPoints:
  // SLOW/MEDIUM/FAST, sentinels (look-direction lists) and lorry guards. ALERT/REDALERT and
  // SILENCER guards have their own init routines with no path lookup. The exporter used to give
  // every guard a slot, which ran past the end of a room's table and picked up the NEXT room's
  // data — room 131's alert guards landed on Paths_139's sentinel look-direction lists.
  {
    let malformed = 0, alertWithPath = 0, pathed = 0;
    for (const rn of Object.keys(actorsData))
      for (const g of (actorsData[rn].guards || [])) {
        if (!g.path) continue;
        pathed++;
        if (g.path.some(p => !Array.isArray(p) || p.length !== 2 ||
                             !Number.isInteger(p[0]) || !Number.isInteger(p[1]))) malformed++;
        if (g.alert || g.silencer) alertWithPath++;
      }
    __check('#122 no patrol path has a malformed/null point', malformed === 0, 'bad=' + malformed);
    __check('#122 alert/silencer guards carry no patrol path', alertWithPath === 0, 'n=' + alertWithPath);
    __check('#122 patrol paths still exist for real path guards', pathed > 50, 'pathed=' + pathed);
    // Room 131 is the room the bug bit: four ID_GUARD_ALERT, a one-entry path table (Paths_119).
    const r131 = actorsData[131].guards;
    __check('#122 room 131 has 4 alert guards, none with a path',
      r131.length === 4 && r131.every(g => g.alert && !g.path));
    // ...and the alarm-end re-home must not produce NaN (it used to read (3, null)).
    currentRoom = 131; buildGuard(131);
    for (const g of guards) g.state = 'alert';
    stopAlarm();                      // the path re-home lives here
    __check('#122 alarm-end re-home keeps every room-131 guard on real coordinates',
      guards.every(g => Number.isFinite(g.x) && Number.isFinite(g.y)),
      guards.map(g => '(' + g.x + ',' + g.y + ')').join(' '));
    // Room 4's two patrol guards keep the ROM's Path_003_01/02 (the fix must not shift real paths).
    const r4 = actorsData[4].guards;
    __check('#122 room 4 keeps its ROM patrol paths',
      JSON.stringify(r4[0].path) === JSON.stringify([[56,136],[56,56],[136,56],[136,136]]) &&
      JSON.stringify(r4[1].path) === JSON.stringify([[56,152],[56,232],[136,232],[136,152]]));
    guards = []; guard = null;        // don't leak room 131's guards into the later blocks
  }

  // ==== SetDirToPoint (#123) ====
  // Banks0123.asm:6965-7005 — b (Y) and c (X) are computed independently and OR'd, with the
  // 0-based mapping 0=up 1=down 2=left 3=right (ChangeGuardSprDir: SpriteId = Direction*2).
  __check('#123 pure vertical: up / down',
    setDirToPoint(100,100,100,50) === 'up' && setDirToPoint(100,100,100,150) === 'down');
  __check('#123 pure horizontal: left / right',
    setDirToPoint(100,100,50,100) === 'left' && setDirToPoint(100,100,150,100) === 'right');
  __check('#123 same point resolves to up (b=0,c=0)', setDirToPoint(100,100,100,100) === 'up');
  // The X result dominates whenever X differs, and b|c makes down+left read as RIGHT.
  __check('#123 up+left -> left (0|2)', setDirToPoint(100,100,50,50) === 'left');
  __check('#123 up+right -> right (0|3)', setDirToPoint(100,100,150,50) === 'right');
  __check('#123 down+right -> right (1|3)', setDirToPoint(100,100,150,150) === 'right');
  __check('#123 ROM QUIRK down+left -> RIGHT (1|2 = 3), not left',
    setDirToPoint(100,100,50,150) === 'right');
  // Integration: room 4's two guards each sit directly below path point 0 -> both face up.
  {
    const d4 = guardDefsFor(4);
    __check('#123 room 4 guards both face up on entry (spawn directly below p0)',
      d4.length === 2 && d4.every(d => d.dir === 'up'), d4.map(d => d.dir).join(','));
  }

  // ==== Rolling barrels (RollingBarrelLogic) ====
  // #113: InitRollingBarrel reads PlayerX, and the ROM runs it AFTER LocatePlayerEntry
  // (Banks0123.asm:11863 then :11925). buildBarrels therefore leaves the direction at 0 and
  // flushRoomEntryInit()/initBarrelDirections() sets it once Snake is at the entry point.
  currentRoom=153; buildBarrels(153);
  __check('room 153 places its one barrel at the ROM spot (128,8)',
    barrels.length===1 && barrels[0].x===128 && barrels[0].y===8);
  __check('#113 buildBarrels does NOT read the (still stale) player X',
    barrels[0].vx===0 && barrels[0].dir===0);
  snake.x=40; snake.y=10; initBarrelDirections();       // player in the LEFT half
  __check('#113 player left of centre -> barrel launched RIGHT (+0.5)', barrels[0].vx===0.5);
  snake.x=200; initBarrelDirections();                  // player in the RIGHT half
  __check('#113 player right of centre -> barrel launched LEFT (-0.5)', barrels[0].vx===-0.5);

  // ROM QUIRK (RB_IncrementSpeed): InitRollingBarrel never sets ACTOR.Direction and SetupEnemyRoom
  // zeroes the EnemyList, so bit 0 is clear on the first leg -> acceleration is LEFT regardless.
  // A barrel launched rightward therefore decelerates, stops, and rolls back. 0.5 / (8/256) = 16.
  const b0=barrels[0];
  snake.x=40; initBarrelDirections();                   // relaunch rightward at +0.5, dir still 0
  b0.x=128;
  iter2(barrelTick, 16);
  __check('#113 the first leg accelerates LEFT (Direction 0) — a rightward launch stops after 16 iters',
    Math.abs(b0.vx) < 1e-9, 'v='+b0.vx);
  iter2(barrelTick, 4);
  __check('#113 ...and then rolls back leftward', b0.vx < 0, 'v='+b0.vx);

  // ChkBarrelBounce: X >= 200 -> X=199, speed -80h, Direction=DIR_DOWN(2).
  b0.x=198; b0.vx=2; b0.dir=ROM_DIR_LEFT;               // dir 3 = "moving right" -> accelerates right
  iter2(barrelTick, 2);
  __check('the right wall bounces it (X clamps to 199, speed flips to -0.5, dir=DOWN)',
    b0.x < 200 && b0.vx < 0 && b0.dir===ROM_DIR_DOWN, 'x='+b0.x+' v='+b0.vx+' dir='+b0.dir);
  const sp = Math.abs(b0.vx);
  iter2(barrelTick, 4);
  __check('it accelerates every iteration (RB_IncrementSpeed)', Math.abs(b0.vx) > sp, 'v='+b0.vx);
  // ChkBarrelBounce: X < 56 -> X=57, speed +80h, Direction=DIR_LEFT(3). 56 itself must NOT bounce.
  b0.x=56; b0.vx=-0.5; b0.dir=ROM_DIR_DOWN;
  iter2(barrelTick, 1);
  __check('X == 56 does NOT bounce (ROM tests X < 56)', b0.dir===ROM_DIR_DOWN && b0.x<56, 'x='+b0.x);
  iter2(barrelTick, 1);
  __check('the left wall bounces it (X=57, speed +0.5, dir=LEFT)',
    b0.x>=56 && b0.vx>0 && b0.dir===ROM_DIR_LEFT, 'x='+b0.x+' v='+b0.vx);

  // Touch box: ActorsShapeTouch[0x0E] = 0x10 -> ImpactAreasInfo row 16 = offY 0x48, distY 0x48,
  // offX 0, distX 0x0C -> |dy-72| < 72 and |dx| < 12, i.e. exactly the 16x144 sprite column.
  b0.x=128; b0.vx=0; b0.dir=0;
  gameState='play'; snake.life=24; snake.invulnTimer=0;
  snake.x=b0.x + 12; snake.y=b0.y + 0x48;               // |dx| == 12 -> just OUTSIDE
  iter2(barrelTick, 1);
  __check('|dx| == 12 is outside the touch box (strict <)', snake.life===24, 'life='+snake.life);
  b0.x=128; b0.vx=0; b0.dir=0;
  snake.x=b0.x; snake.y=b0.y;                            // |dy-72| == 72 -> just OUTSIDE (column top)
  iter2(barrelTick, 1);
  __check('the column top edge is outside the touch box', snake.life===24, 'life='+snake.life);
  b0.x=128; b0.vx=0; b0.dir=0;
  snake.x=b0.x; snake.y=b0.y + 0x48;                     // dead centre of the column
  iter2(barrelTick, 1);
  __check('the crush takes ALL life (damage 0xFF)', snake.life===0 || gameState==='dead');

  // #111: the column is drawn from the EXPORTED SprRollingBarrel asset, not primitives.
  __check('#111 barrel.json matches RollBarrels1/2 + SprOffsets7 (2 frames of 16x144 at -8,0)',
    __barrelMeta.frames===2 && __barrelMeta.frameWidth===16 && __barrelMeta.frameHeight===144 &&
    __barrelMeta.offsetX===-8 && __barrelMeta.offsetY===0 && __barrelMeta.rows===9,
    JSON.stringify(__barrelMeta));
  gameState='play'; snake.life=24; snake.invulnTimer=0;

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

  // #112 PowerSwitchLogic's palette fade. InitPowerSwitch seeds BRIGHT=4 / DELTA=+1; every 4
  // iterations BRIGHT += DELTA and ChkRevertFade ("cp 7 / call nc") rewrites it BEFORE the colour
  // is read — so 7 is clamped to 6 (never displayed) and the fade-out runs through 0 to the 0xFF
  // wrap, which clamps to 1. Expected displayed ramp from the seed:
  const wantRamp = [5,6,6,5,4,3,2,1,0,1,2,3,4,5,6,6,5];
  powerFadeBright=4; powerFadeDelta=1; powerSwitchOn=true;
  const gotRamp=[];
  for (let i=0;i<wantRamp.length;i++){ tickCounter=0; powerSwitchTick(); gotRamp.push(powerFadeBright); }
  __check('#112 the BRIGHT ramp matches PowerSwitchLogic/ChkRevertFade exactly',
    gotRamp.join(',')===wantRamp.join(','), 'got='+gotRamp.join(','));
  __check('#112 the peak is 6, not a pure-white 7', Math.max(...gotRamp)===6);
  __check('#112 the trough reaches 0 (full black)', Math.min(...gotRamp)===0);
  // The fade only runs while the switch is on (PowerSwitchLogic is the ACTOR's logic).
  powerSwitchOn=false; const frozen=powerFadeBright; tickCounter=0; powerSwitchTick();
  __check('#112 a dead switch freezes the fade', powerFadeBright===frozen);
  powerSwitchOn=true;
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
  // ErasePowerSw (Banks0123.asm:13603-13645): the blown switch leaves a WRECK on the wall, drawn as
  // two 8x8 room tiles at PowerSwitchX/Y = the actor position offset by (-4,-8). Not a sprite and
  // not an explosion — a page-1 VDP tile copy. (It used to just vanish, leaving clean wall.)
  __check('#132 the blown switch leaves a wreck at (X-4, Y-8)',
    powerSwitchOff !== null && powerSwitchOff.x === 56 && powerSwitchOff.y === 52,
    JSON.stringify(powerSwitchOff));
  __check('#132 the wreck is the NORMAL-room variant, not room 40s roof pair',
    powerSwitchOff.roof === false);
  // SetupEnemyRoom zeroes PowerSwitchY on every room change and InitPowerSwitch re-arms the switch.
  buildPowerSwitch(37);
  __check('#132 leaving the room clears the wreck and re-arms the switch',
    powerSwitchOff === null && powerSwitch !== null && powerSwitchOn === true);
  // Room 40 (the roof floor) reads PowSwOffGfxX = {50h,70h} -> room tiles 4Ah/4Eh instead.
  currentRoom=40; powerSwitch={x:100,y:100,life:0,dmgTable:POWER_SWITCH_DMG,
                               shotShape:{offY:0,distY:8,offX:0,distX:8}};
  powerSwitchOn=true; powerSwitchTick();
  __check('#132 room 40 uses the roof tile pair', powerSwitchOff && powerSwitchOff.roof === true);
  currentRoom=37; buildPowerSwitch(37);

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
  __check('an upper suppressor guard slides 2px (SetWalkSpeedFast, #96) and fires a VERTICAL bullet (down) with drift',
    up.x===ux-2 && bullets.length>0 && bullets[0].vy===2.5 && Math.abs(bullets[0].vx) <= 0.125, 'x='+up.x+'/'+ux+' v='+bullets[0].vx+','+bullets[0].vy);
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
  // #69: GuardSwShot fires only when PlayerY >= 0x80 (lower half), NOT relative to the guard's Y
  sw.swStatus=5; sw.swWait=1; sw.x=0x60; bullets.length=0; snake.x=0x60;
  snake.y=0x40; tickCounter=0; updateGuardOne(sw);       // upper half: hold fire
  __check('#69 switch guard holds fire while PlayerY < 0x80', bullets.length===0);
  sw.swStatus=5; sw.swWait=1; snake.y=0xA0; tickCounter=0; updateGuardOne(sw);   // lower half: fire
  __check('#69 switch guard fires once PlayerY >= 0x80', bullets.length>0);

  // #94: GuardSwChkSeeY is a lower-half tripwire (NOT a directional LOS) — it alarms on Snake at
  // PlayerY >= 0x80 regardless of the guard's facing/X (box-aware).
  alertMode=false; redAlertFlag=false; powerSwitchOn=false; powerSwitch=null;
  buildGuard(16); const sw2=guards[0]; sw2.swStatus=0; sw2.x=0x80; sw2.dir='right';
  snake.anim=ANIM_NORMAL; snake.state='idle'; snake.x=0x10;
  snake.y=0x40; tickCounter=0; updateGuardOne(sw2);     // upper half, far away: no alarm
  __check('#94 switch guard ignores Snake in the upper half', sw2.swStatus===0 && alertMode===false);
  snake.y=0xA0; tickCounter=0; updateGuardOne(sw2);     // lower half, out of the facing line: alarm
  __check('#94 switch guard alarms on Snake in the LOWER half (tripwire, any facing)',
    alertMode===true && sw2.swStatus===6);

  // #95: look-north resumes the SAME travel direction — a left-moving guard does not flip to right at
  // 0x98 (which would oscillate 0x98<->0xD0 and never reach the 0x50 limit).
  alertMode=false; redAlertFlag=false;
  buildGuard(16); const sw3=guards[0]; sw3.swStatus=0; sw3.x=0x99; sw3.dir='left';
  snake.anim=ANIM_NORMAL; snake.state='idle'; snake.x=0x10; snake.y=0x10;   // far upper: no alarm
  tickCounter=0; updateGuardOne(sw3);                   // steps left to 0x98 -> look north, saves 'left'
  __check('#95 a left-moving guard stops to look at 0x98 (travel dir saved)',
    sw3.swStatus===1 && sw3.swTravelDir==='left' && sw3.x===0x98);
  sw3.swWait=1; tickCounter=0; updateGuardOne(sw3);     // the wait expires -> resume LEFT, not right
  __check('#95 it resumes moving LEFT after the look (full patrol, no oscillation)',
    sw3.swStatus===0 && sw3.dir==='left');

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
  // #65: the trigger box is ±0x0C in X (ImpactAreasInfo row 8), not ±8 — a mine 10px away DOES catch
  buildMines(9); const mb=mines[0]; snake.life=24; snake.invulnTimer=0;
  snake.x=mb.x+10; snake.y=mb.y;                 // |dx|=10: inside ±0x0C (the old ±8 would miss)
  iter2(mineTick, 1);
  __check('#65 a mine 10px away in X still triggers (box ±0x0C)', mb.exploding>0);

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

// ---- the destroyed-switch ART is a decoded ROM asset, not something drawn here (#132) ----
// The two source tiles are pinned by the ROM: ErasePowerSw's X table {30h,38h} / PowSwOffGfxX
// {50h,70h} at SY 10h, inverted through TileToVramAdd's page-1 grid (x=(A&1Fh)*8, y=(A>>5)*8).
// Assert the exported metadata AND a byte hash of each PNG, so a silent re-export is caught.
{
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'powerswitch-off.json'), 'utf8'));
  sandbox.__check('#132 normal rooms decode ROM tiles 0x46/0x47 at offset (-4,-8), 8x16',
    meta.normal.tiles[0] === 0x46 && meta.normal.tiles[1] === 0x47 &&
    meta.normal.offX === -4 && meta.normal.offY === -8 &&
    meta.normal.w === 8 && meta.normal.h === 16, JSON.stringify(meta.normal.tiles));
  sandbox.__check('#132 room 40 decodes ROM tiles 0x4A/0x4E (PowSwOffGfxX)',
    meta.roof.tiles[0] === 0x4A && meta.roof.tiles[1] === 0x4E, JSON.stringify(meta.roof.tiles));
  for (const [file, want] of [['powerswitch-off.png', 'e0de6d4b'], ['powerswitch-off-roof.png', 'd490b29e']]) {
    const buf = fs.readFileSync(path.join(dir, 'assets', file));
    let h = 0x811c9dc5;                                     // FNV-1a over the PNG bytes
    for (const b of buf) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    sandbox.__check(`#132 ${file} matches the decoded ROM tiles`, h.toString(16) === want,
      'hash=' + h.toString(16) + ' bytes=' + buf.length);
  }
}

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nhazards.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
