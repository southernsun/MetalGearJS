// Headless verification for the text system (SetText/TextBoxLogic/TW_PrintChar + the decoded
// idxTexts table). Loads the REAL web/game.js + the real texts.json in a vm sandbox and checks
// the decode (texts 3/10 wording, pages), the print cadence (one char per TickCounter & 3 == 0
// ROM iteration), the print SFX, page waits + the enter icon, skip-to-next-page, the text-10
// auto-advance timer, wrapping, and the per-type window geometry.
// Run: node web/text.headless.mjs
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
    rec[m] = (...a) => calls.push({ m, a });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}}, style:{}, blur(){}, width:0, height:0 });
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat, String, Number,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(){}, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
sandbox.__texts = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8'));
sandbox.__fontMeta = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'font.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });
sandbox.__calls = calls;

const test = `
;(function(){
  textsData = __texts;
  fontImg = {}; fontMeta = __fontMeta;
  gameState = 'play';
  assets.textBuf = 'SFX23';
  const sfx = [];
  playBuf = (b) => sfx.push(b);
  // Readable decode of the raw ROM char codes (font glyph chart; see export-texts.mjs).
  const R = { 0x3a:'(c)', 0x3d:'!', 0x3e:'!!', 0x40:'-', 0x5b:'?', 0x5c:'.', 0x5e:'.', 0x5f:',', 0x60:',', 0x97:"'" };
  const rd = (s) => [...s].map((c) => R[c.charCodeAt(0)] || c).join('');

  // --- the decoded table (Tools/export-texts.mjs vs the disassembly's inline comments) ---
  const t3 = textsData[3];
  __check('text 3 = the mission briefing, 2 pages (the 0xFD page wait)',
    t3.pages.length === 2 && rd(t3.pages[0].join(' ')) === "THIS IS BIG BOSS... MISION! GAIN ACCESS TO THE ENEMY'S FORTRESS, OUTER HEAVEN."
      && rd(t3.pages[1].join(' ')) === 'TAKE ACTION NOT TO BE DISCOVERED BY THE ENEMY. ...OVER',
    JSON.stringify(t3.pages.map(p => rd(p.join(' ')))));
  __check('text 3 window config: type 3 (radio box) + prompt icon nibble', t3.cfg === 0x13, 'cfg='+t3.cfg);
  __check('text 10 = Snake calling out', rd(textsData[10].pages[0].join(' ')) === 'THIS IS SOLID SNAKE... YOUR REPLY,PLEASE.',
    rd(textsData[10].pages[0].join(' ')));
  __check('text 131 = RESCUED (prisoner)', rd(textsData[131].pages[0][0]) === 'RESCUED');

  // --- cadence: one char per TickCounter & 3 == 0 iteration (= every 8 of our 60Hz ticks) ---
  const tick = () => { tickCounter = (tickCounter + 1) & 0xff; updateTextBox(); };
  setText(3);
  __check('setText pauses play into the text mode', gameState === 'text' && textBox.id === 3);
  // TW_PrintChar3 mask 3 at the FULL tick rate (text mode runs light — no TickInProgress
  // halving): one char per 4 ticks, ~15 chars/s.
  tickCounter = 0; sfx.length = 0;
  for (let i = 0; i < 4; i++) tick();
  __check('exactly 1 char after 4 ticks (mask 3, full tick rate)', textBox.shown === 1, 'shown='+textBox.shown);
  __check('print SFX per visible char', sfx.length === 1 && sfx[0] === 'SFX23', 'sfx='+sfx.length);
  for (let i = 0; i < 4 * 4; i++) tick();
  __check('5 chars after 20 ticks ("THIS "), space silent', textBox.shown === 5 && sfx.length === 4,
    'shown='+textBox.shown+' sfx='+sfx.length);

  // --- page wait + the blinking enter icon (cfg high nibble; char 0x3F at PromptXY) ---
  const page0len = textBox.pages[0].reduce((n, l) => n + l.length, 0);
  let g0 = 0;
  while (!textBox.wait && g0++ < 2000) tick();
  __check('page 0 printed -> waiting', textBox.wait === true && textBox.page === 0 && textBox.shown === page0len,
    'shown='+textBox.shown+'/'+page0len);
  const ARROW_SX = (0x3F - fontMeta.first) * fontMeta.charW;
  tickCounter = 0x20; __calls.length = 0; drawTextWindow();
  const icon = () => __calls.some(c => c.m === 'drawImage' && c.a[0] === fontImg && c.a[1] === ARROW_SX
                                       && c.a[5] === 0xD4 && c.a[6] === 0xA8);
  __check('enter icon blinks at PromptXY (212,168) while waiting', icon());
  tickCounter = 0; __calls.length = 0; drawTextWindow();
  __check('enter icon off-phase', !icon());
  // window geometry: type 3 = the radio text box at (32,116) size 200x72 (TextBoxXYSize)
  __calls.length = 0; drawTextWindow();
  __check('type-3 window box at ROM geometry', __calls.some(c => c.m === 'fillRect'
    && c.a[0] === 0x20 && c.a[1] === 0x74 && c.a[2] === 0xC8 && c.a[3] === 0x48));
  __check('white border frames the box (DrawTextBoxIn3)', __calls.some(c => c.m === 'strokeRect'
    && c.a[0] === 0x20 + 0.5 && c.a[1] === 0x74 + 0.5));

  dismissText();
  __check('dismiss advances to page 1', textBox.page === 1 && textBox.shown === 0 && !textBox.wait);
  dismissText();
  __check('skip mid-print jumps past the LAST page -> closes (SkipText)', textBox === null && gameState === 'play');

  // --- text 10 auto-advances after 0x60 iterations (TW_Wait, Banks0123.asm:8175) ---
  setText(10);
  const len10 = textBox.pages[0].reduce((n, l) => n + l.length, 0);
  tickCounter = 0;
  while (textBox && textBox.shown < len10) tick();
  let guard_ = 0;
  while (textBox && guard_++ < 0x70 * 2 + 8) tick();
  __check('text 10 dismisses itself on the wait timer', textBox === null && gameState === 'play', 'iters='+guard_);

  // --- wrap: a synthetic long line wraps at TextX + clearNX - 8 and steps +12 per line ---
  textsData[999] = { cfg: 3, pages: [[ 'A'.repeat(40) ]] };
  setText(999);
  textBox.shown = 40;
  __calls.length = 0; drawTextWindow();
  const ys = [...new Set(__calls.filter(c => c.m === 'drawImage' && c.a[0] === fontImg).map(c => c.a[6]))];
  __check('long line wraps onto +12px rows', ys.length >= 2 && ys[1] - ys[0] === 12, JSON.stringify(ys));
  dismissText();
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
