// Headless verification for guard-touch-alert (task 3.1). Loads the REAL web/game.js in a vm
// sandbox with mocked DOM, strips the trailing main(), and appends asserts in the same scope so
// they can read game.js's touch/LOS state. Run: node web/touch.headless.mjs
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
  function reset(opts){ alertMode=false; redAlertFlag=false; roomAlert=-1; gameState='play';
    currentRoom=0; assets.collision=C(); bullets.length=0; playerShots.length=0;
    snake.x=200; snake.y=150; snake.dir='down'; snake.state='idle';
    snake.anim=ANIM_NORMAL; snake.life=snake.maxLife=24; snake.invulnTimer=0;
    guardsData = { '0': Object.assign({x:120,y:100,dir:'left'}, opts||{}) }; buildGuardRaw(0); }
  // One game-ordered tick of the touch + guard phases (update() without the player/shot parts).
  const tick = () => { chkTouchGuard(); chkAlarmEnd(); updateGuard(); };

  // --- ROM touch box (ActorsShapeTouch 8 -> ImpactAreasInfo row 8: 0,8,0,12; strict <) ---
  __check('touch shape = (0,8,0,12)', GUARD_TOUCH_SHAPE.offY===0 && GUARD_TOUCH_SHAPE.distY===8
                                      && GUARD_TOUCH_SHAPE.offX===0 && GUARD_TOUCH_SHAPE.distX===12);
  reset(); snake.x=132; snake.y=100; chkTouchGuard();   // |dx| = 12 -> not < 12
  __check('X edge 12px is no touch (strict <)', guard.touched===false && snake.life===24);
  reset(); snake.x=131; snake.y=100; chkTouchGuard();   // 11 < 12
  __check('X 11px touches', guard.touched===true);
  reset(); snake.x=120; snake.y=108; chkTouchGuard();   // |dy| = 8 -> not < 8
  __check('Y edge 8px is no touch (strict <)', guard.touched===false && snake.life===24);
  reset(); snake.x=120; snake.y=107; chkTouchGuard();   // 7 < 8
  __check('Y 7px touches', guard.touched===true);

  // --- touching a PATROL guard damages Snake and raises the alarm ---
  reset(); snake.x=124; snake.y=100; tick();
  __check('patrol touch: Snake loses 2 life', snake.life===22, 'life='+snake.life);
  __check('patrol touch: i-frames open', snake.invulnTimer>0);
  __check('patrol touch: alarm raised, guard chases', alertMode===true && guard.state==='alert');

  // --- repeat touch inside the i-frame window: no extra damage, alarm stays ---
  tick();
  __check('repeat touch in i-frames: no extra damage', snake.life===22 && alertMode===true);

  // --- a stunned guard registers no touch: no flag, no damage, no alarm ---
  reset(); snake.x=124; snake.y=100; guard.stunnedCnt=0x20; tick();
  __check('stunned: no flag/damage/alarm', guard.touched===false && snake.life===24 && alertMode===false);

  // --- an ALERTED guard still damages on contact (old behaviour preserved) ---
  reset(); raiseAlarm(0); snake.x=124; snake.y=100; snake.invulnTimer=0; tick();
  __check('alert-guard contact still damages', snake.life===22);

  // --- sleeping guard: touch wakes + alarms + damages ---
  reset({sleeping:true}); snake.x=124; snake.y=100; tick();
  __check('sleeping touch: wakes + alarm + damage',
          guard.asleep===false && alertMode===true && snake.life===22);

  // --- ChkSeePlayer gates: deep water hides Snake from a clear LOS ---
  reset(); snake.x=80; snake.y=100; guard.dir='left';   // in front, in band, clear path
  __check('baseline: clear LOS sees Snake', guardSeesSnake()===true);
  snake.anim=ANIM_DEEP_WATER;
  __check('deep water: unseen in the same LOS', guardSeesSnake()===false);

  // --- box: stationary hides, moving is spotted ---
  reset(); snake.x=80; snake.y=100; guard.dir='left'; snake.anim=ANIM_BOX; snake.state='idle';
  __check('stationary box: unseen', guardSeesSnake()===false);
  snake.state='walk';
  __check('moving box: seen', guardSeesSnake()===true);

  // --- touch discovers regardless of facing (ChkSeePlayer2 before the directional LOS) ---
  reset(); guard.dir='right'; snake.x=110; snake.y=100; tick();  // behind the guard, touching
  __check('touch behind the guard still alarms', alertMode===true);

  // --- #106: chkPunch is suppressed inside the cardboard box (also in water/deep water) ---
  reset(); currentRoom=0; selectedItem=SELECTED_BOX; snake.x=200; snake.y=150; snake.state='idle';
  punchQueued=true; normalControl();
  __check('#106 cannot punch while wearing the box',
          snake.state!=='punch' && snake.controlMod===CONTROL_NORMAL && punchQueued===false);
  selectedItem=0;

  // --- #107: ChkWaterTiles classifies the H tile (X-4) first; H shallow beats L deep ---
  reset(); currentRoom=70; snake.x=128; snake.y=100;            // room 70 is shallow-water tileset
  const wty=snake.y>>3, hcol=(snake.x-4)>>3, lcol=(snake.x+4)>>3, W=assets.collision.width;
  const setT=(col,v)=>{ assets.collision.tiles[wty*W+col]=v; };
  setT(hcol,0x73); setT(lcol,0x75); snake.anim=ANIM_NORMAL; snake.invulnTimer=0; chkWater();
  __check('#107 H shallow + L deep -> SHALLOW (H wins, no deep drain)', snake.anim===ANIM_WATER);
  setT(hcol,0x00); setT(lcol,0x75); snake.invulnTimer=0; chkWater();
  __check('#107 H non-water + L deep -> DEEP (L consulted)', snake.anim===ANIM_DEEP_WATER);
  setT(hcol,0x6D); setT(lcol,0x75); snake.anim=ANIM_NORMAL; snake.invulnTimer=0; chkWater();
  __check('#107 H brick + L deep -> DEEP (brick checked last)', snake.anim===ANIM_DEEP_WATER);

  // ===== #51 punch duration =====
  // chkPunch (Banks0123.asm:8949): "ld a,8 / ld (PunchCnt),a".
  __check('#51 PUNCH_TICKS is the ROM PunchCnt of 8', PUNCH_TICKS === 8);
  reset(); currentRoom=0; selectedItem=0; snake.x=200; snake.y=150; snake.state='idle';
  snake.controlMod=CONTROL_NORMAL; punchQueued=true; normalControl();
  __check('#51 a swing locks control in PUNCH for 8 iterations',
    snake.controlMod===CONTROL_PUNCH && snake.punchTimer===8, 't='+snake.punchTimer);
  let n=0; while (snake.controlMod===CONTROL_PUNCH && n<30) { punchControl(); n++; }
  __check('#51 ...and releases after exactly 8', n===8, 'n='+n);

  // ===== #55 punch SFX only on contact =====
  // chkPunch plays nothing; SFX 9 comes from ChkPunchColl on a solid probe, SFX 8 from
  // ChkPunchEnemy4 on a landed hit. An air punch is silent.
  const sfx=[]; const realPlayBuf=playBuf; playBuf=(b)=>{ if(b) sfx.push(b); };
  assets.punchBuf='SFX8'; assets.punchWallBuf='SFX9';
  reset(); currentRoom=0; guards=[]; guard=null;        // nothing to hit, open ground
  snake.x=200; snake.y=150; snake.state='idle'; snake.controlMod=CONTROL_NORMAL;
  sfx.length=0; punchQueued=true; normalControl();
  __check('#55 an AIR punch is silent', sfx.length===0, 'sfx='+JSON.stringify(sfx));
  // Facing a solid tile -> SFX 9 only. ChkPunchColl probes 2px AHEAD in the facing direction, so
  // place the wall where a Snake standing flush against it would find it: shape 0's right probe is
  // x+7, plus the 2px offset -> x+9.
  reset(); currentRoom=0; guards=[]; guard=null;
  snake.x=200; snake.y=150; snake.dir='right'; snake.state='idle'; snake.controlMod=CONTROL_NORMAL;
  const W2=assets.collision.width;
  assets.collision.solid.fill(0);
  assets.collision.solid[(150>>3)*W2 + ((200+7+2)>>3)] = 1;
  sfx.length=0; punchQueued=true; normalControl();
  __check('#55 punching a WALL plays SFX 9 only', sfx.length===1 && sfx[0]==='SFX9',
    JSON.stringify(sfx));
  // The regression this guards: an un-offset probe reports clear when Snake is stopped against the
  // wall, so nothing sounds. Put the wall ONLY where the 2px offset reaches and it must still fire.
  reset(); currentRoom=0; guards=[]; guard=null;
  snake.x=199; snake.y=150; snake.dir='right'; snake.state='idle'; snake.controlMod=CONTROL_NORMAL;
  assets.collision.solid.fill(0);
  const onlyAhead = (150>>3)*W2 + ((199+7+2)>>3);
  if (((199+7)>>3) !== ((199+7+2)>>3)) {         // only meaningful when the two land in different tiles
    assets.collision.solid[onlyAhead] = 1;
    sfx.length=0; punchQueued=true; normalControl();
    __check('#108 the wall thud uses the 2px-ahead probe (flush against a wall still sounds)',
      sfx.includes('SFX9'), JSON.stringify(sfx));
  }
  // connecting with a guard -> SFX 8
  reset(); currentRoom=0; snake.x=200; snake.y=150; snake.dir='left';
  snake.state='idle'; snake.controlMod=CONTROL_NORMAL;
  guards=[makeGuard({x:190,y:150,dir:'right',path:[[190,150]]})]; guard=guards[0];
  sfx.length=0; punchQueued=true; normalControl();
  __check('#55 a CONNECTING punch plays SFX 8', sfx.includes('SFX8'), JSON.stringify(sfx));
  playBuf=realPlayBuf;

  // ===== #52 ladder mount/dismount need a fresh press =====
  // ChkStartClimb (:9338) reads the Up TRIGGER; ChkExitLadders (:9378) the Left/Right trigger.
  reset(); currentRoom=224; snake.controlMod=CONTROL_NORMAL;
  snake.x=0xD8; snake.y=LADDER_CLIMB_FLOOR_Y;
  const lt=(snake.y>>3)*assets.collision.width + ((snake.x-4)>>3);
  assets.collision.tiles[lt]=0x08;          // isLadder tile
  held.add('dir:up'); ladderDirTrigger=null;            // HELD up, no fresh press
  chkStartClimb();
  __check('#52 a HELD Up does not mount the ladder', snake.controlMod===CONTROL_NORMAL);
  ladderDirTrigger='up';
  chkStartClimb();
  __check('#52 a fresh Up press mounts it', snake.controlMod===CONTROL_LADDER_CLIMB);
  __check('#52 the mount consumes the trigger', ladderDirTrigger===null);
  // dismount
  snake.y=LADDER_CLIMB_FLOOR_Y; ladderDirTrigger=null; held.add('dir:left');
  chkExitLadders();
  __check('#52 a HELD Left does not step off', snake.controlMod===CONTROL_LADDER_CLIMB);
  ladderDirTrigger='left'; chkExitLadders();
  __check('#52 a fresh Left press steps off onto the floor',
    snake.controlMod===CONTROL_LADDER_WALK && snake.y===LADDER_WALK_FLOOR_Y);
  held.clear();

  // ===== #49 room 78's second collision shape =====
  __check('#49 shape 2 matches BoxColliderDat (narrower than shape 0)',
    JSON.stringify(PROBES_SHAPE2.up)===JSON.stringify([[-5,-4],[-5,3]]) &&
    JSON.stringify(PROBES_SHAPE2.left)===JSON.stringify([[-4,-5],[3,-5]]) &&
    JSON.stringify(PROBES_SHAPE2.right)===JSON.stringify([[-4,4],[3,4]]));
  reset();
  const W3=assets.collision.width;
  // Pick an X where the two shapes probe DIFFERENT tile columns: shape 2's right probe is x+4,
  // shape 0's is x+7. At x=105 that is column 13 vs 14, so each can be isolated.
  const PX=105, PY=100;
  const colS2=(PX+4)>>3, colS0=(PX+7)>>3;
  __check('#49 fixture isolates the two shapes (different tile columns)', colS2 !== colS0,
    'shape2 col='+colS2+' shape0 col='+colS0);
  assets.collision.solid.fill(0); assets.collision.solid[(PY>>3)*W3 + colS2]=1;
  currentRoom=0;  const base = blocked(PX,PY,'right');
  currentRoom=78; const r78  = blocked(PX,PY,'right');
  __check('#49 a shape-2-only obstacle blocks ONLY in room 78',
    base === false && r78 === true, 'room0=' + base + ' room78=' + r78);
  assets.collision.solid.fill(0); assets.collision.solid[(PY>>3)*W3 + colS0]=1;
  currentRoom=0;  const s0a = blocked(PX,PY,'right');
  currentRoom=78; const s0b = blocked(PX,PY,'right');
  __check('#49 a shape-0 obstacle still blocks in BOTH rooms', s0a===true && s0b===true);
  assets.collision.solid.fill(0);
  currentRoom=78;
  __check('#49 open ground is still passable in room 78', blocked(PX,PY,'right')===false);
  currentRoom=0;
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
