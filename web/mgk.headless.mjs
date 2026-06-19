// Headless verification for Machine Gun Kid (MachGunKidLogic, logic/actors/machinegunkid.asm
// + InitMGunKidShot). Loads the REAL web/game.js and drives the room-20 boss: the intro
// speech (text 79, once), the think/walk/shoot/hide cycle, the downward bullet fan (8 damage,
// every 4th iteration), the X limits, weapon damage vs his 20 life, and the permanent death
// (MachGunStatus bit 0). Run: node web/mgk.headless.mjs
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
    rec[m] = () => calls.push(m);
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
sandbox.__coll20 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '20.collision.json'), 'utf8'));
sandbox.__coll57 = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'rooms', '57.collision.json'), 'utf8'));

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  textsData = __texts; doorsData = {}; doorTypes = {};
  rooms.set(20, { img: null, collision: __coll20 });
  gameState = 'play'; held.clear();

  // --- spawn (InitMachGunKid via ActorsRoom020: (0xE0, 0x34)) ---
  setRoom(20);
  __check('MGK spawns at (0xE0, 0x34) with 20 life', boss && boss.x === 0xE0 && boss.y === 0x34
    && boss.life === 0x14, boss && ('x='+boss.x));

  // --- intro: 2 iterations, then text 79 (unskippable) ONCE + the fight starts ---
  snake.x = 0x80; snake.y = 0x98;
  bossTick(); bossTick();
  __check('the intro shows text 79 (unskippable) once', gameState === 'text' && textBox.id === 79
    && textBox.mode === 2 && mgkSpeechDone === true);
  let g = 0;
  while (gameState === 'text' && g++ < 2000) updateTextBox();
  __check('the speech auto-advances back to play', gameState === 'play', 'g='+g);
  __check('after the intro he heads for a hide move (status 4)', boss.status === 4);

  // --- the cycle: walk 8 iterations at +-4, then think, then walk, then shoot 0x28 ---
  const x0 = boss.x;
  for (let i = 0; i < 8; i++) bossTick();              // MG_MoveToHide
  __check('he slides 8 iterations at 4px (32px total)', Math.abs(boss.x - x0) === 32 && boss.status === 1,
    'x '+x0+'->'+boss.x);
  // MG_ThinkMovement: while Snake HIDES in his column he waits the timer out...
  snake.x = boss.x - 8 + 4;                            // inside |dx+8| < 0x11
  for (let i = 0; i < 16; i++) bossTick();
  __check('he WAITS while Snake hides in his column', boss.status === 1);
  snake.x = boss.x - 0x30;                             // ...but moves at once when Snake shows
  bossTick();
  __check('Snake breaks cover: he walks immediately (status 2)', boss.status === 2 && boss.vx === -4);
  for (let i = 0; i < 8; i++) bossTick();
  __check('then stops to shoot (status 3, 0x28 iterations)', boss.status === 3 && boss.wait === 0x28);

  // --- shooting: every 4th iteration a bullet (8 damage, downward fan) while |dx| <= 0x30 ---
  snake.x = boss.x; snake.y = 0x98;                    // right under him
  bullets.length = 0;
  for (let i = 0; i < 16; i++) bossTick();
  __check('4 bullets in 16 iterations (every 4th)', bullets.length === 4, 'n='+bullets.length);
  __check('bullets rain down at the guard-bullet rate with 8 damage',
    bullets.every((b) => b.vy === 2.5 && b.dmg === 8));
  __check('the burst fans across X', new Set(bullets.map((b) => b.vx)).size > 1,
    JSON.stringify(bullets.map((b)=>b.vx)));
  snake.x = boss.x + 0x40;                             // out of his arc
  bossTick();
  __check('player out of the +-0x30 arc: he repositions', boss.status === 4);

  // --- the X limits (MG_ChoseDir) ---
  boss.x = 0xE0; mgChoseDir(boss);
  __check('at the right limit he turns left', boss.vx === -4);
  boss.x = 0x20; mgChoseDir(boss);
  __check('at the left limit he turns right', boss.vx === 4);

  // --- weapon damage (BulletDamage idx 0x21: handgun 2, rocket 0x0A) + the explosion shape ---
  weapons.set(1, 10); selectedWeapon = 1;
  playerShots.push({ type: 1, status: 0, x: boss.x, y: boss.y - 16, vx: 0, vy: 0, range: 5 });
  updatePlayerShots();                                  // shape-0 box: (bossY-16 +-16, bossX +-8)
  __check('a handgun bullet takes 2 of his 20 life', boss.life === 0x14 - 2, 'life='+boss.life);
  const before = boss.life;
  playerShots.length = 0;
  // Real rocket shape: the sprite Y rides 16 above the ground Y_Alt (fireRocket) — tile
  // detonation needs BOTH rows to collide (ChkShotCollision + ChkShotCollisionA).
  playerShots.push({ type: 4, status: 0, dir: 'up', x: boss.x, y: boss.y - 16, yAlt: boss.y, vx: 0, vy: 0 });
  updatePlayerShots();                                  // rocket contact: 10 damage + explode
  __check('a rocket contact takes 0x0A', boss.life === before - 0x0A, 'life='+boss.life);

  // --- death is permanent (MachGunStatus bit 0) ---
  boss.life = 0;
  bossTick();
  __check('at 0 life he dies and the flag latches', boss === null && mgkDead === true);
  setRoom(20);
  __check('re-entering room 20 spawns NO boss ever again', boss === null);

  // ==== Shotgunner (ShotGunnerLogic, room 57) ===============================================
  rooms.set(57, { img: null, collision: __coll57 });
  gameState = 'play';
  setRoom(57);
  __check('Shotgunner spawns at (0x90, 0x38) with 20 life',
    boss && boss.kind === 'sg' && boss.x === 0x90 && boss.y === 0x38 && boss.life === 0x14);
  snake.x = 0x40; snake.y = 0x80;
  sgTick(boss); sgTick(boss);
  __check('the intro shows text 61 (unskippable) once', gameState === 'text' && textBox.id === 61
    && sgSpeechDone === true);
  g = 0;
  while (gameState === 'text' && g++ < 3000) updateTextBox();
  __check('back to play; he rolls toward Snake, INVULNERABLE', gameState === 'play'
    && boss.status === 1 && boss.vx === -4 && boss.inv === true);
  playerShots.push({ type: 1, status: 0, x: boss.x, y: boss.y - 16, vx: 0, vy: 0, range: 3 });
  updatePlayerShots();
  __check('shots pass through the roll', boss.life === 0x14);
  playerShots.length = 0;
  g = 0;
  while (boss.status === 1 && g++ < 20) sgTick(boss);
  __check('the roll ends (timer/wall) into the standing window (0x2D, vulnerable)',
    boss.status === 2 && boss.inv === false && boss.wait === 0x2D, 'g='+g);
  // standing: he fires an aimed expanding blast every 16th iteration
  bullets.length = 0;
  boss.anim = 0;
  for (let i = 0; i < 33; i++) { if (boss.status !== 2) break; sgTick(boss); }
  __check('two blasts in 33 standing iterations (every 16th), 8 damage, aimed at Snake',
    bullets.length === 2 && bullets.every((b) => b.dmg === 8 && b.sgAge === 0 && b.vx < 0),
    'n='+bullets.length);
  // the crate corner is safe
  bullets.length = 0; snake.x = 200; snake.y = 180;
  boss.anim = 0; boss.wait = 0x20;
  for (let i = 0; i < 32 && boss.status === 2; i++) sgTick(boss);
  __check('Snake behind the boxes (Y>=166, X>=170): he holds fire', bullets.length === 0);
  // standing he IS vulnerable
  playerShots.push({ type: 1, status: 0, x: boss.x, y: boss.y - 16, vx: 0, vy: 0, range: 3 });
  if (boss.status !== 2) { boss.status = 2; boss.inv = false; }
  updatePlayerShots();
  __check('standing, a handgun bullet takes 2', boss.life === 0x14 - 2, 'life='+boss.life);
  // permanent death
  boss.life = 0; bossTick();
  __check('ShotGunnerStat latches on death', boss === null && sgDead === true);
  setRoom(57);
  __check('room 57 stays boss-free forever', boss === null);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + '\n' + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\nmgk.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
