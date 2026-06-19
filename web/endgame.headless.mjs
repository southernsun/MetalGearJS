// Headless verification for the endgame: the destruction countdown (armed by Metal
// Gear's death, the HUD digits slot, the cigarettes bonus, the zero-kill), and the
// radio-text event flags (117/118/138). Run: node web/endgame.headless.mjs
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

  // ==== Metal Gear's death arms the countdown ====
  currentRoom=118; mgDestroyed=false; buildMetalGear(118); cameras=[];
  const PLAY = [...MG_BOMB_ORDER].reverse();
  for (const s of PLAY) chkMetalGearBomb({ x: s===1 ? 0x70 : 0x90, y: 0x70 });
  __check('Metal Gear death arms the 3000-unit self-destruct',
    destructionOn===true && destructTimer===3000);

  // ==== The countdown ticks and kills at zero ====
  iter2(destructTick, 10);
  __check('the countdown ticks per iteration', destructTimer===2990, 't='+destructTimer);
  // cigarettes buy 2000
  items.set(SELECTED_CIGARETTES, 1); selectedItem = SELECTED_CIGARETTES;
  chkUseItem();
  __check('cigarettes during the countdown add 2000 and are consumed',
    destructTimer===4990 && !items.has(SELECTED_CIGARETTES));
  snake.life=24; snake.invulnTimer=0;
  destructTimer=1;
  iter2(destructTick, 1);
  __check('zero takes Snake with the base', (snake.life===0 || gameState==='dead') && destructionOn===false);

  // ==== Radio-text event flags (TextBoxExit) ====
  gameState='play'; jeniOpenDoor=false; jeniRocket=false; schneiderCaptured=false;
  setText(118, 0); advanceTextPage(textBox);
  let g=0; while (textBox && g++<10) advanceTextPage(textBox);
  __check('reading text 118 opens Jennifer\\'s compass-door flag', jeniOpenDoor===true);
  setText(117, 0); g=0; while (textBox && g++<10) advanceTextPage(textBox);
  __check('reading text 117 sets the rocket promise', jeniRocket===true);
  setText(138, 0); g=0; while (textBox && g++<10) advanceTextPage(textBox);
  __check('reading text 138 marks Schneider captured', schneiderCaptured===true);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nendgame.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
