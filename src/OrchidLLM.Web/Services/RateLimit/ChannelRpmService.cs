using StackExchange.Redis;

namespace OrchidLLM.Web.Services.RateLimit;

/// <summary>
/// Live per-channel RPM tracking — the requested Channels admin UX change. Backed by a
/// Redis fixed-60s-bucket counter (channel:rpm:{providerId}), same INCR+EXPIRE pattern as
/// the plan's per-user rpm:{user_id} counter (§16), just scoped to a provider instead of a user.
/// Not persisted in MySQL — this is intentionally a live/ephemeral value.
/// </summary>
public class ChannelRpmService(IConnectionMultiplexer redis)
{
    private static string Key(int providerId) => $"channel:rpm:{providerId}";

    /// <summary>Call when a request is actually dispatched to this channel.</summary>
    public async Task RecordDispatchAsync(int providerId)
    {
        var db = redis.GetDatabase();
        var key = Key(providerId);
        var count = await db.StringIncrementAsync(key);
        if (count == 1)
        {
            await db.KeyExpireAsync(key, TimeSpan.FromSeconds(60));
        }
    }

    /// <summary>Current requests dispatched to this channel within its active 60s window.</summary>
    public async Task<int> GetCurrentRpmAsync(int providerId)
    {
        var db = redis.GetDatabase();
        var value = await db.StringGetAsync(Key(providerId));
        return value.HasValue ? (int)value : 0;
    }

    public async Task<Dictionary<int, int>> GetCurrentRpmAsync(IEnumerable<int> providerIds)
    {
        var ids = providerIds.ToList();
        var db = redis.GetDatabase();
        var tasks = ids.Select(id => db.StringGetAsync(Key(id))).ToArray();
        var values = await Task.WhenAll(tasks);
        return ids.Zip(values, (id, v) => (id, rpm: v.HasValue ? (int)v : 0)).ToDictionary(x => x.id, x => x.rpm);
    }
}
