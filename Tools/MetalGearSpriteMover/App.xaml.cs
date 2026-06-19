using System;
using System.Windows;

namespace MetalGearSpriteMover
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Generic: `--export-actor-singles <SprLabel> <out.png> [#color]` — every
            // 16x16 pattern as its own flat-color frame (side-by-side actors, e.g. the bridge).
            int si = Array.FindIndex(e.Args, a => string.Equals(a, "--export-actor-singles", StringComparison.OrdinalIgnoreCase));
            if (si >= 0 && si + 2 < e.Args.Length)
            {
                System.Windows.Media.Color? SHex(int k) =>
                    si + k < e.Args.Length && e.Args[si + k].StartsWith("#")
                        ? (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(e.Args[si + k])
                        : (System.Windows.Media.Color?)null;
                int scode;
                try { scode = WebExporter.ExportActorSingles(e.Args[si + 1], e.Args[si + 2], SHex(3)); }
                catch (Exception ex) { Console.Error.WriteLine(ex.Message); scode = 1; }
                Shutdown(scode);
                return;
            }

            // Generic: `--export-actor <SprLabel> <out.png> [#A #B #overlap]` — any
            // sprites.asm label as OR-pair frames (see WebExporter.ExportActorPairs).
            int ai = Array.FindIndex(e.Args, a => string.Equals(a, "--export-actor", StringComparison.OrdinalIgnoreCase));
            if (ai >= 0 && ai + 2 < e.Args.Length)
            {
                System.Windows.Media.Color? Hex(int k) =>
                    ai + k < e.Args.Length && e.Args[ai + k].StartsWith("#")
                        ? (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(e.Args[ai + k])
                        : (System.Windows.Media.Color?)null;
                int code;
                try { code = WebExporter.ExportActorPairs(e.Args[ai + 1], e.Args[ai + 2], Hex(3), Hex(4), Hex(5)); }
                catch (Exception ex) { Console.Error.WriteLine(ex.Message); code = 1; }
                Shutdown(code);
                return;
            }

            // Headless export mode: `--export-web [outDir]` writes web/assets/snake.png
            // and snake.json without ever showing the main window, then exits. Everything
            // else keeps today's behaviour (open MainWindow).
            int idx = Array.FindIndex(e.Args, a =>
                string.Equals(a, "--export-web", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-guard", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-guard-bullet", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-zzz", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-prisoner", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-elevator", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-camera", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-shots", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-mgk", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-bigboss", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a, "--export-sgunner", StringComparison.OrdinalIgnoreCase));
            if (idx >= 0)
            {
                bool guard = string.Equals(e.Args[idx], "--export-guard", StringComparison.OrdinalIgnoreCase);
                bool bullet = string.Equals(e.Args[idx], "--export-guard-bullet", StringComparison.OrdinalIgnoreCase);
                bool zzz = string.Equals(e.Args[idx], "--export-zzz", StringComparison.OrdinalIgnoreCase);
                bool prisoner = string.Equals(e.Args[idx], "--export-prisoner", StringComparison.OrdinalIgnoreCase);
                bool elevator = string.Equals(e.Args[idx], "--export-elevator", StringComparison.OrdinalIgnoreCase);
                bool camera = string.Equals(e.Args[idx], "--export-camera", StringComparison.OrdinalIgnoreCase);
                bool shots = string.Equals(e.Args[idx], "--export-shots", StringComparison.OrdinalIgnoreCase);
                bool mgk = string.Equals(e.Args[idx], "--export-mgk", StringComparison.OrdinalIgnoreCase);
                bool bigboss = string.Equals(e.Args[idx], "--export-bigboss", StringComparison.OrdinalIgnoreCase);
                bool sgunner = string.Equals(e.Args[idx], "--export-sgunner", StringComparison.OrdinalIgnoreCase);
                string outDir = (idx + 1 < e.Args.Length && !e.Args[idx + 1].StartsWith("-"))
                    ? e.Args[idx + 1]
                    : WebExporter.DefaultOutDir();

                int exit = 0;
                try
                {
                    if (zzz) WebExporter.ExportZzz(outDir);
                    else if (bullet) WebExporter.ExportGuardBullet(outDir);
                    else if (guard) WebExporter.ExportGuard(outDir);
                    else if (prisoner) WebExporter.ExportPrisoner(outDir);
                    else if (elevator) WebExporter.ExportElevator(outDir);
                    else if (camera) WebExporter.ExportCamera(outDir);
                    else if (shots) WebExporter.ExportShots(outDir);
                    else if (mgk) WebExporter.ExportMgk(outDir);
                    else if (bigboss) WebExporter.ExportBigBoss(outDir);
                    else if (sgunner) WebExporter.ExportSgunner(outDir);
                    else WebExporter.Export(outDir);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Export failed: " + ex);
                    exit = 1;
                }
                Shutdown(exit);
                return;
            }

            // Normal launch: open the interactive window exactly as before.
            new MainWindow().Show();
        }
    }
}
