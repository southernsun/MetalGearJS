// Headless verification for guard-alarm-system (task 7.1). Loads the REAL web/game.js in a vm sandbox
// with mocked DOM, strips the trailing main(), and appends asserts in the same scope so they can read
// game.js's alarm state/functions. Run: node web/alarm.headless.mjs
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
  function reset(room){ alertMode=false; redAlertFlag=false; roomAlert=-1; alertRespawnTimer=0; numRespawnGuards=0;
    items.clear();   // no keycards -> NumRespawnGuards = 0 highest-card + 3 = 3
    guards.length=0; guard=null; currentRoom=room; gameState='play'; assets.collision=C(); snake.x=128; snake.y=100; }

  // --- RedAlertRooms bit table (room 7,11 red; room 0 low) ---
  __check('redAlertBit 7 = red', redAlertBit(7) === true);
  __check('redAlertBit 0 = low', redAlertBit(0) === false);
  __check('redAlertBit 11 = red', redAlertBit(11) === true);

  // --- raise: low vs red ---
  reset(0); raiseAlarm(0);
  __check('raise low: alertMode set, not red', alertMode && !redAlertFlag);
  reset(7); raiseAlarm(7);
  __check('raise red: red flag set', alertMode && redAlertFlag);
  reset(0); raiseAlarm(0); raiseAlarm(7);
  __check('raise is a no-op when already up', roomAlert===0);

  // --- noise (ChkAlertTrigger): secure vs normal ---
  reset(5); chkAlertTrigger();              // room 5 is in ROOM_SHOT_SECURE
  __check('shot in secure room raises no alarm', alertMode===false);
  reset(0); chkAlertTrigger();
  __check('shot in normal room raises the alarm', alertMode===true);
  reset(122); chkAlertTrigger();            // room 122: IsolatedRoom (RoomsMusic&7==1), NOT in RoomShotSecure
  __check('shot in an IsolatedRoom raises no alarm (RoomsMusic&7==1)', alertMode===false);

  // --- red alert arms the card-based reinforcement budget (NumRespawnGuards); low alert doesn't ---
  reset(7); raiseAlarm(7);   // a plain guard SIGHTING in a red-alert room: GuardSetAlarm6 seeds 0x1E (not 0x28)
  __check('red alert sets redAlertFlag + arms reinforcements (timer 0x1E, budget 3)',
    redAlertFlag===true && alertRespawnTimer===0x1E && numRespawnGuards===3);
  // #59: a guard sighting in a red room shows the SIGN but plays the NORMAL alert track (not red music)
  __check('#59 red-room sighting: sign on, but red-alert MUSIC off', redAlertFlag===true && redAlertMusic===false);
  reset(7); raiseAlarm(7, true);   // a CAMERA/LASER trigger (forceRed) -> SetAlertMode5 red-alert music
  __check('#59 a camera/laser trigger plays the red-alert music', redAlertMusic===true);
  reset(0); raiseAlarm(0);
  __check('low alert: redAlertFlag clear, no reinforcement timer', redAlertFlag===false && alertRespawnTimer===0);
  // SetAlertMode2/3/4: the budget is the highest keycard owned + 3, and 0 in room 216.
  reset(0); items.set(SELECTED_CARD1+3, 1); raiseAlarm(0);   // CARD4 (the 4th card)
  __check('NumRespawnGuards = highest keycard (4) + 3', numRespawnGuards===7);
  reset(216); raiseAlarm(216);
  __check('room 216 (4th desert lorry) never respawns', numRespawnGuards===0);

  // --- chkAlarmEnd: a LOW alert ends on leaving / clearing the room; a RED alert PERSISTS across
  //     rooms until its reinforcement budget (NumRespawnGuards) is spent (faithful ChkAlarmEnd) ---
  reset(0); raiseAlarm(0); currentRoom=1; chkAlarmEnd();
  __check('low alert ends on leaving the trigger room', alertMode===false);
  reset(0); raiseAlarm(0); guards.length=0; guard=null; chkAlarmEnd();
  __check('low alert ends when the alert room is cleared', alertMode===false);
  reset(7); raiseAlarm(7); currentRoom=8; chkAlarmEnd();
  __check('red alert PERSISTS across rooms while reinforcements remain', alertMode===true);
  numRespawnGuards=0; chkAlarmEnd(); chkAlarmEnd();   // budget spent -> respawn off, then the room ends it
  __check('red alert ends once the reinforcement budget is spent', alertMode===false && alertRespawnTimer===0);

  // --- guard entered during an alarm starts alerted ---
  reset(0); guardsData = { '0': {x:120,y:100,dir:'left'} }; raiseAlarm(0); guards.length=0; guard=null; currentRoom=0; buildGuard(0);
  __check('guard built alerted during the alarm', guard && guard.state==='alert');

  // --- a killed guard does NOT respawn IN PLACE (chkGuardRespawn removed); reinforcements come
  //     from RespawnInfo spots via respawnTick, not where the guard died ---
  reset(0); guardsData = { '0': {x:120,y:100,dir:'left'} }; raiseAlarm(0); guards.length=0; guard=null; currentRoom=0;
  for(let i=0;i<200;i++){ chkAlarmEnd(); if(guard) updateGuard(); }
  __check('no in-place respawn after a kill (low alert, room clear -> ends)', guard===null && alertMode===false);

  // --- sleeping guard: holds until woken ---
  reset(0); snake.x=210; snake.y=100; guardsData={'0':{x:120,y:100,dir:'left',sleeping:true}}; buildGuardRaw(0); currentRoom=0;
  __check('guard starts asleep', guard.asleep===true);
  updateGuard();
  __check('sleeping guard stays asleep (no alarm, far)', guard.asleep===true && guard.state!=='alert');
  reset(0); snake.x=122; snake.y=100; guardsData={'0':{x:120,y:100,dir:'left',sleeping:true}}; buildGuardRaw(0); currentRoom=0;
  chkTouchGuard(); updateGuard();             // game order: the touch scan sets the flag updateGuard reads
  __check('touch wakes the sleeping guard and raises the alarm', guard.asleep===false && alertMode===true);

  // --- alarm end reverts guard to patrol + stops alarm ---
  reset(0); guardsData={'0':{x:120,y:100,dir:'left'}}; raiseAlarm(0); guards.length=0; guard=null; currentRoom=2; chkAlarmEnd();
  __check('stopAlarm clears alertMode when leaving (low)', alertMode===false);

  // ==== Alert-guard sub-AI: the RED-ALERT stand-off (guardalert.asm) =======================
  reset(0); assets.collision=C(); guardsData={'0':{x:120,y:100,dir:'left'}}; buildGuardRaw(0); currentRoom=0;
  const ag = guards[0]; enterAlert(ag);
  snake.x=ag.x+8; snake.y=ag.y;                       // right on top of a NORMAL alert guard
  __check('a normal alert guard is never "near" (ChkNearPlayer false -> chases onto Snake)', guardNearPlayer(ag)===false);
  ag.redalert=true;                                   // ID_GUARD_REDALERT keeps its distance
  snake.x=ag.x+0x10; snake.y=ag.y+0x10;
  __check('a red-alert guard within 0x30 on both axes is "near"', guardNearPlayer(ag)===true);
  snake.x=ag.x+0x40; snake.y=ag.y;
  __check('a red-alert guard beyond 0x30 is not near', guardNearPlayer(ag)===false);
  // GuardWalk2 -> SetGuardWalkAway: a near red-alert guard heads AWAY from Snake.
  ag.status='walk'; ag.counter=1; ag.dir='right'; ag.moving=true; snake.x=ag.x+0x10; snake.y=ag.y;
  guardAlertLogic(ag);
  __check('a near red-alert guard walks AWAY from Snake (Snake right -> guard goes left)', ag.dir==='left');
  // GuardWaitShot: a red-alert guard fires AGAIN the moment it resumes from a wait-shot.
  ag.redalert=true; ag.status='waitshot'; ag.counter=1; ag.moving=false; snake.x=ag.x+0x40; snake.y=ag.y; bullets.length=0;
  guardAlertLogic(ag);
  __check('a red-alert guard double-shoots on resuming the chase', ag.status==='walk' && bullets.length>0);
  // a NORMAL guard does not double-shoot on resume.
  ag.redalert=false; ag.status='waitshot'; ag.counter=1; ag.moving=false; bullets.length=0;
  guardAlertLogic(ag);
  __check('a normal guard does NOT double-shoot on resume', ag.status==='walk' && bullets.length===0);

  // ==== ChkGuardWater / MoveAwayExit: an alert guard turns away from an EXIT tile (id 1) ===
  reset(0); const wcoll=C(); const wgx=120, wgy=100;
  wcoll.tiles[(wgy>>3)*wcoll.width + ((wgx-4)>>3)] = 1;   // an exit tile (door/lorry/gap) at the feet
  assets.collision=wcoll;
  guardsData={'0':{x:wgx,y:wgy,dir:'down'}}; buildGuardRaw(0); currentRoom=0;
  const wg=guards[0]; enterAlert(wg); wg.dir='down'; wg.status='walk'; wg.moving=true; wg.counter=5;
  guardAlertLogic(wg);
  __check('an alert guard on an exit tile turns 180° away from it (down -> up)', wg.dir==='up');
  reset(0); assets.collision=C();                         // open floor: no forced turn
  guardsData={'0':{x:120,y:100,dir:'down'}}; buildGuardRaw(0); currentRoom=0;
  const wg2=guards[0]; enterAlert(wg2); snake.x=120; snake.y=160; wg2.dir='down'; wg2.status='walk'; wg2.moving=true; wg2.counter=5;
  guardAlertLogic(wg2);
  __check('no exit tile: the guard keeps chasing (no forced 180°)', wg2.dir==='down');

  // ==== GuardWaitChkAlert (status-4 init beat) + the alarm trigger ====
  reset(0); assets.collision=C(); guardsData={'0':{x:120,y:100,dir:'left'}}; buildGuardRaw(0); currentRoom=0;
  const wa=guards[0]; alertMode=false; enterAlert(wa);   // transform-to-alert without the alarm up yet
  __check('a freshly-alerted guard starts in the status-4 wait-check-alert beat', wa.status==='waitalert' && wa.alertWait===1);
  guardAlertLogic(wa);
  __check('after the beat it enters the chase and TRIGGERS the alarm', wa.status==='walk' && alertMode===true);

  // ==== SetRespawnTime: per-room reinforcement-schedule override at alert-guard init ====
  reset(0); items.clear(); currentRoom=187; guardsData={'187':{x:120,y:100,dir:'left'}}; buildGuardRaw(187);
  raiseAlarm(187);                                        // base budget 3, then InitGuardAlert overrides
  __check('SetRespawnTime: room 187 overrides the budget to 10', numRespawnGuards===0x0A);
  __check('SetRespawnTime: room 187 sets a random timer 0x10..0x1F', alertRespawnTimer>=0x10 && alertRespawnTimer<=0x1F);
  reset(0); currentRoom=92; guardsData={'92':{x:120,y:100,dir:'left'}}; buildGuardRaw(92);
  raiseAlarm(92);
  __check('SetRespawnTime: roof building 2 (rooms 88-92) also gets the budget-10 override', numRespawnGuards===0x0A);
  reset(0); currentRoom=216; guardsData={'216':{x:120,y:100,dir:'left'}}; buildGuardRaw(216);
  raiseAlarm(216);
  __check('SetRespawnTime: room 216 keeps no respawn (budget + timer 0)', numRespawnGuards===0 && alertRespawnTimer===0);
  reset(0); currentRoom=50; guardsData={'50':{x:120,y:100,dir:'left'}}; buildGuardRaw(50);
  raiseAlarm(50);                                         // a non-special room keeps the card budget (3)
  __check('SetRespawnTime: a non-special room keeps the card-based budget', numRespawnGuards===3);

  // ==== Exact LOS / sight bands (chkdiscover.asm ChkView*) ================================
  reset(0); assets.collision=C(); currentRoom=0; snake.anim=ANIM_NORMAL; snake.state='idle';
  guardsData={'0':{x:120,y:100,dir:'up'}}; buildGuardRaw(0); const lg=guards[0]; lg.touched=false;
  lg.dir='up'; snake.y=80;                              // Snake above a guard looking up
  snake.x=120+7; __check('LOS up: |dx|=7 is inside the ±8 band', guardSeesSnake(lg)===true);
  snake.x=120+8; __check('LOS up: |dx|=8 is outside the band (strict < 8)', guardSeesSnake(lg)===false);
  // the up/left vs down/right level-row asymmetry (ROM ret c vs ret nc)
  snake.x=120; snake.y=100;                             // exactly level with the guard
  lg.dir='up';   __check('LOS up includes the exactly-level row', guardSeesSnake(lg)===true);
  lg.dir='down'; __check('LOS down excludes the exactly-level row', guardSeesSnake(lg)===false);
  // guard horizontal band = 6
  lg.dir='left'; snake.x=80; snake.y=100;
  snake.y=100+5; __check('LOS left (guard): |dy|=5 is inside the ±6 band', guardSeesSnake(lg)===true);
  snake.y=100+6; __check('LOS left (guard): |dy|=6 is outside the band', guardSeesSnake(lg)===false);
  // a wall blocks LOS; a railing (0x6B) is see-through in a water room only
  reset(0); const lc=C(); currentRoom=105;             // 105 is a water-channel room (ROOMS_WATER)
  lc.solid[(100>>3)*lc.width + ((120>>3)-2)]=1;        // a solid cell two tiles left of the guard
  lc.tiles[(100>>3)*lc.width + ((120>>3)-2)]=0x6B;     // ...that is a RAILING tile
  assets.collision=lc; guardsData={'105':{x:120,y:100,dir:'left'}}; buildGuardRaw(105); currentRoom=105;
  const rg=guards[0]; rg.touched=false; rg.dir='left'; snake.x=80; snake.y=100;
  __check('LOS sees THROUGH a railing tile in a water room', guardSeesSnake(rg)===true);
  lc.tiles[(100>>3)*lc.width + ((120>>3)-2)]=0x55;     // a plain solid wall tile (not see-through)
  __check('LOS is blocked by a solid non-railing wall', guardSeesSnake(rg)===false);
  currentRoom=0;                                        // a non-water room: the railing is NOT see-through
  lc.tiles[(100>>3)*lc.width + ((120>>3)-2)]=0x6B; assets.collision=lc;
  __check('the railing see-through is gated to water rooms (blocks elsewhere)', guardSeesSnake(rg)===false);

  // ==== ListenShotsChkTouch: an exploding shot's NOISE wakes sleeping guards / sentinels ====
  reset(0); assets.collision=C(); snake.x=10; snake.y=10;   // Snake far away (no LOS, no touch)
  guardsData={'0':{x:120,y:100,dir:'left',sleeping:true}}; buildGuardRaw(0); currentRoom=0;
  const sgz=guards[0]; sgz.touched=false; selectedWeapon=0; invSuppressor=false; playerShots.length=0;
  __check('no shot in flight: nothing to hear', listenShotsChkTouch(sgz)===false);
  playerShots.push({status:0});                              // a flying (non-exploding) shot
  __check('a flying shot is not heard (only status 2 = exploding)', listenShotsChkTouch(sgz)===false);
  playerShots.length=0; playerShots.push({status:2});        // an exploding shot
  __check('an exploding shot is heard', listenShotsChkTouch(sgz)===true);
  selectedWeapon=HAND_GUN; invSuppressor=true;               // suppressor gate (handgun/SMG)
  __check('a silenced handgun/SMG suppresses the noise discovery', listenShotsChkTouch(sgz)===false);
  selectedWeapon=ROCKET_LAUNCHER;                            // a loud weapon is never gated
  __check('a loud weapon is heard regardless of the suppressor', listenShotsChkTouch(sgz)===true);
  // integration: GuardSleeping wakes + alarms on the explosion
  selectedWeapon=0; invSuppressor=false; alertMode=false; redAlertFlag=false; roomAlert=-1;
  alertRespawnTimer=0; numRespawnGuards=0; sgz.asleep=true;
  updateGuard();
  __check('GuardSleeping: an exploding shot wakes the guard and raises the alarm', sgz.asleep===false && alertMode===true);
  // integration: a SENTINEL raises the alarm on the explosion (SentinelLogic -> ListenShotsChkTouch)
  reset(0); assets.collision=C(); snake.x=10; snake.y=10;
  guardsData={'0':{x:120,y:100,dir:'left',sentinel:true,dirs:[1,4,2,3]}}; buildGuardRaw(0); currentRoom=0;
  playerShots.length=0; playerShots.push({status:2});
  updateGuard();
  __check('SentinelLogic: an exploding shot raises the alarm', alertMode===true);
  playerShots.length=0;

  // ==== InitGuardAlert2/3 / ChkDismissGuard: lorry-interior alert-guard dedup (rooms 127/131/132) ==
  reset(0); assets.collision=C(); currentRoom=127; guardExitedLorry=[false,false,false];
  guardsData={'127':{x:120,y:100,dir:'left'}}; buildGuardRaw(127); const ld1=guards[0];
  enterAlert(ld1);                                          // flag clear, alarm down -> not dismissed
  __check('lorry room 127: a guard alerts normally when its soldier has NOT exited', guards.length===1 && ld1.state==='alert');
  reset(0); assets.collision=C(); currentRoom=127; guardExitedLorry=[true,false,false];
  guardsData={'127':{x:120,y:100,dir:'left'}}; buildGuardRaw(127); const ld2=guards[0];
  enterAlert(ld2);                                          // soldier already exited -> dismissed
  __check('lorry room 127: the guard is DISMISSED when its soldier already exited', guards.length===0);
  reset(0); assets.collision=C(); currentRoom=131; guardExitedLorry=[false,true,false]; alertMode=true;
  guardsData={'131':{x:120,y:100,dir:'left'}}; buildGuardRaw(131); const ld3=guards[0];
  enterAlert(ld3);                                          // alarm already up -> InitGuardAlert skips the check
  __check('the lorry dismiss is skipped once the alarm is already up', guards.length===1 && ld3.state==='alert');
  guardExitedLorry=[false,false,false]; alertMode=false;

  // ==== Multi-guard rooms (the room actor lists spawn EVERY guard) =========================
  reset(5); guardsData = {};
  actorsData = { 5: { guards: [
    { y: 100, x: 80,  fast: false, path: [[100, 40], [100, 120]] },
    { y: 140, x: 180, fast: true,  path: [[140, 180], [60, 180]] },
  ], prisoners: [] } };
  currentRoom = 5; buildGuard(5);
  __check('a 2-guard room spawns BOTH with their paths',
    guards.length === 2 && guard === guards[0] && guards[1].speed > guards[0].speed,
    'n='+guards.length);
  const ax = guards[0].x, by = guards[1].y;
  for (let i = 0; i < 60; i++) updateGuard();
  __check('both patrol independently', guards[0].x !== ax && guards[1].y !== by,
    guards[0].x+','+guards[1].y);
  raiseAlarm(5);
  updateGuard();
  __check('the alarm alerts every guard', guards.every((g) => g.state === 'alert'));
  guards[0].life = 0; guards[0].stunnedCnt = 0;
  updateGuard(); chkAlarmEnd();
  __check('one down: the other keeps the alarm alive', guards.length === 1 && alertMode === true);
  __check('the guard alias tracks the survivor', guard === guards[0]);
  guards[0].life = 0;
  updateGuard(); chkAlarmEnd();
  __check('room cleared: the alarm ends', guards.length === 0 && alertMode === false);
  actorsData = null;
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
