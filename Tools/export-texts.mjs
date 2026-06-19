// Export the ROM's text table to web/assets/texts.json.
//
// Faithful to the text pipeline (see docs/rom-data-formats.md "Texts"):
//   - idxTexts (data/texts.asm:6): dw pointer per 1-BASED text id (GetText, Banks0123.asm:5274
//     indexes with id-1); txtEmpty entries are unwritten.
//   - Per text: first byte = TextBoxType (low nibble = window type 0-4), then the stream
//     DecodeText (Banks0123.asm:5305) unpacks: 0x00 space, bytes < 0xA1 = font char codes
//     (custom punctuation: 0x3D '!', 0x5C/0x5E '.', 0x5F/0x60 ',', 0x3F/0x5B '?', 0x40 '-',
//     0x97 apostrophe), bytes >= 0xA1 = dictionary tokens -> idxDictionary[token-0xA1]
//     (data/texts.asm:573), entries copied verbatim until 0xFF (may embed 0xFE newlines,
//     never nested tokens); 0xFE = newline, 0xFD = page wait, 0xFF = end.
//
// texts.json stores the RAW ROM char codes as string code units (0x00 mapped to ' ') —
// font.png is indexed by exactly these codes, so the browser renders them without any
// translation and the export is lossless. The exporter prints a human-readable decode and
// asserts the known wording of texts 3 and 10 as a sanity check.
//
// Run: node Tools/export-texts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRom } from './rom-source.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readRom('data/texts.asm');

// ---- Tokenize into label -> { bytes:[], words:[labels] } -------------------
const byLabel = {};
let cur = null;
for (let rawLine of src.split(/\r?\n/)) {
  let line = rawLine;
  // Strip comments, but not inside quotes.
  let q = false, cut = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === ';' && !q) { cut = i; break; }
  }
  if (cut >= 0) line = line.slice(0, cut);

  const lm = line.match(/^(\w+):/);
  if (lm) { cur = { bytes: [], words: [] }; byLabel[lm[1]] = cur; line = line.slice(lm[0].length); }
  if (!cur) continue;
  const dm = line.match(/^\s*(db|dw)\s+(.+)$/i);
  if (!dm) continue;
  const isWord = dm[1].toLowerCase() === 'dw';

  // Split on commas outside quotes.
  const toks = [];
  let buf = '';
  q = false;
  for (const ch of dm[2]) {
    if (ch === '"') { q = !q; buf += ch; }
    else if (ch === ',' && !q) { toks.push(buf.trim()); buf = ''; }
    else buf += ch;
  }
  if (buf.trim()) toks.push(buf.trim());

  for (const tok of toks) {
    if (!tok) continue;
    if (tok.startsWith('"')) {
      for (const ch of tok.slice(1, -1)) cur.bytes.push(ch.charCodeAt(0));   // quoted ASCII = char codes
    } else if (isWord && /^[A-Za-z_]\w*$/.test(tok)) {
      cur.words.push(tok);
    } else if (/^0?[0-9A-F]+h$/i.test(tok)) {
      cur.bytes.push(parseInt(tok.replace(/h$/i, ''), 16));
    } else if (/^#[0-9A-F]+$/i.test(tok)) {
      cur.bytes.push(parseInt(tok.slice(1), 16));
    } else if (/^\d+$/.test(tok)) {
      cur.bytes.push(parseInt(tok, 10));
    } else {
      throw new Error('Cannot parse token: ' + tok);
    }
  }
}

const textLabels = byLabel['idxTexts'].words;
const dictLabels = byLabel['idxDictionary'].words;
const dict = dictLabels.map((l) => {
  const b = byLabel[l].bytes;
  const end = b.indexOf(0xff);
  return b.slice(0, end < 0 ? b.length : end);
});

// ---- Decode one text (DecodeText + AddDictEntry) ----------------------------
function decodeText(label) {
  const b = byLabel[label].bytes;
  const cfg = b[0];
  // Expand dictionary tokens into a flat stream (entries are verbatim, no nesting).
  const stream = [];
  for (let i = 1; i < b.length; i++) {
    const v = b[i];
    if (v === 0xff) break;
    if (v >= 0xa1 && v !== 0xfe && v !== 0xfd) {
      const entry = dict[v - 0xa1];
      if (!entry) throw new Error(`${label}: dictionary token 0x${v.toString(16)} out of range`);
      if (entry.includes(0xfd)) throw new Error(`${label}: dictionary entry with page wait`);
      stream.push(...entry);
    } else {
      stream.push(v);
    }
  }
  // Split pages on 0xFD, lines on 0xFE; chars: 0x00 -> ' ', else raw code.
  const pages = [[]];
  let line = '';
  const endLine = () => { pages[pages.length - 1].push(line); line = ''; };
  for (const v of stream) {
    if (v === 0xfd) { endLine(); pages.push([]); }
    else if (v === 0xfe) { endLine(); }
    else line += String.fromCharCode(v === 0 ? 0x20 : v);
  }
  endLine();
  return { cfg, pages };
}

const texts = {};
for (let i = 0; i < textLabels.length; i++) {
  const label = textLabels[i];
  if (label === 'txtEmpty') continue;
  texts[i + 1] = decodeText(label);                 // idxTexts is 1-based (GetText: dec a)
}

// ---- Sanity: decode to readable and assert the known wording ----------------
const READABLE = { 0x3a: '©', 0x3d: '!', 0x3e: '!!', 0x3f: '⏎', 0x40: '-', 0x5b: '?',
                   0x5c: '.', 0x5e: '.', 0x5f: ',', 0x60: ',', 0x97: "'" };   // 0x3F = enter icon (DrawEnterIcon)
const readable = (s) => [...s].map((c) => READABLE[c.charCodeAt(0)] ?? c).join('');
const flat = (id) => texts[id].pages.map((p) => p.map(readable).join('\n')).join('\n*\n');

const t3 = flat(3), t10 = flat(10);
if (!/THIS IS BIG BOSS/.test(t3) || !/OUTER HEAVEN/.test(t3) || !/DISCOVERED/.test(t3))
  throw new Error('Sanity failed for text 3:\n' + t3);
if (!/SOLID SNAKE/.test(t10) || !/REPLY/.test(t10))
  throw new Error('Sanity failed for text 10:\n' + t10);
console.log('--- text 3 ---\n' + t3 + '\n--- text 10 ---\n' + t10 + '\n---');

const outPath = path.join(repo, 'web', 'assets', 'texts.json');
fs.writeFileSync(outPath, JSON.stringify(texts) + '\n');
console.log(`Wrote ${outPath}: ${Object.keys(texts).length} texts, ${dict.length} dictionary entries`);
