// Headless verification for the attract demo (GS_DemoPlay, logic/gamedemo.asm) — specifically that
// gameplay demo 1 plays out like the original: Snake walks 5 -> (into a parked lorry) 127 -> 5 -> 1,
// then in room 1 punches the patrolling guard THREE times and takes him out, raising NO alarm.
// This locks in the room-transition fixes (EntryRoomXY + ChkExitRoom thresholds) and the guard
// first-path-point fix that issue #9 depends on. Loads the REAL web/game.js with real assets so the
// transitions, doors, collision and guard AI all run for real.
// Run: node web/demo.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ctxBase = {
  fillStyle: 0, strokeStyle: 0, lineWidth: 1, font: '', textAlign: '', textBaseline: '',
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) }),
  putImageData: () => {}, measureText: () => ({ width: 0 }),
};
const recCtx = new Proxy(ctxBase, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });
const el = () => ({ getContext: () => recCtx, addEventListener(){}, removeEventListener(){},
  classList:{add(){},remove(){}}, style:{}, blur(){}, focus(){}, width:0, height:0, innerHTML:'',
  textContent:'', setAttribute(){}, getBoundingClientRect:()=>({left:0,top:0,width:256,height:192}) });

// Filesystem-backed fetch so the real loadAssets()/setRoom() run end to end.
function fsFetch(src) {
  const p = path.join(dir, src.split('?')[0]);
  if (!fs.existsSync(p)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(), text: () => Promise.resolve('') });
  const buf = fs.readFileSync(p);
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(buf.toString('utf8'))), text: () => Promise.resolve(buf.toString('utf8')) });
}

const results = [];
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat, String, Number, Promise, queueMicrotask, Proxy, Uint8ClampedArray, Uint8Array, Float32Array, ArrayBuffer,
  requestAnimationFrame: () => 0, setInterval: () => 0, clearInterval: () => 0, setTimeout: () => 0, clearTimeout: () => 0,
  document: { getElementById: () => el(), addEventListener(){}, removeEventListener(){}, createElement: () => el(), body: el() },
  window: { addEventListener(){}, removeEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined, location: { search:'', hash:'', href:'' } },
  location: { search: '', hash: '', href: '' },
  fetch: fsFetch,
  Image: class { constructor(){ this.width = 256; this.height = 256; this.onload = null; this.onerror = null; }
    set src(_v){ if (this.onload) queueMicrotask(() => this.onload()); } get src(){ return ''; } },
  performance: { now: () => 0 }, navigator: { userAgent: 'node' },
};
sandbox.globalThis = sandbox;
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');

const test = `
globalThis.__run = async () => {
  audioCtx = null;
  await loadAssets();

  // --- Start gameplay demo 1 exactly as the idling title does (SetupDemoPlay, scene 0) ---
  demoSceneIdx = 0;
  startDemo();
  __check('gameplay demo 1 starts in the lorry yard (room 5) at (0x10,0x70)',
    demoActive && gameState === 'play' && currentRoom === 5 && snake.x === 0x10 && snake.y === 0x70);

  // Drive the real loop and watch what happens.
  const rooms = [currentRoom];
  let enteredRoom1Guards = -1, minRoom1Guards = 99, alarmEver = false;
  let punchAtX = null, punchAtY = null, punchDir = null, guardKilledByPunch = false;
  let prevGuards = guards.length, prevCtrl = snake.controlMod;
  let tick = 0; const MAX = 4000;
  while (demoActive && tick < MAX) {
    update(); tick++;
    if (currentRoom !== rooms[rooms.length - 1]) rooms.push(currentRoom);
    if (alertMode) alarmEver = true;
    if (currentRoom === 1) {
      if (enteredRoom1Guards < 0) enteredRoom1Guards = guards.length;
      if (guards.length < minRoom1Guards) minRoom1Guards = guards.length;
      // first punch in room 1: record where Snake throws it
      if (snake.controlMod === CONTROL_PUNCH && prevCtrl !== CONTROL_PUNCH && punchAtX === null) {
        punchAtX = Math.round(snake.x); punchAtY = Math.round(snake.y); punchDir = snake.dir;
      }
      // a guard removed during the punch window = punched to death
      if (guards.length < prevGuards && (snake.controlMod === CONTROL_PUNCH || prevCtrl === CONTROL_PUNCH))
        guardKilledByPunch = true;
    }
    prevGuards = guards.length; prevCtrl = snake.controlMod;
  }

  __check('the demo walks 5 -> 127 (a parked lorry) -> 5 -> 1', rooms.join(',') === '5,127,5,1', rooms.join(','));
  __check('HideGuardRoom1 leaves 2 guards on a west entry', enteredRoom1Guards === 2, 'n='+enteredRoom1Guards);
  __check('Snake punches DOWN at the lower-right (x~200,y~158) — far enough left to reach the guard',
    punchDir === 'down' && punchAtX >= 195 && punchAtX <= 205 && punchAtY >= 153 && punchAtY <= 163,
    'punch@('+punchAtX+','+punchAtY+') '+punchDir);
  __check('the three scripted punches take the guard out (2 guards -> 1)',
    guardKilledByPunch && minRoom1Guards === 1, 'min='+minRoom1Guards+' killed='+guardKilledByPunch);
  __check('no false alarm is raised during the demo', !alarmEver);
  __check('the demo ends cleanly at the 0xFF terminator -> back to the title',
    !demoActive && gameState === 'title', 'state='+gameState);
};
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+demo-test' }); }
catch (e) { console.error('HARNESS PARSE ERROR:', e); process.exit(2); }

await sandbox.__run().catch(e => { console.error('RUN ERROR:', e); process.exit(2); });

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\ndemo.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
