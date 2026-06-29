// Headless verification for the desert slice: scorpions (ScorpionLogic — diagonal wander,
// the charge, the room-margin turns, the POISON sting + the 0x40-iteration drain + the
// antidote), and the flag door locks 12 (ChkDesertDoorBuild2) / 13 (ChkCompassDoor).
// Run: node web/desert.headless.mjs
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

let src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8').replace(/\bmain\(\);\s*$/, '\n');
const results = [];
sandbox.__check = (name, cond, extra='') => results.push({ name, ok: !!cond, extra });

const test = `
;(function(){
  const C = () => ({ width:32, height:24, solid:new Array(32*24).fill(0), tiles:new Array(32*24).fill(0) });
  actorsData = JSON.parse(__actors);
  gameState='play'; assets.collision=C();
  // One ROM iteration = two 60Hz ticks (scorpionTick gates on the even tick).
  const iter = (n) => { for (let i=0;i<(n||1);i++) { tickCounter=(tickCounter+1)&0xff; scorpionTick(); tickCounter=(tickCounter+1)&0xff; scorpionTick(); } };

  // --- spawn (InitScorpion: 6 in room 208, random initial frame, wait status) ---
  currentRoom=208; buildScorpions(208);
  __check('room 208 spawns its 6 scorpions', scorpions.length===6 && scorpions.every(s=>s.status===2&&s.life===2));

  // --- wander: after the wait, a random DIAGONAL burst (ScorpionSpeedDat) ---
  snake.x=240; snake.y=10;                       // far away (no charge)
  const s0 = scorpions[0]; s0.x=128; s0.y=96;
  tickCounter=0; iter(2*9);                      // wait 8 + the wander start
  __check('wander bursts are diagonal (|vx|=|vy|=1)', Math.abs(s0.vx)===1 && Math.abs(s0.vy)===1,
    'v='+s0.vx+','+s0.vy);

  // --- the charge (ScorpionSeePlayer): within 0x51, velocity points at the player ---
  buildScorpions(208); const s1=scorpions[0]; s1.x=100; s1.y=100; s1.status=0; s1.wait=99;
  snake.x=140; snake.y=100;
  tickCounter=0; iter(1);
  // CalcShot quantized angle: dx 40 -> block 1, dy 0 -> block 0 => degree 8
  // (QuadrantDegrees[1]); vx = 0x80*sin(63-8)/8192, vy = 0x80*sin(8)/8192 (the slant).
  __check('within 0x51 the scorpion dashes at the player at CalcShot speed (quantized)',
    s1.status===1 && s1.vx===0x80*250/8192 && s1.vy===0x80*50/8192,
    'v='+s1.vx+','+s1.vy);
  iter(8);
  __check('the charge ends into the 0x14 wait', s1.status===2 && s1.wait===0x14 && s1.vx===0,
    'st='+s1.status+' wait='+s1.wait);

  // --- zero distance (on top of Snake): both blocks 0 -> degree 32, a full-speed
  // down-right diagonal — the scorpion never freezes on the player ---
  buildScorpions(208); const sz=scorpions[0]; sz.x=100; sz.y=100; sz.status=0; sz.wait=99;
  snake.x=100; snake.y=100;
  tickCounter=0; iter(1);
  __check('at zero distance it dashes down-right (degree 32), never parking on Snake',
    sz.status===1 && sz.vx===0x80*177/8192 && sz.vy===0x80*181/8192, 'v='+sz.vx+','+sz.vy);

  // --- the margins (ChkScorpionLimits): out of bounds flips to the opposite diagonal ---
  buildScorpions(208); const s2=scorpions[0]; s2.x=8; s2.y=96; s2.status=0; s2.wait=99; s2.dir=1;
  snake.x=240; snake.y=10;
  tickCounter=0; iter(1);
  __check('outside the margins: the diagonal flips (1 -> 2)', s2.dir===2 && s2.vx===1 && s2.vy===1);

  // --- the sting: POISON, no direct damage (ChkScorpion skips TouchPlayer) ---
  buildScorpions(208); const s3=scorpions[0]; s3.x=100; s3.y=100; s3.status=2; s3.wait=99;
  snake.x=104; snake.y=104; snake.life=24; poisoned=false;
  tickCounter=0; iter(1);
  __check('a sting poisons without direct damage', poisoned===true && snake.life===24);

  // --- the drain: 1 life every 0x40 ticks in the play loop (#29) ---
  currentRoom=0; guardsData={}; buildGuardRaw(0); actorsData=null; buildScorpions(0);
  doorsData={}; activeDoors=[]; itemsData={}; buildRoomItems(0);
  snake.life=24; snake.invulnTimer=0; poisoned=true; gameState='play';
  tickCounter=0; for (let i=0;i<0x100;i++) update();   // fires at tick 64/128/192/0 -> 4 drains
  __check('poison drains 4 life over 0x100 ticks (every 0x40)', snake.life===20, 'life='+snake.life);

  // --- the antidote (ChkUseAntidote): clears poison, NOT consumed ---
  items.set(SELECTED_ANTIDOTE, 1); selectedItem = SELECTED_ANTIDOTE;
  chkUseItem();
  __check('the antidote clears the poison and is kept', poisoned===false && items.get(SELECTED_ANTIDOTE)===1);

  // #41: in DEEP WATER no item is usable — ChkUseItem keeps A=PlayerAnimation (4), so every cp fails
  poisoned=true; snake.anim=ANIM_DEEP_WATER; selectedItem=SELECTED_ANTIDOTE; chkUseItem();
  __check('#41 deep water blocks the antidote (poison stays)', poisoned===true);
  snake.anim=ANIM_NORMAL; chkUseItem();
  __check('#41 out of deep water the antidote works again', poisoned===false);

  // --- shots kill (shape 2 box, life 2 = one handgun bullet) ---
  actorsData = JSON.parse(__actors); currentRoom=208; buildScorpions(208);
  const s4=scorpions[0]; s4.x=100; s4.y=100;
  playerShots.push({ x:100, y:100, vx:0, vy:0, range:5 });
  updatePlayerShots();
  __check('a bullet kills the scorpion (life 2, damage 2)', s4.life===0);
  tickCounter=0; iter(1);
  __check('the dead scorpion leaves on its logic tick', scorpions.length===5);

  // --- lock 12 (ChkDesertDoorBuild2) + lock 13 (ChkCompassDoor) ---
  snake.anim = ANIM_NORMAL;
  const door12 = { lock:12, type:2 }, door13 = { lock:13, type:1 };
  currentRoom=73; snake.dir='down';
  __check('lock 12 from inside room 73: walking south opens', canOpenDoor(door12)===true);
  snake.dir='up';
  __check('lock 12 from inside: any other facing stays locked', canOpenDoor(door12)===false);
  currentRoom=216; doorBuild2Open=false;
  __check('lock 12 outside: locked until the guards open it', canOpenDoor(door12)===false);
  doorBuild2Open=true;
  __check('lock 12 outside: the one-shot flag opens it once', canOpenDoor(door12)===true && doorBuild2Open===false);
  jeniOpenDoor=false;
  __check('lock 13: locked until Jennifer opens it', canOpenDoor(door13)===false);
  jeniOpenDoor=true;
  __check('lock 13: the one-shot flag opens it once', canOpenDoor(door13)===true && jeniOpenDoor===false);

  // --- #32: the desert compass gate (SetNextRoom): leaving room 103 only works heading SOUTH or
  //     with the compass selected; any other exit re-enters 103 ("get lost in the desert") ---
  rooms.set(102,{img:null,collision:C()}); rooms.set(103,{img:null,collision:C()}); rooms.set(208,{img:null,collision:C()});
  doorsData={}; itemsData={}; guardsData={}; actorsData=null;
  currentRoom=103; selectedItem=0; transition('up', 208);
  __check('#32 no compass + going UP gets lost back in 103', currentRoom===103, 'room='+currentRoom);
  currentRoom=103; selectedItem=0; transition('down', 102);
  __check('#32 no compass but heading SOUTH escapes to 102', currentRoom===102, 'room='+currentRoom);
  currentRoom=103; selectedItem=SELECTED_COMPASS; transition('up', 208);
  __check('#32 with the compass selected, UP reaches 208', currentRoom===208, 'room='+currentRoom);

  // --- restart clears the poison ---
  poisoned=true; manifest={start:0}; rooms.set(0,{img:null,collision:C()});
  restart();
  __check('restart clears Poisoned', poisoned===false);
})();
`;

vm.createContext(sandbox);
try { vm.runInContext(src + test, sandbox, { filename: 'game.js+test' }); }
catch (e) { console.error('HARNESS ERROR:', e); process.exit(2); }

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra ? '  ['+r.extra+']' : '')); if (r.ok) pass++; }
console.log(`\ndesert.headless: ${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
