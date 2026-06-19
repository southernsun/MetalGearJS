// Headless verification for the moving-lorry ride (GameMode 5) + the desert lorry ambush.
// Run: node web/lorry.headless.mjs
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
  gameState='play'; assets.collision=C(); guardsData={};
  rooms.set(173, { img:null, collision:C() }); rooms.set(104, { img:null, collision:C() });
  rooms.set(5, { img:null, collision:C() });
  manifest={start:173};
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== The ride ====
  lorryTextDone=false;
  setRoom(173);
  __check('entering lorry 173 starts the ride (GameMode 5, 0x90 iterations)',
    gameState==='lorry' && lorryCnt===0x90);
  iter2(lorryTick, 2);
  __check('the I-GOOFED text (91, once per game)', gameState==='text' && textBox && textBox.id===91);
  textBox=null; gameState='lorry';
  lorryCnt = 0x40; tickCounter = 0;
  __check('the screen wobbles through the VertScrollOffset table', lorryShakeY()!==0 || LORRY_WOBBLE.includes(lorryShakeY()));
  iter2(lorryTick, 0x40);
  __check('the ride ends back in play', gameState==='play');
  lorryTextDone===true;
  setRoom(173);
  __check('a second ride skips the text (LorryMovTextF)', gameState==='lorry');
  iter2(lorryTick, 1);
  __check('no repeat text', gameState==='lorry');
  lorryCnt=1; iter2(lorryTick, 1);

  // ==== The desert lorry ambush (room 104): hidden pop-out shooters (LorryShooterLogic) ====
  gameState='play'; stopAlarm();
  setRoom(104);
  __check('room 104 spawns FOUR HIDDEN lorry shooters (no global alarm)',
    guards.length===4 && guards.every(g=>g.lorryShooter && g.lorryHidden && g.lorryStat===0) && alertMode===false,
    'n='+guards.length);
  const sh=guards[0]; snake.x=sh.x; snake.y=sh.y+0x40;
  // LorryShooterWalkOut (status 2): walks down a step, then stops, faces the player and shoots.
  sh.lorryStat=2; sh.lorrySpeedY=2; sh.lorryWait=1; sh.lorryHidden=false; bullets.length=0; const y0=sh.y;
  iter2(()=>lorryShooterLogic(sh),1);
  __check('LorryShooterWalkOut: moves down, then stops and shoots', sh.y>y0 && sh.lorryStat===3 && bullets.length>0,
    'y0='+y0+' y='+sh.y+' st='+sh.lorryStat);
  // WaitOut (3) -> WalkIn (4, heads up)
  sh.lorryWait=1; iter2(()=>lorryShooterLogic(sh),1);
  __check('LorryShooterWaitOut -> WalkIn (heads back up at -2)', sh.lorryStat===4 && sh.lorrySpeedY===-2);
  // WalkIn (4) -> hidden think (0)
  sh.lorryWait=1; iter2(()=>lorryShooterLogic(sh),1);
  __check('LorryShooterWalkIn ends HIDDEN in the think state', sh.lorryStat===0 && sh.lorryHidden===true);
  // a hidden shooter ignores bullets (COLLISION_CFG 0)
  const before=guards.length; playerShots.length=0;
  playerShots.push({x:sh.x,y:sh.y,vx:0,vy:0,range:5,type:1,status:0,dir:'down',yAlt:sh.y});
  updatePlayerShots();
  __check('a hidden lorry shooter ignores bullets', guards.length===before && sh.life===GUARD_LIFE);

  // ==== Lorry guards (rooms 5/7, GuardLorryLogic): emerge -> patrol -> return, set/clear the flag ==
  gameState='play'; stopAlarm(); guardExitedLorry=[false,false,false];
  setRoom(5); snake.x=10; snake.y=10;
  const lgd = guards.find(g=>g.lorry);
  __check('room 5 lorry guard starts HIDDEN in the lorry (status 0, idx 0)',
    lgd && lgd.lorryHidden===true && lgd.lorryStat===0 && lgd.lorryIdx===0);
  lgd.lorryWait=1; iter2(()=>lorryGuardLogic(lgd),1);
  __check('the emerge timer expires -> walks out + sets Guard1ExitedLorry',
    lgd.lorryStat===1 && lgd.lorryHidden===false && guardExitedLorry[0]===true);
  lgd.lorryWait=1; iter2(()=>lorryGuardLogic(lgd),1);
  __check('emerge done -> patrolling (status 2)', lgd.lorryStat===2);
  // walking out + the alarm transforms it into a chaser (GuardLorryWalk -> TransformAlertGuard)
  alertMode=true; lgd.state='patrol'; lgd.lorryStat=2; lgd.lorryHidden=false; tickCounter=0;
  lorryGuardLogic(lgd);
  __check('a lorry guard OUT during an alarm becomes an alert chaser', lgd.state==='alert');
  alertMode=false; stopAlarm();
  // GuardEnterLorry: status 3 walks up, hides, clears the flag
  lgd.state='patrol'; lgd.lorryStat=3; lgd.lorryWait=1; guardExitedLorry[0]=true;
  iter2(()=>lorryGuardLogic(lgd),1);
  __check('GuardEnterLorry: back in the lorry, hidden, Guard1ExitedLorry cleared',
    lgd.lorryStat===0 && lgd.lorryHidden===true && guardExitedLorry[0]===false);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nlorry.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
