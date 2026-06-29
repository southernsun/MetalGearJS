// Headless verification for the recon telescope / binoculars (BinocularMode / BinocularLogic /
// DrawBinocRoom, Banks0123.asm:12256-12603). Loads the REAL web/game.js in a vm sandbox with a
// mocked DOM/canvas, strips its trailing main(), and appends asserts in the same scope. Covers:
//   - enter/exit state (ExitEquipMenu -> GAME_MODE_BINOCULARS; ExitBinocularMode -> play)
//   - #114 exit is LOCKED while a neighbour is shown (F3 only when BinoculStatus==1 / idle)
//   - peek state machine: dir trigger -> show + TimerBinocular(0x80); dead end no-ops; timer return
//   - #116 "TELESCOPE MODE" banner at txtTelescope 0C420h -> (32,196)
//   - #115 direction arrow as the ROM ArrowsChars font glyph (right 3Ch) at 0C0C4h -> (196,192)
//   - #117 full 212-line clear + black HUD-strip backdrop (no stale HUD bleed-through)
//   - #118 reticle blitted from the decoded SprTarget bitmap (white 1x1 pixels = '#' count)
// Run: node web/binoc.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fontMetaJson = JSON.parse(fs.readFileSync(path.join(dir, 'assets/font.json'), 'utf8'));

const calls = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect',
                   'transform','translate'])
    rec[m] = (...a) => calls.push({ m, a, fillStyle: rec.fillStyle, strokeStyle: rec.strokeStyle });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false; rec.filter = 'none';
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}},
                    style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  String, Number,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
src = src.replace(/\bmain\(\);\s*$/, '// main() stripped for harness\n');

const results = [];
function check(name, cond, extra='') { results.push({ name, ok: !!cond, extra }); }
sandbox.__check = check;
sandbox.__calls = calls;
sandbox.__fontMeta = fontMetaJson;

const test = `
;(function(){
  fontImg = {}; fontMeta = __fontMeta;
  // A transient snapshot stub so we never touch the room/door/item/guard build machinery.
  const fakeSnap = (n) => ({ room: n, img: null, doors: [], items: [null,null,null], guards: [] });
  binocSnapshot = fakeSnap;
  // Draw helpers irrelevant to the binoculars-specific overlays — neutralise so the draw test only
  // sees the clear / strip / banner / arrow / reticle calls.
  drawRoomItems = () => {}; drawDoors = () => {}; drawGuard = () => {};

  // --- enter (ExitEquipMenu -> GAME_MODE_BINOCULARS, BinoculStatus 0 / BinocularDir 1) ---
  currentRoom = 10; gameState = 'play';
  enterBinoculars();
  __check('enter: gameState binoculars', gameState === 'binoculars');
  __check('enter: idle on the home room', binoc && binoc.mode === 'idle' && binoc.home === 10);

  // --- #114 exit LOCKED while a neighbour is shown; allowed only when idle ---
  binoc.mode = 'show'; binoc.lookDir = 'left';
  binocOnKey('Escape');
  __check('#114 Escape ignored while peeking (BinoculStatus != 1)', gameState === 'binoculars' && binoc !== null);
  binocOnKey('q');
  __check('#114 q ignored while peeking', gameState === 'binoculars' && binoc !== null);
  binoc.mode = 'idle';
  binocOnKey('Escape');
  __check('#114 Escape exits to play when idle', gameState === 'play' && binoc === null);

  // --- peek state machine (BinocularLogic): dir trigger -> show + TimerBinocular(0x80) ---
  connections = { '10': { up: null, left: 11, right: null, down: null } };
  rooms.set(11, { img: null });
  currentRoom = 10; gameState = 'play'; enterBinoculars();
  // dir key only latches a trigger while idle (ControlsTrigger)
  binocOnKey('ArrowLeft');
  __check('idle: a dir key latches binocDirTrigger', binocDirTrigger === 'left');
  binocularsTick();
  __check('peek: idle+trigger -> show, lookDir set, timer = TIMER_BINOC',
    binoc.mode === 'show' && binoc.lookDir === 'left' && binoc.timer === TIMER_BINOC && TIMER_BINOC === 0x80,
    'mode='+binoc.mode+' t='+binoc.timer);
  __check('peek: snapshot swapped to the neighbour room', binoc.snap.room === 11);

  // a dir key is ignored mid-peek (idle only)
  binocDirTrigger = null; binocOnKey('ArrowRight');
  __check('show: dir keys do NOT latch (idle-only ControlsTrigger)', binocDirTrigger === null);

  // --- timer return: counts down, then snaps back to the home room ---
  binoc.timer = 1; binocularsTick();
  __check('timer elapsed -> back to idle on the home room',
    binoc.mode === 'idle' && binoc.lookDir === null && binoc.snap.room === 10, 'mode='+binoc.mode);

  // --- dead end: a direction with no neighbour is a no-op (GetNextRoomNum FF) ---
  binocDirTrigger = 'up'; binocularsTick();
  __check('dead-end direction stays idle (no move)', binoc.mode === 'idle');

  // --- draw overlays (#115 / #116 / #117 / #118) ---
  binoc.mode = 'show'; binoc.lookDir = 'right'; binoc.snap = fakeSnap(11);
  __calls.length = 0; drawBinoculars();
  const VH = VIEW_H, VW = VIEW_W, HH = HUD_H;
  // #117 full 212-line clear + black strip backdrop
  __check('#117 clears the FULL canvas incl HUD strip',
    __calls.some(c => c.m === 'clearRect' && c.a[2] === VW && c.a[3] === VH + HH));
  __check('#117 paints the black HUD-strip backdrop',
    __calls.some(c => c.m === 'fillRect' && c.a[1] === VH && c.a[2] === VW && c.a[3] === HH && c.fillStyle === '#000'));
  // #116 banner first glyph at (32,196)
  __check('#116 TELESCOPE MODE banner first glyph at (32,196)',
    __calls.some(c => c.m === 'drawImage' && c.a[0] === fontImg && c.a[5] === 32 && c.a[6] === 196));
  // #115 arrow = ROM glyph 3Ch (right), source-x (3Ch-first)*charW, drawn at (196,192)
  const arrowSX = (0x3C - fontMeta.first) * fontMeta.charW;
  __check('#115 right arrow glyph (3Ch) drawn at (196,192)',
    __calls.some(c => c.m === 'drawImage' && c.a[0] === fontImg && c.a[1] === arrowSX && c.a[5] === 196 && c.a[6] === 192),
    'sx='+arrowSX);
  // #118 reticle: white 1x1 pixels, count == '#' in the decoded bitmap, centred at (112,80)
  const hashCount = BINOC_RETICLE.join('').split('').filter(ch => ch === '#').length;
  const whitePx = __calls.filter(c => c.m === 'fillRect' && c.fillStyle === '#ffffff' && c.a[2] === 1 && c.a[3] === 1);
  __check('#118 reticle pixel count matches the decoded SprTarget bitmap',
    whitePx.length === hashCount, 'drawn='+whitePx.length+' expected='+hashCount);
  __check('#118 reticle is centred (top-left pixel of row0 at x0=112,y0=80)',
    whitePx.some(c => c.a[0] === 112 + 1 && c.a[1] === 80));   // row0 = '.#######...' -> first '#' at col 1

  // arrow only while peeking: idle draw has no arrow glyph
  binoc.mode = 'idle'; binoc.lookDir = null; binoc.snap = fakeSnap(10);
  __calls.length = 0; drawBinoculars();
  __check('arrow not drawn when idle (own room)',
    !__calls.some(c => c.m === 'drawImage' && c.a[0] === fontImg && c.a[5] === 196 && c.a[6] === 192));
})();
`;

vm.createContext(sandbox);
try {
  vm.runInContext(src + test, sandbox, { filename: 'game.js+test' });
} catch (e) {
  console.error('HARNESS ERROR:', e);
  process.exit(2);
}

let pass = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
