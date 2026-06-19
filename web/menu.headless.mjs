// Headless verification for the equipment menus (DrawWeaponMenu / DrawEquipMenu). Loads the REAL
// web/game.js in a vm sandbox with a mocked DOM/canvas, strips its trailing main(), and appends asserts
// in the same scope. Verifies the faithful slot geometry (menuSlotPos), the title/OPTION/arrow draws,
// the SelectIdx grid navigation with select-on-move + edge clamps + hold-repeat (CtrlMenuWeapon /
// MenuEquipLogic), and ChkUseItem (Fire in the item menu). Run: node web/menu.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const atlas = JSON.parse(fs.readFileSync(path.join(dir, 'assets/snake.json'), 'utf8'));
const iconAtlas = JSON.parse(fs.readFileSync(path.join(dir, 'assets/hud-icons.json'), 'utf8'));
const fontMetaJson = JSON.parse(fs.readFileSync(path.join(dir, 'assets/font.json'), 'utf8'));
const namesJson = JSON.parse(fs.readFileSync(path.join(dir, 'assets/names.json'), 'utf8'));

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
sandbox.__atlas = atlas; sandbox.__iconAtlas = iconAtlas; sandbox.__calls = calls;
sandbox.__fontMeta = fontMetaJson; sandbox.__names = namesJson;

const test = `
;(function(){
  assets.atlas = __atlas; assets.sheet = {}; assets.room = null;
  hudIcons = {}; hudIconsAtlas = __iconAtlas;
  fontImg = {}; fontMeta = __fontMeta; names = __names;
  gameState = 'play';
  // Real inventory: seed a full loadout (weapons 1-7 + suppressor flag = 8 menu entries, as the
  // old seeded-set tests assumed) and a few items in pickup order.
  for (let w = 1; w <= 7; w++) weapons.set(w, 0);
  invSuppressor = true;
  items.set(SELECTED_BOX, 1); items.set(SELECTED_OXYGEN, 1);
  items.set(SELECTED_RATION, 2); items.set(SELECTED_CARD1, 0x31);

  const ARROW_SX = (0x3C - fontMeta.first) * fontMeta.charW;   // arrow glyph source-x in font.png (=96)
  function eq(o, x) { return JSON.stringify(o) === JSON.stringify(x); }

  // --- menuSlotPos: weapon columns (24 / 136) + suppressor (96,168), rows +24 from 40; name +32 ---
  const w0 = menuSlotPos('weapon', 0), w3 = menuSlotPos('weapon', 3),
        w4 = menuSlotPos('weapon', 4), w6 = menuSlotPos('weapon', 6), w7 = menuSlotPos('weapon', 7);
  __check('weapon slot 0 @ (24,40) name 56 arrow (16,44) ammo (104,48)',
    w0.ix===24 && w0.iy===40 && w0.nameX===56 && w0.arrowX===16 && w0.arrowY===44 && w0.ammoX===104 && w0.ammoY===48, JSON.stringify(w0));
  __check('weapon slot 3 (left col bottom) @ (24,112)', w3.ix===24 && w3.iy===112, JSON.stringify(w3));
  __check('weapon slot 4 (right col top) @ (136,40)', w4.ix===136 && w4.iy===40, JSON.stringify(w4));
  __check('weapon slot 6 (right col) @ (136,88)', w6.ix===136 && w6.iy===88, JSON.stringify(w6));
  __check('weapon slot 7 (suppressor) @ (96,168)', w7.ix===96 && w7.iy===168, JSON.stringify(w7));

  // --- menuSlotPos: item columns (24 / 104 / 184) of 9/9/7, rows +16 from 40; name +16 ---
  const i0 = menuSlotPos('item', 0), i8 = menuSlotPos('item', 8), i9 = menuSlotPos('item', 9),
        i17 = menuSlotPos('item', 17), i18 = menuSlotPos('item', 18), i24 = menuSlotPos('item', 24);
  __check('item slot 0 @ (24,40) name 40 arrow (16,44)', i0.ix===24 && i0.iy===40 && i0.nameX===40 && i0.arrowX===16 && i0.arrowY===44, JSON.stringify(i0));
  __check('item slot 8 (col1 bottom) @ (24,168)', i8.ix===24 && i8.iy===168, JSON.stringify(i8));
  __check('item slot 9 (col2 top) @ (104,40)', i9.ix===104 && i9.iy===40, JSON.stringify(i9));
  __check('item slot 17 (col2 bottom) @ (104,168)', i17.ix===104 && i17.iy===168, JSON.stringify(i17));
  __check('item slot 18 (col3 top) @ (184,40)', i18.ix===184 && i18.iy===40, JSON.stringify(i18));
  __check('item slot 24 (col3 bottom) @ (184,136)', i24.ix===184 && i24.iy===136, JSON.stringify(i24));

  // --- drawMenu (weapon): title @ y16, OPTION @ y144, arrow glyph drawn, HUD strip present ---
  selectedWeapon = HAND_GUN; selectedItem = SELECTED_BOX;
  gameState="play"; openMenu('weapon'); __calls.length = 0; drawMenu();
  const fontAt = (y) => __calls.some(c => c.m==='drawImage' && c.a[0]===fontImg && c.a[6]===y);
  const arrowDrawn = __calls.some(c => c.m==='drawImage' && c.a[0]===fontImg && c.a[1]===ARROW_SX);
  const hudStrip = __calls.some(c => c.m==='fillRect' && c.a[1]===VIEW_H && c.a[3]===HUD_H);
  __check('weapon title row drawn at y=16', fontAt(16));
  __check('weapon OPTION label drawn at y=144', fontAt(144));
  __check('weapon arrow cursor glyph drawn', arrowDrawn);
  __check('HUD strip kept on screen in menu', hudStrip);

  // --- drawMenu (item): title @ y16, NO OPTION row (nothing at y=144) ---
  gameState="play"; openMenu('item'); __calls.length = 0; drawMenu();
  __check('item title row drawn at y=16', fontAt(16));
  __check('item menu has no OPTION (y=144 clear)', !fontAt(144));

  // --- SFX intercept: playCursor/playUseItem route through the playBuf function binding ---
  assets.cursorBuf = 'SFX20'; assets.useItemBuf = 'SFX21';
  const sfx = [];
  playBuf = (b) => sfx.push(b);

  // --- weapon grid (CtrlMenuWeapon, Banks0123.asm:11387): SelectIdx 1-7, clamps, select-on-move ---
  selectedWeapon = HAND_GUN; gameState='play'; openMenu('weapon');
  __check('weapon cursor seeds on the selected weapon (slot 1)', selectIdx === 1, 'idx='+selectIdx);
  menuMove('up');
  __check('weapon up clamped at slot 1: no move, no SFX, no re-select',
    selectIdx === 1 && selectedWeapon === HAND_GUN && sfx.length === 0, 'idx='+selectIdx);
  menuMove('down');
  __check('weapon down 1->2 selects the slot-2 weapon immediately + SFX 0x20',
    selectIdx === 2 && selectedWeapon === menuEntries[1] && eq(sfx, ['SFX20']),
    'idx='+selectIdx+' sel='+selectedWeapon);
  menuMove('right');
  __check('weapon right 2->6 (column jump) selects the slot-6 weapon',
    selectIdx === 6 && selectedWeapon === menuEntries[5], 'idx='+selectIdx);
  menuMove('right');
  __check('weapon right clamped in the right column (idx>=4)', selectIdx === 6, 'idx='+selectIdx);
  menuMove('down'); menuMove('down');
  __check('weapon down clamped at slot 7 (right column bottom; suppressor/OPTION unreachable)',
    selectIdx === 7, 'idx='+selectIdx);
  menuMove('left');
  __check('weapon left 7->3', selectIdx === 3 && selectedWeapon === menuEntries[2], 'idx='+selectIdx);
  closeMenu();
  __check('closing keeps the highlighted entry (no confirm press)',
    gameState === 'play' && selectedWeapon === menuEntries[2], 'sel='+selectedWeapon);

  // --- the weapon menu ignores Fire (CtrlMenuWeapon never tests bit 4) ---
  gameState='play'; openMenu('weapon');
  const selW = selectedWeapon;
  menuFireTrigger = true; menuTick();
  __check('Fire in the weapon menu does nothing', gameState === 'menu' && selectedWeapon === selW);
  closeMenu();

  // --- item grid (MenuEquipLogic, logic/menuequipment.asm:51): clamps + empty-slot deselect ---
  // 4 seeded items fill slots 1-4; slots 5-25 are empty (ID 0).
  selectedItem = SELECTED_RATION; gameState='play'; openMenu('item');
  __check('item cursor seeds on the selected ration (slot 3)', selectIdx === 3, 'idx='+selectIdx);
  menuMove('down'); menuMove('down');
  __check('item slot 5 is empty -> SelectedItem 0 (deselect, like the ROM zeroed record)',
    selectIdx === 5 && selectedItem === 0, 'idx='+selectIdx+' sel='+selectedItem);
  menuMove('right');
  __check('item right 5->14 (column jump +9)', selectIdx === 14, 'idx='+selectIdx);
  menuMove('up'); menuMove('up'); menuMove('up'); menuMove('up');
  __check('item up clamped at slot 10 (2nd column top)', selectIdx === 10, 'idx='+selectIdx);
  menuMove('left');
  __check('item left 10->1 selects the first item', selectIdx === 1 && selectedItem === menuEntries[0],
    'idx='+selectIdx+' sel='+selectedItem);
  selectIdx = 17; menuMove('right');
  __check('item right clamped at slot 17 (3rd column holds only 7)', selectIdx === 17, 'idx='+selectIdx);
  selectIdx = 25; menuMove('down');
  __check('item down clamped at slot 25', selectIdx === 25, 'idx='+selectIdx);
  closeMenu();

  // --- hold-repeat (ControlHoldWait): trigger moves now, a held direction repeats every 8 ticks ---
  selectedItem = 0; gameState='play'; openMenu('item');
  menuDirTrigger = 'down'; menuTick();
  __check('direction trigger moves immediately', selectIdx === 2, 'idx='+selectIdx);
  held.add('dir:down'); pushRecency('down');
  for (let t = 0; t < 7; t++) menuTick();
  const heldNoMove = selectIdx === 2;
  menuTick();
  __check('held direction repeats only after 8 ticks', heldNoMove && selectIdx === 3, 'idx='+selectIdx);
  held.delete('dir:down');
  closeMenu();

  // --- ChkUseItem (logic/menuequipment.asm:208): Fire in the item menu uses the selected item ---
  selectedItem = SELECTED_RATION; gameState='play'; openMenu('item');
  snake.anim = ANIM_DEEP_WATER; snake.life = 5; sfx.length = 0;
  menuFireTrigger = true; menuTick();
  __check('deep water blocks ration use (no heal, no consume, no SFX)',
    snake.life === 5 && items.get(SELECTED_RATION) === 2 && sfx.length === 0, 'life='+snake.life);
  snake.anim = ANIM_NORMAL;
  menuFireTrigger = true; menuTick();
  __check('ration use: heal to MaxLife + consume one + SFX 0x21',
    snake.life === snake.maxLife && items.get(SELECTED_RATION) === 1 && eq(sfx, ['SFX21']),
    'life='+snake.life+' rations='+items.get(SELECTED_RATION));
  snake.life = 5;
  menuFireTrigger = true; menuTick();
  __check('last ration: heal, removed from inventory, slot gap kept, SelectedItem cleared',
    snake.life === snake.maxLife && !items.has(SELECTED_RATION) && menuEntries[2] === 0 && selectedItem === 0,
    'entries='+JSON.stringify(menuEntries)+' sel='+selectedItem);
  __calls.length = 0; drawMenu();
  const slot3Icon = __calls.some(c => c.m === 'drawImage' && c.a[6] === 72);          // slot 3 row y=72
  const arrowOnGap = __calls.some(c => c.m === 'drawImage' && c.a[0] === fontImg && c.a[1] === ARROW_SX && c.a[6] === 76);
  __check('emptied slot stays a gap while open (no recompact until reopen)', !slot3Icon);
  __check('arrow still drawn on the now-empty slot', arrowOnGap);

  // --- non-usable / nothing selected: silent returns ---
  selectIdx = 4; menuSelect();                                  // move onto CARD1
  sfx.length = 0; menuFireTrigger = true; menuTick();
  __check('card: Fire does nothing (no SFX, nothing consumed, menu stays open)',
    items.get(SELECTED_CARD1) === 0x31 && sfx.length === 0 && gameState === 'menu');
  selectedItem = 0; menuFireTrigger = true; menuTick();
  __check('nothing selected: Fire does nothing', sfx.length === 0);
  closeMenu();

  // --- reopening recompacts (CompactEquipment runs on open) ---
  gameState='play'; openMenu('item');
  __check('reopen recompacts the entries (ration gone)',
    eq(menuEntries, [SELECTED_BOX, SELECTED_OXYGEN, SELECTED_CARD1]), JSON.stringify(menuEntries));
  closeMenu();
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
