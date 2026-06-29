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
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
