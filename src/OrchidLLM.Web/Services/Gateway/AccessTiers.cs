namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// Model access tier ordering (plan §5). A caller whose plan grants tier X can use models
/// whose AccessTier ranks at or below X. Matches Frontend-DEMO's TIER_RANK map.
/// </summary>
public static class AccessTiers
{
    private static readonly Dictionary<string, int> Ranks = new(StringComparer.OrdinalIgnoreCase)
    {
        ["demo"] = 0,
        ["free"] = 1,
        ["standard"] = 2,
        ["premium"] = 3,
        ["premium+"] = 4,
        ["max"] = 5,
        ["elite"] = 6,
        ["admin"] = 7,
    };

    /// <summary>Unknown labels rank below demo so misconfigured rows never widen access.</summary>
    public static int Rank(string? tier) => tier is not null && Ranks.TryGetValue(tier, out var r) ? r : -1;

    public static bool CallerCanAccess(string callerTier, string modelTier)
        => Rank(modelTier) >= 0 && Rank(modelTier) <= Rank(callerTier);
}
