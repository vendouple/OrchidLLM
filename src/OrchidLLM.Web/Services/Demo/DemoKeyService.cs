using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using StackExchange.Redis;

namespace OrchidLLM.Web.Services.Demo;

/// <summary>
/// Demo key lifecycle (plan §17a): issuance, and the Redis daily request counter
/// (demo:{uuid}:daily, TTL = end of current UTC day). The MySQL DemoKey row keeps
/// RequestsToday/TotalRequests as inspection/fallback values; the Redis counter is the
/// authoritative live limit check, mirroring ChannelRpmService's INCR+EXPIRE pattern.
/// Registered scoped (needs OrchidDbContext).
/// </summary>
public class DemoKeyService(OrchidDbContext db, IConnectionMultiplexer redis, IConfiguration config)
{
    public const string CookieName = "orchid_demo_key";

    private static string DailyKey(string demoKeyId) => $"demo:{demoKeyId}:daily";

    public int MaxRequestsPerDay => config.GetValue("Orchid:DemoRequestsPerDay", 20);
    public int ContextCap => config.GetValue("Orchid:DemoContextCap", 33000);

    /// <summary>Creates the DemoKey row. The caller sets the cookie (needs the HttpResponse).</summary>
    public async Task<DemoKey> IssueAsync(string? platform)
    {
        var key = new DemoKey
        {
            Id = Guid.NewGuid().ToString(),
            Platform = platform == "web_mobile" ? "web_mobile" : "web_desktop",
            RequestsToday = 0,
            TotalRequests = 0,
            LastRequestDay = DateOnly.FromDateTime(DateTime.UtcNow),
            CreatedAt = DateTime.UtcNow,
            LastUsedAt = DateTime.UtcNow,
        };
        db.DemoKeys.Add(key);
        await db.SaveChangesAsync();
        return key;
    }

    /// <summary>
    /// Atomically counts one request against the daily limit. Returns the remaining quota,
    /// or null when the key is unknown/deleted. A result of -1 means the limit was already
    /// exhausted and the request must be rejected (no count consumed beyond the limit).
    /// </summary>
    public async Task<int?> TryConsumeAsync(string demoKeyId)
    {
        var key = await db.DemoKeys.FirstOrDefaultAsync(k => k.Id == demoKeyId);
        if (key is null) return null;

        var redisDb = redis.GetDatabase();
        var counterKey = DailyKey(demoKeyId);
        var count = await redisDb.StringIncrementAsync(counterKey);
        if (count == 1)
        {
            await redisDb.KeyExpireAsync(counterKey, TimeUntilUtcMidnight());
        }

        if (count > MaxRequestsPerDay)
        {
            // Over the cap — undo so repeated rejected attempts don't inflate the counter.
            await redisDb.StringDecrementAsync(counterKey);
            return -1;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        key.RequestsToday = key.LastRequestDay == today ? (int)count : 1;
        key.LastRequestDay = today;
        key.TotalRequests++;
        key.LastUsedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return MaxRequestsPerDay - (int)count;
    }

    /// <summary>Remaining daily quota without consuming (for the demo banner's "N requests left" pill).</summary>
    public async Task<int> GetRemainingAsync(string demoKeyId)
    {
        var value = await redis.GetDatabase().StringGetAsync(DailyKey(demoKeyId));
        var used = value.HasValue ? (int)value : 0;
        return Math.Max(0, MaxRequestsPerDay - used);
    }

    private static TimeSpan TimeUntilUtcMidnight()
    {
        var now = DateTime.UtcNow;
        var midnight = now.Date.AddDays(1);
        var remaining = midnight - now;
        // Guard against a zero/negative TTL if we're exactly on the boundary.
        return remaining > TimeSpan.FromSeconds(1) ? remaining : TimeSpan.FromSeconds(1);
    }
}
