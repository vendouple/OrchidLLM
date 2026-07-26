using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;

namespace OrchidLLM.Web.Services.Demo;

/// <summary>
/// Plan §17a: demo keys unused for 20+ days are hard-deleted (no soft-delete — demo keys
/// hold no user data worth retaining). Runs daily at 03:00 UTC per the checklist's suggested
/// schedule, plus once shortly after boot to catch up after downtime.
/// </summary>
public class DemoKeyCleanupService(IServiceScopeFactory scopeFactory, ILogger<DemoKeyCleanupService> logger) : BackgroundService
{
    private const int InactivityDays = 20;
    private static readonly TimeSpan RunAtUtc = TimeSpan.FromHours(3);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small startup delay so boot isn't slowed by cleanup work.
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Demo key cleanup pass failed; will retry at next scheduled run.");
            }

            await Task.Delay(TimeUntilNextRun(), stoppingToken);
        }
    }

    private async Task CleanupAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrchidDbContext>();

        var cutoff = DateTime.UtcNow.AddDays(-InactivityDays);
        var deleted = await db.DemoKeys.Where(k => k.LastUsedAt < cutoff).ExecuteDeleteAsync(ct);
        if (deleted > 0)
        {
            logger.LogInformation("Demo key cleanup: hard-deleted {Count} keys inactive since {Cutoff:u}.", deleted, cutoff);
        }
    }

    private static TimeSpan TimeUntilNextRun()
    {
        var now = DateTime.UtcNow;
        var next = now.Date.Add(RunAtUtc);
        if (next <= now) next = next.AddDays(1);
        return next - now;
    }
}
