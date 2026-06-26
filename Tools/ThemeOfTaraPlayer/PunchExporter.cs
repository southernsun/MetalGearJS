using System.IO;
using NAudio.Wave;

namespace ThemeOfTaraPlayer;

/// <summary>
/// Headless renderer for Solid Snake's PUNCH sound effect (Sfx_PunchGuard).
///
/// Drives <see cref="MusicEngine"/> offline using the exact same wiring the
/// live tool (PsgWaveProvider / AudioPlayer) uses, but accumulates the PSG
/// samples into a buffer and writes them to a 16-bit PCM mono WAV instead of
/// sending them to the speakers.
/// </summary>
public static class PunchExporter
{
    private const int SampleRate = 44100;
    private const int FrameRate = 60;
    private const int SamplesPerFrame = SampleRate / FrameRate; // 735

    // Safety cap so a misbehaving / looping stream can never spin forever.
    // A punch is well under a second; 2s is a generous ceiling.
    private const int MaxFrames = FrameRate * 2;

    // A few frames of trailing silence are kept after the last audible sample
    // so the tail decays naturally instead of clicking off.
    private const int TailFrames = 3;

    // Amplitude below this (on the [-1,1] float scale) counts as "silence" when
    // trimming the tail.
    private const float SilenceThreshold = 0.0008f;

    /// <summary>
    /// Render the punch SFX to <paramref name="outPath"/>. When null, defaults
    /// to &lt;repoRoot&gt;\web\assets\punch.wav. Returns a process exit code.
    /// </summary>
    public static int Export(string? outPath) =>
        ExportSfx(FindPunchSong, "punch.wav", "punch", outPath);

    /// <summary>Render the door SFX (Sfx_Door) to <paramref name="outPath"/> (default door.wav).</summary>
    public static int ExportDoor(string? outPath) =>
        ExportSfx(FindDoorSong, "door.wav", "door", outPath);

    /// <summary>Render the "Pick up item" SFX (0x24) to <paramref name="outPath"/> (default pickup.wav).</summary>
    public static int ExportPickup(string? outPath) =>
        ExportSfx(() => FindSfxByName("Pick up item"), "pickup.wav", "pickup", outPath);

    /// <summary>Render the "Spawn item" SFX (0x25, enemy drops) to <paramref name="outPath"/> (default spawn.wav).</summary>
    public static int ExportSpawn(string? outPath) =>
        ExportSfx(() => FindSfxByName("Spawn item"), "spawn.wav", "item spawn", outPath);

    /// <summary>
    /// Render ANY catalog SFX by its exact extractor name (generic `--export-sfx "<name>" [out]`).
    /// The default file name is the lowercased name with non-alphanumerics collapsed to '-'.
    /// </summary>
    public static int ExportByName(string name, string? outPath, double musicSeconds = 12.0)
    {
        string file = string.Join("-",
            name.ToLowerInvariant().Split(Path.GetInvalidFileNameChars().Concat(new[] { ' ', '/' }).ToArray(),
                StringSplitOptions.RemoveEmptyEntries)) + ".wav";
        if (FindSfxByName(name) != null)
            return ExportSfx(() => FindSfxByName(name), file, name, outPath, musicSeconds);
        // Fall back to a MUSIC track at a fixed render length (loops in-browser, like
        // alert.wav) — e.g. "Mercenary (Boss)" for the boss fights, "Theme of Tara (intro)"
        // for the area music (rendered long enough to cover the lead-in + the full loop).
        var find = (Func<MusicCatalog.Song?>)(() => Array.Find(MusicCatalog.Songs,
            s => s.Category == "Music" && s.Name.Equals(name, StringComparison.OrdinalIgnoreCase)));
        return ExportFixed(find, file, name, musicSeconds, outPath);
    }

    /// <summary>Locate an SFX catalog entry by its exact extractor name.</summary>
    private static MusicCatalog.Song? FindSfxByName(string name) =>
        Array.Find(MusicCatalog.Songs,
            s => s.Category == "SFX" && s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Render a catalog SFX scaled RELATIVE to a reference SFX instead of to its own peak.
    /// Per-file normalization (Normalize to 0.9) destroys the ROM's PSG loudness balance:
    /// an SFX whose PSG volumes render quieter than the reference gets boosted ABOVE its
    /// in-game level (user-reported: the incoming-call ring played harder than the other
    /// sounds). gain = 0.9 / rawPeak(reference), so a sound exactly as loud as the
    /// reference peaks at 0.9 and quieter ones sit proportionally lower — the ROM ratio.
    /// </summary>
    public static int ExportByNameRelative(string name, string refName, string? outPath)
    {
        try
        {
            string repoRoot = FindRepoRoot();
            string file = string.Join("-",
                name.ToLowerInvariant().Split(Path.GetInvalidFileNameChars().Concat(new[] { ' ', '/' }).ToArray(),
                    StringSplitOptions.RemoveEmptyEntries)) + ".wav";
            outPath ??= Path.Combine(repoRoot, "web", "assets", file);

            var song = FindSfxByName(name);
            var refSong = FindSfxByName(refName);
            if (song == null) { Console.Error.WriteLine($"Could not find SFX '{name}'."); return 1; }
            if (refSong == null) { Console.Error.WriteLine($"Could not find reference SFX '{refName}'."); return 1; }

            float[] target = TrimTrailingSilence(Render(song));
            float refPeak = RawPeak(Render(refSong));
            float tgtPeak = RawPeak(target);
            if (refPeak <= 1e-6f) { Console.Error.WriteLine("Reference rendered silent."); return 1; }

            float gain = 0.9f / refPeak;
            for (int i = 0; i < target.Length; i++) target[i] = Math.Clamp(target[i] * gain, -1f, 1f);

            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            WriteWav(outPath, target);
            Console.WriteLine(
                $"Wrote {outPath} ({target.Length / (double)SampleRate:F3}s)\n" +
                $"  raw peaks: target {tgtPeak:F4}, ref '{refName}' {refPeak:F4} " +
                $"-> final peak {Math.Min(0.9f * tgtPeak / refPeak, 1f):F3} (ref-relative)");
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine($"Export failed: {ex}"); return 1; }
    }

    private static float RawPeak(float[] samples)
    {
        float peak = 0f;
        foreach (var s in samples) peak = Math.Max(peak, Math.Abs(s));
        return peak;
    }

    /// <summary>Render ~8s of the Alert music (MUSIC 0x32) to alert.wav for the guard alert (loops in-browser).</summary>
    public static int ExportAlertMusic(string? outPath)
    {
        var find = (Func<MusicCatalog.Song?>)(() => Array.Find(MusicCatalog.Songs,
            s => s.Category == "Music" && s.Name.Equals("Alert", StringComparison.OrdinalIgnoreCase)));
        return ExportFixed(find, "alert.wav", "alert music", 8.0, outPath);
    }

    /// <summary>
    /// Analyse every looping music track and write web/assets/music-loops.json:
    /// { "<wavBaseName>": { "start": <sec>, "end": <sec> }, ... } (issue #16).
    /// The browser loops [start,end] (one melody body) so the one-time intro plays once instead of
    /// the whole file restarting from the top each loop. We DON'T re-render the WAVs — the existing
    /// ones already contain the intro + several body loops; this just records where the body repeats
    /// (the melody channel's first two GOTO/0xFE-0xFE frames).
    /// </summary>
    public static int ExportMusicLoops(string? outPath)
    {
        try
        {
            string repoRoot = FindRepoRoot();
            outPath ??= Path.Combine(repoRoot, "web", "assets", "music-loops.json");
            // wavBaseName -> catalog track name (must match how each *.wav was rendered)
            var tracks = new (string file, string name)[]
            {
                ("tara", "Theme of Tara (intro)"),
                ("sneaking", "Sneaking Mission"),
                ("tx55", "Metal Gear TX-55"),
                ("escape", "Beyond Big Boss"),
                ("mercenary", "Mercenary (Boss)"),
                ("foxhunter", "Return of Fox Hunter"),
                ("alert", "Alert"),
                ("red-alert", "Red Alert"),
            };
            // WAV durations (seconds) so we never emit a loopEnd past the rendered buffer.
            var wavSeconds = new Dictionary<string, double>();
            foreach (var (file, _) in tracks)
            {
                var wp = Path.Combine(repoRoot, "web", "assets", file + ".wav");
                if (File.Exists(wp)) wavSeconds[file] = (new FileInfo(wp).Length - 44) / (double)(SampleRate * 2);
            }
            var entries = new List<string>();
            var diag = new System.Text.StringBuilder();
            foreach (var (file, name) in tracks)
            {
                var song = Array.Find(MusicCatalog.Songs, s => s.Name == name);
                if (song == null) { diag.AppendLine($"{file}: track \"{name}\" not found"); continue; }
                var psg = new PsgEmulator(SampleRate);
                var engine = new MusicEngine(psg);
                engine.LoadMusic(MusicCatalog.Data, song.Channel1, song.Channel2, song.Channel3);
                int maxFrames = 240 * FrameRate;   // 4-minute safety cap
                var seen = new Dictionary<string, int>();
                int loopStartFrame = -1, loopEndFrame = -1;
                for (int i = 0; i < maxFrames; i++)
                {
                    engine.ProcessFrame();
                    string k = engine.StateKey();
                    if (seen.TryGetValue(k, out int prev)) { loopStartFrame = prev; loopEndFrame = i; break; }
                    seen[k] = i;
                }
                double wav = wavSeconds.TryGetValue(file, out double w) ? w : 0;
                if (loopStartFrame < 0)
                {
                    diag.AppendLine($"{file}: no state recurrence within {maxFrames} frames (wav {wav:F1}s) — whole-file loop");
                    continue;
                }
                double start = loopStartFrame / (double)FrameRate;
                double end = loopEndFrame / (double)FrameRate;
                double period = end - start;
                diag.AppendLine($"{file}: loop {start:F3}s..{end:F3}s (period {period:F3}s) wav {wav:F1}s");
                if (wav > 0 && end > wav + 0.05)
                {
                    diag.AppendLine($"  -> loopEnd {end:F3}s exceeds wav {wav:F1}s; SKIP (re-render this track longer to use a loop point)");
                    continue;
                }
                entries.Add($"\"{file}\":{{\"start\":{start.ToString("F4", System.Globalization.CultureInfo.InvariantCulture)},\"end\":{end.ToString("F4", System.Globalization.CultureInfo.InvariantCulture)}}}");
            }
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            File.WriteAllText(outPath, "{" + string.Join(",", entries) + "}\n");
            File.WriteAllText(Path.ChangeExtension(outPath, ".log"), diag.ToString());
            Console.WriteLine($"Wrote {outPath} ({entries.Count} tracks)");
            Console.WriteLine(diag.ToString());
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine($"Export failed: {ex}"); return 1; }
    }

    /// <summary>
    /// Render the death tune ("Just Another Dead Soldier", MUSIC 0x44 — played by SetDead)
    /// to dead.wav. The on-death pause is ~128 frames (DeadTimer 0x80 ≈ 2.1s); 4s captures
    /// the full jingle, and the browser plays it once (no loop) on game-over.
    /// </summary>
    public static int ExportDeathMusic(string? outPath)
    {
        var find = (Func<MusicCatalog.Song?>)(() => Array.Find(MusicCatalog.Songs,
            s => s.Category == "Music" && s.Name.Contains("Dead Soldier", StringComparison.OrdinalIgnoreCase)));
        return ExportFixed(find, "dead.wav", "death music", 4.0, outPath);
    }

    /// <summary>Render a fixed number of seconds of a track (for looping music that never ends).</summary>
    private static int ExportFixed(Func<MusicCatalog.Song?> find, string defaultFile, string label, double seconds, string? outPath)
    {
        try
        {
            string repoRoot = FindRepoRoot();
            outPath ??= Path.Combine(repoRoot, "web", "assets", defaultFile);
            var song = find();
            if (song == null) { Console.Error.WriteLine($"Could not find the {label} track."); return 1; }
            Console.WriteLine($"Rendering {label}: {song.DisplayName} (ch1=0x{song.Channel1:X4}), {seconds:F1}s");

            var psg = new PsgEmulator(SampleRate);
            var engine = new MusicEngine(psg);
            engine.LoadMusic(MusicCatalog.Data, song.Channel1, song.Channel2, song.Channel3);
            int frames = (int)(seconds * FrameRate);
            var buffer = new List<float>(frames * SamplesPerFrame);
            var frameBuffer = new float[SamplesPerFrame];
            for (int i = 0; i < frames; i++)
            {
                engine.ProcessFrame();
                psg.GenerateSamples(frameBuffer, 0, SamplesPerFrame);
                buffer.AddRange(frameBuffer);
            }
            float[] samples = Normalize(buffer.ToArray(), 0.9f);

            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            WriteWav(outPath, samples);
            var info = new FileInfo(outPath);
            Console.WriteLine($"Wrote {outPath}  ({samples.Length / (double)SampleRate:F2}s, {info.Length} bytes)");
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine($"Export failed: {ex}"); return 1; }
    }

    /// <summary>Shared render-to-WAV pipeline for any catalog SFX.</summary>
    private static int ExportSfx(Func<MusicCatalog.Song?> find, string defaultFile, string label, string? outPath, double maxSeconds = 2.0)
    {
        try
        {
            string repoRoot = FindRepoRoot();
            outPath ??= Path.Combine(repoRoot, "web", "assets", defaultFile);

            var song = find();
            if (song == null)
            {
                Console.Error.WriteLine($"Could not find the {label} SFX in MusicCatalog.");
                return 1;
            }

            Console.WriteLine($"Rendering SFX: {song.DisplayName} (ch1=0x{song.Channel1:X4})");

            float[] samples = TrimTrailingSilence(Render(song, (int)(maxSeconds * FrameRate)));
            samples = Normalize(samples, 0.9f);   // PSG SFX render quiet (~0.15 peak); lift so it's clearly audible

            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            WriteWav(outPath, samples);

            double seconds = samples.Length / (double)SampleRate;
            var info = new FileInfo(outPath);
            Console.WriteLine(
                $"Wrote {outPath}\n" +
                $"  format : 16-bit PCM, mono, {SampleRate} Hz\n" +
                $"  samples: {samples.Length} ({seconds:F3} s)\n" +
                $"  size   : {info.Length} bytes");

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Export failed: {ex}");
            return 1;
        }
    }

    /// <summary>Locate the plain door SFX (Sfx_Door), excluding the elevator-door variant.</summary>
    private static MusicCatalog.Song? FindDoorSong()
    {
        return Array.Find(MusicCatalog.Songs,
                   s => s.Category == "SFX" &&
                        s.Name.Contains("door", StringComparison.OrdinalIgnoreCase) &&
                        !s.Name.Contains("elevator", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Locate the catalog entry for Sfx_PunchGuard. The extractor names it
    /// "Punch guard" under the "SFX" category.
    /// </summary>
    private static MusicCatalog.Song? FindPunchSong()
    {
        // Prefer the exact "guard" punch; fall back to any punch entry.
        return Array.Find(MusicCatalog.Songs,
                   s => s.Category == "SFX" &&
                        s.Name.Contains("punch", StringComparison.OrdinalIgnoreCase) &&
                        s.Name.Contains("guard", StringComparison.OrdinalIgnoreCase))
            ?? Array.Find(MusicCatalog.Songs,
                   s => s.Category == "SFX" &&
                        s.Name.Contains("punch", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Step the engine frame-by-frame, pulling PSG samples the same way
    /// PsgWaveProvider.Read does, until the SFX channel reaches end-of-stream
    /// (engine reports not playing) plus a short tail — or the safety cap.
    /// </summary>
    private static float[] Render(MusicCatalog.Song song, int maxFrames = MaxFrames)
    {
        var psg = new PsgEmulator(SampleRate);
        var engine = new MusicEngine(psg);
        engine.LoadMusic(MusicCatalog.Data, song.Channel1, song.Channel2, song.Channel3);

        var buffer = new List<float>(maxFrames * SamplesPerFrame);
        var frameBuffer = new float[SamplesPerFrame];

        int tailRemaining = TailFrames;

        for (int frame = 0; frame < maxFrames; frame++)
        {
            engine.ProcessFrame();

            bool active = engine.IsPlaying;

            // Generate this frame's worth of samples regardless, so the final
            // (silencing) frame and a short tail are captured.
            psg.GenerateSamples(frameBuffer, 0, SamplesPerFrame);
            buffer.AddRange(frameBuffer);

            if (!active)
            {
                if (--tailRemaining <= 0)
                    break;
            }
        }

        return buffer.ToArray();
    }

    /// <summary>Scale samples so the loudest reaches <paramref name="targetPeak"/> (no-op if silent).</summary>
    private static float[] Normalize(float[] samples, float targetPeak)
    {
        float peak = 0f;
        foreach (var s in samples) peak = Math.Max(peak, Math.Abs(s));
        if (peak <= 1e-6f) return samples;
        float gain = targetPeak / peak;
        for (int i = 0; i < samples.Length; i++) samples[i] = Math.Clamp(samples[i] * gain, -1f, 1f);
        return samples;
    }

    private static float[] TrimTrailingSilence(float[] samples)
    {
        int last = samples.Length - 1;
        while (last >= 0 && Math.Abs(samples[last]) < SilenceThreshold)
            last--;

        if (last < 0)
            return samples; // entirely silent — keep as-is rather than zero-length

        // Keep a few ms of tail past the last audible sample.
        int keepTail = SampleRate / 100; // 10 ms
        int end = Math.Min(samples.Length, last + 1 + keepTail);

        var trimmed = new float[end];
        Array.Copy(samples, trimmed, end);
        return trimmed;
    }

    private static void WriteWav(string path, float[] samples)
    {
        var format = new WaveFormat(SampleRate, 16, 1); // 16-bit PCM, mono
        using var writer = new WaveFileWriter(path, format);

        var pcm = new byte[samples.Length * 2];
        for (int i = 0; i < samples.Length; i++)
        {
            float s = Math.Clamp(samples[i], -1f, 1f);
            short v = (short)Math.Round(s * short.MaxValue);
            pcm[i * 2] = (byte)(v & 0xFF);
            pcm[i * 2 + 1] = (byte)((v >> 8) & 0xFF);
        }

        writer.Write(pcm, 0, pcm.Length);
    }

    /// <summary>
    /// Walk up from the executable / working directory to the folder that
    /// contains sound/sfx/SfxPunch.asm (the disassembly root).
    /// </summary>
    private static string FindRepoRoot()
    {
        // The audio catalog is baked into MusicCatalog.cs (generated by extract_music.py from the
        // disassembly's MetalGear.lst), so this tool reads no .asm at runtime — FindRepoRoot only
        // locates THIS repo to write web/assets into. Marker: web/serve.js.
        var candidates = new[]
        {
            AppContext.BaseDirectory,
            Directory.GetCurrentDirectory()
        };

        foreach (var start in candidates)
        {
            var dir = new DirectoryInfo(start);
            while (dir != null)
            {
                if (File.Exists(Path.Combine(dir.FullName, "web", "serve.js")))
                    return dir.FullName;
                dir = dir.Parent;
            }
        }

        throw new DirectoryNotFoundException(
            "Could not locate this repo (web/serve.js) to write web/assets into.");
    }
}
