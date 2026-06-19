// Export the ROM's items-in-rooms placement (data/itemsinrooms.asm) to web/assets/items.json.
//
// Faithful to AddRoomItems (logic/addroomitems.asm):
//   - idxRoomItemsIdx[room - 122] (rooms 122..217; 0 = no items) -> 1-based index into
//     idxRoomItems -> a set of (ID, Y, X) triplets terminated by 0xFF (dw YX stores Y in the
//     low byte, X in the high byte — AddItemToRoom reads Y then X).
//   - The ROCKET_LAUNCHER entry is gated on the Schneider radio event (JeniRocketF); the ROM
//     ABORTS the rest of the set (`ret z`) when the flag is clear. Radio events aren't ported,
//     so the flag is permanently 0 — the export applies the same truncation (documented
//     divergence: the rocket launcher never appears until radio events exist).
//
// Run: node Tools/export-items.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readRom(p);   // disassembly sources resolve under the sibling ROM dir

// ---- Parse constants/Enums.asm (NAME: equ VALUE) ---------------------------
const enums = {};
for (const line of read('constants/Enums.asm').split(/\r?\n/)) {
  const m = line.match(/^(\w+):?\s+equ\s+(\S+)/i);
  if (m) enums[m[1]] = parseVal(m[2]);
}
function parseVal(s) {
  s = s.trim();
  if (/^0?[0-9A-F]+h$/i.test(s)) return parseInt(s.replace(/h$/i, ''), 16);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s in enums) return enums[s];
  throw new Error('Cannot parse value: ' + s);
}

// ---- Tokenize data/itemsinrooms.asm into labeled byte streams --------------
// db N -> one byte; dw NNNN -> two bytes little-endian (low=Y, high=X).
const stream = [];                 // { label? } | { byte }
for (let line of read('data/itemsinrooms.asm').split(/\r?\n/)) {
  line = line.replace(/;.*$/, '');
  const lm = line.match(/^(\w+):/);
  if (lm) { stream.push({ label: lm[1] }); line = line.slice(lm[0].length); }
  const dm = line.match(/^\s*(db|dw)\s+(.+)$/i);
  if (!dm) continue;
  const isWord = dm[1].toLowerCase() === 'dw';
  for (const tok of dm[2].split(',').map((t) => t.trim()).filter(Boolean)) {
    if (isWord && /^\w+$/.test(tok) && !(tok in enums) && !/^0?[0-9A-F]+h$/i.test(tok) && !/^\d+$/.test(tok)) {
      stream.push({ word: tok });            // dw <label> (idxRoomItems entries)
    } else {
      const v = parseVal(tok);
      if (isWord) { stream.push({ byte: v & 0xff }, { byte: (v >> 8) & 0xff }); }
      else stream.push({ byte: v });
    }
  }
}

// Slice the stream per label.
const byLabel = {};
let cur = null;
for (const t of stream) {
  if (t.label) { cur = []; byLabel[t.label] = cur; continue; }
  if (cur) cur.push(t);
}

const idxBytes = byLabel['idxRoomItemsIdx'].filter((t) => 'byte' in t).map((t) => t.byte);
const setLabels = byLabel['idxRoomItems'].filter((t) => 'word' in t).map((t) => t.word);

// Parse one item set: (ID, Y, X)* until 0xFF; truncate at ROCKET_LAUNCHER (JeniRocketF = 0).
function parseSet(label) {
  const bytes = (byLabel[label] || []).filter((t) => 'byte' in t).map((t) => t.byte);
  const out = [];
  for (let i = 0; i + 2 < bytes.length + 1; i += 3) {
    const id = bytes[i];
    if (id === 0xff || id === undefined) break;
    if (id === enums.ROCKET_LAUNCHER) break;   // AddRoomItems: ret z when JeniRocketF clear
    out.push({ id, y: bytes[i + 1], x: bytes[i + 2] });
  }
  return out;
}

const rooms = {};
for (let i = 0; i < 96; i++) {                 // rooms 122..217 (AddRoomItems bounds)
  const v = idxBytes[i];
  if (!v) continue;
  const label = setLabels[v - 1];
  if (!label) { console.warn(`room ${122 + i}: set index ${v} out of range`); continue; }
  const set = parseSet(label);
  if (set.length > 3) console.warn(`room ${122 + i}: ${set.length} items (> 3 live slots)`);
  if (set.length) rooms[122 + i] = set;
}

const outPath = path.join(repo, 'web', 'assets', 'items.json');
fs.writeFileSync(outPath, JSON.stringify(rooms) + '\n');
const total = Object.values(rooms).reduce((n, l) => n + l.length, 0);
console.log(`Wrote ${outPath}: ${Object.keys(rooms).length} rooms, ${total} items`);
