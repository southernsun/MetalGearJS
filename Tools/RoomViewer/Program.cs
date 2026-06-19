using MetalGear.RoomViewer.Game;
using MetalGear.RoomViewer.UI;

namespace MetalGear.RoomViewer;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        string root = ResolveGameRoot(args);
        var data = GameData.Load(root);

        // Headless export for batch/verification: --render <room> [<room> ...] <outDir>
        if (args.Length > 0 && args[0] == "--render")
        {
            RenderHeadless(data, args);
            return;
        }

        // Debug: --palette <room> â€” print the room's 16-colour palette (R,G,B) and exit.
        if (args.Length >= 2 && args[0] == "--palette")
        {
            var rr = new Render.RoomRenderer(data);
            var pal = rr.BuildScene(int.Parse(args[1])).Palette;
            for (int i = 0; i < 16; i++)
            {
                var c = pal[i];
                Console.WriteLine($"{i,2} (0x{i:X}): {c.R},{c.G},{c.B}");
            }
            return;
        }

        // Headless: --export-names â€” decode weapon/item name strings (idxWeaponName/idxItemName) to
        // names.json. Parsed from the raw .asm (the asm parser strips quoted strings).
        if (args.Length > 0 && args[0] == "--export-names")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            var weapons = ParseNameTable(Path.Combine(root, "data", "weaponnames.asm"), "idxWeaponName");
            var items = ParseNameTable(Path.Combine(root, "data", "itemnames.asm"), "idxItemName");
            string Obj(System.Collections.Generic.Dictionary<int, string> m) =>
                "{" + string.Join(",", m.OrderBy(kv => kv.Key).Select(kv => $"\"{kv.Key}\":\"{kv.Value}\"")) + "}";
            File.WriteAllText(Path.Combine(outDir, "names.json"),
                "{\n  \"weapons\": " + Obj(weapons) + ",\n  \"items\": " + Obj(items) + "\n}\n");
            Console.WriteLine($"Names: wrote names.json ({weapons.Count} weapons, {items.Count} items)");
            return;
        }

        // Headless: --export-doors â€” regenerate only doors.json + door-types.json for the rooms already
        // in web/assets/manifest.json (so the room set isn't touched). Picks up the door `lock` field.
        if (args.Length > 0 && args[0] == "--export-doors")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            var mani = System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(outDir, "manifest.json")));
            var rooms = new List<int>();
            foreach (var e in mani.RootElement.GetProperty("rooms").EnumerateArray()) rooms.Add(e.GetInt32());
            WriteDoorsJson(Path.Combine(outDir, "doors.json"), Path.Combine(outDir, "door-types.json"),
                           data, rooms, new HashSet<int>(rooms));
            ExportDoorGfx(new Render.RoomRenderer(data), data, outDir);   // door + wall PNGs + door-gfx.json
            return;
        }

        // Debug: --doors-audit â€” list every room's doors with their lock type (IdDoorsLogic & 0x1F)
        // and dest, flag card/elevator doors, and dump elevator rooms' connections. Helps pick a
        // keycard-door room + an elevator shaft to export.
        if (args.Length > 0 && args[0] == "--doors-audit")
        {
            byte[] logic = data.Asm.Bytes("IdDoorsLogic");
            string LockName(int lk) => lk == 1 ? "ELEVATOR" : (lk >= 2 && lk <= 9) ? ("CARD" + (lk - 1)) : lk.ToString();
            Console.WriteLine("== rooms with a CARD or ELEVATOR door ==");
            for (int room = 0; room < 256; room++)
            {
                var doors = data.Doors(room);
                if (doors.Count == 0) continue;
                var notable = new List<string>();
                foreach (var d in doors)
                {
                    int lk = (d.Id - 1 >= 0 && d.Id - 1 < logic.Length) ? (logic[d.Id - 1] & 0x1F) : -1;
                    if (lk == 1 || (lk >= 2 && lk <= 9))
                        notable.Add($"id{d.Id} {LockName(lk)} type{d.Type} -> room{d.Dest} @({d.X},{d.Y})");
                }
                if (notable.Count > 0)
                {
                    bool def = data.RoomDefined(room);
                    Console.WriteLine($"room {room}{(def ? "" : " (UNDEFINED)")}: {string.Join(" | ", notable)}");
                }
            }
            Console.WriteLine("\n== elevator rooms (240-250): connections up/down/left/right ==");
            for (int room = 240; room <= 250; room++)
            {
                int[] c = data.Connections(room);
                Console.WriteLine($"room {room}{(data.RoomDefined(room) ? "" : " (UNDEFINED)")}: up={c[0]} down={c[1]} left={c[2]} right={c[3]}");
            }
            return;
        }

        // Headless: --export-hud-icons [<outDir>] â€” write only the HUD assets (hud-icons.png/json +
        // font.png/json), leaving the room set and other assets untouched.
        if (args.Length > 0 && args[0] == "--export-hud-icons")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            var rr = new Render.RoomRenderer(data);
            ExportHudIcons(rr, data, outDir);
            ExportFont(rr, data, outDir);
            ExportCallSign(rr, data, outDir);    // call-sign.png (incoming radio call)
            ExportAlertIcon(rr, data, outDir);   // alert-icon.png + alert-icon-red.png
            return;
        }

        // Headless: --export-title [<outDir>] â€” write only the boot/title assets.
        if (args.Length > 0 && args[0] == "--export-title")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            ExportTitle(data, outDir);
            return;
        }

        // Headless: --export-radio [<outDir>] â€” write only the radio/transceiver screen assets.
        if (args.Length > 0 && args[0] == "--export-radio")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            ExportRadio(data, outDir);
            return;
        }

        // Headless: --export-pitfall [<outDir>] â€” write only the open-pitfall image.
        if (args.Length > 0 && args[0] == "--export-pitfall")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            ExportPitfall(new Render.RoomRenderer(data), data, outDir);
            return;
        }

        // Headless: --export-hindd [<outDir>] â€” the Hind D body + wreck tile blocks
        // (HindDTileMap/2, drawn at (0x40,0) in room 50 by ChkDrawHindD/RemoveHindD).
        if (args.Length > 0 && args[0] == "--export-hindd")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            var rr = new Render.RoomRenderer(data);
            ExportTileBlock(rr, data, 50, "HindDTileMap", Path.Combine(outDir, "hindd.png"));
            ExportTileBlock(rr, data, 50, "HindDTileMap2", Path.Combine(outDir, "hindd-wreck.png"));
            // Metal Gear's body + the bare background that replaces it (room 118).
            ExportTileBlock(rr, data, 118, "MetalGearTileMap", Path.Combine(outDir, "metalgear.png"));
            ExportTileBlock(rr, data, 118, "MetalGearTileMap2", Path.Combine(outDir, "metalgear-bg.png"));
            return;
        }

        // Headless: --export-ending [<outDir>] â€” the ending EXPLOSION tile atlas (base + flash
        // palette) + frame layout JSON for the browser port. Tiles come from tileset 7
        // (TileSetEnding); maps from ExploxionTiles1/2/3 (data/tileblocks.asm). Base palette
        // RoomPalette13, flash palette RoomPalette15 (data/palettes.asm).
        if (args.Length > 0 && args[0] == "--export-ending")
        {
            string outDir = args.Length > 1 ? args[1] : RomPaths.DefaultOutDir();
            Directory.CreateDirectory(outDir);
            ExportEnding(data, outDir);
            return;
        }

        // Headless web export: --export-web [<startRoom>] [<count>] [<outDir>]
        // Exports a connected cluster of rooms (PNG + collision each), plus
        // connections.json and manifest.json. Defaults: start 0, count 16,
        // <repoRoot>\web\assets. Also writes legacy room.png/room-collision.json
        // for the start room so the single-room prototype keeps working.
        if (args.Length > 0 && args[0] == "--export-web")
        {
            ExportWeb(data, root, args);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new ViewerForm(data));
    }

    // Decode a name table: idxLabel is a `dw txtX` list (1-based id -> label); each txtX is a `db`
    // with quoted ASCII, `0` = space, `@` = separator (-> space), `#ff`/`0FFh` = terminator.
    private static System.Collections.Generic.Dictionary<int, string> ParseNameTable(string path, string idxLabel)
    {
        var lines = File.ReadAllLines(path);
        var order = new List<string>();
        var byLabel = new System.Collections.Generic.Dictionary<string, string>();
        string? cur = null;
        foreach (var raw in lines)
        {
            string line = raw.Split(';')[0];
            var lm = System.Text.RegularExpressions.Regex.Match(line, @"^(\w+):");
            string rest = line;
            if (lm.Success) { cur = lm.Groups[1].Value; rest = line.Substring(lm.Length); }
            if (cur == idxLabel)
            {
                var dw = System.Text.RegularExpressions.Regex.Match(rest, @"\bdw\s+(\w+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (dw.Success) order.Add(dw.Groups[1].Value);
            }
            var db = System.Text.RegularExpressions.Regex.Match(rest, @"\bdb\s+(.*)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (db.Success && cur != null && !byLabel.ContainsKey(cur)) byLabel[cur] = DecodeName(db.Groups[1].Value);
        }
        var result = new System.Collections.Generic.Dictionary<int, string>();
        for (int i = 0; i < order.Count; i++)
            if (byLabel.TryGetValue(order[i], out var nm)) result[i + 1] = nm;
        return result;
    }

    private static string DecodeName(string ops)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var tok in ops.Split(','))                              // names have no commas inside quotes
        {
            string t = tok.Trim();
            if (t.Length == 0) continue;
            if (t.Length >= 2 && t[0] == '"' && t[^1] == '"') { sb.Append(t.Substring(1, t.Length - 2)); continue; }
            if (t == "0") { sb.Append(' '); continue; }                 // bare 0 = space between words
            break;                                                       // #ff / 0FFh / other -> terminator
        }
        return sb.ToString().Replace('@', ' ').Trim();                   // @ separator -> space
    }

    private static void RenderHeadless(GameData data, string[] args)
    {
        var renderer = new Render.RoomRenderer(data);
        string outDir = args[^1];
        Directory.CreateDirectory(outDir);
        for (int i = 1; i < args.Length - 1; i++)
        {
            int room = int.Parse(args[i]);
            using var bmp = renderer.DrawRoom(room);
            string file = Path.Combine(outDir, $"room_{room:000}.png");
            bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png);
        }
    }

    /// <summary>
    /// Web export: render a connected cluster of rooms (each a 256x192 PNG plus a
    /// 32x24 collision JSON under rooms/), plus connections.json and manifest.json.
    /// Every file is derived from the same data tables the in-game routines use, so
    /// the browser sees exactly what the ROM would. Also writes the legacy
    /// room.png/room-collision.json for the start room (the single-room prototype).
    /// </summary>
    private static void ExportWeb(GameData data, string root, string[] args)
    {
        // --export-web [start] [count] [outDir] [--extra N,N...] â€” numbers are positional, the
        // first non-number is the output directory. --extra appends explicitly-requested rooms
        // the connection BFS can't reach (door-linked rooms, e.g. elevator room 240 + its top
        // floor 31, which pair with room 3 by DOORS only â€” see docs/rom-data-formats.md).
        int start = 0, count = 16;
        string? outDir = null;
        var nums = new List<int>();
        var extras = new List<int>();
        for (int i = 1; i < args.Length; i++)
        {
            if (args[i] == "--extra" && i + 1 < args.Length)
            {
                foreach (var tok in args[++i].Split(','))
                    if (int.TryParse(tok, out int e)) extras.Add(e);
            }
            else if (int.TryParse(args[i], out int v)) nums.Add(v);
            else outDir ??= args[i];
        }
        if (nums.Count > 0) start = nums[0];
        if (nums.Count > 1) count = nums[1];
        outDir ??= RomPaths.DefaultOutDir();

        string roomsDir = Path.Combine(outDir, "rooms");
        Directory.CreateDirectory(roomsDir);

        var renderer = new Render.RoomRenderer(data);

        // BFS over connections from the start room; keep only defined rooms, cap at count.
        var order = new List<int>();
        var seen = new HashSet<int>();
        var queue = new Queue<int>();
        if (data.RoomDefined(start)) { queue.Enqueue(start); seen.Add(start); }
        while (queue.Count > 0 && order.Count < count)
        {
            int r = queue.Dequeue();
            order.Add(r);
            foreach (int n in data.Connections(r))
                if (n != 255 && data.RoomDefined(n) && seen.Add(n))
                    queue.Enqueue(n);
        }
        // Dedup against ORDER, not `seen` â€” the BFS enqueues neighbours into `seen` that the
        // room-count cap never dequeues, and those must still be exportable as extras.
        foreach (int e in extras)
            if (data.RoomDefined(e) && !order.Contains(e))
                order.Add(e);
        var exported = new HashSet<int>(order);

        // The goggles' infrared view (ChkGogglesPal, Banks0123.asm:2967): with the goggles
        // selected, SetRoomPal loads RoomPalette10 â€” the four per-room tile slots (1/3/5/9)
        // go grey/black while the fixed slots and sprites keep their colours. Exported as a
        // grey variant per room, rendered with that palette block applied on top.
        byte[] gogglesPal = data.Asm.Bytes("RoomPalette10");
        // The DARK rooms (SetRoomPal, Banks0123.asm:2946-2964: 123-125 and 220/221) render
        // with the BLACK palette (RoomPalette11) unless the FLASHLIGHT is selected.
        byte[] darkPal = data.Asm.Bytes("RoomPalette11");
        var darkRooms = new HashSet<int> { 123, 124, 125, 220, 221 };
        foreach (int room in order)
        {
            using (var bmp = renderer.DrawRoom(room))
                bmp.Save(Path.Combine(roomsDir, $"{room}.png"), System.Drawing.Imaging.ImageFormat.Png);
            using (var bmp = renderer.DrawRoom(room, gogglesPal))
                bmp.Save(Path.Combine(roomsDir, $"{room}.goggles.png"), System.Drawing.Imaging.ImageFormat.Png);
            if (darkRooms.Contains(room))
                using (var bmp = renderer.DrawRoom(room, darkPal))
                    bmp.Save(Path.Combine(roomsDir, $"{room}.dark.png"), System.Drawing.Imaging.ImageFormat.Png);
            int[] tiles = renderer.UnpackTileNumbers(room);
            WriteCollisionJson(Path.Combine(roomsDir, $"{room}.collision.json"), 32, 24, ComputeSolid(data, room, tiles), tiles);
        }

        WriteConnectionsJson(Path.Combine(outDir, "connections.json"), data, order, exported);
        WriteManifestJson(Path.Combine(outDir, "manifest.json"), order, start);
        WriteDoorsJson(Path.Combine(outDir, "doors.json"),
                       Path.Combine(outDir, "door-types.json"), data, order, exported);
        ExportDoorGfx(renderer, data, outDir);
        ExportAlertIcon(renderer, data, outDir);
        ExportHudIcons(renderer, data, outDir);
        ExportFont(renderer, data, outDir);
        ExportCallSign(renderer, data, outDir);
        ExportRadio(data, outDir);
        ExportTitle(data, outDir);
        ExportPitfall(renderer, data, outDir);

        // Legacy single-room files for the movement/punch prototype.
        using (var bmp = renderer.DrawRoom(start))
            bmp.Save(Path.Combine(outDir, "room.png"), System.Drawing.Imaging.ImageFormat.Png);
        int[] startTiles = renderer.UnpackTileNumbers(start);
        WriteCollisionJson(Path.Combine(outDir, "room-collision.json"), 32, 24, ComputeSolid(data, start, startTiles), startTiles);

        Console.WriteLine($"Exported {order.Count} rooms from start {start}: {string.Join(", ", order)}");
        Console.WriteLine($"Out: {outDir}");
        foreach (int room in order)
        {
            int[] c = data.Connections(room);
            string N(int n) => (n == 255 || !exported.Contains(n)) ? "--" : n.ToString();
            Console.WriteLine($"  room {room,3}: up={N(c[0]),3} down={N(c[1]),3} left={N(c[2]),3} right={N(c[3]),3}");
        }
    }

    /// <summary>
    /// Decode and export the four door graphics (GfxDoorFront/Down/Left/Right) as
    /// transparent PNGs in the building palette, plus door-gfx.json mapping each door
    /// type to its sprite + draw offset. Door gfx are 4bpp tile-blocks (LoadTilesGfxBlk):
    /// each 8x8 tile is 32 bytes (8 lines x 4 bytes), tiles row-major; a byte is two
    /// 4-bit pixels (high nibble = left). Index 0 is treated as transparent.
    /// </summary>
    private static void ExportDoorGfx(Render.RoomRenderer renderer, GameData data, string outDir)
    {
        var palette = renderer.BuildScene(0).Palette;  // building palette (our cluster)

        // name, label, tilesW, tilesH, used width, used height, source crop X.
        // The north door's 4-tile (32px) GfxDoorFront is an 8px jamb + 16px door + 8px jamb;
        // the ROM draws the centred 24px window (DrawDoorNorth NX=24), so crop from X=4.
        var doors = new (string file, string label, int tw, int th, int w, int h, int sx)[]
        {
            ("door-north.png", "GfxDoorFront", 4, 4, 24, 32, 4),
            ("door-south.png", "GfxDoorDown",  4, 1, 32, 8,  0),
            ("door-west.png",  "GfxDoorLeft",  1, 4, 8, 32,  0),
            ("door-east.png",  "GfxDoorRight", 1, 4, 8, 32,  0),
            // Type 5 (elevator door): DrawDoorElevator (drawdoors.asm:214) draws the centred
            // 24x32 of the 4x4-tile GfxDoorElevator (loaded by LoadGfxDoors, Banks0123.asm:2720).
            ("door-elevator.png", "GfxDoorElevator", 4, 4, 24, 32, 4),
        };
        foreach (var d in doors)
        {
            byte[] gfx = data.Gfx(d.label);
            using var bmp = DecodeDoor4bpp(gfx, d.tw, d.th, d.w, d.h, palette, d.sx);
            bmp.Save(Path.Combine(outDir, d.file), System.Drawing.Imaging.ImageFormat.Png);
        }

        // The prison/cell walls (DrawWallPrison*, drawdoors.asm:262-281) are TILE BLOCKS from
        // the host room's own tileset, drawn over the room's opening while closed: type 12/13
        // share TilesWallPrison2 (1 row x 4 cols), type 14 = TilesWallPrison1 (13 rows x 3),
        // type 15 = TilesWallPrison (12 rows x 2) â€” data/doors.asm:992-1024. Rendered with the
        // tileset/palette of the room each wall lives in (54 / 164 / 165 / 164).
        void SaveWallBlock(string label, int room, string file)
        {
            var scene = renderer.BuildScene(room);
            byte[] m = data.Asm.Bytes(label);
            int rows = m[0], cols = m[1];
            using var bmp = new System.Drawing.Bitmap(cols * 8, rows * 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < cols; c++)
                {
                    var t = scene.Tiles[m[2 + r * cols + c]];
                    for (int y = 0; y < 8; y++)
                        for (int x = 0; x < 8; x++)
                            bmp.SetPixel(c * 8 + x, r * 8 + y, scene.Palette[t.Get(x, y)]);
                }
            bmp.Save(Path.Combine(outDir, file), System.Drawing.Imaging.ImageFormat.Png);
        }
        if (data.RoomDefined(165))
        {
            SaveWallBlock("TilesWallPrison2", 54, "wall-12.png");
            SaveWallBlock("TilesWallPrison2", 164, "wall-13.png");
            SaveWallBlock("TilesWallPrison1", 165, "wall-14.png");
            SaveWallBlock("TilesWallPrison", 164, "wall-15.png");
        }

        // The basement / building-3 breakable BOMB walls (DrawBasemWall* + DrawWallBuil3_108,
        // drawdoors.asm:237-300; tile tables TilesBasemWall*/TilesWallBld3_108 in data/doors.asm:
        // 923-1082) use the SAME tile-block format as the prison walls, rendered in each wall's
        // home-room tileset. Render types 7-11 + 16-19. Where one type spans two rooms with the
        // same tileset (9: 59/96, 17: 93/169, 8: 61/115) the namesake room is used.
        void SaveWallIf(string label, int room, string file) { if (data.RoomDefined(room)) SaveWallBlock(label, room, file); }
        SaveWallIf("TilesBasemWall60",  60,  "wall-7.png");
        SaveWallIf("TilesBasemWall61",  61,  "wall-8.png");
        SaveWallIf("TilesBasemWall59",  59,  "wall-9.png");
        SaveWallIf("TilesBasemWall58",  58,  "wall-10.png");
        SaveWallIf("TilesBasemWall63",  63,  "wall-11.png");
        SaveWallIf("TilesWallBld3_108", 108, "wall-16.png");
        SaveWallIf("TilesBasemWall93",  93,  "wall-17.png");
        SaveWallIf("TilesBasemWall100", 100, "wall-18.png");
        SaveWallIf("TilesBasemWall112", 112, "wall-19.png");

        // type -> sprite + offset from the door's (x,y), plus `shear` = vertical pixels
        // shifted per column when drawing (reproduces drawdoors.asm). North/south draw
        // upright (shear 0); west/east are angled side doors: DrawDoorWest shifts +4 per
        // column, DrawDoorEast -4, giving the recessed-wall parallelogram.
        File.WriteAllText(Path.Combine(outDir, "door-gfx.json"),
            "{\n" +
            "  \"1\": {\"img\":\"door-north.png\",\"w\":24,\"h\":32,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"2\": {\"img\":\"door-south.png\",\"w\":32,\"h\":8,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"3\": {\"img\":\"door-west.png\",\"w\":8,\"h\":32,\"offX\":0,\"offY\":0,\"shear\":4},\n" +
            "  \"4\": {\"img\":\"door-east.png\",\"w\":8,\"h\":32,\"offX\":0,\"offY\":0,\"shear\":-4},\n" +
            "  \"5\": {\"img\":\"door-elevator.png\",\"w\":24,\"h\":32,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"7\": {\"img\":\"wall-7.png\",\"w\":32,\"h\":48,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"8\": {\"img\":\"wall-8.png\",\"w\":32,\"h\":8,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"9\": {\"img\":\"wall-9.png\",\"w\":24,\"h\":104,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"10\": {\"img\":\"wall-10.png\",\"w\":40,\"h\":104,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"11\": {\"img\":\"wall-11.png\",\"w\":40,\"h\":96,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"12\": {\"img\":\"wall-12.png\",\"w\":32,\"h\":8,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"13\": {\"img\":\"wall-13.png\",\"w\":32,\"h\":8,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"14\": {\"img\":\"wall-14.png\",\"w\":24,\"h\":104,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"15\": {\"img\":\"wall-15.png\",\"w\":16,\"h\":96,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"16\": {\"img\":\"wall-16.png\",\"w\":64,\"h\":80,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"17\": {\"img\":\"wall-17.png\",\"w\":16,\"h\":96,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"18\": {\"img\":\"wall-18.png\",\"w\":40,\"h\":96,\"offX\":0,\"offY\":0,\"shear\":0},\n" +
            "  \"19\": {\"img\":\"wall-19.png\",\"w\":48,\"h\":40,\"offX\":0,\"offY\":0,\"shear\":0}\n" +
            "}\n");
        Console.WriteLine("Doors: wrote door-{north,south,west,east,elevator}.png + prison walls + door-gfx.json");
    }

    /// <summary>
    /// Decode the normal-alert "!" icon into a 16x16 transparent PNG. The icon is split across
    /// two graphics: the BOTTOM half is in gfxAlertIcon (alerticon.asm), the TOP half is the
    /// tail of GfxItems (items.asm). Both 3bpp via ColorsItems, stored oriented correctly.
    /// The last 4 item tiles are [normalTL, normalTR, redTL, redTR]; alerticon tiles 0,1 are
    /// the normal bottom (2,3 the red). The guard raises the normal (single) alert.
    /// </summary>
    private static void ExportAlertIcon(Render.RoomRenderer renderer, GameData data, string outDir)
    {
        var palette = renderer.BuildScene(0).Palette;
        byte[] bottoms = data.Gfx("gfxAlertIcon");
        byte[] items = data.Gfx("GfxItems");
        byte[] cmap = data.Asm.Bytes("ColorsItems");
        int topBase = items.Length / 24 - 4;   // first of the 4 alert-top tiles

        void Blit(System.Drawing.Bitmap bmp, byte[] src, int tileIndex, int ox, int oy)
        {
            var t = Render.Tile.Decode3bpp(src, tileIndex * 24, cmap, flip: false);
            for (int y = 0; y < 8; y++)
                for (int x = 0; x < 8; x++)
                {
                    int ci = t.Get(x, y);
                    if (ci != 0) bmp.SetPixel(ox + x, oy + y, palette[ci]);
                }
        }
        // Normal alert "!": top = GfxItems tail tiles [0,1], bottom = gfxAlertIcon tiles [0,1].
        var n = new System.Drawing.Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        Blit(n, items, topBase + 0, 0, 0);  Blit(n, items, topBase + 1, 8, 0);
        Blit(n, bottoms, 0, 0, 8);          Blit(n, bottoms, 1, 8, 8);
        n.Save(Path.Combine(outDir, "alert-icon.png"), System.Drawing.Imaging.ImageFormat.Png);
        n.Dispose();
        // Red alert "!": top = GfxItems tail tiles [2,3], bottom = gfxAlertIcon tiles [2,3].
        var r = new System.Drawing.Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        Blit(r, items, topBase + 2, 0, 0);  Blit(r, items, topBase + 3, 8, 0);
        Blit(r, bottoms, 2, 0, 8);          Blit(r, bottoms, 3, 8, 8);
        r.Save(Path.Combine(outDir, "alert-icon-red.png"), System.Drawing.Imaging.ImageFormat.Png);
        r.Dispose();
        Console.WriteLine("Alert: wrote alert-icon.png + alert-icon-red.png (16x16; top=GfxItems tail, bottom=gfxAlertIcon)");
    }

    /// <summary>
    /// Export the weapon and item HUD icons (DrawWeaponHUD / DrawItemHUD). The icons live in the
    /// GfxItems 3bpp blob, loaded into VRAM page 1 at 0xB000 = (X=0, Y=96) by Load3bppTiles, 32 tiles
    /// per 256px row (LoadTilesGfx advances 8px and wraps at X=256, +8px per row). WeaponGfxXY /
    /// ItemGfxXY are page-1 pixel coords (dw word = (SY&lt;&lt;8)|SX; the SX byte's bit0 is a size
    /// flag: 0 -> 32x16 "big" weapon, 1 -> 16x16). We rebuild that page-1 bitmap from the decoded
    /// tiles and crop each icon, writing one atlas PNG (hud-icons.png) plus hud-icons.json keyed by
    /// weapon/item ID ("w&lt;id&gt;" / "i&lt;id&gt;"; SelectedWeapon/SelectedItem index the tables 1-based).
    /// Icons use the same GfxItems palette as the alert icon (BuildScene(0).Palette / ColorsItems).
    /// </summary>
    private static void ExportHudIcons(Render.RoomRenderer renderer, GameData data, string outDir)
    {
        var palette = renderer.BuildScene(0).Palette;
        byte[] items = data.Gfx("GfxItems");
        byte[] cmap = data.Asm.Bytes("ColorsItems");
        int nTiles = items.Length / 24;
        int rows = (nTiles + 31) / 32;
        const int baseY = 96;                 // page-1 load base 0xB000 = (X=0, Y=96)
        const int bw = 256, ih = 16;          // bitmap width = 256px (32 tiles); icons are 16px tall
        int bh = rows * 8;

        // Rebuild the page-1 icon bitmap: tile n at (col=n%32, row=n/32), 8px cells.
        var page = new int[bw * bh];          // palette index per pixel, 0 = transparent
        for (int n = 0; n < nTiles; n++)
        {
            var t = Render.Tile.Decode3bpp(items, n * 24, cmap, flip: false);
            int ox = (n % 32) * 8, oy = (n / 32) * 8;
            for (int y = 0; y < 8; y++)
                for (int x = 0; x < 8; x++)
                    page[(oy + y) * bw + (ox + x)] = t.Get(x, y);
        }

        // Collect every weapon + item icon as (key, SX, SY, width). word = (SY<<8)|SX little-endian.
        byte[] wxy = data.Asm.Bytes("WeaponGfxXY");
        byte[] ixy = data.Asm.Bytes("ItemGfxXY");
        var icons = new List<(string key, int sx, int sy, int w)>();
        for (int k = 0; k * 2 + 1 < wxy.Length; k++)
        {
            int sxb = wxy[k * 2], sy = wxy[k * 2 + 1];
            icons.Add(("w" + (k + 1), sxb & 0xFE, sy, (sxb & 1) == 0 ? 32 : 16));   // bit0=0 -> 32x16
        }
        for (int k = 0; k * 2 + 1 < ixy.Length; k++)
        {
            int sxb = ixy[k * 2], sy = ixy[k * 2 + 1];
            icons.Add(("i" + (k + 1), sxb & 0xFE, sy, 16));                          // items are 16x16
        }

        int sheetW = 0;
        foreach (var ic in icons) sheetW += ic.w;
        var bmp = new System.Drawing.Bitmap(Math.Max(1, sheetW), ih, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        var sb = new System.Text.StringBuilder();
        sb.Append("{\n  \"frameHeight\": ").Append(ih).Append(",\n  \"icons\": {\n");
        var entries = new List<string>();
        int cx = 0;
        foreach (var ic in icons)
        {
            for (int y = 0; y < ih; y++)
                for (int x = 0; x < ic.w; x++)
                {
                    int srcX = ic.sx + x, srcY = ic.sy - baseY + y;
                    int p = (srcX >= 0 && srcX < bw && srcY >= 0 && srcY < bh) ? page[srcY * bw + srcX] : 0;
                    if (p != 0) bmp.SetPixel(cx + x, y, palette[p]);
                }
            entries.Add($"    \"{ic.key}\": {{\"x\": {cx}, \"y\": 0, \"w\": {ic.w}}}");
            cx += ic.w;
        }
        sb.Append(string.Join(",\n", entries)).Append("\n  }\n}\n");
        bmp.Save(Path.Combine(outDir, "hud-icons.png"), System.Drawing.Imaging.ImageFormat.Png);
        bmp.Dispose();
        File.WriteAllText(Path.Combine(outDir, "hud-icons.json"), sb.ToString());
        Console.WriteLine($"HUD icons: wrote hud-icons.png ({sheetW}x{ih}) + hud-icons.json ({icons.Count} icons)");
    }

    /// <summary>
    /// Export the game font as a glyph atlas (font.png + font.json). gfxFont (gfx/font.asm) is 108
    /// 1bpp 8x8 glyphs loaded white starting at VRAM tile 0x40 (LoadFont, logic/loadfont.asm);
    /// DrawChar maps a character to tile (char + 0x10), so glyph i is character code 0x30 + i
    /// ('0','1',...). We decode the 1bpp glyphs to white-on-transparent and lay them in a horizontal
    /// strip; font.json gives the cell size and the first character code so the browser can index by
    /// (charCode - first). Faithful to the ROM's text rendering (PrintText/DrawChar).
    /// </summary>
    private static void ExportFont(Render.RoomRenderer renderer, GameData data, string outDir)
    {
        var palette = renderer.BuildScene(0).Palette;
        var white = palette[14];                 // LoadFont colour 0x0E = white
        // LoadFont loads 0x6C = 108 contiguous glyphs starting at gfxFont; in the source that run
        // spans gfxFont (digits + ':') then gfxSymbChars (symbols + the A-Z letters), so concatenate.
        byte[] a = data.Gfx("gfxFont"), b = data.Gfx("gfxSymbChars");
        byte[] font = new byte[a.Length + b.Length];
        Array.Copy(a, 0, font, 0, a.Length);
        Array.Copy(b, 0, font, a.Length, b.Length);
        const int gw = 8, gh = 8, bytesPerGlyph = 8, first = 0x30;
        int n = Math.Min(108, font.Length / bytesPerGlyph);   // the 108 tiles LoadFont uploads
        // The CLASS rank star is gfxSymbChars[0] = glyph 11 (char ';'), loaded YELLOW (LoadFont colour 6
        // to VRAM (88,64) = tile 0x4B, which DrawClass draws via tile 0x3B+0x10). We append a yellow
        // copy of that glyph after the white font so the browser can blit it for the rank stars.
        const int starGlyph = 11;
        var yellow = palette[6];                 // LoadFont star colour 0x06 = yellow

        void Blit(int glyph, int cellX, System.Drawing.Color c, System.Drawing.Bitmap bm)
        {
            for (int y = 0; y < gh; y++)
            {
                byte row = font[glyph * bytesPerGlyph + y];   // 1bpp: bit 7 = leftmost pixel
                for (int x = 0; x < gw; x++)
                    if (((row >> (7 - x)) & 1) != 0)
                        bm.SetPixel(cellX + x, y, c);
            }
        }

        int starX = n * gw;
        var bmp = new System.Drawing.Bitmap(Math.Max(1, (n + 1) * gw), gh, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        for (int i = 0; i < n; i++) Blit(i, i * gw, white, bmp);   // white font glyphs
        Blit(starGlyph, starX, yellow, bmp);                       // yellow rank star, appended
        bmp.Save(Path.Combine(outDir, "font.png"), System.Drawing.Imaging.ImageFormat.Png);
        bmp.Dispose();
        File.WriteAllText(Path.Combine(outDir, "font.json"),
            $"{{\n  \"charW\": {gw},\n  \"charH\": {gh},\n  \"first\": {first},\n  \"count\": {n},\n  \"starX\": {starX}\n}}\n");
        Console.WriteLine($"Font: wrote font.png ({(n + 1) * gw}x{gh}) + font.json ({n} glyphs + yellow star at x={starX})");
    }

    /// <summary>
    /// Export the boot/title assets:
    ///  - konami-logo.png: the Konami logo (InitKonamiLogo/SetUpKonamiLogo, Banks0123.asm:3242)
    ///    â€” three 1bpp tile blobs (gfxKonamiLogo colour 1, gfxKonamiLogo2 colour 2, gfxKonami
    ///    colour 3; tile numbers 1..52 index them concatenated) laid out by the KonamiLogoTiles
    ///    walk (DrawTileList :3274: rows 8px apart, each row's X = previous row's X + a signed
    ///    offset after the 0xFE marker), coloured by KonamiLogoPal (logic/konamilogo.asm:45).
    ///  - metal.png (13x4 tiles) + gear.png (9x4): gfxMetalGearLogo (70 tiles, 3bpp via
    ///    MGLogoColors {0,2,3,4,5,9,10,14}) laid out by MetalTilesDat/GearTilesDat
    ///    (logic/mainmenu.asm:257/265; tile 0 = blank), coloured by MenuPalette overrides.
    /// </summary>
    private static void ExportTitle(GameData data, string outDir)
    {
        // --- Konami logo (1bpp) ---
        var kpal = new Render.Palette();
        kpal.ApplyOverrides(data.Asm.Bytes("KonamiLogoPal"));
        byte[][] blobs = { data.Gfx("gfxKonamiLogo"), data.Gfx("gfxKonamiLogo2"), data.Gfx("gfxKonami") };
        int[] blobColour = { 1, 2, 3 };
        int n1 = blobs[0].Length / 8, n2 = blobs[1].Length / 8;

        byte[] walk = data.Asm.Bytes("KonamiLogoTiles");
        // First pass: compute row X starts and the bounding box.
        var rows = new List<(int x, List<int> tiles)>();
        int rowX = 0;
        var cur = new List<int>();
        for (int i = 0; i < walk.Length; i++)
        {
            if (walk[i] == 0xFF) break;
            if (walk[i] == 0xFE) { rows.Add((rowX, cur)); rowX += (sbyte)walk[++i]; cur = new List<int>(); continue; }
            cur.Add(walk[i]);
        }
        rows.Add((rowX, cur));
        int minX = int.MaxValue, maxX = int.MinValue;
        foreach (var r in rows) { minX = Math.Min(minX, r.x); maxX = Math.Max(maxX, r.x + r.tiles.Count * 8); }

        using (var bmp = new System.Drawing.Bitmap(maxX - minX, rows.Count * 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            for (int r = 0; r < rows.Count; r++)
                for (int t = 0; t < rows[r].tiles.Count; t++)
                {
                    int tile = rows[r].tiles[t];
                    if (tile == 0) continue;
                    int idx = tile - 1, blob = 0;                       // tiles 1.. index the blobs in load order
                    if (idx >= n1 + n2) { blob = 2; idx -= n1 + n2; }
                    else if (idx >= n1) { blob = 1; idx -= n1; }
                    var colour = kpal[blobColour[blob]];
                    for (int y = 0; y < 8; y++)
                    {
                        byte row8 = blobs[blob][idx * 8 + y];
                        for (int x = 0; x < 8; x++)
                            if (((row8 >> (7 - x)) & 1) != 0)
                                bmp.SetPixel(rows[r].x - minX + t * 8 + x, r * 8 + y, colour);
                    }
                }
            bmp.Save(Path.Combine(outDir, "konami-logo.png"), System.Drawing.Imaging.ImageFormat.Png);
        }

        // --- METAL GEAR logo (3bpp) ---
        var mpal = new Render.Palette();
        mpal.ApplyOverrides(data.Asm.Bytes("MenuPalette"));
        byte[] mcolours = data.Asm.Bytes("MGLogoColors");
        byte[] logo = data.Gfx("gfxMetalGearLogo");

        void SaveLogoBlock(string label, int tw, int th, string file)
        {
            byte[] map = data.Asm.Bytes(label);
            using var bmp = new System.Drawing.Bitmap(tw * 8, th * 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            for (int r = 0; r < th; r++)
                for (int c = 0; c < tw; c++)
                {
                    int tile = map[r * tw + c];
                    if (tile == 0) continue;
                    var t = Render.Tile.Decode3bpp(logo, (tile - 1) * 24, mcolours, flip: false);
                    for (int y = 0; y < 8; y++)
                        for (int x = 0; x < 8; x++)
                        {
                            int ci = t.Get(x, y);
                            if (ci != 0) bmp.SetPixel(c * 8 + x, r * 8 + y, mpal[ci]);
                        }
                }
            bmp.Save(Path.Combine(outDir, file), System.Drawing.Imaging.ImageFormat.Png);
        }
        SaveLogoBlock("MetalTilesDat", 13, 4, "metal.png");
        SaveLogoBlock("GearTilesDat", 9, 4, "gear.png");
        Console.WriteLine("Title: wrote konami-logo.png, metal.png, gear.png");
    }

    /// <summary>
    /// Export the radio/transceiver screen assets (RadioLogic, GameMode 4):
    ///  - radio-bg.png: RadioTilesMap (data/tileblocks.asm:27, 9 rows x 18 cols; DrawRadio draws it
    ///    at screen (48,24)) rendered from the second tile bank LoadGameGfx (Banks0123.asm:3030+)
    ///    fills: id 0x40 = blank, 0x41-0x5F = gfxRadio (31 tiles, 3bpp via ColorsTileset),
    ///    0x60-0x66 = gfxRadio2 (7 tiles, loaded mirrored via Load3bppTileFlip).
    ///  - snake-portrait.png: SnakeTilesMap (4x4, ids 0x10-0x1F = gfxSnakePortrait via ColSnakePic;
    ///    drawn at (200,40)) and snake-talk0/1/2.png â€” the 16x16 mouth/eye frames SnakePicture0-2
    ///    (DrawSnakeFrame draws them at (208,48); ids 0x30-0x32 = gfxSnakePortrait2).
    ///  - freq-digits.png: gfxFreqDigits (13 1bpp digit tiles, loaded RED by LoadFont) as a strip.
    /// Palette = RadioPalette overrides (SetRadioPal, data/palettes.asm) on the default palette.
    /// </summary>
    private static void ExportRadio(GameData data, string outDir)
    {
        var pal = new Render.Palette();
        pal.ApplyOverrides(data.Asm.Bytes("RadioPalette"));
        byte[] colTiles = data.Asm.Bytes("ColorsTileset");
        byte[] colSnake = data.Asm.Bytes("ColSnakePic");
        byte[] radio = data.Gfx("gfxRadio"), radio2 = data.Gfx("gfxRadio2");
        byte[] port = data.Gfx("gfxSnakePortrait"), port2 = data.Gfx("gfxSnakePortrait2");

        void BlitId(System.Drawing.Bitmap bmp, int id, int ox, int oy)
        {
            // LoadGameGfx loads 31 tiles FROM gfxRadio â€” running past its 24 into the adjacent
            // gfxRadio2 (ids 0x41-0x5F unflipped) â€” then 7 more from gfxRadio2 mirrored
            // (Load3bppTileFlip) as ids 0x60-0x66.
            byte[] src; int idx; bool flip; byte[] cmap;
            if (id >= 0x41 && id <= 0x58) { src = radio; idx = id - 0x41; flip = false; cmap = colTiles; }
            else if (id >= 0x59 && id <= 0x5F) { src = radio2; idx = id - 0x59; flip = false; cmap = colTiles; }
            else if (id >= 0x60 && id <= 0x66) { src = radio2; idx = id - 0x60; flip = true; cmap = colTiles; }
            else if (id >= 0x10 && id <= 0x1F) { src = port; idx = id - 0x10; flip = false; cmap = colSnake; }
            else if (id >= 0x30 && id <= 0x32) { src = port2; idx = id - 0x30; flip = false; cmap = colSnake; }
            else return;                                  // 0x40 = blank (page 0 is cleared black)
            var t = Render.Tile.Decode3bpp(src, idx * 24, cmap, flip);
            for (int y = 0; y < 8; y++)
                for (int x = 0; x < 8; x++)
                    bmp.SetPixel(ox + x, oy + y, pal[t.Get(x, y)]);
        }

        void SaveMap(string label, string file)
        {
            byte[] m = data.Asm.Bytes(label);             // [rows, cols, tiles...] (DrawTilesBlock)
            int rows = m[0], cols = m[1];
            using var bmp = new System.Drawing.Bitmap(cols * 8, rows * 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < cols; c++)
                    BlitId(bmp, m[2 + r * cols + c], c * 8, r * 8);
            bmp.Save(Path.Combine(outDir, file), System.Drawing.Imaging.ImageFormat.Png);
        }
        SaveMap("RadioTilesMap", "radio-bg.png");
        SaveMap("SnakeTilesMap", "snake-portrait.png");
        SaveMap("SnakePicture0", "snake-talk0.png");
        SaveMap("SnakePicture1", "snake-talk1.png");
        SaveMap("SnakePicture2", "snake-talk2.png");

        // The radio LED lamp tiles (DrawRadioLeds, Banks0123.asm:11271-11334). Each 8x8 tile
        // holds a PAIR of LED bars side by side, and the panel fills in pairs: "ON ON" from
        // page-1 (24,144), "ON OFF" (left bar only) from (16,144), "OFF OFF" from (8,144) â€”
        // gfxRadio tiles 2/1/0, ids 0x43/0x42/0x41; each tile is drawn on BOTH display rows
        // (y 32 and 40). The OFF lamp is what RadioTilesMap bakes into the panel.
        void SaveTile(int id, string file)
        {
            using var bmp = new System.Drawing.Bitmap(8, 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            BlitId(bmp, id, 0, 0);
            bmp.Save(Path.Combine(outDir, file), System.Drawing.Imaging.ImageFormat.Png);
        }
        SaveTile(0x43, "led-on.png");
        SaveTile(0x42, "led-half.png");
        SaveTile(0x41, "led-off.png");

        // Frequency digits: 13 contiguous 1bpp 8x8 glyphs, loaded red (LoadFont, logic/loadfont.asm:20-23).
        byte[] digits = data.Gfx("gfxFreqDigits");
        int n = digits.Length / 8;
        var red = pal[8];
        using (var bmp = new System.Drawing.Bitmap(n * 8, 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
        {
            for (int g = 0; g < n; g++)
                for (int y = 0; y < 8; y++)
                {
                    byte row = digits[g * 8 + y];
                    for (int x = 0; x < 8; x++)
                        if (((row >> (7 - x)) & 1) != 0) bmp.SetPixel(g * 8 + x, y, red);
                }
            bmp.Save(Path.Combine(outDir, "freq-digits.png"), System.Drawing.Imaging.ImageFormat.Png);
        }
        Console.WriteLine($"Radio: wrote radio-bg.png, snake-portrait.png, snake-talk0-2.png, freq-digits.png ({n} digits)");
    }

    /// <summary>
    /// Export the incoming-call "CALL" sign (call-sign.png, 24x16). LoadFont (logic/loadfont.asm:30-38)
    /// decodes gfxCALL (gfx/font.asm) â€” six 2bpp tiles â€” through colorsCALL {6, 8, 0x0E, 0x0F} into
    /// VRAM tiles 0xAC-0xB1; DrawCallTimer prints them as txtCALL chars 0x9C-0x9E over 0x9F-0xA1
    /// (data/hudstartendtexts.asm:74), i.e. tiles 0-2 are the top row, 3-5 the bottom.
    /// Decode2bppRow (Banks0123.asm:5076): two bytes per row â€” first byte = low bit plane, second =
    /// high bit plane, MSB-first â€” index -> BufferColor (colorsCALL) -> palette colour.
    /// </summary>
    private static void ExportCallSign(Render.RoomRenderer renderer, GameData data, string outDir)
    {
        var palette = renderer.BuildScene(0).Palette;
        byte[] gfx = data.Gfx("gfxCALL");
        int[] colorsCALL = { 6, 8, 0x0E, 0x0F };           // colorsCALL (logic/loadfont.asm:57)
        var bmp = new System.Drawing.Bitmap(24, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        for (int t = 0; t < 6; t++)
        {
            int ox = (t % 3) * 8, oy = (t / 3) * 8;
            for (int y = 0; y < 8; y++)
            {
                byte lo = gfx[t * 16 + y * 2], hi = gfx[t * 16 + y * 2 + 1];
                for (int x = 0; x < 8; x++)
                {
                    int idx = (((hi >> (7 - x)) & 1) << 1) | ((lo >> (7 - x)) & 1);
                    bmp.SetPixel(ox + x, oy + y, palette[colorsCALL[idx]]);
                }
            }
        }
        bmp.Save(Path.Combine(outDir, "call-sign.png"), System.Drawing.Imaging.ImageFormat.Png);
        bmp.Dispose();
        Console.WriteLine("Call sign: wrote call-sign.png (24x16)");
    }

    /// <summary>
    /// Export the open-pitfall image (pitfall.png, 64x64). GfxPitfall (gfx/pitfall.asm) is
    /// 2bpp tiles (Load2bppTile, 16 bytes each) composed by PitfallTileMap (8 rows of 8 ids,
    /// 1-based; 0xFE = next row, 0xFF = end), coloured by ColorsPitfall {0,5,9,0x0F} through
    /// the room palette. SetupPitfall pre-draws this image into the VRAM page-1 buffer at
    /// (0x40,0xA0); the on-screen hole is a CENTRE-OUT window of it (PitfallLogic3 /
    /// RenderPitfallP0), so the browser draws a centred crop that grows with HOLE_SIZE.
    /// </summary>
    private static void ExportPitfall(Render.RoomRenderer renderer, GameData data, string outDir)
    {
        var palette = renderer.BuildScene(0).Palette;
        byte[] gfx = data.Gfx("GfxPitfall");
        byte[] map = data.Asm.Bytes("PitfallTileMap");
        byte[] cols = data.Asm.Bytes("ColorsPitfall");
        using var bmp = new System.Drawing.Bitmap(64, 64, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        int cx = 0, cy = 0;
        foreach (byte b in map)
        {
            if (b == 0xFF) break;
            if (b == 0xFE) { cx = 0; cy += 8; continue; }
            int t = b - 1;                                   // tile ids are 1-based
            for (int y = 0; y < 8; y++)
            {
                // Ids past the 12 loaded tiles (the map's 0x0D) hit EMPTY VRAM beyond the
                // load area (GetPitfallXY: "not in a tile bank but in an empty VRAM area")
                // â€” cleared memory, i.e. the solid black pit interior.
                byte lo = t * 16 + 15 < gfx.Length ? gfx[t * 16 + y * 2] : (byte)0;
                byte hi = t * 16 + 15 < gfx.Length ? gfx[t * 16 + y * 2 + 1] : (byte)0;
                for (int x = 0; x < 8; x++)
                {
                    int idx = (((hi >> (7 - x)) & 1) << 1) | ((lo >> (7 - x)) & 1);
                    int ci = cols[idx];
                    // Colour 0 is the pit's BLACK interior (the VDP copy writes the zero
                    // pixels too â€” they show the backdrop), not transparency.
                    bmp.SetPixel(cx + x, cy + y, ci == 0 ? System.Drawing.Color.Black : palette[ci]);
                }
            }
            cx += 8;
        }
        bmp.Save(Path.Combine(outDir, "pitfall.png"), System.Drawing.Imaging.ImageFormat.Png);
        Console.WriteLine("Pitfall: wrote pitfall.png (64x64)");
    }

    /// <summary>
    /// Render a DrawTilesBlock-style tile map (header: rows, cols; then row-major tile
    /// numbers from the given room's TILESET) to a PNG â€” e.g. the Hind D body/wreck.
    /// </summary>
    private static void ExportTileBlock(Render.RoomRenderer renderer, GameData data, int room, string label, string outPath)
    {
        var scene = renderer.BuildScene(room);
        byte[] m = data.Asm.Bytes(label);
        int rows = m[0], cols = m[1];
        var buffer = new int[cols * 8 * rows * 8];
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
            {
                int t = m[2 + r * cols + c];
                Render.RoomRenderer.DrawTile(scene.Tiles[t], scene.Palette, buffer, cols * 8, c * 8, r * 8);
            }
        using var bmp = new System.Drawing.Bitmap(cols * 8, rows * 8, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        for (int y = 0; y < rows * 8; y++)
            for (int x = 0; x < cols * 8; x++)
                bmp.SetPixel(x, y, System.Drawing.Color.FromArgb(buffer[y * cols * 8 + x]));
        bmp.Save(outPath, System.Drawing.Imaging.ImageFormat.Png);
        Console.WriteLine($"TileBlock: wrote {outPath} ({cols * 8}x{rows * 8} from {label})");
    }

    /// <summary>
    /// Export the ending EXPLOSION as two tile atlases (base + flash palette) plus a frame-layout
    /// JSON for the browser port. Tiles are tileset 7 (TileSetEnding) built directly via
    /// TileSetBuilder (room 251 has no room entry). Frame maps are read from ExploxionTiles1/2/3
    /// (data/tileblocks.asm). Base palette = RoomPalette13, flash = RoomPalette15
    /// (data/palettes.asm:151 / :164). Palette construction mirrors RoomRenderer.BuildScene
    /// (Render/RoomRenderer.cs:49-52): base gameplay slots (PalMenuWeapon) then the room-palette
    /// override block. Tile pixels are 4-bit colour indices (Render/Tile.cs); index 0 is rendered
    /// transparent so the browser can composite the atlas. Atlas layout is identical for both PNGs
    /// so the browser can swap base<->flash by switching images.
    /// </summary>
    private static void ExportEnding(GameData data, string outDir)
    {
        const int EndingTileSet = 7;             // label TileSetEnding (Game/TileSetBuilder.cs:23)

        // Frame tile maps straight from the ROM (data/tileblocks.asm: header is [rows, cols, ...]).
        var frameLabels = new[] { "ExploxionTiles1", "ExploxionTiles2", "ExploxionTiles3" };
        var framePos = new[] { (x: 144, y: 96), (x: 128, y: 80), (x: 128, y: 64) }; // explosion draw XY
        var frames = new List<(int x, int y, int cols, int rows, int[] map)>();
        foreach (var (label, idx) in frameLabels.Select((l, i) => (l, i)))
        {
            byte[] b = data.Asm.Bytes(label);
            int rows = b[0], cols = b[1];
            var map = new int[rows * cols];
            for (int j = 0; j < rows * cols; j++) map[j] = b[2 + j];
            frames.Add((framePos[idx].x, framePos[idx].y, cols, rows, map));
        }

        // Distinct non-zero tile ids across all frames, in first-seen order.
        var distinct = new List<int>();
        var seen = new HashSet<int>();
        foreach (var f in frames)
            foreach (int t in f.map)
                if (t != 0 && seen.Add(t)) distinct.Add(t);

        // Build the ending tileset directly (room 251 has no room entry).
        var tiles = new TileSetBuilder(data).Build(EndingTileSet);

        // Two palettes, built like RoomRenderer.BuildScene: base gameplay slots then the override.
        Render.Palette MakePalette(string roomPalLabel)
        {
            var p = new Render.Palette();
            p.ApplyOverrides(data.BasePaletteBlock());        // PalMenuWeapon (Game/GameData.cs:180)
            p.ApplyOverrides(data.Asm.Bytes(roomPalLabel));   // RoomPalette13 / RoomPalette15
            return p;
        }
        var basePal = MakePalette("RoomPalette13");
        var flashPal = MakePalette("RoomPalette15");

        // Atlas layout: one row of 8x8 tiles, left-to-right, in `distinct` order.
        int tileCount = distinct.Count;
        int atlasW = tileCount * 8, atlasH = 8;
        var atlas = new List<(int id, int x, int y)>();

        System.Drawing.Bitmap RenderAtlas(Render.Palette pal)
        {
            var bmp = new System.Drawing.Bitmap(atlasW, atlasH, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            for (int i = 0; i < tileCount; i++)
            {
                int ox = i * 8;
                var tile = tiles[distinct[i] & 0xFF];
                for (int py = 0; py < 8; py++)
                    for (int px = 0; px < 8; px++)
                    {
                        byte ci = tile.Pixels[py * 8 + px];
                        // Palette slot 0 -> transparent (alpha 0) so the atlas composites cleanly.
                        var c = ci == 0
                            ? System.Drawing.Color.FromArgb(0, 0, 0, 0)
                            : pal[ci];
                        bmp.SetPixel(ox + px, py, c);
                    }
            }
            return bmp;
        }

        for (int i = 0; i < tileCount; i++) atlas.Add((distinct[i], i * 8, 0));

        string basePath = Path.Combine(outDir, "ending-explosion.png");
        string flashPath = Path.Combine(outDir, "ending-explosion-flash.png");
        string jsonPath = Path.Combine(outDir, "ending-explosion.json");

        using (var b1 = RenderAtlas(basePal)) b1.Save(basePath, System.Drawing.Imaging.ImageFormat.Png);
        using (var b2 = RenderAtlas(flashPal)) b2.Save(flashPath, System.Drawing.Imaging.ImageFormat.Png);

        // JSON.
        var sb = new System.Text.StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"tile\": 8,\n");
        sb.Append("  \"atlas\": {");
        for (int i = 0; i < atlas.Count; i++)
        {
            var a = atlas[i];
            sb.Append(i == 0 ? " " : ", ");
            sb.Append('"').Append(a.id).Append("\": [").Append(a.x).Append(',').Append(a.y).Append(']');
        }
        sb.Append(" },\n");
        sb.Append("  \"frames\": [\n");
        for (int fi = 0; fi < frames.Count; fi++)
        {
            var f = frames[fi];
            sb.Append("    { \"x\":").Append(f.x).Append(", \"y\":").Append(f.y)
              .Append(", \"cols\":").Append(f.cols).Append(", \"rows\":").Append(f.rows)
              .Append(", \"map\":[").Append(string.Join(",", f.map)).Append("] }");
            sb.Append(fi < frames.Count - 1 ? ",\n" : "\n");
        }
        sb.Append("  ]\n");
        sb.Append("}\n");
        File.WriteAllText(jsonPath, sb.ToString());

        Console.WriteLine($"Ending: wrote ending-explosion.png + ending-explosion-flash.png ({atlasW}x{atlasH}) and ending-explosion.json");
        Console.WriteLine($"Ending: {distinct.Count} distinct tiles: {string.Join(",", distinct)}");
    }

    private static System.Drawing.Bitmap DecodeDoor4bpp(byte[] gfx, int tilesW, int tilesH, int cropW, int cropH, Render.Palette pal, int startX = 0)
    {
        int fullW = tilesW * 8;
        var bmp = new System.Drawing.Bitmap(cropW, cropH, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        for (int py = 0; py < cropH; py++)
        for (int px = 0; px < cropW; px++)
        {
            int srcX = px + startX;
            int tx = srcX / 8, ty = py / 8, lx = srcX % 8, ly = py % 8;
            int tileIdx = ty * tilesW + tx;
            int off = tileIdx * 32 + ly * 4 + lx / 2;
            int ci = off < gfx.Length ? ((lx & 1) == 0 ? (gfx[off] >> 4) : (gfx[off] & 0x0F)) : 0;
            var c = ci == 0 ? System.Drawing.Color.Transparent : pal[ci];
            bmp.SetPixel(px, py, c);
        }
        return bmp;
    }

    /// <summary>Per-tile solid map (32x24, row-major) for a room, from its CollTiles* bitmap,
    /// given the room's per-cell tile numbers.</summary>
    private static int[] ComputeSolid(GameData data, int room, int[] tileNumbers)
    {
        int tilesetId = data.GfxSetId(room);
        string collLabel = data.Asm.Symbols("IdxColisTiles")[tilesetId];
        byte[] collBytes = data.Asm.Bytes(collLabel); // 32 bytes = 256 bits, one per tile number

        var solid = new int[tileNumbers.Length];
        for (int i = 0; i < tileNumbers.Length; i++)
        {
            int t = tileNumbers[i] & 0xFF;
            // tile 0 -> bit7 of byte0, tile 7 -> bit0 of byte0, tile 8 -> bit7 of byte1, ...
            solid[i] = (collBytes[t >> 3] >> (7 - (t & 7))) & 1;
        }
        return solid;
    }

    /// <summary>connections.json: each exported room -> {up,down,left,right} (null if no exit or neighbor not exported).</summary>
    private static void WriteConnectionsJson(string path, GameData data, List<int> rooms, HashSet<int> exported)
    {
        string V(int n) => (n == 255 || !exported.Contains(n)) ? "null" : n.ToString();
        var sb = new System.Text.StringBuilder();
        sb.Append("{\n");
        for (int i = 0; i < rooms.Count; i++)
        {
            int[] c = data.Connections(rooms[i]);
            sb.Append("  \"").Append(rooms[i]).Append("\": {")
              .Append("\"up\":").Append(V(c[0]))
              .Append(",\"down\":").Append(V(c[1]))
              .Append(",\"left\":").Append(V(c[2]))
              .Append(",\"right\":").Append(V(c[3]))
              .Append('}');
            if (i < rooms.Count - 1) sb.Append(',');
            sb.Append('\n');
        }
        sb.Append("}\n");
        File.WriteAllText(path, sb.ToString());
    }

    /// <summary>manifest.json: { "rooms": [...], "start": n }.</summary>
    private static void WriteManifestJson(string path, List<int> rooms, int start)
    {
        File.WriteAllText(path,
            "{ \"rooms\": [" + string.Join(",", rooms) + "], \"start\": " + start + " }\n");
    }

    /// <summary>
    /// doors.json (room -> usable doors) and door-types.json (the DoorOpenEnterDat geometry
    /// for every referenced type). A door is "usable" only if it is not an elevator
    /// (dest &lt; 0xF0) and its destination is in the exported set â€” that also drops the
    /// fake/special doors (lorry locators, the Metal Gear lock), whose dests are out of cluster.
    /// </summary>
    private static void WriteDoorsJson(string doorsPath, string typesPath, GameData data,
                                       List<int> rooms, HashSet<int> exported)
    {
        // Door lock type = IdDoorsLogic[door.Id - 1] & 0x1F (ChkOpenDoor dispatch): 0/plain open on
        // contact, 1 = elevator, 2..9 = keycard CARD1..8, others = special (punch/lorry/walls).
        // Bits 7-6 = the DEFAULT STATE (SetDefaultDoorLock, Banks0123.asm:1014-1019): exactly
        // 10b = the door STARTS OPEN â€” never drawn, walked straight through (e.g. the lorry
        // backs in room 5, ids 101/109/113 = 0x8A/0x8B); anything else starts closed.
        byte[] doorLogic = data.Asm.Bytes("IdDoorsLogic");
        int LockOf(int id) => (id - 1 >= 0 && id - 1 < doorLogic.Length) ? (doorLogic[id - 1] & 0x1F) : 0;
        bool OpenOf(int id) => id - 1 >= 0 && id - 1 < doorLogic.Length && (doorLogic[id - 1] & 0xC0) == 0x80;

        var usedTypes = new SortedSet<int>();
        var sb = new System.Text.StringBuilder();
        sb.Append("{\n");
        bool firstRoom = true;
        foreach (int room in rooms)
        {
            var kept = new List<GameData.Door>();
            foreach (var d in data.Doors(room))
            {
                // Elevator doors (dest >= 0xF0, render type 5/6) are kept when their elevator
                // room is exported â€” the cluster check below covers both cases.
                if (!exported.Contains(d.Dest)) { Console.WriteLine($"  drop door room {room} id {d.Id}: dest {d.Dest} not in cluster"); continue; }
                kept.Add(d);
                usedTypes.Add(d.Type);
            }
            if (kept.Count == 0) continue;

            if (!firstRoom) sb.Append(",\n");
            firstRoom = false;
            sb.Append("  \"").Append(room).Append("\": [");
            for (int i = 0; i < kept.Count; i++)
            {
                var d = kept[i];
                if (i > 0) sb.Append(", ");
                sb.Append("{\"id\":").Append(d.Id).Append(",\"type\":").Append(d.Type)
                  .Append(",\"lock\":").Append(LockOf(d.Id));
                if (OpenOf(d.Id)) sb.Append(",\"open\":true");
                sb.Append(",\"x\":").Append(d.X).Append(",\"y\":").Append(d.Y)
                  .Append(",\"dest\":").Append(d.Dest).Append('}');
            }
            sb.Append(']');
        }
        sb.Append("\n}\n");
        File.WriteAllText(doorsPath, sb.ToString());

        var tb = new System.Text.StringBuilder();
        tb.Append("{\n");
        bool firstType = true;
        foreach (int t in usedTypes)
        {
            var ti = data.DoorTypeInfo(t);
            if (!firstType) tb.Append(",\n");
            firstType = false;
            tb.Append("  \"").Append(t).Append("\": {")
              .Append("\"openOffX\":").Append(ti.OpenOffX).Append(",\"openOffY\":").Append(ti.OpenOffY)
              .Append(",\"openNX\":").Append(ti.OpenNX).Append(",\"openNY\":").Append(ti.OpenNY)
              .Append(",\"enterOffX\":").Append(ti.EnterOffX).Append(",\"enterOffY\":").Append(ti.EnterOffY)
              .Append(",\"enterNX\":").Append(ti.EnterNX).Append(",\"enterNY\":").Append(ti.EnterNY)
              .Append('}');
        }
        tb.Append("\n}\n");
        File.WriteAllText(typesPath, tb.ToString());

        Console.WriteLine($"Doors: wrote {doorsPath} and {typesPath} (types {string.Join(",", usedTypes)})");
    }

    // Per-room collision JSON: the solid bitmap plus the raw per-tile tile numbers (`tiles`), so
    // the browser can classify gameplay tiles (ladder 0x08, water 0x73-0x76, â€¦), not just solidity.
    private static void WriteCollisionJson(string path, int width, int height, int[] solid, int[] tiles)
    {
        var sb = new System.Text.StringBuilder();
        sb.Append("{ \"width\": ").Append(width)
          .Append(", \"height\": ").Append(height)
          .Append(", \"solid\": [");
        for (int i = 0; i < solid.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(solid[i]);
        }
        sb.Append("], \"tiles\": [");
        for (int i = 0; i < tiles.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(tiles[i] & 0xFF);
        }
        sb.Append("] }");
        File.WriteAllText(path, sb.ToString());
    }

    /// <summary>
    /// Find the disassembly root (the folder containing data/rooms.asm). Accept
    /// an explicit path as the first argument, otherwise walk up from the exe.
    /// </summary>
    private static string ResolveGameRoot(string[] args)
    {
        // The disassembly now lives in the sibling repo southernsun/MetalGear (../MetalGear).
        // Accept an explicit path as the first arg; otherwise RomPaths finds the sibling / $MG_ROM_DIR.
        string? explicitPath = args.Length > 0 && Directory.Exists(args[0]) ? args[0] : null;
        return RomPaths.ResolveRomDir(explicitPath);
    }
}
