// Export the per-elevator floor data (data/elevatorrooms.asm) to web/assets/elevatorrooms.json.
//
// Format (GetElevatorRoomDat, Banks0123.asm:980; see docs/rom-data-formats.md "Elevators"):
//   idxElevatorRoom: dw pointer per elevator room (240 + index)
//   per elevator: dw limitUp,limitDown (one word, low byte = up, high = down)
//                 then db prevRoom / dw playerY,elevatorY per floor (low = playerY)
// Output: { "240": { up, down, floors: [{ room, playerY, elevY }] }, ... }
//
// Run: node Tools/export-elevators.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readRom('data/elevatorrooms.asm');

const byLabel = {};
let cur = null;
for (let line of src.split(/\r?\n/)) {
  line = line.replace(/;.*$/, '');
  const lm = line.match(/^(\w+):/);
  if (lm) { cur = { bytes: [], words: [] }; byLabel[lm[1]] = cur; line = line.slice(lm[0].length); }
  if (!cur) continue;
  const dm = line.match(/^\s*(db|dw)\s+(.+)$/i);
  if (!dm) continue;
  const isWord = dm[1].toLowerCase() === 'dw';
  for (const tok of dm[2].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (isWord && /^[A-Za-z_]\w*$/.test(tok)) { cur.words.push(tok); continue; }
    const v = /^0?[0-9A-F]+h$/i.test(tok) ? parseInt(tok.replace(/h$/i, ''), 16) : parseInt(tok, 10);
    if (isWord) { cur.bytes.push(v & 0xff, (v >> 8) & 0xff); } else cur.bytes.push(v);
  }
}

const out = {};
byLabel['idxElevatorRoom'].words.forEach((label, i) => {
  const b = byLabel[label].bytes;
  const elev = { up: b[0], down: b[1], floors: [] };
  for (let p = 2; p + 2 < b.length; p += 3)
    elev.floors.push({ room: b[p], playerY: b[p + 1], elevY: b[p + 2] });
  out[240 + i] = elev;
});

const outPath = path.join(repo, 'web', 'assets', 'elevatorrooms.json');
fs.writeFileSync(outPath, JSON.stringify(out) + '\n');
console.log(`Wrote ${outPath}: ${Object.keys(out).length} elevator rooms; 240 = ${JSON.stringify(out[240])}`);
const r240 = out[240];
if (r240.up !== 0x38 || r240.down !== 0xB8 ||
    JSON.stringify(r240.floors) !== JSON.stringify([{ room: 31, playerY: 0x34, elevY: 0x38 }, { room: 3, playerY: 0xB4, elevY: 0xB8 }]))
  throw new Error('Sanity failed for elevator room 240');
