using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Services.Maintenance;

/// <summary>
/// Provider health recovery cron (plan §5): every N minutes, expire elapsed rate limits
/// (keys and channels), re-probe dead channels/routes with an HTTP reachability check and
/// restore them if alive, and raise the ">1 day out of credits" admin alert. Uses the same
/// "channel-probe" HttpClient as ChannelsController's manual probe.
/// </summary>
public class ProviderReprobeService(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClientFactory,
    IConfiguration config,
    ILogger<ProviderReprobeService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PassAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Provider re-probe pass failed; retrying at next interval.");
            }

            var interval = TimeSpan.FromMinutes(config.GetValue("Orchid:ReprobeIntervalMinutes", 5));
            await Task.Delay(interval, stoppingToken);
        }
    }

    private async Task PassAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrchidDbContext>();
        var now = DateTime.UtcNow;

        // 1. Elapsed rate limits → healthy/active again (plan: cron re-probes rate_limited providers).
        await db.ProviderKeys
            .Where(k => k.Status == "rate_limited" && k.RateLimitUntil != null && k.RateLimitUntil <= now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(k => k.Status, "healthy")
                .SetProperty(k => k.RateLimitUntil, (DateTime?)null), ct);

        await db.Providers
            .Where(p => p.Status == "rate_limited" && p.RateLimitUntil != null && p.RateLimitUntil <= now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, "active")
                .SetProperty(p => p.RateLimitUntil, (DateTime?)null), ct);

        // 2. Reachability probe for dead channels; restore on success.
        var deadProviders = await db.Providers.Where(p => p.Status == "dead").ToListAsync(ct);
        foreach (var provider in deadProviders)
        {
            if (await ProbeAsync(provider.BaseUrl, ct))
            {
                provider.Status = "active";
                provider.UpdatedAt = now;
                logger.LogInformation("Channel {Name} probe succeeded — restored to active.", provider.Name);
            }
        }

        // 3. Dead model routes on healthy channels get another chance.
        await db.ModelProviders
            .Where(mp => mp.Status == "dead" && mp.Provider!.Status == "active")
            .ExecuteUpdateAsync(s => s
                .SetProperty(mp => mp.Status, "active")
                .SetProperty(mp => mp.Notes, "Auto-restored by re-probe cron"), ct);

        // 4. Out-of-credits for >1 day → admin notification (plan §5), deduped per day.
        var staleCutoff = now.AddDays(-1);
        var starving = await db.Providers
            .Where(p => p.Status == "out_of_credits" && p.UpdatedAt <= staleCutoff)
            .ToListAsync(ct);
        foreach (var provider in starving)
        {
            var alreadyAlerted = await db.AdminNotifications.AnyAsync(n =>
                n.EntityType == "provider" && n.EntityId == provider.Id.ToString() &&
                n.Type == "provider" && n.CreatedAt > staleCutoff &&
                n.Title.Contains("still out of credits"), ct);
            if (alreadyAlerted) continue;

            db.AdminNotifications.Add(new AdminNotification
            {
                Type = "provider",
                Severity = "critical",
                Title = $"Channel \"{provider.Name}\" is still out of credits (>1 day)",
                Message = "This channel has been out of credits for over a day and is receiving no traffic. Top it up or disable it.",
                EntityType = "provider",
                EntityId = provider.Id.ToString(),
                CreatedAt = now,
            });
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task<bool> ProbeAsync(string baseUrl, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(baseUrl)) return false;
        try
        {
            var client = httpClientFactory.CreateClient("channel-probe");
            using var request = new HttpRequestMessage(HttpMethod.Head, baseUrl);
            using var response = await client.SendAsync(request, ct);
            // Any HTTP answer (even 401/404) proves the endpoint is reachable again.
            return true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }
}
