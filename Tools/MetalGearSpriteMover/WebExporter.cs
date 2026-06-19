using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MetalGearSpriteMover
{
    /// <summary>
    /// Headless exporter: writes <c>snake.png</c> (a spritesheet of Solid Snake's 16
    /// directional/animation frames in his true in-game colours) and <c>snake.json</c>
    /// (an atlas describing each frame's cell and the common actor-origin anchor).
    ///
    /// All 16 frames are rendered into a COMMON cell with a COMMON origin so they neither
    /// jitter nor misalign: the global min/max of every visible attribute row (across all
    /// frames) defines the cell size and where the actor origin (0,0) lands inside it.
    /// </summary>
    public static class WebExporter
    {
        // The 16 frames to export, in pack order, as (dir, state, spriteId).
        // Sprite ids are indices into idxSnakeSpr (data/playersprite.asm):
        //   Up=0 Up1=1 Up2=2  Down=3 Down1=4 Down2=5  Left=6 Left1=7 Left2=8
        //   Right=9 Right1=10 Right2=11  PunchU=24 PunchD=25 PunchL=26 PunchR=27
        //   ... plus the death poses: Dying=41 (leaned back) and Dead=43 (the Dying anim mode).
        private static readonly (string Dir, string State, int Id)[] Frames =
        {
            ("down",  "idle",  3),  ("down",  "walk1", 4),  ("down",  "walk2", 5),  ("down",  "punch", 25),
            ("up",    "idle",  0),  ("up",    "walk1", 1),  ("up",    "walk2", 2),  ("up",    "punch", 24),
            ("left",  "idle",  6),  ("left",  "walk1", 7),  ("left",  "walk2", 8),  ("left",  "punch", 26),
            ("right", "idle",  9),  ("right", "walk1", 10), ("right", "walk2", 11), ("right", "punch", 27),
            ("die",   "lean",  41), ("die",   "dead",  43),
            ("ladder", "1",    39), ("ladder", "2",    40),   // climb frames (SetSprLadder*, Climb mode)
            ("water", "down",  29), ("water", "up",    28),   // shallow-water wading (SetSprWater*, Swim pose)
            ("water", "left",  30), ("water", "right", 31),
            ("deepwater", "1", 37), ("deepwater", "2", 38),   // deep-water swimming (SetSprDeepWater)
            ("box", "1", 42), ("box", "2", 44),               // cardboard box: idle (42) / moving (44) (SetSprBox)
            ("parachute", "fall", 36),                        // SetSprParachute (PlayerAnimation 3): canopy + hanging Snake
            // Armed walk/idle (SetSprWalk4 adds 12 when a weapon is selected): up=12, down=15, left=18, right=21.
            ("armed-up",    "idle", 12), ("armed-up",    "walk1", 13), ("armed-up",    "walk2", 14),
            ("armed-down",  "idle", 15), ("armed-down",  "walk1", 16), ("armed-down",  "walk2", 17),
            ("armed-left",  "idle", 18), ("armed-left",  "walk1", 19), ("armed-left",  "walk2", 20),
            ("armed-right", "idle", 21), ("armed-right", "walk1", 22), ("armed-right", "walk2", 23),
        };

        public static void Export(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            Color[] palette = SnakePalette.SnakeColors();
            Color[] waterShadowPalette = SnakePalette.WaterShadowColors();   // deep-water frames (14/15 light/white)
            Color[] damagePalette = SnakePalette.DamageColors();             // post-hit red flash (SnakeAttrDamage)

            // 1. Global bounds over all 16 frames' visible attribute rows.
            int gMinX = int.MaxValue, gMinY = int.MaxValue, gMaxX = int.MinValue, gMaxY = int.MinValue;
            foreach (var f in Frames)
            {
                if (!sprites.TryGetBounds(f.Id, out int minX, out int minY, out int maxX, out int maxY))
                    continue;
                gMinX = Math.Min(gMinX, minX); gMaxX = Math.Max(gMaxX, maxX);
                gMinY = Math.Min(gMinY, minY); gMaxY = Math.Max(gMaxY, maxY);
            }

            int cellW = gMaxX - gMinX, cellH = gMaxY - gMinY;
            int originX = -gMinX, originY = -gMinY;

            // 2. Render each frame into the common cell and lay them out as a horizontal strip.
            // Two variants are emitted: the normal colours, then a red "damage-" copy of every frame
            // (SnakeAttrDamage) so the browser can show the post-hit red flash by swapping to the
            // "damage-"+key frame on alternate ticks (SetSnakeSprCol).
            int sheetW = cellW * Frames.Length * 2, sheetH = cellH;
            var dv = new DrawingVisual();
            RenderOptions.SetBitmapScalingMode(dv, BitmapScalingMode.NearestNeighbor);
            var atlas = new StringBuilder();
            atlas.Append("{\n");
            atlas.Append("  \"frameWidth\": ").Append(cellW).Append(",\n");
            atlas.Append("  \"frameHeight\": ").Append(cellH).Append(",\n");
            atlas.Append("  \"anchorX\": ").Append(originX).Append(",\n");
            atlas.Append("  \"anchorY\": ").Append(originY).Append(",\n");
            atlas.Append("  \"frames\": {\n");

            var entries = new List<string>();
            using (var dc = dv.RenderOpen())
            {
                // variant 0 = normal palette, variant 1 = damage (red) palette.
                for (int variant = 0; variant < 2; variant++)
                {
                    for (int i = 0; i < Frames.Length; i++)
                    {
                        var f = Frames[i];
                        // Normal: deep-water frames use WaterShadowAttr's light palette, the rest use
                        // Snake's colours. Damage: every frame uses the red SnakeAttrDamage palette.
                        Color[] framePal = variant == 1
                            ? damagePalette
                            : (f.Dir == "deepwater" ? waterShadowPalette : palette);
                        var bmp = sprites.RenderAligned(f.Id, framePal, originX, originY, cellW, cellH);
                        int cx = (variant * Frames.Length + i) * cellW;
                        dc.DrawImage(bmp, new Rect(cx, 0, cellW, cellH));

                        string key = (variant == 1 ? "damage-" : "") + f.Dir + "-" + f.State;
                        entries.Add("    \"" + key + "\": {\"x\": "
                            + cx.ToString(CultureInfo.InvariantCulture) + ", \"y\": 0}");
                    }
                }
            }
            atlas.Append(string.Join(",\n", entries)).Append("\n");

            atlas.Append("  }\n");
            atlas.Append("}\n");

            var rtb = new RenderTargetBitmap(sheetW, sheetH, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(dv);

            Directory.CreateDirectory(outDir);
            string pngPath = Path.Combine(outDir, "snake.png");
            string jsonPath = Path.Combine(outDir, "snake.json");

            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(rtb));
            using (var fs = File.Create(pngPath))
                enc.Save(fs);

            File.WriteAllText(jsonPath, atlas.ToString());

            Console.WriteLine($"Wrote {pngPath} ({sheetW}x{sheetH})");
            Console.WriteLine($"Wrote {jsonPath}");
            Console.WriteLine($"frameWidth={cellW} frameHeight={cellH} anchorX={originX} anchorY={originY}");
        }

        // ---- Guard export ------------------------------------------------------
        // The guard is an actor whose frames live in one RLE block (SprGuard). It uses the
        // same 4-sprite / 2-OR-pair / 16x32 structure as Snake (NumSprEnemies[4]=4), with
        // colours 2 and 0x0D (ActorSprColors3 = 2,4Dh -> index 2 and CC|0Dh).
        // STEP 1 (debug): dump every 16x16 sprite in SprGuard so the frame layout can be read.
        public static void ExportGuard(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns("SprGuard");
            int n = g.Length / 32;
            int frameCount = n / 4;             // 4 sprites per frame (two OR-pairs)
            Console.WriteLine($"SprGuard: {g.Length} bytes = {n} sprites = {frameCount} frames (4 each)");

            // Guard colours (ActorSprColors3 = index 2 + CC|0Dh; overlap 2|0Dh = 0x0F).
            // Index 2 = uniform, 0x0D = face/hands, 0x0F = outline — the guard's green look.
            var pal = new Color[16];
            pal[2] = Color.FromRgb(40, 120, 40);     // body / uniform green
            pal[0x0D] = Color.FromRgb(216, 176, 104); // face / hands tan
            pal[0x0F] = Color.FromRgb(8, 16, 8);      // outline (the OR overlap)
            const int colA = 2, colB = 0x0D;            // ActorSprColors3: index 2 and CC|0Dh

            // SprGuard layout (confirmed by inspection + actorspriteattr.asm):
            //   uppers  = sprites 0..7  : OR-pairs (2d, 2d+1) for dir d = down,left,up,right
            //   lowers  = sprites 8..31 : OR-pairs (8 + phase*8 + 2d) for 3 leg phases per dir
            // A frame = upper[dir] (top 16x16) over lower[dir][phase] (bottom 16x16) -> 16x32.
            // Phase identity (VRAM slot order): 0 = GuardWalk1, 1 = idle, 2 = GuardWalk2.
            // The ROM positions each half via SprOffsets1/2 (idxSprOffsets, picked by the
            // frame's 91h/92h header). Legs are fixed (Y=-11) across all phases; only the
            // GuardWalk2 (phase 2) torso sits 1px lower (SprOffsets2 upper Y=-26 vs -27).
            // So we keep legs at a constant y and drop the phase-2 upper body by one pixel
            // -- the stride's body-dip with feet planted, not a leg lift.
            string[] dirs = { "down", "left", "up", "right" };
            const int phases = 3, cellW = 16, cellH = 32;
            int frames = dirs.Length * phases;             // 4 dirs x 3 leg phases = 12
            int w = frames * cellW, h = cellH;
            var px = new byte[w * h * 4];

            void Composite(int spriteA, int spriteB, int cellX, int yoff)
            {
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        int ci = 0;
                        if (SnakeSprites.ReadPixel(g, spriteA, x, y)) ci = colA;
                        if (SnakeSprites.ReadPixel(g, spriteB, x, y)) ci |= colB;
                        if (ci == 0) continue;
                        Color c = pal[ci & 15];
                        int o = ((yoff + y) * w + (cellX + x)) * 4;
                        px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                    }
            }
            for (int d = 0; d < dirs.Length; d++)
                for (int p = 0; p < phases; p++)
                {
                    int cellX = (d * phases + p) * cellW;
                    int up = d * 2;                        // upper OR-pair for this direction
                    int lo = 8 + p * 8 + d * 2;            // lower OR-pair for this phase/direction
                    int upperY = p == 2 ? 1 : 0;           // GuardWalk2 torso dips 1px (SprOffsets2); feet stay planted
                    Composite(up, up + 1, cellX, upperY);  // top = upper body
                    Composite(lo, lo + 1, cellX, 16);      // bottom = legs (fixed Y for every phase)
                }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "guard.png"))) enc.Save(fs);

            // Atlas: walk1 = phase 0 (GuardWalk1), idle = phase 1 (the standing Guard<Dir>
            // frame, guard.asm GuardPatrolTurn: SpriteId = Direction + 8), walk2 = phase 2
            // (GuardWalk2). The walk cycle toggles walk1<->walk2; idle is only shown stopped.
            var sb = new StringBuilder();
            sb.Append("{\n  \"frameWidth\": 16,\n  \"frameHeight\": 32,\n  \"anchorX\": 8,\n  \"anchorY\": 30,\n  \"frames\": {\n");
            var rows = new List<string>();
            string[] states = { "walk1", "idle", "walk2" };
            for (int d = 0; d < dirs.Length; d++)
                for (int p = 0; p < phases; p++)
                    rows.Add($"    \"{dirs[d]}-{states[p]}\": {{\"x\": {(d * phases + p) * cellW}, \"y\": 0}}");
            sb.Append(string.Join(",\n", rows)).Append("\n  }\n}\n");
            File.WriteAllText(Path.Combine(outDir, "guard.json"), sb.ToString());

            Console.WriteLine($"Wrote guard.png ({w}x{h}) + guard.json — {frames} frames (4 dir x 3 phases)");
        }

        // ---- Big Boss export --------------------------------------------------
        // Big Boss (room 119, bigboss.asm). SprBigBoss decodes to 24 16x16 sprites whose attr
        // pattern numbers start at 0x60, so attr pattern P -> decoded index (P-0x60)/4. Each
        // frame = a top OR-pair over a legs OR-pair (16x32), like the guard. Per the frame attr
        // records (actorspriteattr.asm:202-209, BigBoss<Dir><1|2> = color, pat0..pat3):
        //   tops  (decoded idx): down 0,1   left 2,3   up 4,5   right 6,7
        //   legs1 (idx):         down 8,9   left 10,11 up 12,13 right 14,15
        //   legs2 (idx):         down 16,17 left 18,19 up 20,21 right 22,23
        // Colours = ActorSprColors3 (idxActorSprCols[ID_BIG_BOSS=0x20] = 2,4Dh -> indices 2 and
        // 0x0D, overlap 0x0F) — the same uniform/face/outline palette as the guard.
        public static void ExportBigBoss(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns("SprBigBoss");
            int n = g.Length / 32;
            Console.WriteLine($"SprBigBoss: {g.Length} bytes = {n} sprites (expect 24)");

            var pal = new Color[16];
            pal[2] = Color.FromRgb(40, 120, 40);      // index 2: uniform green
            pal[0x0D] = Color.FromRgb(216, 176, 104); // 0x0D: face / hands tan
            pal[0x0F] = Color.FromRgb(8, 16, 8);      // 0x0F: outline (the OR overlap)
            const int colA = 2, colB = 0x0D;

            string[] dirs = { "up", "down", "left", "right" };  // SpriteId order 0x41..0x48
            var topIdx  = new System.Collections.Generic.Dictionary<string, int> { { "down", 0 }, { "left", 2 }, { "up", 4 }, { "right", 6 } };
            var legIdx1 = new System.Collections.Generic.Dictionary<string, int> { { "down", 8 }, { "left", 10 }, { "up", 12 }, { "right", 14 } };
            var legIdx2 = new System.Collections.Generic.Dictionary<string, int> { { "down", 16 }, { "left", 18 }, { "up", 20 }, { "right", 22 } };
            const int phases = 2, cellW = 16, cellH = 32;
            int frames = dirs.Length * phases;        // 4 dir x 2 leg phases = 8
            int w = frames * cellW, h = cellH;
            var px = new byte[w * h * 4];

            void Composite(int spriteA, int spriteB, int cellX, int yoff)
            {
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        int ci = 0;
                        if (spriteA < n && SnakeSprites.ReadPixel(g, spriteA, x, y)) ci = colA;
                        if (spriteB < n && SnakeSprites.ReadPixel(g, spriteB, x, y)) ci |= colB;
                        if (ci == 0) continue;
                        Color c = pal[ci & 15];
                        int o = ((yoff + y) * w + (cellX + x)) * 4;
                        px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                    }
            }
            for (int d = 0; d < dirs.Length; d++)
                for (int p = 0; p < phases; p++)
                {
                    int cellX = (d * phases + p) * cellW;
                    int top = topIdx[dirs[d]];
                    int leg = (p == 0 ? legIdx1 : legIdx2)[dirs[d]];
                    Composite(top, top + 1, cellX, 0);    // top = upper body
                    Composite(leg, leg + 1, cellX, 16);   // bottom = legs (2 walk phases)
                }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "bigboss.png"))) enc.Save(fs);

            var sb = new StringBuilder();
            sb.Append("{\n  \"frameWidth\": 16,\n  \"frameHeight\": 32,\n  \"anchorX\": 8,\n  \"anchorY\": 30,\n  \"frames\": {\n");
            var rows = new List<string>();
            for (int d = 0; d < dirs.Length; d++)
                for (int p = 0; p < phases; p++)
                    rows.Add($"    \"{dirs[d]}-walk{p + 1}\": {{\"x\": {(d * phases + p) * cellW}, \"y\": 0}}");
            sb.Append(string.Join(",\n", rows)).Append("\n  }\n}\n");
            File.WriteAllText(Path.Combine(outDir, "bigboss.json"), sb.ToString());

            Console.WriteLine($"Wrote bigboss.png ({w}x{h}) + bigboss.json — {frames} frames (4 dir x 2 phases)");
        }

        // ---- Prisoner export --------------------------------------------------
        // The prisoner actor (ID_PRISONER1.. / PrisonerLogic). Frames per actorspriteattr.asm
        // (:378-380): Prisoner = torso(0D0h,0D4h) over legs(0E0h,0E4h); Prisoner2 = torso
        // (0D8h,0DCh) over the SAME legs (idle 2-frame animation); PrisonerFree = torso
        // (0E8h,0ECh) over legs(0F0h,0F4h) — the rescued pose. VRAM base 0xD0 -> sprite index
        // (pattern - 0xD0) / 4 into SprPrisoner + SprPrisoner2 concatenated (gfx/sprites.asm).
        // Colours: idxActorSprCols entry for the prisoner IDs is ActorSprColors3 — the same
        // (2 + CC|0Dh) pair as the guard, so the guard's hand-picked RGB triplet applies.
        public static void ExportPrisoner(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] p1 = sprites.DecodedPatterns("SprPrisoner");
            byte[] p2 = sprites.DecodedPatterns("SprPrisoner2");
            byte[] g = new byte[p1.Length + p2.Length];
            p1.CopyTo(g, 0); p2.CopyTo(g, p1.Length);
            int n = g.Length / 32;
            Console.WriteLine($"SprPrisoner(+2): {g.Length} bytes = {n} sprites (expect 10: 3 torsos + 2 leg pairs)");
            if (n < 10) throw new InvalidDataException($"Expected >= 10 prisoner sprites, got {n}.");

            var pal = new Color[16];
            pal[2] = Color.FromRgb(40, 120, 40);      // uniform (palette index 2, as the guard)
            pal[0x0D] = Color.FromRgb(216, 176, 104); // face / hands tan
            pal[0x0F] = Color.FromRgb(8, 16, 8);      // outline (the OR overlap)
            const int colA = 2, colB = 0x0D;          // ActorSprColors3

            // Cells: 0 = idle-1, 1 = idle-2, 2 = rescued. (upperPair, lowerPair) sprite indices.
            int[][] frames = { new[] { 0, 4 }, new[] { 2, 4 }, new[] { 6, 8 } };
            const int cellW = 16, cellH = 32;
            int w = frames.Length * cellW, h = cellH;
            var px = new byte[w * h * 4];

            void Composite(int spriteA, int spriteB, int cellX, int yoff)
            {
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        int ci = 0;
                        if (SnakeSprites.ReadPixel(g, spriteA, x, y)) ci = colA;
                        if (SnakeSprites.ReadPixel(g, spriteB, x, y)) ci |= colB;
                        if (ci == 0) continue;
                        Color c = pal[ci & 15];
                        int o = ((yoff + y) * w + (cellX + x)) * 4;
                        px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                    }
            }
            for (int f = 0; f < frames.Length; f++)
            {
                Composite(frames[f][0], frames[f][0] + 1, f * cellW, 0);    // torso OR-pair
                Composite(frames[f][1], frames[f][1] + 1, f * cellW, 16);   // legs OR-pair
            }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "prisoner.png"))) enc.Save(fs);

            File.WriteAllText(Path.Combine(outDir, "prisoner.json"),
                "{\n  \"frameWidth\": 16,\n  \"frameHeight\": 32,\n  \"anchorX\": 8,\n  \"anchorY\": 30,\n" +
                "  \"frames\": {\n    \"idle-1\": {\"x\": 0, \"y\": 0},\n    \"idle-2\": {\"x\": 16, \"y\": 0},\n" +
                "    \"rescued\": {\"x\": 32, \"y\": 0}\n  }\n}\n");

            // Grey Fox (room 164): SprSetPrisoner2 loads SprPrisoner2 — a complete ALTERNATE
            // 10-sprite prisoner sheet — at the same pattern base 0xD0, and the room's sprite
            // palette (SprsetPal9, data/palettes.asm:249) recolours slot 2 to DARK BLUE
            // (13h/2) with tan details (0Dh = 42h/3). Same frame layout, different man.
            if (p2.Length / 32 >= 10)
            {
                pal[2] = Color.FromRgb(36, 73, 109);       // uniform blue (SprsetPal9: 2 = 13h/2)
                pal[0x0D] = Color.FromRgb(146, 109, 73);   // face / hands tan (0Dh = 42h/3)
                pal[0x0F] = Color.FromRgb(0, 0, 0);        // outline (the OR overlap, fixed black)
                Array.Clear(px, 0, px.Length);
                g = p2;
                for (int f = 0; f < frames.Length; f++)
                {
                    Composite(frames[f][0], frames[f][0] + 1, f * cellW, 0);
                    Composite(frames[f][1], frames[f][1] + 1, f * cellW, 16);
                }
                var bmp2 = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
                bmp2.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
                var enc2 = new PngBitmapEncoder();
                enc2.Frames.Add(BitmapFrame.Create(bmp2));
                using (var fs = File.Create(Path.Combine(outDir, "greyfox.png"))) enc2.Save(fs);
                Console.WriteLine("Wrote greyfox.png (SprPrisoner2, SprsetPal9 blue)");
            }
            else Console.WriteLine($"SprPrisoner2 has only {p2.Length / 32} sprites — no greyfox.png");

            // Ellen (room 167): SprElen at the same prisoner patterns (SprSetElen), coloured
            // by ActorSprColors14 — BOTH pairs 0Dh + CC|0Bh: tan (SprsetPal8 0Dh = 53h/4)
            // over the dark-red dress (0Bh = 41h/0), overlap 0x0F black.
            byte[] el = sprites.DecodedPatterns("SprElen");
            if (el.Length / 32 >= 10)
            {
                pal[0x0D] = Color.FromRgb(182, 146, 109);  // tan
                pal[0x0B] = Color.FromRgb(146, 0, 36);     // the red dress
                pal[2] = pal[0x0B];                        // (colA slot reused below)
                pal[0x0F] = Color.FromRgb(0, 0, 0);
                Array.Clear(px, 0, px.Length);
                g = el;
                // colA = 0x0D, colB = 0x0B (Composite uses colA/colB consts = 2/0x0D — emulate
                // by mapping: layerA -> 0x0D handled via a local composite)
                void PairEl(int sprA, int cellX, int yoff)
                {
                    for (int y = 0; y < 16; y++)
                        for (int x = 0; x < 16; x++)
                        {
                            bool la = SnakeSprites.ReadPixel(el, sprA, x, y);
                            bool lb = SnakeSprites.ReadPixel(el, sprA + 1, x, y);
                            if (!la && !lb) continue;
                            Color c = la && lb ? pal[0x0F] : (la ? pal[0x0D] : pal[0x0B]);
                            int o = ((yoff + y) * w + (cellX + x)) * 4;
                            px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                        }
                }
                for (int f = 0; f < frames.Length; f++)
                {
                    PairEl(frames[f][0], f * cellW, 0);
                    PairEl(frames[f][1], f * cellW, 16);
                }
                var bmp3 = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
                bmp3.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
                var enc3 = new PngBitmapEncoder();
                enc3.Frames.Add(BitmapFrame.Create(bmp3));
                using (var fs = File.Create(Path.Combine(outDir, "ellen.png"))) enc3.Save(fs);
                Console.WriteLine("Wrote ellen.png (SprElen, tan + red dress)");
            }
            else Console.WriteLine($"SprElen has only {el.Length / 32} sprites — no ellen.png");

            // Dr. Madnar (rooms 182/189): SprMadnar at the same prisoner patterns
            // (SprSetMadnar at 0xD0), coloured by ActorSprColors15/16 under SprsetPal7:
            // the torso pair 0Dh tan + CC|0Eh white, the leg pair 0Eh white + 0Bh gray
            // (55h/5), every overlap 0x0F black — the tan-faced doctor in the white coat.
            byte[] md = sprites.DecodedPatterns("SprMadnar");
            if (md.Length / 32 >= 10)
            {
                var mdTan = Color.FromRgb(182, 146, 109);
                var mdWhite = Color.FromRgb(255, 255, 255);
                var mdGray = Color.FromRgb(182, 182, 182);
                var mdBlack = Color.FromRgb(0, 0, 0);
                Array.Clear(px, 0, px.Length);
                void PairMd(int sprA, int cellX, int yoff, Color a, Color bcol)
                {
                    for (int y = 0; y < 16; y++)
                        for (int x = 0; x < 16; x++)
                        {
                            bool la = SnakeSprites.ReadPixel(md, sprA, x, y);
                            bool lb = SnakeSprites.ReadPixel(md, sprA + 1, x, y);
                            if (!la && !lb) continue;
                            Color c = la && lb ? mdBlack : (la ? a : bcol);
                            int o = ((yoff + y) * w + (cellX + x)) * 4;
                            px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                        }
                }
                for (int f = 0; f < frames.Length; f++)
                {
                    PairMd(frames[f][0], f * cellW, 0, mdTan, mdWhite);     // torso: tan + white
                    PairMd(frames[f][1], f * cellW, 16, mdWhite, mdGray);   // coat/legs: white + gray
                }
                var bmp4 = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
                bmp4.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
                var enc4 = new PngBitmapEncoder();
                enc4.Frames.Add(BitmapFrame.Create(bmp4));
                using (var fs = File.Create(Path.Combine(outDir, "madnar.png"))) enc4.Save(fs);
                Console.WriteLine("Wrote madnar.png (SprMadnar, the white-coat doctor)");
            }
            else Console.WriteLine($"SprMadnar has only {md.Length / 32} sprites — no madnar.png");
            Console.WriteLine($"Wrote prisoner.png ({w}x{h}) + prisoner.json — 3 frames (idle-1, idle-2, rescued)");
        }

        // ---- Elevator cabin export --------------------------------------------
        // The cabin is 12 hardware sprites = 6 OR-pair positions (SprElevatorDat,
        // logic/elevatorroom.asm:230: offY, offX, pattern, colour per sprite; offsets are
        // signed bytes from (ElevatorY, ElevatorX); the second sprite of each pair has the
        // CC bit (0x40) set = OR-combine). Patterns base 0x38 (SprSetElevator,
        // data/spritesets.asm:69) -> sprite index (pattern - 0x38) / 4 into SprElevator
        // (gfx/sprites.asm:449). The block spans x [-16,16) y [-48,16) around the elevator
        // origin -> a 32x64 PNG anchored at (16,48). Colours are the REAL in-game values:
        // elevator rooms use spriteset 0 (SpritesetRooms, data/spritesets.asm) whose palette
        // SprsetPal0 (data/palettes.asm:214) sets 2 = blue (27h/2), 0x0B = dark grey (22h/2),
        // 0x0D = light grey (55h/5); 0x0C and 0x0F come from the fixed PalMenuWeapon slots
        // (33h/3 grey and 0/0 black). Pair colours: rails 0x0C|0x0B, body 0x02|0x0D.
        public static void ExportElevator(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns("SprElevator");
            int n = g.Length / 32;
            Console.WriteLine($"SprElevator: {g.Length} bytes = {n} sprites (expect 12)");
            if (n < 12) throw new InvalidDataException($"Expected 12 elevator sprites, got {n}.");

            // MSX 3-bit channels expanded v*255/7 (SprsetPal0 + PalMenuWeapon, data/palettes.asm).
            var pal = new Color[16];
            pal[0x02] = Color.FromRgb(73, 73, 255);     // blue   (SprsetPal0: 2, 27h, 2)
            pal[0x0B] = Color.FromRgb(73, 73, 73);      // dark grey  (SprsetPal0: 0Bh, 22h, 2)
            pal[0x0C] = Color.FromRgb(109, 109, 109);   // mid grey   (PalMenuWeapon: 0Ch, 33h, 3)
            pal[0x0D] = Color.FromRgb(182, 182, 182);   // light grey (SprsetPal0: 0Dh, 55h, 5)
            pal[0x0F] = Color.FromRgb(0, 0, 0);         // OR overlap (PalMenuWeapon: 0Fh, 0, 0 = black)

            // SprElevatorDat rows: (dy, dx, sprite pair base, colour pair) — pairs share a position.
            (int dy, int dx, int spr, int colA, int colB)[] cells =
            {
                (-48,  -8,  0, 0x0C, 0x0B),
                (-32, -16,  2, 0x02, 0x0D),
                (-32,   0,  4, 0x02, 0x0D),
                (-16, -16,  6, 0x02, 0x0D),
                (-16,   0,  8, 0x02, 0x0D),
                (  0,  -8, 10, 0x0C, 0x0B),
            };
            const int w = 32, h = 64, ax = 16, ay = 48;     // anchor = the ElevatorX/Y origin
            var px = new byte[w * h * 4];
            foreach (var c in cells)
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        int ci = 0;
                        if (SnakeSprites.ReadPixel(g, c.spr, x, y)) ci = c.colA;
                        if (SnakeSprites.ReadPixel(g, c.spr + 1, x, y)) ci |= c.colB;
                        if (ci == 0) continue;
                        int ox = ax + c.dx + x, oy = ay + c.dy + y;
                        int o = (oy * w + ox) * 4;
                        Color col = pal[ci & 15];
                        px[o] = col.B; px[o + 1] = col.G; px[o + 2] = col.R; px[o + 3] = 255;
                    }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "elevator.png"))) enc.Save(fs);

            File.WriteAllText(Path.Combine(outDir, "elevator.json"),
                "{\n  \"width\": 32,\n  \"height\": 64,\n  \"anchorX\": 16,\n  \"anchorY\": 48\n}\n");
            Console.WriteLine($"Wrote elevator.png ({w}x{h}) + elevator.json — anchored at the ElevatorX/Y origin");
        }

        // ---- Camera export -----------------------------------------------------
        // SprCamera (gfx/sprites.asm:594): EIGHT 16x16 sprites = four facings x two OR-layers
        // (CameraUp/Down/Left/Right, data/actorspriteattr.asm:335-338: header 95h + two
        // patterns — VRAM 0xE0/0xE4, 0xE8/0xEC, 0xF0/0xF4, 0xF8/0xFC = sprite pairs (2d, 2d+1)
        // for d = up, down, left, right). Colours follow the guard scheme (CamAlertAnim:
        // bc=24Dh normal / 44Bh flashing — layer A colour 2 / 4, layer B CC|0Dh / CC|0Bh,
        // overlap ORs to 0x0F): in the camera rooms' sprite palette (SprsetPal2,
        // data/palettes.asm:219 — rooms 14/21/27/28/31/36 use set 22 SprSetCamGuard) that is
        // 2 = dark grey 22h/2, 0x0D = tan 42h/3, and both 4 and 0x0B = dark red 50h/0; 0x0F is
        // the fixed black. camera.png = 4 columns (facing) x 2 rows (normal, flash-red).
        // ---- Generic actor OR-pair export ---------------------------------------
        // `--export-actor <SprLabel> <out.png> [#A #B #overlap]`: decode a sprites.asm
        // label as consecutive OR-PAIRS (sprite 2i = layer A, 2i+1 = layer B) and write
        // one 16x16 frame per pair in a row + <out>.json ({frameWidth, frames}). The
        // default colours are the guard scheme (ActorSprColors3-style: dark layer + tan
        // layer, black overlap) — per-actor palettes can override via the CLI.
        public static int ExportActorPairs(string label, string outPath, Color? a = null, Color? b = null, Color? o = null)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns(label);
            int n = g.Length / 32, frames = n / 2;
            if (frames < 1) { Console.Error.WriteLine($"{label}: {n} sprites — nothing to export."); return 1; }
            Color colA = a ?? Color.FromRgb(73, 73, 73);        // 2  (dark)
            Color colB = b ?? Color.FromRgb(182, 109, 36);      // 0Dh (tan)
            Color colO = o ?? Color.FromRgb(0, 0, 0);           // OR overlap
            int w = frames * 16, h = 16;
            var px = new byte[w * h * 4];
            for (int f = 0; f < frames; f++)
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        bool la = SnakeSprites.ReadPixel(g, f * 2, x, y);
                        bool lb = SnakeSprites.ReadPixel(g, f * 2 + 1, x, y);
                        if (!la && !lb) continue;
                        Color c = la && lb ? colO : (la ? colA : colB);
                        int off = (y * w + f * 16 + x) * 4;
                        px[off] = c.B; px[off + 1] = c.G; px[off + 2] = c.R; px[off + 3] = 255;
                    }
            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(outPath)) enc.Save(fs);
            File.WriteAllText(Path.ChangeExtension(outPath, ".json"),
                $"{{\n  \"frameWidth\": 16,\n  \"frameHeight\": 16,\n  \"frames\": {frames}\n}}\n");
            Console.WriteLine($"Wrote {outPath} ({w}x{h}, {frames} pair-frames from {label})");
            return 0;
        }

        // Single-layer variant: each 16x16 pattern becomes its OWN frame in one flat
        // color (for actors whose attr entries place separate sprites side by side
        // instead of OR-layering them — e.g. the bridge, actorspriteattr.asm:360).
        public static int ExportActorSingles(string label, string outPath, Color? col = null)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns(label);
            int frames = g.Length / 32;
            if (frames < 1) { Console.Error.WriteLine($"{label}: nothing to export."); return 1; }
            Color c0 = col ?? Color.FromRgb(109, 109, 109);     // 0Ch in PalMenuWeapon (33h,3)
            int w = frames * 16, h = 16;
            var px = new byte[w * h * 4];
            for (int f = 0; f < frames; f++)
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        if (!SnakeSprites.ReadPixel(g, f, x, y)) continue;
                        int off = (y * w + f * 16 + x) * 4;
                        px[off] = c0.B; px[off + 1] = c0.G; px[off + 2] = c0.R; px[off + 3] = 255;
                    }
            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(outPath)) enc.Save(fs);
            File.WriteAllText(Path.ChangeExtension(outPath, ".json"),
                $"{{\n  \"frameWidth\": 16,\n  \"frameHeight\": 16,\n  \"frames\": {frames}\n}}\n");
            Console.WriteLine($"Wrote {outPath} ({w}x{h}, {frames} single-frames from {label})");
            return 0;
        }

        public static void ExportCamera(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns("SprCamera");
            int n = g.Length / 32;
            Console.WriteLine($"SprCamera: {g.Length} bytes = {n} sprites (expect 8 = 4 facings x 2 layers)");
            if (n < 8) throw new InvalidDataException($"Expected 8 camera sprites, got {n}.");

            var grey = Color.FromRgb(73, 73, 73);       // SprsetPal2: 2 = 22h/2
            var tan = Color.FromRgb(146, 109, 73);      // SprsetPal2: 0Dh = 42h/3
            var red = Color.FromRgb(182, 0, 0);         // SprsetPal2: 4 and 0Bh = 50h/0
            var black = Color.FromRgb(0, 0, 0);         // PalMenuWeapon: 0Fh (the OR overlap)
            var rows = new[] { (colA: grey, colB: tan, both: black), (colA: red, colB: red, both: black) };
            const int w = 16 * 4, h = 16 * 2;
            var px = new byte[w * h * 4];
            for (int row = 0; row < 2; row++)
                for (int d = 0; d < 4; d++)
                    for (int y = 0; y < 16; y++)
                        for (int x = 0; x < 16; x++)
                        {
                            bool a = SnakeSprites.ReadPixel(g, d * 2, x, y);
                            bool b = SnakeSprites.ReadPixel(g, d * 2 + 1, x, y);
                            if (!a && !b) continue;
                            Color col = a && b ? rows[row].both : (a ? rows[row].colA : rows[row].colB);
                            int o = ((row * 16 + y) * w + d * 16 + x) * 4;
                            px[o] = col.B; px[o + 1] = col.G; px[o + 2] = col.R; px[o + 3] = 255;
                        }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "camera.png"))) enc.Save(fs);
            Console.WriteLine($"Wrote camera.png ({w}x{h}) — cols up/down/left/right, rows normal/flash");
        }

        // ---- Machine Gun Kid export -------------------------------------------
        // SprMGunKid: 8 sprites = torso pair A (0,1), torso pair B/recoil (2,3), legs A
        // (4,5), legs B (6,7). Frames per actorspriteattr.asm (0x31-0x34, header 0xA5 =
        // 16x32 two-pair actor): fire = torsoA+legsA, recoil = torsoB+legsA, walk1 =
        // torsoA+legsA (same as fire), walk2 = torsoA+legsB. Colours: the guard scheme
        // (2 + CC|0Dh, overlap 0x0F) in room 20's sprite palette SprsetPal11
        // (2 = 41h/2 brown, 0Dh = 53h/4 tan).
        public static void ExportMgk(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns("SprMGunKid");
            int n = g.Length / 32;
            Console.WriteLine($"SprMGunKid: {g.Length} bytes = {n} sprites (expect 8)");
            if (n < 8) throw new InvalidDataException($"Expected 8 MGK sprites, got {n}.");

            var pal = new Color[16];
            pal[2] = Color.FromRgb(146, 73, 36);       // SprsetPal11: 2 = 41h/2
            pal[0x0D] = Color.FromRgb(182, 146, 109);  // SprsetPal11: 0Dh = 53h/4
            pal[0x0F] = Color.FromRgb(0, 0, 0);        // the OR overlap

            (string name, int torso, int legs)[] frames =
                { ("fire", 0, 4), ("recoil", 2, 4), ("walk1", 0, 4), ("walk2", 0, 6) };
            const int cw = 16, ch = 32;
            int w = frames.Length * cw;
            var px = new byte[w * ch * 4];
            void Pair(int spr, int cellX, int yoff)
            {
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        int ci = 0;
                        if (SnakeSprites.ReadPixel(g, spr, x, y)) ci = 2;
                        if (SnakeSprites.ReadPixel(g, spr + 1, x, y)) ci |= 0x0D;
                        if (ci == 0) continue;
                        Color c = pal[ci & 15];
                        int o = ((yoff + y) * w + cellX + x) * 4;
                        px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                    }
            }
            for (int f = 0; f < frames.Length; f++)
            {
                Pair(frames[f].torso, f * cw, 0);
                Pair(frames[f].legs, f * cw, 16);
            }
            var bmp = new WriteableBitmap(w, ch, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, ch), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "mgk.png"))) enc.Save(fs);
            File.WriteAllText(Path.Combine(outDir, "mgk.json"),
                "{\n  \"frameWidth\": 16,\n  \"frameHeight\": 32,\n  \"anchorX\": 8,\n  \"anchorY\": 30,\n" +
                "  \"frames\": {\n    \"fire\": {\"x\": 0, \"y\": 0},\n    \"recoil\": {\"x\": 16, \"y\": 0},\n" +
                "    \"walk1\": {\"x\": 32, \"y\": 0},\n    \"walk2\": {\"x\": 48, \"y\": 0}\n  }\n}\n");
            Console.WriteLine("Wrote mgk.png (4 frames) + mgk.json");
        }

        // ---- Shotgunner export ------------------------------------------------
        // SprShotGunner at VRAM 0x60 (SprSetSGunner): standing = attr 0x5D (91h header,
        // torso pair 0x60/0x64 over legs 0x68/0x6C); rolls 1-3 = attr 0x5E-0x60 (9Ah
        // header, pairs 0x70/0x74+0x78/0x7C, 0x80/0x84+0x88/0x8C, 0x90/0x94+0x98/0x9C).
        // SprSGunnerShot at 0xA0 = 3 pellet frames (the expanding blast draws each 4x).
        // Colours: the guard scheme in room 57's sprite palette SprsetPal10
        // (2 = 12h/1 dark blue, 0Dh = 42h/3 tan).
        public static void ExportSgunner(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] g = sprites.DecodedPatterns("SprShotGunner");
            byte[] shot = sprites.DecodedPatterns("SprSGunnerShot");
            Console.WriteLine($"SprShotGunner: {g.Length / 32} sprites; SprSGunnerShot: {shot.Length / 32}");
            if (g.Length / 32 < 16 || shot.Length / 32 < 3)
                throw new InvalidDataException("unexpected Shotgunner sprite counts");

            var pal = new Color[16];
            pal[2] = Color.FromRgb(36, 36, 73);        // SprsetPal10: 2 = 12h/1
            pal[0x0D] = Color.FromRgb(146, 109, 73);   // SprsetPal10: 0Dh = 42h/3
            pal[0x0F] = Color.FromRgb(0, 0, 0);
            pal[0x0E] = Color.FromRgb(255, 255, 255);  // the pellet (white)

            // frames: standing + 3 rolls — sprite-index pairs (top, bottom) within SprShotGunner
            (string name, int top, int bot)[] frames =
                { ("stand", 0, 2), ("roll1", 4, 6), ("roll2", 8, 10), ("roll3", 12, 14) };
            const int cw = 16, ch = 32;
            int w = frames.Length * cw + 3 * cw;       // + the 3 pellet cells (16x16, top row)
            var px = new byte[w * ch * 4];
            void Pair(byte[] src, int spr, int cellX, int yoff, int cA, int cB)
            {
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        int ci = 0;
                        if (SnakeSprites.ReadPixel(src, spr, x, y)) ci = cA;
                        if (SnakeSprites.ReadPixel(src, spr + 1, x, y)) ci |= cB;
                        if (ci == 0) continue;
                        Color c = pal[ci & 15];
                        int o = ((yoff + y) * w + cellX + x) * 4;
                        px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
                    }
            }
            for (int f = 0; f < frames.Length; f++)
            {
                Pair(g, frames[f].top, f * cw, 0, 2, 0x0D);
                Pair(g, frames[f].bot, f * cw, 16, 2, 0x0D);
            }
            for (int p = 0; p < 3; p++)                // pellets: single-layer, white
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                        if (SnakeSprites.ReadPixel(shot, p, x, y))
                        {
                            int o = (y * w + frames.Length * cw + p * cw + x) * 4;
                            px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; px[o + 3] = 255;
                        }

            var bmp = new WriteableBitmap(w, ch, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, ch), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "sgunner.png"))) enc.Save(fs);
            File.WriteAllText(Path.Combine(outDir, "sgunner.json"),
                "{\n  \"frameWidth\": 16,\n  \"frameHeight\": 32,\n  \"anchorX\": 8,\n  \"anchorY\": 30,\n" +
                "  \"frames\": {\n    \"stand\": {\"x\": 0, \"y\": 0},\n    \"roll1\": {\"x\": 16, \"y\": 0},\n" +
                "    \"roll2\": {\"x\": 32, \"y\": 0},\n    \"roll3\": {\"x\": 48, \"y\": 0},\n" +
                "    \"pellet1\": {\"x\": 64, \"y\": 0, \"w\": 16, \"h\": 16},\n" +
                "    \"pellet2\": {\"x\": 80, \"y\": 0, \"w\": 16, \"h\": 16},\n" +
                "    \"pellet3\": {\"x\": 96, \"y\": 0, \"w\": 16, \"h\": 16}\n  }\n}\n");
            Console.WriteLine("Wrote sgunner.png (stand + 3 rolls + 3 pellets) + sgunner.json");
        }

        // ---- Weapon shots export ----------------------------------------------
        // Every projectile/explosion sprite, composed as the ROM's OR-pairs with the colours
        // from the shot attribute tables (data/weaponspratt.asm): grenade/bomb 7+CC|0Ah,
        // rocket 7+CC|0Ch, mine 0Ch+CC|07h, missile 8+0Fh, small/medium explosions 6+CC|08h
        // (overlap 0x0E = white core), and the medium explosion's FINAL frame = a 32x32
        // white 4-sprite burst (SprExplosB3Attr). Palette: the game's fixed slots
        // (PalMenuWeapon: 6 yellow, 8 red, 0xC grey, 0xE white, 0xF black) + the MSX2
        // default for untouched slots 7 (2,6,7) and 0xA (6,6,1).
        public static void ExportShots(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));

            var pal = new Color[16];
            pal[6] = Color.FromRgb(255, 255, 0);      // yellow (PalMenuWeapon 70h/7)
            pal[7] = Color.FromRgb(73, 218, 255);     // cyan   (MSX2 default 2,6,7)
            pal[8] = Color.FromRgb(255, 0, 0);        // red    (PalMenuWeapon 70h/0)
            pal[0x0A] = Color.FromRgb(218, 218, 36);  // dark yellow (MSX2 default 6,6,1)
            pal[0x0C] = Color.FromRgb(109, 109, 109); // grey   (PalMenuWeapon 33h/3)
            pal[0x0E] = Color.FromRgb(255, 255, 255); // white  (PalMenuWeapon 77h/7)
            pal[0x0F] = Color.FromRgb(0, 0, 0);       // black  (PalMenuWeapon 0/0)

            // (label, sprite pair base, colour A, colour B, overlap colour)
            (string name, string label, int spr, int cA, int cB, int cO)[] cells =
            {
                ("grenade",      "SprGrenade",      0, 7, 0x0A, 0x0F),
                ("rocket-up",    "SprRocketUp",     0, 7, 0x0C, 0x0F),
                ("rocket-right", "SprRocketRight",  0, 7, 0x0C, 0x0F),
                ("rocket-down",  "SprRocketDown",   0, 7, 0x0C, 0x0F),
                ("rocket-left",  "SprRocketLeft",   0, 7, 0x0C, 0x0F),
                ("bomb",         "SprPlasticBomb",  0, 7, 0x0A, 0x0F),
                ("mine",         "SprMine",         0, 0x0C, 7, 0x0F),
                ("missile-up",   "SprMissileUp",    0, 8, 0x0F, 0x0F),
                ("missile-right","SprMissileRight", 0, 8, 0x0F, 0x0F),
                ("missile-down", "SprMissileDown",  0, 8, 0x0F, 0x0F),
                ("missile-left", "SprMissileLeft",  0, 8, 0x0F, 0x0F),
                ("sexp-1",       "SprExplosionS",   0, 6, 8, 0x0E),
                ("sexp-2",       "SprExplosionS",   2, 6, 8, 0x0E),
                ("sexp-3",       "SprExplosionS",   4, 6, 8, 0x0E),
                ("mexp-1",       "SprExplosionB",   0, 6, 8, 0x0E),
                ("mexp-2",       "SprExplosionB",   2, 6, 8, 0x0E),
            };

            const int cellW = 16, cellH = 16;
            int w = (cells.Length + 3) * cellW;       // +2 = the 32x32 final flash, +1 = the target
            int h = 32;
            var px = new byte[w * h * 4];

            void Pixel(int ox, int oy, Color c)
            {
                int o = (oy * w + ox) * 4;
                px[o] = c.B; px[o + 1] = c.G; px[o + 2] = c.R; px[o + 3] = 255;
            }
            void Pair(byte[] g, int sprA, int cellX, int cellY, int cA, int cB, int cO)
            {
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        bool a = SnakeSprites.ReadPixel(g, sprA, x, y);
                        bool b = SnakeSprites.ReadPixel(g, sprA + 1, x, y);
                        if (!a && !b) continue;
                        Pixel(cellX + x, cellY + y, pal[a && b ? cO : (a ? cA : cB)]);
                    }
            }

            for (int i = 0; i < cells.Length; i++)
            {
                byte[] g = sprites.DecodedPatterns(cells[i].label);
                if (g.Length < (cells[i].spr + 2) * 32)
                    throw new InvalidDataException($"{cells[i].label}: {g.Length / 32} sprites, need {cells[i].spr + 2}");
                Pair(g, cells[i].spr, i * cellW, 0, cells[i].cA, cells[i].cB, cells[i].cO);
            }
            // mexp-3: SprExplosionB sprites 4-7 in white, quadrants TL/TR/BL/BR (SprExplosB3Attr).
            byte[] eb = sprites.DecodedPatterns("SprExplosionB");
            int bx = cells.Length * cellW;
            (int spr, int dx, int dy)[] quads = { (4, 0, 0), (5, 16, 0), (6, 0, 16), (7, 16, 16) };
            foreach (var q in quads)
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                        if (SnakeSprites.ReadPixel(eb, q.spr, x, y))
                            Pixel(bx + q.dx + x, q.dy + y, pal[0x0E]);

            // target: the grenade-launcher aim crosshair — SprGrenade's THIRD sprite ("Grenade
            // + target point (3 sprites)", gfx/sprites.asm:1013), the single-layer pattern 0x18
            // SetGrenaTargetSpr points at, drawn white (GrenadTargetCol = 0x0E).
            byte[] gt = sprites.DecodedPatterns("SprGrenade");
            int tx = bx + 32;
            for (int y = 0; y < 16; y++)
                for (int x = 0; x < 16; x++)
                    if (SnakeSprites.ReadPixel(gt, 2, x, y))
                        Pixel(tx + x, y, pal[0x0E]);

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "shots.png"))) enc.Save(fs);

            var sb = new System.Text.StringBuilder("{\n  \"frames\": {\n");
            for (int i = 0; i < cells.Length; i++)
                sb.Append($"    \"{cells[i].name}\": {{\"x\": {i * cellW}, \"y\": 0, \"w\": 16, \"h\": 16}},\n");
            sb.Append($"    \"mexp-3\": {{\"x\": {bx}, \"y\": 0, \"w\": 32, \"h\": 32}},\n");
            sb.Append($"    \"target\": {{\"x\": {tx}, \"y\": 0, \"w\": 16, \"h\": 16}}\n  }}\n}}\n");
            File.WriteAllText(Path.Combine(outDir, "shots.json"), sb.ToString());
            Console.WriteLine($"Wrote shots.png ({w}x{h}) + shots.json ({cells.Length + 2} frames)");
        }

        // ---- Guard bullet export ----------------------------------------------
        // The guard's shot (ID_GUARD_BULLET 0x2F, SpriteId 0x72) is the actor sprite
        // `Bullet: db 95h, 50h, 50h` (data/actorspriteattr.asm) — one 16x16 pattern (0x50,
        // the first sprite of SprBullet) drawn twice and OR-combined, coloured by
        // ActorSprColors3 (index 2 + CC|0Dh, the guard's own colours). Because both layers
        // use the identical pattern, every lit pixel OR-combines to index 0x0F, which in the
        // gameplay palette is white — enemy bullets are white on screen (matching the player's
        // shots). We keep the decoded SHAPE faithful and paint it white.
        public static void ExportGuardBullet(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] b = sprites.DecodedPatterns("SprBullet");
            if (b.Length < 32)
                throw new InvalidDataException($"SprBullet decoded to {b.Length} bytes (<32); expected at least one 16x16 sprite.");

            // Tight bounding box over the lit pixels of sprite 0 (the bullet is a small blob
            // inside the 16x16 cell — crop so the PNG is just the bullet).
            int minX = 16, minY = 16, maxX = -1, maxY = -1;
            for (int y = 0; y < 16; y++)
                for (int x = 0; x < 16; x++)
                    if (SnakeSprites.ReadPixel(b, 0, x, y))
                    {
                        if (x < minX) minX = x; if (x > maxX) maxX = x;
                        if (y < minY) minY = y; if (y > maxY) maxY = y;
                    }
            if (maxX < 0) throw new InvalidDataException("SprBullet sprite 0 has no lit pixels.");

            int w = maxX - minX + 1, h = maxY - minY + 1;
            var bullet = Color.FromRgb(255, 255, 255);   // white (index 0x0F in the gameplay palette)
            var px = new byte[w * h * 4];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    if (SnakeSprites.ReadPixel(b, 0, minX + x, minY + y))
                    {
                        int o = (y * w + x) * 4;
                        px[o] = bullet.B; px[o + 1] = bullet.G; px[o + 2] = bullet.R; px[o + 3] = 255;
                    }

            var bmp = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, w, h), px, w * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "guard-bullet.png"))) enc.Save(fs);

            Console.WriteLine($"Wrote guard-bullet.png ({w}x{h}) — SprBullet sprite 0, cropped to lit pixels");
        }

        // ---- Sleeping "Zzz" sign export ---------------------------------------
        // The sleeping guard's sign (ID_SLEEPING_SIGN) animates over 3 frames — actor sprite
        // attributes Zzz1/Zzz2/Zzz3 use patterns 0xE0/0xE4/0xE8 (= sub-sprites 0/1/2 of SprZzz,
        // gfx/sprites.asm). AnimZzzSign cycles them via AnimZzzFrames [1,2,1,0]. We decode the three
        // 16x16 sub-sprites and write zzz.png (3 frames) + zzz.json. The sign is light (white).
        public static void ExportZzz(string outDir)
        {
            var sprites = SnakeSprites.Load(
                LocateRepoFile("gfx", "sprites.asm"),
                LocateRepoFile("data", "playersprite.asm"));
            byte[] z = sprites.DecodedPatterns("SprZzz");
            int n = z.Length / 32;
            int frames = Math.Min(3, n);
            var white = Color.FromRgb(255, 255, 255);
            const int cw = 16, ch = 16;
            var px = new byte[frames * cw * ch * 4];
            int sheetW = frames * cw;
            for (int f = 0; f < frames; f++)
                for (int y = 0; y < ch; y++)
                    for (int x = 0; x < cw; x++)
                        if (SnakeSprites.ReadPixel(z, f, x, y))
                        {
                            int o = (y * sheetW + f * cw + x) * 4;
                            px[o] = white.B; px[o + 1] = white.G; px[o + 2] = white.R; px[o + 3] = 255;
                        }
            var bmp = new WriteableBitmap(sheetW, ch, 96, 96, PixelFormats.Bgra32, null);
            bmp.WritePixels(new Int32Rect(0, 0, sheetW, ch), px, sheetW * 4, 0);
            Directory.CreateDirectory(outDir);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using (var fs = File.Create(Path.Combine(outDir, "zzz.png"))) enc.Save(fs);
            File.WriteAllText(Path.Combine(outDir, "zzz.json"),
                $"{{\n  \"frameWidth\": {cw},\n  \"frameHeight\": {ch},\n  \"frames\": {frames}\n}}\n");
            Console.WriteLine($"Wrote zzz.png ({sheetW}x{ch}) + zzz.json — {frames} Zzz frames (SprZzz has {n} sub-sprites)");
        }

        // Default output directory: <thisRepo>\web\assets (NOT derived from the disassembly path —
        // the disassembly is now a sibling repo; assets are written into THIS repo). See RomPaths.
        public static string DefaultOutDir() => RomPaths.DefaultOutDir();

        // Locate a disassembly source file (now in the sibling ../MetalGear repo). See RomPaths.
        private static string LocateRepoFile(params string[] relativeParts)
            => RomPaths.RomFile(relativeParts);
    }
}
