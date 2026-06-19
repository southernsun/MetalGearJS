// Shared resolver for the original Metal Gear (MSX) disassembly source tree.
//
// The `.asm`/`.lst` disassembly (constants/, data/, gfx/, logic/, sound/, MetalGear.asm,
// MetalGear.lst) used to live in this repo but now lives in the separate southernsun/MetalGear
// repo. The convention is to clone that repo as a SIBLING of this one so it sits at
// `../MetalGear` (this repo's folder is `MetalGearJS`). Set the MG_ROM_DIR environment variable
// to override that location (e.g. if the disassembly is cloned elsewhere).
//
// Tools that read disassembly sources should import { romDir, readRom } from here and pass the
// exact relative asm path (e.g. readRom('constants/Enums.asm'), readRom('MetalGear.lst')).
// In-repo paths (web/assets, docs, web/game.js, ...) must NOT go through here — keep resolving
// those against this repo's root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));            // <repo>/Tools
const repoRoot = path.resolve(here, '..');                           // <repo> (MetalGearJS)

// Root = $MG_ROM_DIR if set, otherwise the sibling ../MetalGear, resolved to an absolute path.
export const romDir = process.env.MG_ROM_DIR
  ? path.resolve(process.env.MG_ROM_DIR)
  : path.resolve(repoRoot, '..', 'MetalGear');

// Read a disassembly source file by its repo-relative asm path. Throws a clear, actionable
// error if the file/dir is missing (instead of a bare ENOENT).
export function readRom(relPath) {
  const full = path.join(romDir, relPath);
  try {
    return fs.readFileSync(full, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        `Disassembly source not found: ${full} (relPath "${relPath}", romDir "${romDir}"). ` +
        `Clone southernsun/MetalGear as a sibling so it is at ../MetalGear, ` +
        `or set MG_ROM_DIR to its location.`,
      );
    }
    throw err;
  }
}
