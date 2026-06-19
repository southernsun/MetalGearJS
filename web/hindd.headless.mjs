// Headless verification for Hind D (room 50): the stationary body, the 5-bullet aimed
// bursts on the 5/0x11 cadence, the 0x64 life, and the permanent KO + wreck.
// Run: node web/hindd.headless.mjs
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

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  gameState='play'; assets.collision=C(); actorsData=null; guardsData={};
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  snake.x=0x80; snake.y=0xB0; snake.life=200;
  currentRoom=50; buildHindD(50);
  __check('Hind D holds room 50 with 0x64 life', hindD!==null && hindD.life===0x64);
  bullets.length=0;
  iter2(hindDTick, 25);
  __check('a burst of FIVE aimed bullets, one every 5 iterations (then the 0x11 pause)',
    bullets.length===4 && hindD.bursting===false, 'n='+bullets.length+' bursting='+hindD.bursting);
  __check('bullets originate AT the actor (0x80,0x58) — hindd.asm:72-75',
    bullets[0].x===0x80 && bullets[0].y===0x58, 'xy='+bullets[0].x+','+bullets[0].y);
  // the explosive box is its own ActorShapeExpl 5 (-0x20,0x10,0,0x10): a grenade
  // bursting under the cockpit hits; one at Snake's feet far below does not
  __check('a grenade burst in the shape-5 box hits the craft',
    shotTarget({x:0x80, y:0x58-0x18}, true)===hindD && shotTarget({x:0x80, y:0xB0}, true)!==hindD);
  // weapondamage.asm ID 0x26: only the grenade launcher (5) — bullets/rockets do 0
  __check('only the grenade launcher damages it (5/hit; 20 grenades for 0x64)',
    weaponDamage(hindD, 3)===5 && weaponDamage(hindD, 1)===0 && weaponDamage(hindD, 4)===0);
  // a REAL lob: Snake below the pad facing up — 23 moves of 3 from (y-16), bursting at
  // ground+8 = inside the shape-5 box. The full pipeline must take 5 off the craft.
  weapons.set(3, 10); selectedWeapon=3;
  snake.x=0x80; snake.y=0x94; snake.dir='up';
  playerShots.length=0;
  const life0=hindD.life;
  fireGrenade();
  for (let i=0;i<0x20;i++) { tickCounter=(tickCounter+1)&0xff; updatePlayerShots(); }
  __check('a lobbed grenade from below the pad takes 5 off (full pipeline)',
    hindD.life===life0-5, 'life='+hindD.life+' was '+life0);
  const n0=bullets.length;
  iter2(hindDTick, 0x11 + 26);
  __check('the next burst follows the 0x11 wait', bullets.length>n0, 'n='+bullets.length);
  hindD.life=0; iter2(hindDTick, 2);
  __check('the kill runs the BossDefeatedLogic explosion phases first',
    hindD!==null && hindD.dying!=null && hindDKO===false, 'dying='+(hindD&&hindD.dying));
  iter2(hindDTick, 0x10);
  __check('after 0x10 iterations the kill latches (BossHindD_KO) and the wreck replaces the body',
    hindDKO===true && hindD===null);
  buildHindD(50);
  __check('room 50 stays cleared forever', hindD===null);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nhindd.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
