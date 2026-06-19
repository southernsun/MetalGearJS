using System.Globalization;
using System.Text.RegularExpressions;

namespace MetalGear.RoomViewer.Asm;

/// <summary>
/// A single operand emitted under a label: either a literal byte value
/// (from a <c>db</c>, or a numeric <c>dw</c> split into lo/hi) or a symbol
/// reference (from a <c>dw Label</c>).
/// </summary>
public readonly struct AsmToken
{
    public bool IsSymbol { get; }
    public byte Value { get; }
    public string Symbol { get; }

    private AsmToken(bool isSymbol, byte value, string symbol)
    {
        IsSymbol = isSymbol;
        Value = value;
        Symbol = symbol;
    }

    public static AsmToken Byte(byte v) => new(false, v, "");
    public static AsmToken Sym(string s) => new(true, 0, s);
}

/// <summary>
/// Minimal Sjasm-flavoured assembler reader. It does not assemble anything;
/// it just collects the <c>db</c>/<c>dw</c> operands that follow each label so
/// the rest of the program can reach the game's data tables by name, exactly
/// as the original ROM lays them out in memory.
/// </summary>
public sealed class AsmParser
{
    // label sits at the start of a line and ends with ':'
    private static readonly Regex LabelRx = new(@"^([A-Za-z_][A-Za-z0-9_]*):", RegexOptions.Compiled);

    private readonly Dictionary<string, List<AsmToken>> _tokens = new(StringComparer.Ordinal);

    /// <summary>All operands following <paramref name="label"/>, in source order.</summary>
    public IReadOnlyList<AsmToken> Tokens(string label) =>
        _tokens.TryGetValue(label, out var list) ? list : Array.Empty<AsmToken>();

    public bool Has(string label) => _tokens.ContainsKey(label);

    /// <summary>The literal bytes following <paramref name="label"/> (db, plus numeric dw).</summary>
    public byte[] Bytes(string label) =>
        Tokens(label).Where(t => !t.IsSymbol).Select(t => t.Value).ToArray();

    /// <summary>The symbol references following <paramref name="label"/> (dw Label, in order).</summary>
    public string[] Symbols(string label) =>
        Tokens(label).Where(t => t.IsSymbol).Select(t => t.Symbol).ToArray();

    public void ParseFile(string path)
    {
        string? current = null;
        // IF (JAPANESE)/ELSE/ENDIF: the port follows the Western (!JAPANESE) build, so the
        // JAPANESE branch is skipped. Without this, both branches' db lines were collected,
        // shifting every table that spans a conditional (gfx/font.asm: all glyphs after '?'
        // were off by two tiles — the period printed as the Japanese centered dot).
        var cond = new Stack<bool>();               // emit-state per nested IF level
        foreach (var raw in File.ReadLines(path))
        {
            // strip comments
            var line = StripComment(raw);
            if (line.Length == 0) continue;

            if (line.StartsWith("IF", StringComparison.OrdinalIgnoreCase) &&
                (line.Length == 2 || !char.IsLetterOrDigit(line[2])))
            {
                cond.Push(!line.Contains("JAPANESE", StringComparison.OrdinalIgnoreCase));
                continue;
            }
            if (line.Equals("ELSE", StringComparison.OrdinalIgnoreCase) && cond.Count > 0)
            {
                cond.Push(!cond.Pop());
                continue;
            }
            if (line.Equals("ENDIF", StringComparison.OrdinalIgnoreCase) && cond.Count > 0)
            {
                cond.Pop();
                continue;
            }
            if (cond.Contains(false)) continue;     // inside a skipped branch

            var m = LabelRx.Match(line);
            if (m.Success)
            {
                current = m.Groups[1].Value;
                if (!_tokens.ContainsKey(current))
                    _tokens[current] = new List<AsmToken>();
                line = line[m.Index..][m.Length..]; // remainder after "label:"
            }

            if (current == null) continue;

            ParseDirective(line, _tokens[current]);
        }
    }

    public void ParseFiles(IEnumerable<string> paths)
    {
        foreach (var p in paths) ParseFile(p);
    }

    private static string StripComment(string line)
    {
        int idx = line.IndexOf(';');
        if (idx >= 0) line = line[..idx];
        return line.Trim();
    }

    private static void ParseDirective(string line, List<AsmToken> sink)
    {
        var trimmed = line.TrimStart();
        bool isDb = trimmed.StartsWith("db", StringComparison.OrdinalIgnoreCase);
        bool isDw = trimmed.StartsWith("dw", StringComparison.OrdinalIgnoreCase);
        if (!isDb && !isDw) return;

        // operand list after the directive keyword
        var operands = trimmed[2..].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var op in operands)
        {
            if (op.Length == 0) continue;
            if (TryParseNumber(op, out int value))
            {
                if (isDb)
                {
                    sink.Add(AsmToken.Byte((byte)(value & 0xFF)));
                }
                else // numeric dw -> little-endian byte pair
                {
                    sink.Add(AsmToken.Byte((byte)(value & 0xFF)));
                    sink.Add(AsmToken.Byte((byte)((value >> 8) & 0xFF)));
                }
            }
            else
            {
                // a symbol reference; only meaningful for dw index tables
                sink.Add(AsmToken.Sym(op));
            }
        }
    }

    /// <summary>Parse a Sjasm numeric literal: 19h, 0FFh, 7, 135, -8, -10h, etc.</summary>
    public static bool TryParseNumber(string token, out int value)
    {
        value = 0;
        token = token.Trim();
        if (token.Length == 0) return false;

        // leading sign (NumberStyles.HexNumber rejects it — e.g. KonamiLogoTiles' `db -10h`)
        bool neg = token.StartsWith('-');
        if (neg) token = token[1..].Trim();
        if (token.Length == 0) return false;

        bool ok;
        if (token.EndsWith('h') || token.EndsWith('H'))   // hex with trailing 'h'
            ok = int.TryParse(token[..^1], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out value);
        else                                              // plain decimal
            ok = int.TryParse(token, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
        if (ok && neg) value = -value;
        return ok;
    }
}
