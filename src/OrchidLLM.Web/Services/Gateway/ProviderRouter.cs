using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using OrchidLLM.Web.Services.Security;

namespace OrchidLLM.Web.Services.Gateway;

/// <summary>One dispatchable (provider, key) choice for a request, in try-order.</summary>
public class RouteCandidate
{
    public required Model Model { get; init; }
    public required ModelProvider ModelProvider { get; init; }
    public required Provider Provider { get; init; }
    public required ProviderKey Key { get; init; }

    /// <summary>Decrypted at dispatch time only — never logged, never serialized.</summary>
    public required string PlaintextKey { get; init; }

    /// <summary>Obfuscated key reference for RoutingLog (plan §18) — hash, never the key or its id.</summary>
    public string KeyRefHash => ApiKeyAuthenticator.Hash($"pk:{Key.Id}:{Key.CreatedAt:O}")[..16];
}

/// <summary>
/// Provider selection per plan §6 routing decision tree: filter by model + health + context
/// + free-eligibility (demo/free traffic only goes where Provider.Free = true), order by
/// Weight (lower = faster/preferred — checklist §1 direction), pick the least-recently-used
/// healthy key per provider. Health-state transitions from dispatch outcomes also live here.
/// </summary>
public class ProviderRouter(OrchidDbContext db, IProviderKeyCipher cipher)
{
    /// <summary>Rate-limit backoff applied when an upstream returns 429 without a Retry-After.</summary>
    private static readonly TimeSpan DefaultRateLimitBackoff = TimeSpan.FromMinutes(2);

    public async Task<Model?> ResolveModelAsync(string modelSlug)
        => await db.Models
            .Include(m => m.TokenMultipliers)
            .FirstOrDefaultAsync(m => m.ModelSlug == modelSlug && m.IsActive);

    /// <summary>
    /// Ordered candidate list for a request. Empty = nothing routable (503, no charge).
    /// </summary>
    public async Task<List<RouteCandidate>> GetCandidatesAsync(Model model, GatewayCaller caller, int inputTokenEstimate)
    {
        var now = DateTime.UtcNow;
        var freeTrafficOnly = caller.IsDemo || AccessTiers.Rank(caller.ModelAccessTier) <= AccessTiers.Rank("free");

        var modelProviders = await db.ModelProviders
            .Include(mp => mp.Provider!).ThenInclude(p => p.Keys)
            .Where(mp => mp.ModelId == model.Id && mp.IsActive && mp.Status == "active")
            .ToListAsync();

        var eligible = modelProviders
            .Where(mp => mp.Provider is { } p
                && p.Status == "active"
                && (p.RateLimitUntil is null || p.RateLimitUntil <= now)
                && (!freeTrafficOnly || p.Free)
                && (mp.ContextLimit is null || mp.ContextLimit >= inputTokenEstimate));

        // Paid: Weight then SpeedPriority, lower = preferred. Free/demo: eligibility-only —
        // plan §3 says speed is ignored, so keep DB order (first eligible wins).
        if (!freeTrafficOnly)
        {
            eligible = eligible
                .OrderBy(mp => mp.Provider!.Weight)
                .ThenBy(mp => mp.SpeedPriority);
        }

        var candidates = new List<RouteCandidate>();
        foreach (var mp in eligible)
        {
            var key = mp.Provider!.Keys
                .Where(k => k.Status == "healthy" || (k.Status == "rate_limited" && k.RateLimitUntil <= now))
                .OrderBy(k => k.LastUsedAt ?? DateTime.MinValue) // LRU rotation across the pool
                .FirstOrDefault();
            if (key is null) continue;

            candidates.Add(new RouteCandidate
            {
                Model = model,
                ModelProvider = mp,
                Provider = mp.Provider,
                Key = key,
                PlaintextKey = cipher.Decrypt(key.KeyCipher),
            });
        }
        return candidates;
    }

    public async Task RecordDispatchAsync(RouteCandidate candidate)
    {
        candidate.Key.Status = "healthy";
        candidate.Key.RateLimitUntil = null;
        candidate.Key.LastUsedAt = DateTime.UtcNow;
        candidate.ModelProvider.LastChecked = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Health transitions per plan §5: 429 → rate_limited with backoff; 402 → out_of_credits
    /// + immediate admin notification; 5xx/timeout → dead (v1 flags on first hard failure;
    /// a fail-count threshold arrives with the re-probe cron).
    /// </summary>
    public async Task RecordFailureAsync(RouteCandidate candidate, int? upstreamStatus, TimeSpan? retryAfter)
    {
        var now = DateTime.UtcNow;
        switch (upstreamStatus)
        {
            case 429:
                candidate.Key.Status = "rate_limited";
                candidate.Key.RateLimitUntil = now + (retryAfter ?? DefaultRateLimitBackoff);
                // Only rate-limit the whole provider once every key in its pool is limited.
                if (candidate.Provider.Keys.All(k => k.Status == "rate_limited" && k.RateLimitUntil > now))
                {
                    candidate.Provider.Status = "rate_limited";
                    candidate.Provider.RateLimitUntil = candidate.Provider.Keys.Min(k => k.RateLimitUntil);
                }
                break;

            case 402:
                candidate.Provider.Status = "out_of_credits";
                db.AdminNotifications.Add(new AdminNotification
                {
                    Type = "provider",
                    Severity = "critical",
                    Title = $"Channel \"{candidate.Provider.Name}\" is out of credits",
                    Message = "Upstream returned a billing error (402). Requests are being routed away from this channel until it is topped up.",
                    EntityType = "provider",
                    EntityId = candidate.Provider.Id.ToString(),
                    CreatedAt = now,
                });
                break;

            case 401:
            case 403:
                candidate.Key.Status = "down";
                break;

            case >= 500:
            case null: // network failure / timeout
                candidate.ModelProvider.Status = "dead";
                candidate.ModelProvider.Notes = $"Auto-flagged dead after upstream failure at {now:u}";
                break;
        }

        candidate.ModelProvider.LastChecked = now;
        await db.SaveChangesAsync();
    }
}
