// Headless verification for Dr. Madnar (182: the Ellen-gated rescue texts 124/125) and
// Fake Madnar (189: the trap — text 109, the pitfall, the permanent latch).
// Run: node web/madnar.headless.mjs
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
  const iter2 = (fn, n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; fn(); tickCounter=(tickCounter+1)&0xff; fn(); } };

  // ==== Dr. Madnar (182): the Ellen gate ====
  currentRoom=182; buildPrisoner(182);
  __check('Dr. Madnar waits in room 182 as a prisoner', prisoner!==null);
  rescuedRooms.delete(167);
  __check('before Ellen: the "save Ellen first" text (124)', prisonerTextId(prisoner)===124);
  rescuedRooms.add(167);
  __check('after Ellen: the Metal Gear briefing (125)', prisonerTextId(prisoner)===125);

  // ==== Fake Madnar (189): the trap ====
  fakeMadnarDone=false; currentRoom=189; buildFakeMadnar(189); buildPitfalls(189);
  __check('the fake doctor waits in room 189', fakeMadnar!==null);
  snake.x=fakeMadnar.x+4; snake.y=fakeMadnar.y;
  iter2(fakeMadnarTick, 2);
  __check('the touch springs the TRAP speech (text 109) — NO pitfall during the text',
    gameState==='text' && textBox && textBox.id===109 && pitfalls.length===0,
    'pitfalls='+pitfalls.length);
  textBox=null; gameState='play';
  iter2(fakeMadnarTick, 1);
  __check('the pitfall opens AFTER the text closes (FakeMadnarTrap)',
    pitfalls.length===1 && pitfalls[0].x===0x80 && pitfalls[0].state==='opening');
  iter2(fakeMadnarTick, 0x12);
  __check('he sinks into it (1px/iteration) and vanishes', fakeMadnar===null);
  buildFakeMadnar(189);
  __check('the trap never re-arms (the RescuedArray latch)', fakeMadnar===null);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nmadnar.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
