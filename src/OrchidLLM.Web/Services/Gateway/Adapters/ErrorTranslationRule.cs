using System.Text.Json;
using System.Text.RegularExpressions;
using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Services.Gateway.Adapters;

/// <summary>
/// One admin-configured error translation (plan §6 / admin Settings → Error Labels).
/// Sources: the global ErrorLabels table, and per-channel Provider.ErrorAliasOverrides
/// JSON (which wins — overrides are prepended so first-match includes them first).
/// </summary>
public record ErrorTranslationRule(string MatchType, string Pattern, string Label, string Category)
{
    public bool Matches(string rawErrorBody)
    {
        if (string.IsNullOrEmpty(Pattern)) return false;
        if (MatchType == "regex")
        {
            try
            {
                return Regex.IsMatch(rawErrorBody, Pattern, RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(200));
            }
            catch (ArgumentException) // bad admin regex must never take the pipeline down
            {
                return false;
            }
            catch (RegexMatchTimeoutException)
            {
                return false;
            }
        }
        return rawErrorBody.Contains(Pattern, StringComparison.OrdinalIgnoreCase);
    }

    public static ErrorTranslationRule From(ErrorLabel label)
        => new(label.MatchType, label.Pattern, label.Label, label.Category);

    /// <summary>
    /// Parses a channel's ErrorAliasOverrides JSON: [{pattern, label, category?, matchType?}].
    /// Malformed entries are skipped — admin input must degrade, not throw.
    /// </summary>
    public static List<ErrorTranslationRule> FromProviderOverrides(string? overridesJson)
    {
        var rules = new List<ErrorTranslationRule>();
        if (string.IsNullOrWhiteSpace(overridesJson)) return rules;
        try
        {
            using var doc = JsonDocument.Parse(overridesJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return rules;
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (el.ValueKind != JsonValueKind.Object) continue;
                var pattern = el.TryGetProperty("pattern", out var p) ? p.GetString() : null;
                var label = el.TryGetProperty("label", out var l) ? l.GetString() : null;
                if (string.IsNullOrWhiteSpace(pattern) || string.IsNullOrWhiteSpace(label)) continue;

                var category = el.TryGetProperty("category", out var c) ? c.GetString() : null;
                var matchType = el.TryGetProperty("matchType", out var m) ? m.GetString() : null;
                rules.Add(new ErrorTranslationRule(
                    matchType == "regex" ? "regex" : "code",
                    pattern,
                    label,
                    category == "internal" ? "internal" : "user_actionable"));
            }
        }
        catch (JsonException)
        {
            // Ignore — fall back to global rules / built-in phrasebook.
        }
        return rules;
    }
}
