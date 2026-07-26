using StackExchange.Redis;

namespace OrchidLLM.Web.Services.RateLimit;

/// <summary>
/// Per-user RPM enforcement (plan §16): Redis fixed-60s-bucket counter at rpm:{user_id},
/// spanning all of the user's API keys combined. Mirrors ChannelRpmService's INCR+EXPIRE
/// pattern. Per the plan: increment on each request, and if the count exceeds the tier's
/// limit respond 429 with no credit charge.
/// </summary>
public class UserRpmService(IConnectionMultiplexer redis)
{
    private static string Key(int userId) => $"rpm:{userId}";

    /// <summary>
    /// Counts this request against the user's 60s window. Returns false when the request
    /// exceeds <paramref name="rpmLimit"/> and must be rejected (429, no charge).
    /// </summary>
    public async Task<bool> TryConsumeAsync(int userId, int rpmLimit)
    {
        var db = redis.GetDatabase();
        var key = Key(userId);
        var count = await db.StringIncrementAsync(key);
        if (count == 1)
        {
            await db.KeyExpireAsync(key, TimeSpan.FromSeconds(60));
        }
        return count <= rpmLimit;
    }

    /// <summary>Current request count in the user's active 60s window (for dashboards/debugging).</summary>
    public async Task<int> GetCurrentAsync(int userId)
    {
        var value = await redis.GetDatabase().StringGetAsync(Key(userId));
        return value.HasValue ? (int)value : 0;
    }
}
