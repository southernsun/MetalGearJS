using System;
using System.IO;

namespace MetalGear.RoomViewer;

// Path resolution after the MSX disassembly was split into the sibling repo
// southernsun/MetalGear. The disassembly (.asm sources, READ) is expected as a sibling
// at ../MetalGear; the exported web assets (WRITE) live in THIS repo's web/assets.
// Override the disassembly location with the MG_ROM_DIR environment variable.
internal static class RomPaths
{
    // Disassembly root (the folder containing data/rooms.asm). Order: explicit path arg,
    // then $MG_ROM_DIR, then walk up from the exe (legacy in-tree), then the sibling
    // ../MetalGear (or a MetalGear child of an ancestor).
    public static string ResolveRomDir(string? explicitPath = null)
    {
        if (!string.IsNullOrEmpty(explicitPath) && HasRom(explicitPath))
            return Path.GetFullPath(explicitPath);

        var env = Environment.GetEnvironmentVariable("MG_ROM_DIR");
        if (!string.IsNullOrEmpty(env) && HasRom(env))
            return Path.GetFullPath(env);

        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
        {
            if (HasRom(dir.FullName)) return dir.FullName;                       // legacy: asm in this tree
            string sibling = Path.Combine(dir.FullName, "..", "MetalGear");
            if (HasRom(sibling)) return Path.GetFullPath(sibling);              // sibling: ../MetalGear
            string child = Path.Combine(dir.FullName, "MetalGear");
            if (HasRom(child)) return Path.GetFullPath(child);
        }

        throw new DirectoryNotFoundException(
            "Could not locate the Metal Gear disassembly (data/rooms.asm). Clone southernsun/MetalGear " +
            "as a sibling so it sits at ../MetalGear, set the MG_ROM_DIR environment variable, or pass " +
            "the disassembly path as the first argument.");
    }

    // A file inside the disassembly, e.g. RomFile("gfx", "sprites.asm").
    public static string RomFile(params string[] parts)
    {
        var all = new string[parts.Length + 1];
        all[0] = ResolveRomDir();
        Array.Copy(parts, 0, all, 1, parts.Length);
        return Path.Combine(all);
    }

    // A subdirectory inside the disassembly, e.g. RomSubdir("room_images").
    public static string RomSubdir(string name) => Path.Combine(ResolveRomDir(), name);

    // This repo's root (the folder containing web/serve.js) — where assets are written.
    public static string ResolveRepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "web", "serve.js")))
                return dir.FullName;

        throw new DirectoryNotFoundException(
            "Could not locate this repo (web/serve.js) to write web/assets into.");
    }

    public static string DefaultOutDir() => Path.Combine(ResolveRepoRoot(), "web", "assets");

    private static bool HasRom(string dir) => File.Exists(Path.Combine(dir, "data", "rooms.asm"));
}
