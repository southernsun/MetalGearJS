// Export the ROM's per-room radio-call config (data/musicradioconfig.asm RoomsMusic) to
// web/assets/radio.json.
//
// RoomsMusic[room] (read by SetAreaMusic6/ChkRadioCalls, Banks0123.asm:1616/1730):
//   high nibble = area music, bit 3 = INCOMING CALL in this room, bits 2-0 = secure-room
//   flags. This export captures the call bit: { "callRooms": [rooms with bit 3 set] }.
//   The table has an IF (JAPANESE)/ELSE/ENDIF block — the non-Japanese (ELSE) branch is taken.
//
// Run: node Tools/export-radio.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readRom('data/musicradioconfig.asm');

const bytes = [];
let inTable = false, condBranch = null;        // condBranch: 'IF' | 'ELSE' | null
for (let line of src.split(/\r?\n/)) {
  line = line.replace(/;.*$/, '');
  if (!inTable) { if (/^RoomsMusic:/.test(line)) inTable = true; else continue; }
  else if (/^\w+:/.test(line)) break;          // next label (idxMapZones) ends the table

  const t = line.trim();
  if (/^IF\b/i.test(t)) { condBranch = 'IF'; continue; }
  if (/^ELSE\b/i.test(t)) { condBranch = 'ELSE'; continue; }
  if (/^ENDIF\b/i.test(t)) { condBranch = null; continue; }
  if (condBranch === 'IF') continue;           // skip the JAPANESE branch

  const dm = line.match(/\bdb\s+(.+)$/i);
  if (!dm) continue;
  for (const tok of dm[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/^0?[0-9A-F]+h$/i.test(tok)) bytes.push(parseInt(tok.replace(/h$/i, ''), 16));
    else if (/^\d+$/.test(tok)) bytes.push(parseInt(tok, 10));
    else throw new Error('Cannot parse byte: ' + tok);
  }
}

const callRooms = [];
bytes.forEach((b, room) => { if (b & 8) callRooms.push(room); });

const outPath = path.join(repo, 'web', 'assets', 'radio.json');
fs.writeFileSync(outPath, JSON.stringify({ callRooms }) + '\n');
console.log(`Wrote ${outPath}: ${bytes.length} room bytes, call rooms: [${callRooms.join(', ')}]`);
