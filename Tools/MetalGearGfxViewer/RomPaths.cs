using System;
using System.IO;

namespace MetalGearGfxViewer
{
    // Path resolution after the MSX disassembly was split into the sibling repo
    // southernsun/MetalGear. The gfx/data .asm sources (READ) are expected as a sibling at
    // ../MetalGear; override with the MG_ROM_DIR environment variable. (The examples/ folder
    // still lives in THIS repo, so it is located separately by FindSiblingFolder.)
    internal static class RomPaths
    {
        // Disassembly root (the folder containing data/rooms.asm), or null if not found.
        // Order: $MG_ROM_DIR, then the sibling ../MetalGear (or a MetalGear child of an
        // ancestor), then a legacy in-tree copy (walk up from the exe / cwd).
        public static string? TryResolveRomDir()
        {
            var env = Environment.GetEnvironmentVariable("MG_ROM_DIR");
            if (!string.IsNullOrEmpty(env) && HasRom(env))
                return Path.GetFullPath(env);

            foreach (var start in new[] { AppDomain.CurrentDomain.BaseDirectory, Environment.CurrentDirectory })
            {
                for (var dir = new DirectoryInfo(start); dir != null; dir = dir.Parent)
                {
                    if (HasRom(dir.FullName)) return dir.FullName;                  // legacy: asm in this tree
                    string sibling = Path.Combine(dir.FullName, "..", "MetalGear");
                    if (HasRom(sibling)) return Path.GetFullPath(sibling);         // sibling: ../MetalGear
                    string child = Path.Combine(dir.FullName, "MetalGear");
                    if (HasRom(child)) return Path.GetFullPath(child);
                }
            }
            return null;
        }

        // The disassembly's gfx/ folder (where the viewer loads its .asm graphics), or null.
        public static string? TryFindGfxFolder()
        {
            var rom = TryResolveRomDir();
            if (rom == null) return null;
            string gfx = Path.Combine(rom, "gfx");
            return Directory.Exists(gfx) ? gfx : null;
        }

        private static bool HasRom(string dir) => File.Exists(Path.Combine(dir, "data", "rooms.asm"));
    }
}
