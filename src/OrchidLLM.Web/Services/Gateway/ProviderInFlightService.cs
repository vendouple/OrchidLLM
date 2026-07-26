using StackExchange.Redis;

namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// Per-provider in-flight request counters (plan §16 Redis key reference:
/// inflight:{provider_id}, no TTL, decremented on completion). Enforces
/// Provider.MaxConcurrent before dispatch.
/// </summary>
public class ProviderInFlightService(IConnectionMultiplexer redis)
{
    private static string Key(int providerId) => $"inflight:{providerId}";

    /// <summary>Reserves an in-flight slot; false when the provider is at MaxConcurrent.</summary>
    public async Task<bool> TryEnterAsync(int providerId, int maxConcurrent)
    {
        var db = redis.GetDatabase();
        var count = await db.StringIncrementAsync(Key(providerId));
        if (count > maxConcurrent)
        {
            await db.StringDecrementAsync(Key(providerId));
            return false;
        }
        return true;
    }

    public async Task ExitAsync(int providerId)
    {
        var db = redis.GetDatabase();
        var count = await db.StringDecrementAsync(Key(providerId));
        if (count < 0)
        {
            // Self-heal drift (e.g. after a crash mid-flight) rather than going negative forever.
            await db.StringSetAsync(Key(providerId), 0);
        }
    }

    public async Task<int> GetAsync(int providerId)
    {
        var value = await redis.GetDatabase().StringGetAsync(Key(providerId));
        return value.HasValue ? Math.Max(0, (int)value) : 0;
    }
}
