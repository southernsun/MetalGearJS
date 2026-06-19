using MetalGear.RoomViewer.Asm;

namespace MetalGear.RoomViewer.Game;

/// <summary>
/// Loads every data table the room renderer needs straight out of the
/// disassembly's .asm sources, so the C# viewer is driven by exactly the same
/// bytes the original ROM uses.
/// </summary>
public sealed class GameData
{
    public const int RoomCols = 8;      // metatiles across a room
    public const int RoomRows = 6;      // metatiles down a room
    public const int MetatileTiles = 4; // tiles per metatile side (4x4)

    private readonly AsmParser _asm = new();

    // room number -> Room label (or null for RoomUndefined)
    private string?[] _roomLabels = Array.Empty<string?>();

    public byte[] ColorsTileset { get; private set; } = { 1, 3, 5, 8, 9, 0x0C, 0x0E, 0x0F };
    public string[] MetatileSetNames { get; private set; } = Array.Empty<string>();
    public string[] TileSetNames { get; private set; } = Array.Empty<string>();
    public string[] RoomPaletteNames { get; private set; } = Array.Empty<string>();

    private byte[] _metaTileSetIds = Array.Empty<byte>();
    private byte[] _roomGfxSetIds = Array.Empty<byte>();
    private byte[] _idsRoomPal = Array.Empty<byte>();

    public AsmParser Asm => _asm;

    public static GameData Load(string gameRoot)
    {
        var g = new GameData();
        g.LoadFrom(gameRoot);
        return g;
    }

    private void LoadFrom(string root)
    {
        // Data tables.
        foreach (var f in new[]
        {
            "data/rooms.asm", "data/metatiles.asm", "data/roomtileset.asm",
            "data/palettes.asm", "data/roomsconnections.asm", "data/doors.asm",
            "data/weapongfxxy.asm", "data/itemgfxxy.asm",   // HUD icon coordinate tables (DrawWeaponHUD/DrawItemHUD)
            "data/tileblocks.asm",                          // radio screen / portrait tile maps (DrawTilesBlock)
            "logic/konamilogo.asm",                         // KonamiLogoPal + KonamiLogoTiles (boot logo)
            "logic/mainmenu.asm",                           // MenuPalette + MGLogoColors + Metal/GearTilesDat
        })
        {
            _asm.ParseFile(Path.Combine(root, f));
        }

        // All graphics blobs.
        foreach (var f in Directory.GetFiles(Path.Combine(root, "gfx"), "*.asm"))
            _asm.ParseFile(f);

        // Constants we pull from the main bank.
        _asm.ParseFile(Path.Combine(root, "Banks0123.asm"));

        if (_asm.Has("ColorsTileset"))
            ColorsTileset = _asm.Bytes("ColorsTileset").Take(8).ToArray();

        _roomLabels = _asm.Symbols("idxRooms");
        MetatileSetNames = _asm.Symbols("idxMetatileSet");
        TileSetNames = _asm.Symbols("idxTileSets");
        RoomPaletteNames = _asm.Symbols("idxRoomPalettes");

        _metaTileSetIds = _asm.Bytes("MetaTileSetIDs");
        _roomGfxSetIds = _asm.Bytes("RoomGfxSetIds");
        _idsRoomPal = _asm.Bytes("IdsRoomPal");
    }

    public int RoomCount => _roomLabels.Length;

    /// <summary>True when the room slot points at real room data (not RoomUndefined).</summary>
    public bool RoomDefined(int room) =>
        room >= 0 && room < _roomLabels.Length &&
        _roomLabels[room] is { } label && label != "RoomUndefined" && _asm.Has(label);

    public string RoomLabel(int room) => _roomLabels[room] ?? "RoomUndefined";

    /// <summary>The 8x6 metatile-id grid for a room.</summary>
    public byte[] RoomMetatiles(int room) => _asm.Bytes(_roomLabels[room]!);

    // --- per-room nibble selectors (GetNibbleRoom in Banks0123.asm) ---
    // even room -> high nibble of byte[room/2], odd room -> low nibble.
    private static int Nibble(byte[] table, int room)
    {
        int b = table[room >> 1];
        return (room & 1) == 0 ? (b >> 4) & 0x0F : b & 0x0F;
    }

    /// <summary>
    /// A room's four connections, in the ROM's RoomConnections order
    /// [Up, Down, Left, Right] (north, south, west, east). 255 = no exit.
    /// The 156-row table is shared by THREE room ranges (GetNextRoomNum,
    /// Banks0123.asm:889-925): rooms 0-125 index 1:1; rooms 208-227 use rows
    /// room-82 (126-145); the elevator rooms 241-250 use rows room-95 (146-155)
    /// — that last range carries the SHAFT CHAINS (243 up to 244, 247-250...).
    /// Rooms 126-207 and 228-240 have no connection row (doors/elevators only).
    /// </summary>
    public int[] Connections(int room)
    {
        byte[] all = _asm.Bytes("RoomConnections");
        int row = room <= 125 ? room
                : room >= 208 && room <= 227 ? room - 82
                : room >= 241 && room <= 250 ? room - 95
                : -1;
        int off = row * 4;
        if (row < 0 || off + 3 >= all.Length)
            return new[] { 255, 255, 255, 255 };
        return new[] { (int)all[off], all[off + 1], all[off + 2], all[off + 3] };
    }

    /// <summary>One door from a room's DoorsRoomNNN list. X/Y are room pixel coords.</summary>
    public readonly record struct Door(int Id, int Type, int X, int Y, int Dest);

    /// <summary>
    /// A door type's geometry from DoorOpenEnterDat (8 bytes per type, 1-based).
    /// Byte order: OpenOffY, OpenNY, OpenOffX, OpenNX, EnterOffY, EnterNY, EnterOffX, EnterNX.
    /// Offsets are signed; sizes (N*) are unsigned.
    /// </summary>
    public readonly record struct DoorType(
        int OpenOffX, int OpenOffY, int OpenNX, int OpenNY,
        int EnterOffX, int EnterOffY, int EnterNX, int EnterNY);

    /// <summary>The doors defined for a room (empty for NoDoorsRoom). 5-byte records, 0xFF-terminated.</summary>
    public IReadOnlyList<Door> Doors(int room)
    {
        // AddDoorsData (Banks0123.asm:1274-1281): rooms 225-239 have no doors and no idxDoors
        // entries; the elevator rooms (>= 240) index the table at room - 15.
        if (room >= 225 && room < 240) return Array.Empty<Door>();
        int idx = room >= 240 ? room - 15 : room;
        string[] syms = _asm.Symbols("idxDoors");
        if (idx < 0 || idx >= syms.Length) return Array.Empty<Door>();
        string label = syms[idx];
        if (label == "NoDoorsRoom" || !_asm.Has(label)) return Array.Empty<Door>();

        byte[] b = _asm.Bytes(label);   // records: [ID, Type, DrawY, DrawX, DestRoom], 0xFF terminator
        var list = new List<Door>();
        for (int i = 0; i + 4 < b.Length && b[i] != 0xFF; i += 5)
            list.Add(new Door(Id: b[i], Type: b[i + 1], X: b[i + 3], Y: b[i + 2], Dest: b[i + 4]));
        return list;
    }

    public DoorType DoorTypeInfo(int type)
    {
        byte[] d = _asm.Bytes("DoorOpenEnterDat");
        int o = (type - 1) * 8;
        sbyte S(int k) => (sbyte)d[o + k];
        return new DoorType(
            OpenOffX: S(2), OpenOffY: S(0), OpenNX: d[o + 3], OpenNY: d[o + 1],
            EnterOffX: S(6), EnterOffY: S(4), EnterNX: d[o + 7], EnterNY: d[o + 5]);
    }

    public int MetatileSetId(int room) => Nibble(_metaTileSetIds, room);
    public int GfxSetId(int room) => Nibble(_roomGfxSetIds, room);
    public int PaletteId(int room) => Nibble(_idsRoomPal, room);

    /// <summary>Raw bytes of a metatile set (a run of 16-byte metatiles).</summary>
    public byte[] MetatileSet(int setIndexOneBased) =>
        _asm.Bytes(MetatileSetNames[setIndexOneBased - 1]);

    public byte[] Gfx(string name) => _asm.Bytes(name);

    public IReadOnlyList<AsmToken> TileSetTokens(int tileSetId) =>
        _asm.Tokens(TileSetNames[tileSetId]);

    public byte[] RoomPaletteBlock(int paletteId) =>
        _asm.Bytes(RoomPaletteNames[paletteId]);

    /// <summary>
    /// The in-game base palette. Gameplay establishes the "fixed" colour slots
    /// (0,6,8,12,14,15) via SetMenuWeaponPal / PalMenuWeapon; these persist while
    /// each room only re-tweaks slots 1,3,5,9 (SetRoomPal). Verified pixel-exact
    /// against room_images.
    /// </summary>
    public byte[] BasePaletteBlock() => _asm.Bytes("PalMenuWeapon");
}
