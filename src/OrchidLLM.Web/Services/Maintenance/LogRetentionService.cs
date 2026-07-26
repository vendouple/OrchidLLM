using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;

namespace OrchidLLM.Web.Services.Maintenance;

/// <summary>
/// Retention cleanup (plan §18): request logs 30d, routing logs 15d, plus settled
/// RequestQueueItem rows after 7d (the live queue view only needs recent history).
/// Daily at 03:30 UTC — offset from DemoKeyCleanupService's 03:00 so the two
/// maintenance passes don't contend.
/// </summary>
public class LogRetentionService(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<LogRetentionService> logger) : BackgroundService
{
    private static readonly TimeSpan RunAtUtc = new(3, 30, 0);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Log retention pass failed; will retry at next scheduled run.");
            }

            var now = DateTime.UtcNow;
            var next = now.Date.Add(RunAtUtc);
            if (next <= now) next = next.AddDays(1);
            await Task.Delay(next - now, stoppingToken);
        }
    }

    private async Task CleanupAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OrchidDbContext>();
        var now = DateTime.UtcNow;

        var requestCutoff = now.AddDays(-config.GetValue("Orchid:RequestLogRetentionDays", 30));
        var routingCutoff = now.AddDays(-config.GetValue("Orchid:RoutingLogRetentionDays", 15));
        var queueCutoff = now.AddDays(-7);

        var requests = await db.RequestLogs.Where(l => l.CreatedAt < requestCutoff).ExecuteDeleteAsync(ct);
        var routing = await db.RoutingLogs.Where(l => l.CreatedAt < routingCutoff).ExecuteDeleteAsync(ct);
        var queue = await db.RequestQueueItems
            .Where(q => (q.Status == "completed" || q.Status == "failed") && q.CreatedAt < queueCutoff)
            .ExecuteDeleteAsync(ct);

        if (requests + routing + queue > 0)
        {
            logger.LogInformation(
                "Log retention: deleted {Requests} request logs (>{ReqDays}d), {Routing} routing logs, {Queue} settled queue rows.",
                requests, config.GetValue("Orchid:RequestLogRetentionDays", 30), routing, queue);
        }
    }
}
