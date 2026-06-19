// Export the per-room GUARD sprite-palette colors -> web/assets/guard-palettes.json.
//
// The ROM colours guards via the ROOM's sprite palette, not a fixed sheet: SetSprPal
// (Banks0123.asm) reads SpritesetRooms[room] -> a spriteset index N; idxSprSetPals[N]
// (data/palettes.asm) selects SprsetPalN, which overrides hardware colour slots. The guard
// draws with ActorSprColors3 = {2, 4Dh} (data/actorspriteattr.asm:87) -> slot 2 (uniform) and
// slot 0x0D (face/hands). So the uniform/face colour is per-area. Our guard.png is baked with a
// single (green) palette, so guards render the wrong colour in most rooms (e.g. room 3 = spriteset
// 29 = SprsetPal29 -> dark red). This table lets the browser recolour the guard per room.
//
// SprsetPal entry format: `db slot, b1, b2` where b1 hi-nibble = R (0-7), b1 lo-nibble = B (0-7),
// b2 = G (0-7); RGB8 = channel*255/7. Terminator 0FFh. A palette overrides only the slots it lists.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readRom } from './rom-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readRom(p);   // disassembly sources resolve under the sibling ROM dir

// --- parse a `db`-list block starting at `label:` until the next label/blank-label line ---
function blockBytes(text, label) {
  const re = new RegExp(`${label}:([\\s\\S]*?)(?:\\n[A-Za-z_]\\w*:|\\n;---)`);
  const m = text.match(re);
  if (!m) throw new Error(`block ${label} not found`);
  const nums = [];
  for (const line of m[1].split('\n')) {
    const code = line.split(';')[0];
    const dm = code.match(/\bdb\s+(.*)/i);
    if (!dm) continue;
    for (const tok of dm[1].split(',')) {
      const raw = tok.trim();
      if (!/^-?[0-9A-Fa-f]+h?$/i.test(raw)) continue;   // asm: bare = DECIMAL, `h` suffix = hex
      const isHex = /h$/i.test(raw);
      nums.push(parseInt(raw.replace(/h$/i, ''), isHex ? 16 : 10) & 0xFF);
    }
  }
  return nums;
}

// --- parse a `dw`-list of labels (idx tables) ---
function blockWords(text, label) {
  const re = new RegExp(`${label}:([\\s\\S]*?)(?:\\n;---)`);
  const m = text.match(re);
  if (!m) throw new Error(`table ${label} not found`);
  return [...m[1].matchAll(/\bdw\s+(\w+)/gi)].map((x) => x[1]);
}

const spritesets = read('data/spritesets.asm');
const palettes = read('data/palettes.asm');
const attr = read('data/actorspriteattr.asm');

// 1) room -> spriteset index (251 rooms)
const roomSet = blockBytes(spritesets, 'SpritesetRooms');

// 2) spriteset index -> set label; the sets that actually load SprGuard are guard-bearing.
const setLabels = blockWords(spritesets, 'idxSprSet');
const guardBearing = setLabels.map((lbl) => {
  // read the SprSetX body and look for a `dw SprGuard` entry
  const re = new RegExp(`\\n${lbl}:([\\s\\S]*?)(?:\\n[A-Za-z_]\\w*:|$)`);
  const m = spritesets.match(re);
  return !!(m && /\bdw\s+SprGuard\b/.test(m[1]));
});

// 3) spriteset index -> SprsetPal label
const palLabels = blockWords(palettes, 'idxSprSetPals');

// 4) SprsetPalN -> { slot: [b1,b2] }
function palSlots(label) {
  if (label === 'SprsetPalNone') return {};
  const re = new RegExp(`${label}:([\\s\\S]*?)(?:\\n[A-Za-z_]\\w*:|$)`);
  const m = palettes.match(re);
  if (!m) throw new Error(`palette ${label} not found`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const code = line.split(';')[0].trim();
    const dm = code.match(/\bdb\s+(.*)/i);
    if (!dm) continue;
    const toks = dm[1].split(',').map((t) => t.trim());
    if (toks[0].replace(/h$/i, '') === '0FF' || toks[0] === 'FF') break;
    const slot = parseInt(toks[0].replace(/h$/i, ''), 16);
    const b1 = parseInt(toks[1].replace(/h$/i, ''), 16);
    const b2 = parseInt(toks[2].replace(/h$/i, ''), 16);
    out[slot] = [b1, b2];
  }
  return out;
}

const chan = (v) => Math.round((v & 7) * 255 / 7);
const rgb = (pair) => pair ? [chan(pair[0] >> 4), chan(pair[1]), chan(pair[0] & 0x0F)] : null;  // [R,G,B]

// The guard's two recolourable slots (ActorSprColors3 = 2, 4Dh -> slot 2 + CC|0Dh).
const ACTOR_SPR_COLORS3 = blockBytes(attr, 'ActorSprColors3');   // sanity: [2,0x4D,...]
if (ACTOR_SPR_COLORS3[0] !== 2 || ACTOR_SPR_COLORS3[1] !== 0x4D)
  throw new Error('ActorSprColors3 changed: ' + ACTOR_SPR_COLORS3.slice(0, 2));
const UNIFORM_SLOT = 2, FACE_SLOT = 0x0D;

const rooms = {};
const counts = {};
for (let r = 0; r < roomSet.length; r++) {
  const ss = roomSet[r];
  if (!guardBearing[ss]) continue;                 // no guard in this room's spriteset
  const slots = palSlots(palLabels[ss]);
  const u = rgb(slots[UNIFORM_SLOT]);
  const f = rgb(slots[FACE_SLOT]);
  if (!u && !f) continue;                           // palette doesn't recolour the guard
  rooms[r] = { u, f };
  const key = `${palLabels[ss]} u=${u} f=${f}`;
  counts[key] = (counts[key] || 0) + 1;
}

// Fallback = the most common guard palette (SprsetPal2 grey, used by the bulk of rooms).
const fallbackKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
const fallback = rooms[Object.keys(rooms).find((r) =>
  `${palLabels[roomSet[r]]} u=${rooms[r].u} f=${rooms[r].f}` === fallbackKey)];

const outPath = path.join(root, 'web', 'assets', 'guard-palettes.json');
fs.writeFileSync(outPath, JSON.stringify({ fallback, rooms }) + '\n');
console.log('guard-palettes.json:', Object.keys(rooms).length, 'guard rooms;',
  Object.keys(counts).length, 'distinct palettes');
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${k}`);
