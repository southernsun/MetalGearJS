using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Text;
using System.Text.Json;

namespace MetalGear.RoomViewer;

// Room-map composer (`--export-map`). Tiles the ALREADY EXPORTED room screenshots
// (web/assets/rooms/<n>.png) into per-area overview PNGs under docs/room-maps, laid out from the
// exported room graph so each room's number and its neighbours are visible at a glance.
//
// This reads ONLY exported assets — manifest.json (the authoritative room list), connections.json
// (the ROM's per-room up/down/left/right table, `idxRoomConnections`) and doors.json (the door
// table, dest room per door) — never the .asm, so it runs without the sibling disassembly.
// Regenerating the underlying data is `--export-web` / `--export-doors`; this flag only composes.
//
// Layout: the connections table is a walk-graph, not a coordinate system, so cells are assigned by
// BFS (up = row-1, down = row+1, left = col-1, right = col+1). Elevator rooms (240-250) are cut
// points — they are never traversed, so each shaft splits the world into separate maps — and are
// emitted as their own map at the end. Rooms only reachable through a door (no edge connection at
// all) are drawn in a separate "interior rooms" strip under the grid of the area they open off.
internal static class MapExport
{
    // ---- geometry -------------------------------------------------------------------------
    private const int TileW = 160;          // room screenshots are 256x192; drawn at 0.625
    private const int TileH = 120;
    private const int Gap = 28;             // space between tiles: connection lines live here
    private const int CellW = TileW + Gap;
    private const int CellH = TileH + Gap;
    private const int Margin = 24;
    private const int HeaderH = 74;
    private const int CaptionH = 32;        // under an interior tile: "<- from room N"
    private const int MinInteriorCols = 6;

    // ---- colours --------------------------------------------------------------------------
    private static readonly Color Bg = Color.FromArgb(0x14, 0x16, 0x1A);
    private static readonly Color SectionBg = Color.FromArgb(0x1C, 0x1F, 0x25);
    private static readonly Color EdgeCol = Color.FromArgb(0x4C, 0xE0, 0x6A);      // walk connection
    private static readonly Color WarpCol = Color.FromArgb(0xFF, 0x9F, 0x2E);      // non-adjacent cells
    private static readonly Color DoorCol = Color.FromArgb(0x7A, 0xD8, 0xFF);      // "-> N" door dests
    private static readonly Color ElevCol = Color.FromArgb(0xFF, 0xD8, 0x3D);      // elevator doors
    private static readonly Color MovedCol = Color.FromArgb(0xFF, 0x5C, 0x5C);     // nudged cell

    private static bool IsElevator(int room) => room >= 240 && room <= 250;

    private sealed class Door
    {
        public int Id, Type, Lock, Dest;
    }

    // Human labels for the areas, taken from docs/SESSION-STATE.md ("The connected world",
    // "THE 2026-06-12 FULL-GAME RUN"). Keyed by the lowest room of the component so the mapping
    // survives re-exports. Anything not listed falls back to a plain room-range name.
    private static readonly Dictionary<int, (string Slug, string Title)> AreaNames = new()
    {
        [0] = ("building1-1f-courtyard-water", "Building 1 - 1F, courtyard, water & north corridors"),
        [16] = ("building1-2f-laser-loop", "Building 1 - 2F laser/camera loop"),
        [28] = ("building1-2f-branch", "Building 1 - 2F branch (elevator 240 from room 3)"),
        [40] = ("building1-upper", "Building 1 - upper floor (elevator 242)"),
        [54] = ("basement-dark-building2-gas", "Basement/prison -> dark corridor -> Building 2 gas floor"),
        [79] = ("building2-main", "Building 2 - main floor"),
        [88] = ("building2-upper", "Building 2 - upper floor (elevator 244)"),
        [111] = ("building3", "Building 3"),
        [224] = ("escape-ladders", "Escape ladders"),
    };

    public static void Run(string[] args)
    {
        string assetsDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
        string outDir = args.Length > 2
            ? args[2]
            : Path.Combine(RomPaths.ResolveRepoRoot(), "docs", "room-maps");
        Directory.CreateDirectory(outDir);

        var rooms = LoadRooms(Path.Combine(assetsDir, "manifest.json"));
        var conn = LoadConnections(Path.Combine(assetsDir, "connections.json"));
        var doors = LoadDoors(Path.Combine(assetsDir, "doors.json"));
        string roomsDir = Path.Combine(assetsDir, "rooms");

        // Inbound door sources, used to hang the door-only rooms off the right area.
        var doorSources = new Dictionary<int, List<int>>();
        foreach (var kv in doors)
            foreach (var d in kv.Value)
            {
                if (!doorSources.TryGetValue(d.Dest, out var l)) doorSources[d.Dest] = l = new List<int>();
                if (!l.Contains(kv.Key)) l.Add(kv.Key);
            }
        foreach (var l in doorSources.Values) l.Sort();

        // Connected components over the walk-graph, never traversing an elevator room.
        var comps = Components(rooms.Where(r => !IsElevator(r)), conn, cutElevators: true);
        comps.Sort((a, b) => b.Count != a.Count ? b.Count - a.Count : a.Min() - b.Min());

        var cores = comps.Where(c => c.Count > 1).ToList();
        var singles = comps.Where(c => c.Count == 1).Select(c => c[0]).OrderBy(r => r).ToList();

        // Attach each door-only room to the area it opens off (following door chains).
        var owner = new Dictionary<int, int>();
        for (int i = 0; i < cores.Count; i++) foreach (int r in cores[i]) owner[r] = i;
        for (int pass = 0; pass < 16; pass++)
        {
            bool changed = false;
            foreach (int s in singles)
            {
                if (owner.ContainsKey(s)) continue;
                foreach (int src in doorSources.GetValueOrDefault(s, new List<int>()))
                    if (owner.TryGetValue(src, out int o)) { owner[s] = o; changed = true; break; }
            }
            if (!changed) break;
        }

        var interiors = new List<List<int>>();
        for (int i = 0; i < cores.Count; i++) interiors.Add(new List<int>());
        var orphans = new List<int>();
        foreach (int s in singles)
        {
            if (owner.TryGetValue(s, out int o)) interiors[o].Add(s);
            else orphans.Add(s);
        }

        int placed = 0, index = 0;
        var summary = new StringBuilder();
        foreach (var f in Directory.GetFiles(outDir, "map-*.png")) File.Delete(f);

        for (int i = 0; i < cores.Count; i++)
        {
            index++;
            var name = AreaNames.GetValueOrDefault(cores[i].Min());
            placed += Compose(outDir, roomsDir, conn, doors, doorSources, index,
                              name.Slug, name.Title, cores[i], interiors[i], summary);
        }

        // The elevator shafts themselves: the cut points, drawn as one map so the shaft chains
        // (240; 241-242; 243-244; 245-246; 247-250) and what each car reaches are visible.
        var elevs = rooms.Where(IsElevator).OrderBy(r => r).ToList();
        if (elevs.Count > 0)
        {
            index++;
            placed += Compose(outDir, roomsDir, conn, doors, doorSources, index,
                              "elevators", "Elevator shafts (cut points between the maps)",
                              elevs, orphans, summary);
            orphans = new List<int>();
        }

        Console.WriteLine(summary.ToString());
        Console.WriteLine($"Rooms in manifest: {rooms.Count}; placed on a map: {placed}");
        if (orphans.Count > 0) Console.WriteLine("UNPLACED (no door and no connection): " + string.Join(",", orphans));
        Console.WriteLine($"Wrote {index} maps to {outDir}");
    }

    // ---- graph ---------------------------------------------------------------------------

    private static List<List<int>> Components(IEnumerable<int> rooms, Dictionary<int, int?[]> conn,
                                              bool cutElevators)
    {
        var set = new HashSet<int>(rooms);
        var seen = new HashSet<int>();
        var comps = new List<List<int>>();
        foreach (int r0 in set.OrderBy(r => r))
        {
            if (!seen.Add(r0)) continue;
            var comp = new List<int>();
            var q = new Queue<int>();
            q.Enqueue(r0);
            while (q.Count > 0)
            {
                int r = q.Dequeue();
                comp.Add(r);
                foreach (int? n in conn.GetValueOrDefault(r, new int?[4]))
                {
                    if (n is null || n == r || !set.Contains(n.Value)) continue;
                    if (cutElevators && IsElevator(n.Value)) continue;
                    if (seen.Add(n.Value)) q.Enqueue(n.Value);
                }
            }
            comps.Add(comp);
        }
        return comps;
    }

    // BFS grid assignment. Sub-components inside `group` (the elevator shafts) are laid out
    // independently and packed left to right with a one-cell gutter.
    private static Dictionary<int, Point> LayoutGrid(List<int> group, Dictionary<int, int?[]> conn,
                                                     List<string> notes)
    {
        // dir index: 0=up 1=down 2=left 3=right  ->  (drow, dcol)
        var delta = new[] { new Point(0, -1), new Point(0, 1), new Point(-1, 0), new Point(1, 0) };
        var pos = new Dictionary<int, Point>();       // Point.X = col, Point.Y = row
        int colOffset = 0;

        foreach (var sub in Components(group, conn, cutElevators: false)
                                .OrderByDescending(c => c.Count).ThenBy(c => c.Min()))
        {
            var local = new Dictionary<int, Point>();
            var q = new Queue<int>();
            int seed = sub.Min();
            local[seed] = new Point(0, 0);
            q.Enqueue(seed);
            while (q.Count > 0)
            {
                int r = q.Dequeue();
                var p = local[r];
                var c = conn.GetValueOrDefault(r, new int?[4]);
                for (int d = 0; d < 4; d++)
                {
                    int? n = c[d];
                    if (n is null || n == r || !sub.Contains(n.Value)) continue;
                    var want = new Point(p.X + delta[d].X, p.Y + delta[d].Y);
                    if (local.ContainsKey(n.Value)) continue;
                    var free = want;
                    if (local.ContainsValue(want))
                    {
                        free = NearestFree(want, local);
                        notes.Add($"room {n.Value} ({Dir(d)} of {r}) wanted cell r{want.Y}c{want.X} " +
                                  $"(taken) - nudged to r{free.Y}c{free.X}");
                    }
                    local[n.Value] = free;
                    q.Enqueue(n.Value);
                }
            }
            int minCol = local.Values.Min(p => p.X), minRow = local.Values.Min(p => p.Y);
            int width = local.Values.Max(p => p.X) - minCol + 1;
            foreach (var kv in local)
            {
                var p = new Point(kv.Value.X - minCol + colOffset, kv.Value.Y - minRow);
                pos[kv.Key] = p;
            }
            colOffset += width + 1;
        }
        return pos;
    }

    private static Point NearestFree(Point want, Dictionary<int, Point> taken)
    {
        for (int ring = 1; ring < 64; ring++)
            for (int dy = -ring; dy <= ring; dy++)
                for (int dx = -ring; dx <= ring; dx++)
                {
                    if (Math.Abs(dx) != ring && Math.Abs(dy) != ring) continue;
                    var p = new Point(want.X + dx, want.Y + dy);
                    if (!taken.ContainsValue(p)) return p;
                }
        return want;
    }

    private static string Dir(int d) => d switch { 0 => "up", 1 => "down", 2 => "left", _ => "right" };

    // ---- rendering -------------------------------------------------------------------------

    private static int Compose(string outDir, string roomsDir, Dictionary<int, int?[]> conn,
                               Dictionary<int, List<Door>> doors, Dictionary<int, List<int>> doorSources,
                               int index, string? slug, string? title,
                               List<int> core, List<int> interiors, StringBuilder summary)
    {
        var notes = new List<string>();
        var pos = LayoutGrid(core, conn, notes);
        var nudged = new HashSet<int>(notes.Select(n => int.Parse(n.Split(' ')[1])));

        int cols = pos.Values.Max(p => p.X) + 1;
        int rows = pos.Values.Max(p => p.Y) + 1;
        interiors = interiors.OrderBy(r => r).ToList();
        int intCols = interiors.Count == 0 ? 0 : Math.Min(interiors.Count,
                          Math.Max(Math.Max(cols, MinInteriorCols),
                                   (int)Math.Ceiling(Math.Sqrt(interiors.Count))));
        int intRows = interiors.Count == 0 ? 0 : (interiors.Count + intCols - 1) / intCols;

        string range = RangeText(core);
        int gridW = cols * CellW - Gap;
        int intW = intCols * CellW - Gap;
        int width = Math.Max(gridW, intW) + 2 * Margin;
        // narrow maps must still fit the header text
        width = Math.Max(width, (int)Math.Ceiling(HeaderWidth(title, range, index)) + 2 * Margin);
        int gridTop = HeaderH;
        int gridH = rows * CellH - Gap;
        int intTop = gridTop + gridH + (interiors.Count > 0 ? 46 : 0);
        int intH = intRows * (TileH + CaptionH + Gap);
        int height = intTop + intH + Margin;

        string file = $"map-{index:00}-{(string.IsNullOrEmpty(slug) ? "rooms" : slug)}-{range}.png";
        string path = Path.Combine(outDir, file);

        using var bmp = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.Clear(Bg);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

            using var fTitle = new Font("Segoe UI", 15f, FontStyle.Bold);
            using var fLegend = new Font("Segoe UI", 8.25f);
            using var fNum = new Font("Consolas", 12f, FontStyle.Bold);
            using var fCap = new Font("Segoe UI", 7.5f);
            using var fSection = new Font("Segoe UI", 11f, FontStyle.Bold);
            using var white = new SolidBrush(Color.White);
            using var grey = new SolidBrush(Color.FromArgb(0xA8, 0xB0, 0xBC));

            g.DrawString(Heading(title, range, index), fTitle, white, Margin, 14f);
            g.DrawString(Legend, fLegend, grey, Margin, 44f);

            Point Origin(Point p) => new(Margin + p.X * CellW, gridTop + p.Y * CellH);

            // connection lines first, so tiles sit on top of them
            using var pEdge = new Pen(EdgeCol, 3f);
            using var pWarp = new Pen(WarpCol, 2f) { DashStyle = DashStyle.Dash };
            var drawn = new HashSet<(int, int)>();
            foreach (int r in core)
            {
                var c = conn.GetValueOrDefault(r, new int?[4]);
                var a = Origin(pos[r]);
                for (int d = 0; d < 4; d++)
                {
                    int? n = c[d];
                    if (n is null || n == r || !pos.ContainsKey(n.Value)) continue;
                    var key = (Math.Min(r, n.Value), Math.Max(r, n.Value));
                    if (!drawn.Add(key)) continue;
                    var b = Origin(pos[n.Value]);
                    int dr = pos[n.Value].Y - pos[r].Y, dc = pos[n.Value].X - pos[r].X;
                    bool adjacent = (d == 0 && dr == -1 && dc == 0) || (d == 1 && dr == 1 && dc == 0)
                                 || (d == 2 && dc == -1 && dr == 0) || (d == 3 && dc == 1 && dr == 0);
                    if (adjacent)
                    {
                        if (dc == 0)
                        {
                            int x = a.X + TileW / 2;
                            int y0 = Math.Min(a.Y, b.Y) + TileH, y1 = Math.Max(a.Y, b.Y);
                            g.DrawLine(pEdge, x, y0, x, y1);
                        }
                        else
                        {
                            int y = a.Y + TileH / 2;
                            int x0 = Math.Min(a.X, b.X) + TileW, x1 = Math.Max(a.X, b.X);
                            g.DrawLine(pEdge, x0, y, x1, y);
                        }
                    }
                    else
                    {
                        g.DrawLine(pWarp, a.X + TileW / 2, a.Y + TileH / 2, b.X + TileW / 2, b.Y + TileH / 2);
                        notes.Add($"{r} {Dir(d)} -> {n.Value}: cells are not adjacent (drawn dashed)");
                    }
                }
            }

            foreach (int r in core)
            {
                var o = Origin(pos[r]);
                DrawTile(g, roomsDir, r, o.X, o.Y, fNum, fCap, conn, doors, nudged.Contains(r));
            }

            if (interiors.Count > 0)
            {
                using var sect = new SolidBrush(SectionBg);
                g.FillRectangle(sect, Margin - 8, intTop - 38, width - 2 * Margin + 16, intH + 46);
                g.DrawString($"Interior / door-only rooms of this area ({interiors.Count}) - " +
                             "reached only through a door, no walk connection",
                             fSection, grey, Margin, intTop - 34f);
                for (int i = 0; i < interiors.Count; i++)
                {
                    int r = interiors[i];
                    int x = Margin + (i % intCols) * CellW;
                    int y = intTop + (i / intCols) * (TileH + CaptionH + Gap);
                    DrawTile(g, roomsDir, r, x, y, fNum, fCap, conn, doors, false);
                    var from = doorSources.GetValueOrDefault(r, new List<int>());
                    string cap = from.Count == 0 ? "<- (no inbound door)" : "<- from " + string.Join(", ", from);
                    g.DrawString(cap, fCap, grey, x, y + TileH + 4f);
                }
            }
        }
        bmp.Save(path, ImageFormat.Png);

        long bytes = new FileInfo(path).Length;
        summary.AppendLine($"{file}");
        summary.AppendLine($"    {width}x{height} px, {bytes / 1024} KB, grid {rows}x{cols}");
        summary.AppendLine($"    core ({core.Count}): {RangeText(core)}");
        if (interiors.Count > 0)
            summary.AppendLine($"    interiors ({interiors.Count}): {RangeText(interiors)}");
        foreach (var n in notes.Distinct()) summary.AppendLine($"    note: {n}");
        summary.AppendLine();
        return core.Count + interiors.Count;
    }

    private const string Legend =
        "green = walk connection    orange dashed = connected but not grid-adjacent    " +
        "\"-> N\" = door to room N    \"ELEV N\" = elevator door    \"<->\" = room wraps to itself";

    private static string Heading(string? title, string range, int index) =>
        $"Map {index:00} - {(string.IsNullOrEmpty(title) ? $"Rooms {range}" : title)}";

    // Widest header line, so a narrow map's canvas doesn't clip the title/legend.
    private static float HeaderWidth(string? title, string range, int index)
    {
        using var probe = new Bitmap(1, 1);
        using var g = Graphics.FromImage(probe);
        using var fTitle = new Font("Segoe UI", 15f, FontStyle.Bold);
        using var fLegend = new Font("Segoe UI", 8.25f);
        return Math.Max(g.MeasureString(Heading(title, range, index), fTitle).Width,
                        g.MeasureString(Legend, fLegend).Width);
    }

    private static void DrawTile(Graphics g, string roomsDir, int room, int x, int y,
                                 Font fNum, Font fCap, Dictionary<int, int?[]> conn,
                                 Dictionary<int, List<Door>> doors, bool nudged)
    {
        string png = Path.Combine(roomsDir, $"{room}.png");
        if (File.Exists(png))
        {
            using var src = LoadUnlocked(png);
            g.DrawImage(src, new Rectangle(x, y, TileW, TileH),
                        new Rectangle(0, 0, src.Width, src.Height), GraphicsUnit.Pixel);
        }
        else
        {
            using var miss = new SolidBrush(Color.FromArgb(0x30, 0x30, 0x38));
            g.FillRectangle(miss, x, y, TileW, TileH);
        }

        using var border = new Pen(nudged ? MovedCol : Color.FromArgb(0x5A, 0x62, 0x70), nudged ? 3f : 1f);
        g.DrawRectangle(border, x, y, TileW - 1, TileH - 1);

        // room number badge (top-left)
        string num = room.ToString();
        var sz = g.MeasureString(num, fNum);
        using var badge = new SolidBrush(Color.FromArgb(0xD0, 0, 0, 0));
        g.FillRectangle(badge, x + 2, y + 2, sz.Width + 8, sz.Height + 2);
        using var numBrush = new SolidBrush(nudged ? MovedCol : Color.White);
        g.DrawString(num, fNum, numBrush, x + 6, y + 3);

        // "wraps to itself" marker (1-wide corridors set left/right to their own room id)
        var c = conn.GetValueOrDefault(room, new int?[4]);
        var wrap = new List<string>();
        if (c[0] == room || c[1] == room) wrap.Add("v^");
        if (c[2] == room || c[3] == room) wrap.Add("<->");
        if (wrap.Count > 0)
        {
            string w = string.Join(" ", wrap);
            var ws = g.MeasureString(w, fCap);
            g.FillRectangle(badge, x + TileW - ws.Width - 6, y + 2, ws.Width + 4, ws.Height);
            using var wb = new SolidBrush(WarpCol);
            g.DrawString(w, fCap, wb, x + TileW - ws.Width - 4, y + 2);
        }

        // door destinations, on a strip along the bottom of the tile
        var list = doors.GetValueOrDefault(room, new List<Door>());
        if (list.Count > 0)
        {
            var plain = list.Where(d => !IsElevator(d.Dest)).Select(d => d.Dest).Distinct().OrderBy(v => v).ToList();
            var elev = list.Where(d => IsElevator(d.Dest)).Select(d => d.Dest).Distinct().OrderBy(v => v).ToList();
            var lines = new List<(string Text, Color Col)>();
            if (plain.Count > 0) lines.Add(("-> " + string.Join(" ", plain), DoorCol));
            if (elev.Count > 0) lines.Add(("ELEV " + string.Join(" ", elev), ElevCol));
            float lh = g.MeasureString("0", fCap).Height;
            float top = y + TileH - lh * lines.Count - 2;
            using var strip = new SolidBrush(Color.FromArgb(0xCC, 0, 0, 0));
            g.FillRectangle(strip, x + 1, top, TileW - 2, lh * lines.Count + 2);
            for (int i = 0; i < lines.Count; i++)
            {
                using var b = new SolidBrush(lines[i].Col);
                g.DrawString(lines[i].Text, fCap, b, x + 3, top + i * lh);
            }
        }
    }

    // Bitmap-from-file without keeping the file locked for the rest of the run.
    private static Bitmap LoadUnlocked(string path)
    {
        using var ms = new MemoryStream(File.ReadAllBytes(path));
        using var tmp = new Bitmap(ms);
        return new Bitmap(tmp);
    }

    // ---- data + text helpers ---------------------------------------------------------------

    private static List<int> LoadRooms(string manifestPath)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(manifestPath));
        return doc.RootElement.GetProperty("rooms").EnumerateArray().Select(e => e.GetInt32()).ToList();
    }

    private static Dictionary<int, int?[]> LoadConnections(string path)
    {
        var map = new Dictionary<int, int?[]>();
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        foreach (var p in doc.RootElement.EnumerateObject())
        {
            var a = new int?[4];
            string[] keys = { "up", "down", "left", "right" };
            for (int i = 0; i < 4; i++)
            {
                var v = p.Value.GetProperty(keys[i]);
                a[i] = v.ValueKind == JsonValueKind.Null ? null : v.GetInt32();
            }
            map[int.Parse(p.Name)] = a;
        }
        return map;
    }

    private static Dictionary<int, List<Door>> LoadDoors(string path)
    {
        var map = new Dictionary<int, List<Door>>();
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        foreach (var p in doc.RootElement.EnumerateObject())
        {
            var list = new List<Door>();
            foreach (var e in p.Value.EnumerateArray())
                list.Add(new Door
                {
                    Id = e.GetProperty("id").GetInt32(),
                    Type = e.GetProperty("type").GetInt32(),
                    Lock = e.TryGetProperty("lock", out var lk) ? lk.GetInt32() : 0,
                    Dest = e.GetProperty("dest").GetInt32(),
                });
            map[int.Parse(p.Name)] = list;
        }
        return map;
    }

    // "0-15+64-78+102-110" — contiguous runs of room numbers, for filenames and the summary.
    private static string RangeText(IEnumerable<int> rooms)
    {
        var s = rooms.Distinct().OrderBy(r => r).ToList();
        if (s.Count == 0) return "none";
        var parts = new List<string>();
        int start = s[0], prev = s[0];
        for (int i = 1; i <= s.Count; i++)
        {
            if (i < s.Count && s[i] == prev + 1) { prev = s[i]; continue; }
            parts.Add(start == prev ? $"{start}" : $"{start}-{prev}");
            if (i < s.Count) { start = prev = s[i]; }
        }
        string all = string.Join("+", parts);
        return all.Length <= 40 ? all : $"{s[0]}-{s[^1]}";
    }
}
