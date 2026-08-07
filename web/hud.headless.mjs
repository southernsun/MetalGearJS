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

const H = {};              // captured window listeners, exposed to the sandbox as __H
const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, URLSearchParams, isNaN, parseInt, parseFloat,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => el(), addEventListener(){} },
  window: { addEventListener(t, fn) { (H[t] ||= []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  location: { search: '', hash: '', href: '' },
  fetch: () => Promise.reject(new Error('no fetch in harness')),
  Image: class { set src(_) {} },
  performance: { now: () => 0 },
};
sandbox.__H = H;           // captured window keydown listeners (see the input checks below)
sandbox.globalThis = sandbox;

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
src = src.replace(/\bmain\(\);\s*$/, '// main() stripped for harness\n');

// Asserts appended in the SAME scope (so they can see snake/assets/update/draw/etc.).
const results = [];
function check(name, cond, extra='') { results.push({ name, ok: !!cond, extra }); }
// CHANGELOG.md's newest entry, so the version constants and the changelog cannot drift apart.
const __clog = fs.readFileSync(path.join(dir, '..', 'CHANGELOG.md'), 'utf8');
const __clogTop = (__clog.match(/^##\s+(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})/m) || []).slice(1);
sandbox.__clogVersion = __clogTop[0] || null;
sandbox.__clogDate = __clogTop[1] || null;
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

  // ===== #81 small weapon icons sit +8 in the HUD box =====
  // DrawWeaponHUD (Banks0123.asm:2110-2120): base "ld de,0A0C2h" = (160,194); a 16x16 weapon
  // (ids 5-7) does "ld a,8 / add a,d" -> X = 168.
  const iconX = (wid) => {
    selectedWeapon = wid; weapons.set(wid, 5); __calls.length = 0; renderHud();
    const c = __calls.find((c) => c.m === 'drawImage' && c.a[0] === hudIcons && c.a[6] === 194);
    return c ? c.a[5] : null;
  };
  __check('#81 a 32x16 weapon icon draws at x=160', iconX(1) === 160, 'x=' + iconX(1));
  __check('#81 a 16x16 weapon (id 5) draws at x=168', iconX(5) === 168, 'x=' + iconX(5));
  __check('#81 ids 6 and 7 are offset too', iconX(6) === 168 && iconX(7) === 168);

  // ===== #44 the keycard identification number in the item box =====
  // DrawItemHUD's tail: DrawChar at "ld de,0F0C8h" — an IMMEDIATE, so D=0F0h=X=240, E=0C8h=Y=200.
  // The stored amount is the card's id number (ItemTakeAmount 31h..38h); the digit is its low nibble.
  const cardDigitAt = (item, amount) => {
    selectedItem = item; if (amount != null) items.set(item, amount);
    __calls.length = 0; renderHud();
    return __calls.filter((c) => c.m === 'drawImage' && c.a[0] === fontImg && c.a[5] === 240 && c.a[6] === 200);
  };
  __check('#44 CARD1 draws its number at (240,200)', cardDigitAt(SELECTED_CARD1, 0x31).length === 1);
  __check('#44 CARD4 draws too', cardDigitAt(SELECTED_CARD1 + 3, 0x34).length === 1);
  items.set(SELECTED_RATION, 3);
  __check('#44 a NON-card item draws no number', cardDigitAt(SELECTED_RATION, 3).length === 0);
  selectedItem = 0;
  __check('#44 no item selected draws no number', cardDigitAt(0, null).length === 0);

  // ===== Versioning =====
  // One source of truth (APP_VERSION/APP_BUILD) surfaced in the page footer, the console and every
  // bug report. These checks exist so a bump can't half-land.
  const vParts = APP_VERSION.split('.');
  __check('version: APP_VERSION is semver-ish (three numeric parts)',
    vParts.length === 3 && vParts.every((x) => x.length > 0 && [...x].every((c) => c >= '0' && c <= '9')),
    APP_VERSION);
  const bParts = APP_BUILD.split('-');
  __check('version: APP_BUILD is an ISO date (YYYY-MM-DD)',
    bParts.length === 3 && bParts[0].length === 4 && bParts[1].length === 2 && bParts[2].length === 2 &&
    bParts.every((x) => [...x].every((c) => c >= '0' && c <= '9')),
    APP_BUILD);
  __check('version: the composed string carries both',
    APP_VERSION_FULL.includes(APP_VERSION) && APP_VERSION_FULL.includes(APP_BUILD), APP_VERSION_FULL);
  // showVersion() must tolerate a missing element (and never throw) — it runs before the game loop.
  {
    let wrote = null;
    const realGet = document.getElementById;
    document.getElementById = (id) => (id === 'version' ? { set textContent(v) { wrote = v; } } : realGet(id));
    showVersion();
    __check('version: showVersion stamps #version with the full string', wrote === APP_VERSION_FULL, String(wrote));
    document.getElementById = () => null;
    let threw = false;
    try { showVersion(); } catch (e) { threw = true; }
    __check('version: showVersion is safe when #version is absent', !threw);
    document.getElementById = realGet;
  }

  // ===== The changelog is tied to the version =====
  __check('changelog: it has a parseable newest entry', __clogVersion !== null && __clogDate !== null,
    String(__clogVersion) + ' / ' + String(__clogDate));
  __check('changelog: its newest version matches APP_VERSION',
    __clogVersion === APP_VERSION, __clogVersion + ' vs ' + APP_VERSION);
  __check('changelog: its newest date matches APP_BUILD',
    __clogDate === APP_BUILD, __clogDate + ' vs ' + APP_BUILD);
  // ==== Input bindings: the weapon number keys (user asked whether 1-7/0 still work) ==========
  // The ROM selects weapons with F1-F7 -> SelectWeapon; browsers reserve the F-keys, so the port
  // binds 1-7 (and 0 = holster). SelectWeapon IGNORES a weapon you do not own, which is why the
  // keys look dead on a fresh boot -- only the handgun responds until ?arsenal or real pickups.
  // Pinned here so "are the number keys broken?" is answerable by the suite, not by guesswork.
  {
    const press = (key) => {
      const ev = { key, repeat: false, preventDefault(){}, stopImmediatePropagation(){}, stopPropagation(){} };
      for (const fn of (__H.keydown || [])) fn(ev);
    };
    gameState = 'play'; equipRemoved = false;
    weapons.clear(); for (let i = 1; i <= 7; i++) weapons.set(i, 30);
    selectedWeapon = 1;
    press('3'); __check('weapon key 3 selects weapon 3', selectedWeapon === 3, 'sel='+selectedWeapon);
    press('7'); __check('weapon key 7 selects weapon 7', selectedWeapon === 7, 'sel='+selectedWeapon);
    press('0'); __check('key 0 holsters (selectedWeapon 0)', selectedWeapon === 0, 'sel='+selectedWeapon);
    press('1'); __check('weapon key 1 selects the handgun', selectedWeapon === 1, 'sel='+selectedWeapon);
    // SelectWeapon's ownership gate — NOT a bug: the ROM does the same.
    weapons.clear(); weapons.set(1, 30); selectedWeapon = 1;
    press('5');
    __check('an UNOWNED weapon key is ignored (ROM SelectWeapon)', selectedWeapon === 1, 'sel='+selectedWeapon);
    // EquipRemoved (after capture) blocks selection entirely.
    weapons.set(5, 30); equipRemoved = true; selectedWeapon = 1;
    press('5');
    __check('EquipRemoved blocks weapon selection', selectedWeapon === 1, 'sel='+selectedWeapon);
    equipRemoved = false;
    // F2 toggles the room readout; ?showroom sets the same flag at boot.
    const r0 = devShowRoom;
    press('F2'); __check('F2 toggles the room-number readout', devShowRoom === !r0);
    press('F2'); __check('F2 toggles it back', devShowRoom === r0);
    // The dev-option registry is the single source for ?help and the console banner.
    __check('every DEV_OPTIONS entry has a key and a description',
      DEV_OPTIONS.length >= 12 && DEV_OPTIONS.every((o) => o.length === 2 && o[0] && o[1]),
      'n='+DEV_OPTIONS.length);
    __check('DEV_KEYS documents the 1-7 weapon binding and its ownership rule',
      DEV_KEYS.some((k) => k[0] === '1 - 7' && /do NOT own/.test(k[1])));
    __check('DEV_OPTIONS documents ?showroom and ?help',
      DEV_OPTIONS.some((o) => o[0] === '?showroom') && DEV_OPTIONS.some((o) => o[0] === '?help'));
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
