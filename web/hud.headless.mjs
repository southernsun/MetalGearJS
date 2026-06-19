// Headless verification for player-hud (task 6.1). Loads the REAL web/game.js in a vm sandbox with
// mocked DOM/canvas, strips its trailing main() (so no async asset fetch runs), and appends asserts
// in the same lexical scope so they can read game.js's const/let state. Run: node web/hud.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const atlas = JSON.parse(fs.readFileSync(path.join(dir, 'assets/snake.json'), 'utf8'));
const iconAtlas = JSON.parse(fs.readFileSync(path.join(dir, 'assets/hud-icons.json'), 'utf8'));
const fontMetaJson = JSON.parse(fs.readFileSync(path.join(dir, 'assets/font.json'), 'utf8'));

// Recording 2D context: methods log into `calls`; style props are settable no-ops.
const calls = [];
function makeCtx() {
  const rec = {};
  for (const m of ['scale','clearRect','fillRect','strokeRect','drawImage','fillText','beginPath',
                   'moveTo','lineTo','closePath','fill','stroke','save','restore','clip','rect',
                   'transform','translate'])
    rec[m] = (...a) => calls.push({ m, a, fillStyle: rec.fillStyle, strokeStyle: rec.strokeStyle });
  rec.measureText = () => ({ width: 0 });
  rec.fillStyle = '#000'; rec.strokeStyle = '#000'; rec.font = ''; rec.lineWidth = 1;
  rec.textAlign = 'left'; rec.textBaseline = 'top'; rec.imageSmoothingEnabled = false;
  return rec;
}
const recCtx = makeCtx();
const el = () => ({ getContext: () => recCtx, addEventListener(){}, classList:{add(){},remove(){}},
                    style:{}, blur(){}, width:0, height:0 });

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

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
src = src.replace(/\bmain\(\);\s*$/, '// main() stripped for harness\n');

// Asserts appended in the SAME scope (so they can see snake/assets/update/draw/etc.).
const results = [];
function check(name, cond, extra='') { results.push({ name, ok: !!cond, extra }); }
sandbox.__check = check;
sandbox.__atlas = atlas; sandbox.__iconAtlas = iconAtlas; sandbox.__calls = calls;
sandbox.__fontMeta = fontMetaJson;

const test = `
;(function(){
  // Wire minimal assets and a clean play state.
  assets.atlas = __atlas; assets.sheet = {}; assets.room = null;
  hudIcons = {}; hudIconsAtlas = __iconAtlas;
  fontImg = {}; fontMeta = __fontMeta;     // so drawText/drawStar blit (recorded as drawImage)
  guard = null; bullets.length = 0; playerShots.length = 0; gameState = 'play';
  snake.dir = 'down'; snake.state = 'idle'; snake.anim = ANIM_NORMAL;
  weapons.set(HAND_GUN, 3); selectedWeapon = HAND_GUN;   // real inventory: own the handgun w/ ammo
  const frameByX = {}; for (const k in __atlas.frames) frameByX[__atlas.frames[k].x] = k;
  function lastSnakeKey() {
    for (let i = __calls.length - 1; i >= 0; i--) {
      const c = __calls[i];
      if (c.m === 'drawImage' && c.a[0] === assets.sheet) return frameByX[c.a[1]];
    }
    return null;
  }

  // --- Ammo: decrement on fire, block + no shot at 0 (Weapons-inventory ammo) ---
  playerShots.length = 0;
  fireQueued = true; chkWeaponShot();
  __check('fire spawns a shot', playerShots.length === 1);
  __check('ammo decrements on fire', weapons.get(HAND_GUN) === 2, 'ammo=' + weapons.get(HAND_GUN));
  weapons.set(HAND_GUN, 0); const before = playerShots.length;
  fireQueued = true; chkWeaponShot();
  __check('no shot fired at 0 ammo', playerShots.length === before, 'len=' + playerShots.length);

  // --- Red flash: damage- frame on even ticks while invuln, normal otherwise ---
  snake.invulnTimer = 10;
  tickCounter = 0; __calls.length = 0; draw();      // even tick + invuln -> red
  const kEvenHurt = lastSnakeKey();
  tickCounter = 1; __calls.length = 0; draw();      // odd tick + invuln -> normal
  const kOddHurt = lastSnakeKey();
  snake.invulnTimer = 0; tickCounter = 0; __calls.length = 0; draw();  // no invuln -> normal
  const kNoHurt = lastSnakeKey();
  __check('flash: red frame on even tick while invuln', kEvenHurt && kEvenHurt.startsWith('damage-'), 'key=' + kEvenHurt);
  __check('flash: normal frame on odd tick', kOddHurt && !kOddHurt.startsWith('damage-'), 'key=' + kOddHurt);
  __check('flash: normal frame when not invuln', kNoHurt && !kNoHurt.startsWith('damage-'), 'key=' + kNoHurt);

  // --- Life bar width tracks Life against 0x30 ---
  snake.life = 24; __calls.length = 0; renderHud();
  const redFill = __calls.find(c => c.m === 'fillRect' && c.fillStyle === '#ff0000');
  __check('life bar fill present', !!redFill);
  __check('life bar width == Life (24)', redFill && Math.round(redFill.a[2]) === 24, 'w=' + (redFill && redFill.a[2]));
  snake.life = LIFE_BAR_SCALE + 10; __calls.length = 0; renderHud();   // clamp at 48
  const redFull = __calls.find(c => c.m === 'fillRect' && c.fillStyle === '#ff0000');
  __check('life bar clamps at 48', redFull && Math.round(redFull.a[2]) === LIFE_BAR_SCALE, 'w=' + (redFull && redFull.a[2]));
  snake.life = 1; __calls.length = 0; renderHud();    // empty at <=1
  const redEmpty = __calls.find(c => c.m === 'fillRect' && c.fillStyle === '#ff0000');
  __check('life bar empty when Life<=1', !redEmpty);

  // --- CLASS: class+1 stars (the ROM star glyph blitted from fontMeta.starX) ---
  for (const cls of [0, 2, 3]) {
    snake.class = cls; snake.life = 24; __calls.length = 0; renderHud();
    const stars = __calls.filter(c => c.m === 'drawImage' && c.a[0] === fontImg && c.a[1] === fontMeta.starX).length;
    __check('class ' + cls + ' -> ' + (cls+1) + ' stars', stars === cls + 1, 'stars=' + stars);
  }
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
