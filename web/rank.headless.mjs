// Headless verification for rank-progression (task 4.1). Loads the REAL web/game.js in a vm
// sandbox with mocked DOM, strips the trailing main(), and appends asserts in the same scope.
// Run: node web/rank.headless.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGlobalMasks, pointReachable } from '../Tools/check-graph.mjs';

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

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '// main() stripped\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });
// GLOBAL reachability (walked from Snake's spawn across the whole cluster) — a placement on
// open floor inside an unreachable pocket must fail this check.
const reach = computeGlobalMasks();
sandbox.__reachable = (room, px, py) =>
  !!reach.masks[room] && pointReachable(reach.coll[room], reach.masks[room], px, py);

sandbox.__texts = JSON.parse(fs.readFileSync(path.join(dir, 'assets', 'texts.json'), 'utf8'));

const test = `
;(function(){
  textsData = __texts;                                  // the real decoded text table
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  function reset(){ alertMode=false; redAlertFlag=false; roomAlert=-1; gameState='play';
    currentRoom=0; assets.collision=C(); bullets.length=0; playerShots.length=0;
    snake.x=200; snake.y=150; snake.dir='down'; snake.state='idle'; snake.anim=ANIM_NORMAL;
    snake.class=0; snake.maxLife=24; snake.life=24; snake.invulnTimer=0; guard=null;
    weapons.clear(); items.clear(); invSuppressor=false; selectedWeapon=0; selectedItem=0;
    rescuedCnt=0; rescuedRooms.clear(); prisoner=null; textBox=null; textReturnState='play';
    roomItems=[null,null,null]; itemsData={}; spawnedItemLatch=false; }
  const placePrisoner = (x,y) => { prisoner={x,y,status:'idle',phase:0,animTimer:0,waitTimer:0,life:PRISONER_LIFE}; };
  // Rescue completes after the 2-tick wait (PrisonerIdle -> PrisonerWait -> RescuedLogic3).
  const tick = (n) => { for (let i=0;i<(n||1);i++) updatePrisoner(); };

  // --- touch box (ActorsShapeTouch 0x17: |y-8-sy|<16, |x-sx|<16, strict) ---
  reset(); placePrisoner(100,100); snake.x=116; snake.y=92; tick();
  __check('touch X edge 16 is a miss (strict <)', prisoner.status==='idle');
  snake.x=115; tick();
  __check('touch X 15 frees him', prisoner.status==='wait');
  reset(); placePrisoner(100,100); snake.x=100; snake.y=108; tick();   // |92-108| = 16
  __check('touch Y edge 16 is a miss (strict <)', prisoner.status==='idle');
  reset(); placePrisoner(100,100); snake.x=100; snake.y=107; tick();
  __check('touch Y 15 frees him', prisoner.status==='wait');

  // --- rescue: flag + counter, no damage, no alarm; gone on re-entry ---
  reset(); currentRoom=3; placePrisoner(100,100); snake.x=100; snake.y=100;
  tick(3);
  __check('rescue: flag set + counter 1', rescuedRooms.has(3) && rescuedCnt===1);
  __check('rescue: prisoner stays visible (freed pose)', prisoner!==null && prisoner.status==='rescued');
  __check('rescue: no damage, no alarm', snake.life===24 && alertMode===false);
  buildPrisoner(3);
  __check('rescued prisoner absent on re-entry', prisoner===null);

  // --- 5th rescue ranks up: class 1, FULL heal to 32, counter reset, ammo ceiling 100 ---
  reset(); snake.life=10; weapons.set(HAND_GUN, 50);
  for (let r=0; r<5; r++) { currentRoom=10+r; placePrisoner(100,100); snake.x=100; snake.y=100; tick(3); }
  __check('5th rescue: class 1, counter reset', snake.class===1 && rescuedCnt===0);
  __check('rank up: full heal to the new MaxLife (32)', snake.life===32 && snake.maxLife===32);
  weapons.set(HAND_GUN, 90); pickAmmoCrate();
  __check('rank 1 ammo ceiling 100', weapons.get(HAND_GUN)===100, 'ammo='+weapons.get(HAND_GUN));

  // --- class caps at 3 ---
  reset(); snake.class=3; snake.maxLife=48; snake.life=48;
  for (let r=0; r<5; r++) { currentRoom=20+r; placePrisoner(100,100); snake.x=100; snake.y=100; tick(3); }
  __check('class caps at 3', snake.class===3);

  // --- shooting a prisoner: dies on his logic tick -> downgrade with clamps + flag reset ---
  reset(); snake.class=1; snake.maxLife=32; snake.life=32; weapons.set(HAND_GUN, 100);
  rescuedRooms.add(5); rescuedRooms.add(167);            // a regular room + Ellen (special)
  currentRoom=6; placePrisoner(100,100); snake.x=200; snake.y=150;
  playerShots.push({x:100,y:84,vx:0,vy:0,range:10}); updatePlayerShots();
  __check('shot prisoner takes damage, still present', prisoner.life===0 && prisoner!==null);
  tick();
  __check('killed on his logic tick', prisoner===null);
  __check('downgrade: class 0, life clamped to 24', snake.class===0 && snake.life===24);
  __check('downgrade: ammo clamped to 50', weapons.get(HAND_GUN)===50);
  __check('downgrade: regular flag cleared, special kept',
          !rescuedRooms.has(5) && rescuedRooms.has(167));

  // #37: DowngradeRank restores RescuedArray[0Dh]=room 193 but DOES reset index 17 = room 202
  reset(); rescuedRooms.add(193); rescuedRooms.add(202); rescuedRooms.add(189);
  downgradeRank();
  __check('#37 downgrade keeps room 193 (idx 13 restored) and resets room 202 (idx 17)',
          rescuedRooms.has(193) && !rescuedRooms.has(202) && rescuedRooms.has(189));

  // --- class floor 0 (flags/counter still reset) ---
  reset(); rescuedCnt=3; rescuedRooms.add(9);
  currentRoom=8; placePrisoner(100,100);
  playerShots.push({x:100,y:84,vx:0,vy:0,range:10}); updatePlayerShots(); tick();
  __check('class floor 0; counter+flags reset', snake.class===0 && rescuedCnt===0 && !rescuedRooms.has(9));

  // --- restart keeps the rank (ROM continue) ---
  reset(); snake.class=2; rescuedRooms.add(3); rescuedCnt=4;
  restart();
  __check('restart keeps class/rescues; life = rank max',
          snake.class===2 && rescuedRooms.has(3) && rescuedCnt===4 && snake.life===40);

  // --- rescue shows the text window (SetText 131 -> GAME_MODE_TEXT_BOX) ---
  reset(); currentRoom=30; placePrisoner(100,100); snake.x=100; snake.y=100; tick(3);
  __check('rescue opens text 131 "RESCUED" from the table',
          gameState==='text' && textBox && textBox.id===131 && textBox.pages[0][0]==='RESCUED');
  // ROM cadence: one char per TickCounter & 3 == 0 at the FULL tick rate (text mode runs
  // light — no TickInProgress halving): every 4 of our 60Hz ticks.
  const txtTick = () => { tickCounter=(tickCounter+1)&0xff; updateTextBox(); };
  tickCounter=0;
  for (let i=0;i<3;i++) txtTick();
  __check('prints at most 1 char in 3 frames (mask 3, full tick rate)', textBox.shown<=1, 'shown='+textBox.shown);
  for (let i=0;i<7*4+8;i++) txtTick();
  __check('text prints to completion then waits', textBox.shown===7 && textBox.wait, 'shown='+textBox.shown);
  dismissText();
  __check('dismiss returns to play', gameState==='play' && textBox===null);
  reset(); setText(131); txtTick(); dismissText();   // press mid-print = SkipText
  __check('mid-print press skips the page (single page -> closes)', gameState==='play' && textBox===null);

  // --- per-room rescue dialogue (PrisonerRescued, logic/actors/prisoner.asm:216-260) ---
  const rescueIn = (room, y) => { reset(); currentRoom = room;
    if (room === 193) items.set(SELECTED_CARD1 + 7, 1);   // #98: CARD8 is required to rescue in the Coward Duck room
    placePrisoner(100, y || 100); snake.x = 100; snake.y = y || 100; tick(3); };
  // #98: the room-193 prisoner (Jennifer's brother) can't be rescued until CARD8 is taken (PrisonerIdle gate)
  reset(); currentRoom = 193; items.delete(SELECTED_CARD1 + 7);
  placePrisoner(100, 100); snake.x = 100; snake.y = 100; tick(3);
  __check('#98 room 193: no rescue without CARD8', prisoner && prisoner.status === 'idle' && rescuedCnt === 0);
  items.set(SELECTED_CARD1 + 7, 1); tick(3);
  __check('#98 room 193: CARD8 taken -> the prisoner frees', rescuedRooms.has(193));
  rescueIn(134);
  __check('PrisonerTexts room 134 -> Grey Fox confined (52)', textBox && textBox.id === 52,
    'id=' + (textBox && textBox.id));
  rescueIn(159);
  __check('PrisonerTexts room 159 -> the Diane-frequency tip (27)', textBox && textBox.id === 27);
  rescueIn(167);
  __check('Ellen room 167 -> text 129', textBox && textBox.id === 129);
  rescueIn(193, 0x54);
  __check("Jennifer's brother (room 193, Y 0x54) -> text 140 (ChkRescJenBro)", textBox && textBox.id === 140);
  rescueIn(193);
  __check('room 193 at another Y -> plain RESCUED 131', textBox && textBox.id === 131);

  // (the DEMO_PRISONERS reachability check was removed along with the demo overlay)

  // ==== Passwords (cheat codes typed while paused, ChkPasswords) ====
  reset(); passwordBuffer='XXDS4'; chkPasswords();
  __check('password DS 4: class +1 (SetMaxClass c=0 -> IncClassLv x1)', snake.class===1);
  reset(); passwordBuffer='ANTAWAERAI'; chkPasswords();
  __check('password ANTA WA ERAI: class +3 = max (SetMaxClass c=1 -> IncClassLv x3)', snake.class===3);
  reset(); weapons.set(1,5); maxAmmoCheat=false; passwordBuffer='INTRUDER'; chkPasswords();
  __check('password INTRUDER: max ammo (weapons -> 0x999, cheat latched)',
    maxAmmoCheat===true && weapons.get(1)===0x999);
  reset(); items.set(SELECTED_RATION,1); maxRationsCheat=false; passwordBuffer='ISOLATION'; chkPasswords();
  __check('password ISOLATION: max rations (0x999)', maxRationsCheat===true && items.get(SELECTED_RATION)===0x999);
  reset(); openedDoorIds.clear(); passwordBuffer='HIRAKEGOMA'; chkPasswords();
  __check('password HIRAKE GOMA: all 8 cards + Grey Fox cell (door 0x0B)',
    [0,1,2,3,4,5,6,7].every(c=>items.has(SELECTED_CARD1+c)) && openedDoorIds.has(0x0B));
  // #74: only the class-changing codes play the rank-up SFX (inside IncClassLv); the others are silent
  { const _pb = playBuf; let sfxN = 0; playBuf = () => { sfxN++; };
    reset(); passwordBuffer='INTRUDER'; chkPasswords();
    __check('#74 INTRUDER plays NO rank-up SFX', sfxN === 0, 'n='+sfxN);
    reset(); snake.class=0; sfxN=0; passwordBuffer='XXDS4'; chkPasswords();
    __check('#74 DS 4 (class change) plays the rank-up SFX once', sfxN === 1, 'n='+sfxN);
    playBuf = _pb; }
  reset(); snake.class=0; passwordBuffer='NOTACODE'; chkPasswords();
  __check('a non-code leaves the game unchanged', snake.class===0);
  // the buffer only accepts letters/digits, rolling to 12 chars
  passwordBuffer=''; for (const k of ['a','1',' ','-','Z']) passwordKey(k);
  __check('passwordKey ignores non-alphanumerics', passwordBuffer==='A1Z');

  // ==== Save / load (serialise the progress; the cassette save's localStorage analog) ====
  setRoom = (n) => { currentRoom = n; };       // stub the heavy room rebuild
  globalThis.localStorage = { d:{}, getItem(k){return k in this.d ? this.d[k] : null;}, setItem(k,v){this.d[k]=String(v);} };
  reset();
  snake.class=2; snake.life=40; currentRoom=118; snake.x=0x42; snake.y=0x55; snake.dir='left';
  weapons.set(1,0x40); weapons.set(5,3); items.set(SELECTED_CARD1,1);
  openedDoorIds.clear(); openedDoorIds.add(99); tankKO=true; bigBossDead=true; rescuedCnt=3; invSuppressor=true;
  saveGame();
  __check('SAVE writes the progress to storage', !!localStorage.getItem('metalgear.save'));
  // wipe everything, then LOAD
  reset(); snake.class=0; snake.life=24; weapons.clear(); items.clear(); openedDoorIds.clear();
  tankKO=false; bigBossDead=false; rescuedCnt=0; invSuppressor=false;
  loadGame();
  __check('LOAD restores room/class/inventory/doors/kill-flags',
    currentRoom===118 && snake.class===2 && snake.life===40 && weapons.get(1)===0x40 && weapons.get(5)===3 &&
    items.get(SELECTED_CARD1)===1 && openedDoorIds.has(99) && tankKO===true && bigBossDead===true &&
    rescuedCnt===3 && invSuppressor===true && snake.x===0x42 && snake.y===0x55);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
