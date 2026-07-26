using System.Text.Json;
using System.Text.Json.Nodes;

namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// Parameter support policy (plan §3): ModelProvider.SupportsParams is a JSON map of
/// request-body param name → bool, admin-configured per route. A param explicitly set to
/// false is unsupported there; anything absent is assumed supported (unknown params pass
/// through — providers ignore what they don't know).
/// </summary>
public static class ParamSupport
{
    /// <summary>Core protocol keys — never candidates for stripping.</summary>
    private static readonly HashSet<string> CoreKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "model", "messages", "stream", "stream_options", "max_tokens", "max_completion_tokens", "n", "user",
    };

    public static List<string> GetFeatureParams(JsonObject body)
        => body.Select(kv => kv.Key).Where(k => !CoreKeys.Contains(k)).ToList();

    /// <summary>Requested feature params this route has explicitly marked unsupported.</summary>
    public static List<string> GetUnsupported(string? supportsParamsJson, IReadOnlyList<string> featureParams)
    {
        if (featureParams.Count == 0 || string.IsNullOrWhiteSpace(supportsParamsJson))
            return [];

        try
        {
            using var doc = JsonDocument.Parse(supportsParamsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return [];

            var unsupported = new List<string>();
            foreach (var param in featureParams)
            {
                if (doc.RootElement.TryGetProperty(param, out var value) && value.ValueKind == JsonValueKind.False)
                    unsupported.Add(param);
            }
            return unsupported;
        }
        catch (JsonException)
        {
            return []; // malformed admin JSON degrades to "everything supported"
        }
    }
}
