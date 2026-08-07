// Headless verification for the mid-bosses: Tank (67), Bulldozer (71), Arnolds x2 (83,
// the CARD7 drop), Fire Trooper (95, the flame jet). Run: node web/midbosses.headless.mjs
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
sandbox.__texts = fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8');

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  textsData = JSON.parse(__texts);
  gameState='play'; assets.collision=C(); actorsData=null; guardsData={};
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== Tank (room 67) ====
  snake.x=10; snake.y=180; snake.life=200; snake.invulnTimer=0;
  buildMidBosses(67);
  __check('the Tank holds room 67 (life 0x37)', midBosses.length===1 && midBosses[0].life===0x37);
  const t=midBosses[0];
  // the machine guns: bursts arrive within ~0x4D iterations
  bullets.length=0;
  iter2(midBossTick, 0x60);
  __check('the machine-gun burst rains bullets (8 dmg)', bullets.length>0 && bullets[0].dmg===8, 'n='+bullets.length);
  // #31: SpeedX = SpeedXUnsigned-2 -> a SYMMETRIC -2..+2 fan for a SINGLE gun (not one-directional).
  bullets.length=0; t.mgOn=true; t.mgSide=1; t.mgTimer=0x2D; t.mgShot=0; snake.x=10;
  for (let k=0;k<8;k++){ t.anim=7; midBossTick(); }   // 8 shots, mgSide fixed: vx must span - and +
  __check('the MG fan is symmetric for a single gun (vx spans - and +, #31)',
    bullets.some(b=>b.vx<0) && bullets.some(b=>b.vx>0), 'vx='+[...new Set(bullets.map(b=>b.vx))].sort().join(','));
  // the cannon: standing in the column
  t.cannon=1; snake.x=t.x; tankShells.length=0;
  iter2(midBossTick, 1);
  __check('the cannon fires a shell when Snake stands in its column', tankShells.length===1);
  // #102: the column is a symmetric ±4 window (PlayerX-X+4 < 9 unsigned), not the shifted [-12,+4]
  t.cannon=1; snake.x=t.x-8; tankShells.length=0; iter2(midBossTick, 1);
  __check('#102 no cannon shot 8px LEFT of the tank (symmetric window)', tankShells.length===0);
  t.cannon=1; snake.x=t.x-4; tankShells.length=0; iter2(midBossTick, 1);
  __check('#102 cannon fires 4px left of the tank', tankShells.length===1);
  snake.x=10; snake.y=Math.round(tankShells[0].y+4); snake.invulnTimer=0; snake.life=200;
  tankShells[0].x=snake.x;
  iter2(midBossTick, 2);
  __check('the shell bursts for 0x20 damage', snake.life===200-0x20, 'life='+snake.life);
  __check('the Tank dies ONLY to land mines (weapondamage ID 9)',
    weaponDamage(t, 6)===5 && weaponDamage(t, 3)===0 && weaponDamage(t, 4)===0);
  t.life=0; iter2(midBossTick, 0x12);              // the BossDefeatedLogic explosion first
  __check('the Tank death latches (BossTank_KO)', tankKO===true && midBosses.length===0);
  buildMidBosses(67);
  __check('room 67 stays clear forever', midBosses.length===0);

  // ==== Bulldozer (room 71) ====
  snake.life=200;
  buildMidBosses(71);
  __check('the Bulldozer holds room 71 (life 0x28)', midBosses.length===1 && midBosses[0].life===0x28);
  const d=midBosses[0]; const y0=d.y;
  iter2(midBossTick, 0x30);
  __check('it pushes DOWN through its phases', d.y>y0);
  d.y=170; iter2(midBossTick, 2);
  __check('it halts at the bottom (Y >= 160)', d.vy===0);
  __check('the Bulldozer dies ONLY to grenades (weapondamage ID 0x12)',
    weaponDamage(d, 3)===5 && weaponDamage(d, 6)===0 && weaponDamage(d, 4)===0);
  d.life=0; iter2(midBossTick, 0x12);
  __check('the Bulldozer death latches', dozerKO===true);

  // ==== Arnolds (room 83) ====
  card7Taken=false; snake.x=10; snake.y=200; snake.life=200;
  roomItems=[null,null,null];
  buildMidBosses(83);
  __check('TWO Arnolds guard room 83', midBosses.length===2 && midBosses.every(b=>b.kind==='arnold'));
  const a0=midBosses[0];
  snake.y=a0.y+0x10-4; snake.x=a0.x-60;        // inside his row window
  iter2(midBossTick, 1);
  __check('crossing his row triggers the 3px dash', a0.status===1 && a0.vx===-3);
  __check('the Arnolds die ONLY to rockets (weapondamage ID 0x1A)',
    weaponDamage(a0, 4)===10 && weaponDamage(a0, 3)===0 && weaponDamage(a0, 1)===0);
  // ArnoldBounceBack: any weapon hit bounces him +-2 away from Snake (weaponId+3
  // iterations), shots disabled during the bounce
  const ax0=a0.x; a0.hitBy=1; snake.x=a0.x-60;
  iter2(midBossTick, 2);
  __check('a hit bounces him away with shots disabled',
    a0.status===3 && a0.x>ax0 && a0.shotsOff===true, 'x='+a0.x+' was '+ax0+' st='+a0.status);
  iter2(midBossTick, 6);
  __check('the bounce ends and he resumes', a0.status!==3 && a0.shotsOff===false, 'st='+a0.status);
  // ArnoldReturn: when Snake leaves the row he walks back to x 0x80 and rests
  snake.y=100; a0.status=1; a0.vx=3; a0.x=0xB0;
  iter2(midBossTick, 1);
  __check('losing the row starts the walk back to centre (1px/iter)', a0.status===2 && a0.vx===-1, 'st='+a0.status+' vx='+a0.vx);
  iter2(midBossTick, 0x40);
  __check('he recenters at 0x80 and RESTS (watch)', a0.status===0 && a0.x===0x80, 'x='+a0.x+' st='+a0.status);
  a0.life=0; iter2(midBossTick, 0x12);
  __check('one down: no card yet', roomItems[0]===null && midBosses.length===1);
  midBosses[0].life=0; iter2(midBossTick, 0x12);
  __check('the SECOND death drops CARD7 at (0x30,0x30)',
    roomItems[0] && roomItems[0].id===0x1C && roomItems[0].x===0x30);
  card7Taken=true; buildMidBosses(83);
  __check('with CARD7 taken the Arnolds never return', midBosses.length===0);

  // ==== Fire Trooper (room 95) ====
  ftKO=false; ftSpeechDone=false; snake.x=0x40; snake.y=200; snake.life=200; snake.invulnTimer=0;
  buildMidBosses(95);
  __check('the Fire Trooper holds room 95 (life 0x1E)', midBosses.length===1 && midBosses[0].life===0x1E);
  iter2(midBossTick, 2);
  __check('the intro speech (text 108, unskippable, once)',
    gameState==='text' && textBox && textBox.id===108);
  textBox=null; gameState='play';
  iter2(midBossTick, 12);                        // walk to the 0x60 clamp, plant, throw
  __check('the flame jet sweeps (8 flames live)', ftFlames.length===8);
  midBosses[0].life=0; iter2(midBossTick, 0x12);
  __check('his death kills the flames and latches', ftKO===true && ftFlames.length===0);

  // ===== #71 tank vertical: idle beats + the long-move state =====
  currentRoom = 67; tankKO = false; buildMidBosses(67);
  const tk = midBosses[0];
  __check('#71 InitTank seeds MovingTime 0x9A, Status 0, +0.5 down',
    tk.moveTime === 0x9A && tk.tankStatus === 0 && tk.vy === 0.5);
  // AnimateTank: ANIM_CNT & 7Fh == 0 -> Status 2 (idle) for StopTime 0x28, tank frozen.
  tk.anim = 0xFF; tk.tankStatus = 0; tk.vy = 0.5; tk.moveTime = 0x50;
  const yBefore = tk.y;
  iter2(midBossTick, 1);                                  // anim wraps to 0 -> the idle beat arms
  // AnimateTank sets StopTime = 0x28 and then FALLS THROUGH to TankStatusLogic, which dispatches
  // on the freshly-set Status 2 and runs TankIdle's "dec (ix+StopTime)" in the same iteration —
  // so one tick is already consumed. The idle therefore spans 0x28 iterations in total.
  __check('#71 every 128 iterations the tank goes IDLE (StopTime 0x28, one consumed by the fall-through)',
    tk.tankStatus === 2 && tk.stopTime === 0x27, 'st=' + tk.tankStatus + ' t=' + tk.stopTime);
  let idleSpan = 1;
  while (tk.tankStatus === 2 && idleSpan < 100) { iter2(midBossTick, 1); idleSpan++; }
  __check('#71 the idle lasts exactly 0x28 iterations', idleSpan === 0x28, 'span=' + idleSpan);
  tk.anim = 1; tk.tankStatus = 0; tk.vy = 0.5; tk.moveTime = 0x50;
  tk.anim = 0xFF; tk.tankStatus = 0; tk.vy = 0.5; tk.moveTime = 0x50;
  iter2(midBossTick, 1);
  const yIdle = tk.y;
  iter2(midBossTick, 0x20);
  __check('#71 it does not move while idle', tk.y === yIdle, 'y=' + tk.y + ' was ' + yIdle);
  iter2(midBossTick, 0x10);
  __check('#71 idle restores the previous status and it moves again',
    tk.tankStatus === 0 && tk.y !== yIdle, 'st=' + tk.tankStatus + ' y=' + tk.y);
  // TankMove: an up->down flip is unconditional; a down->up flip may enter TankMoveLong.
  tk.tankStatus = 0; tk.vy = -0.5; tk.moveTime = 1; tk.anim = 1;
  iter2(midBossTick, 1);
  __check('#71 moving UP flips to DOWN after 0x32 with no randomness',
    tk.vy === 0.5 && tk.moveTime === 0x32, 'vy=' + tk.vy + ' t=' + tk.moveTime);
  // TankMoveLong: hold, then resume downward at +0.5 with MovingTime 0x9A.
  tk.tankStatus = 1; tk.moveTime = 1; tk.vy = -0.5; tk.anim = 1;
  iter2(midBossTick, 1);
  __check('#71 TankMoveLong expires back to Status 0, +0.5 down, 0x9A',
    tk.tankStatus === 0 && tk.vy === 0.5 && tk.moveTime === 0x9A);
  __check('#71 there is no hard Y clamp any more (timers bound the drift)',
    !/b\.y = 0x10;|b\.y = 0x60;/.test(String(midBossTick)));

  // ===== #72 bulldozer: no stop after the final acceleration =====
  currentRoom = 71; dozerKO = false; buildMidBosses(71);
  const dz = midBosses[0];
  dz.phase = 6; dz.vy = 0xE0 / 256; dz.timer = 1; dz.y = 100;
  const ySeq = [];
  for (let k = 0; k < 40; k++) { iter2(midBossTick, 1); ySeq.push(dz.y); }
  const stalled = ySeq.some((y, k) => k > 0 && y === ySeq[k - 1]);
  __check('#72 after the final accel (status 6) it never stops again',
    !stalled && dz.vy === 0xE0 / 256, 'stalled=' + stalled + ' vy=' + dz.vy);
  dz.y = 165;
  iter2(midBossTick, 1);
  __check('#72 it halts at Y >= 160 (StopBulldozer)', dz.vy === 0);
  // the earlier phases still stop between accelerations
  dz.phase = 0; dz.timer = 1; dz.vy = 0x60 / 256; dz.y = 40;
  iter2(midBossTick, 1);
  __check('#72 the early phases DO stop (BuldozerMoving -> Stop1)',
    dz.phase === 1 && dz.vy === 0 && dz.timer === 0x10, 'phase=' + dz.phase + ' vy=' + dz.vy);

  // ===== #73 desert air shell: accelerating drift + a lingering explosion =====
  currentRoom = 65; tankKO = false; buildShellSpawner(65); tankShells.length = 0;
  tankShells.push({ x: 100, y: 0, vx: 0, left: false, timer: 3 });
  const sh = tankShells[0];
  iter2(midBossTick, 1); const v1 = sh.vx;
  iter2(midBossTick, 1); const v2 = sh.vx;
  __check('#73 the X speed ACCELERATES by 0x18/256 each iteration',
    v1 === 0x18 / 256 && v2 === 2 * 0x18 / 256, 'v1=' + v1 + ' v2=' + v2);
  __check('#73 a left-drifting shell accelerates the other way', (() => {
    tankShells.length = 0; tankShells.push({ x: 100, y: 0, vx: 0, left: true, timer: 5 });
    iter2(midBossTick, 1); return tankShells[0].vx === -0x18 / 256;
  })());
  // On timeout it TRANSFORMS into ID_BIG_EXPLOSION rather than vanishing.
  tankShells.length = 0; tankShells.push({ x: 100, y: 100, vx: 0, left: false, timer: 1 });
  iter2(midBossTick, 1);
  __check('#73 the shell becomes a lingering explosion (Timer 0x12), not removed',
    tankShells.length === 1 && tankShells[0].explode === 0x12, JSON.stringify(tankShells[0]));
  // ...and that explosion can still hit you: |dy-16| < 24, |dx| < 24, damage 0x10.
  gameState = 'play'; snake.life = 24; snake.invulnTimer = 0;
  snake.x = tankShells[0].x; snake.y = tankShells[0].y + 0x10;
  iter2(midBossTick, 1);
  __check('#73 standing on the impact point after the burst takes 0x10',
    snake.life === 24 - 0x10, 'life=' + snake.life);
  // it expires after 0x12 iterations
  iter2(midBossTick, 0x14);
  __check('#73 the explosion expires', tankShells.length === 0);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nmidbosses.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
