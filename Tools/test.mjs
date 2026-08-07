#!/usr/bin/env node
// One command to run every headless suite: `node Tools/test.mjs`.
//
// The suites are plain node scripts (web/*.headless.mjs) that load the REAL web/game.js in a
// node:vm sandbox and assert against ROM-derived numbers. They need no npm install and no
// disassembly checkout — only the committed web/assets. This runner just executes them all and
// prints one summary, so "are we green?" is a single command instead of a shell loop.
//
//   node Tools/test.mjs              # run everything
//   node Tools/test.mjs doors rank   # only suites whose name contains one of these
//   node Tools/test.mjs --verbose    # also print each suite's own PASS/FAIL lines
//
// Exit code is non-zero if any suite fails, so CI can call it directly.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(REPO, 'web');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const filters = args.filter((a) => !a.startsWith('-'));

const suites = fs.readdirSync(WEB)
  .filter((f) => f.endsWith('.headless.mjs'))
  .filter((f) => filters.length === 0 || filters.some((k) => f.includes(k)))
  .sort();

if (suites.length === 0) {
  console.error(`No suites matched ${JSON.stringify(filters)}. Available:`);
  for (const f of fs.readdirSync(WEB).filter((x) => x.endsWith('.headless.mjs')).sort())
    console.error('  ' + f.replace('.headless.mjs', ''));
  process.exit(2);
}

// A suite prints one line per assertion ("PASS ..." / "  ok  ..." / "FAIL ...") and exits non-zero
// if any failed. Count from the output so the summary reports assertions, not just suites.
const COUNT = /^(?:\s*)(PASS|ok|FAIL)\b|^\s{2}(ok|FAIL)\s/;
let totalAsserts = 0, totalFailed = 0;
const failedSuites = [];
const t0 = Date.now();

for (const file of suites) {
  const name = file.replace('.headless.mjs', '');
  const r = spawnSync(process.execPath, [path.join(WEB, file)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split(/\r?\n/);
  const asserts = lines.filter((l) => COUNT.test(l.trim()) || /^\s*(PASS|FAIL|ok)\s/.test(l));
  const failed = lines.filter((l) => /\bFAIL\b/.test(l));
  totalAsserts += asserts.length;
  totalFailed += failed.length;

  const ok = r.status === 0;
  if (!ok) failedSuites.push(name);
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name.padEnd(16)} ${String(asserts.length).padStart(4)} checks`);
  if (verbose) for (const l of lines) if (l.trim()) console.log('        ' + l);
  else if (!ok) {
    // On failure always show why, even without --verbose.
    for (const l of failed) console.log('        ' + l.trim());
    if (r.status === 2 || /HARNESS ERROR/.test(out))
      for (const l of lines.slice(0, 12)) if (l.trim()) console.log('        ' + l);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log(`${suites.length - failedSuites.length}/${suites.length} suites, ` +
            `${totalAsserts - totalFailed}/${totalAsserts} checks passed  (${secs}s)`);
if (failedSuites.length) {
  console.log('failed: ' + failedSuites.join(', '));
  process.exit(1);
}
