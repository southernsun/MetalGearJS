using System.Runtime.InteropServices;
using System.Windows;

namespace ThemeOfTaraPlayer;

public partial class App : Application
{
    [DllImport("kernel32.dll")]
    private static extern bool AttachConsole(int dwProcessId);
    private const int ATTACH_PARENT_PROCESS = -1;
    protected override void OnStartup(StartupEventArgs e)
    {
        // Headless export mode: `--export-punch [outPath]`. Renders the
        // "Punch guard" SFX (Sfx_PunchGuard) to a WAV file and exits without
        // ever opening the interactive player window.
        var args = e.Args;
        for (int i = 0; i < args.Length; i++)
        {
            bool isPunch = string.Equals(args[i], "--export-punch", StringComparison.OrdinalIgnoreCase);
            bool isDoor = string.Equals(args[i], "--export-door", StringComparison.OrdinalIgnoreCase);
            bool isAlert = string.Equals(args[i], "--export-alert", StringComparison.OrdinalIgnoreCase);
            bool isDead = string.Equals(args[i], "--export-dead", StringComparison.OrdinalIgnoreCase);
            bool isPickup = string.Equals(args[i], "--export-pickup", StringComparison.OrdinalIgnoreCase);
            bool isSpawn = string.Equals(args[i], "--export-spawn", StringComparison.OrdinalIgnoreCase);

            // `--export-sfx-rel "<name>" "<refName>" [outPath]`: render an SFX scaled
            // relative to a reference SFX (preserves the ROM's PSG loudness balance).
            if (string.Equals(args[i], "--export-sfx-rel", StringComparison.OrdinalIgnoreCase) && i + 2 < args.Length)
            {
                AttachConsole(ATTACH_PARENT_PROCESS);
                string? relOut = (i + 3 < args.Length && !args[i + 3].StartsWith("--")) ? args[i + 3] : null;
                Shutdown(PunchExporter.ExportByNameRelative(args[i + 1], args[i + 2], relOut));
                return;
            }

            // Generic: `--export-sfx "<catalog name>" [outPath] [seconds]` renders any SFX
            // by name; Music-category tracks render [seconds] (default 12, loop in-browser).
            if (string.Equals(args[i], "--export-sfx", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                AttachConsole(ATTACH_PARENT_PROCESS);
                string name = args[i + 1];
                string? sfxOut = (i + 2 < args.Length && !args[i + 2].StartsWith("--")) ? args[i + 2] : null;
                double seconds = 12.0;
                if (i + 3 < args.Length && double.TryParse(args[i + 3],
                        System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out double s))
                    seconds = s;
                Shutdown(PunchExporter.ExportByName(name, sfxOut, seconds));
                return;
            }

            if (isPunch || isDoor || isAlert || isDead || isPickup || isSpawn)
            {
                // WinExe has no console; attach to the launching terminal so
                // the export's status/verification output is visible.
                AttachConsole(ATTACH_PARENT_PROCESS);

                string? outPath = (i + 1 < args.Length && !args[i + 1].StartsWith("--"))
                    ? args[i + 1]
                    : null;

                int code = isDead ? PunchExporter.ExportDeathMusic(outPath)
                         : isAlert ? PunchExporter.ExportAlertMusic(outPath)
                         : isDoor ? PunchExporter.ExportDoor(outPath)
                         : isPickup ? PunchExporter.ExportPickup(outPath)
                         : isSpawn ? PunchExporter.ExportSpawn(outPath)
                         : PunchExporter.Export(outPath);
                Shutdown(code);
                return;
            }
        }

        // Normal interactive startup (App.xaml no longer sets StartupUri, so we
        // create and show the main window ourselves).
        base.OnStartup(e);
        var window = new MainWindow();
        window.Show();
    }
}
