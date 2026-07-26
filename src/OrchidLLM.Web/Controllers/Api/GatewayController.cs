using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using OrchidLLM.Web.Services.Billing;
using OrchidLLM.Web.Services.Gateway;
using OrchidLLM.Web.Services.Gateway.Adapters;

namespace OrchidLLM.Web.Controllers.Api;

/// <summary>
/// The OpenAI-compatible gateway (plan §3). Authentication + RPM already happened in
/// GatewayAuthMiddleware; this controller owns the per-request pipeline:
/// resolve model → reserve credits → queue slot → route → dispatch (with fallback) →
/// reconcile → log. Failures of any kind charge zero credits (plan §6 hard rule).
/// </summary>
[ApiController]
[Route("v1")]
public class GatewayController(
    OrchidDbContext db,
    ProviderRouter router,
    CreditService credits,
    GatewayRequestQueue queue,
    ProviderInFlightService inFlight,
    OpenAiCompatibleAdapter adapter,
    IConfiguration config,
    ILogger<GatewayController> logger) : ControllerBase
{
    private GatewayCaller Caller => (GatewayCaller)HttpContext.Items[GatewayCaller.HttpContextItemKey]!;

    // ---------------------------------------------------------------- /v1/models

    [HttpGet("models")]
    public async Task<IActionResult> ListModels()
    {
        var callerTier = Caller.ModelAccessTier;
        var models = await db.Models.AsNoTracking()
            .Where(m => m.IsActive)
            .OrderBy(m => m.ModelSlug)
            .ToListAsync();

        var data = models
            .Where(m => AccessTiers.CallerCanAccess(callerTier, m.AccessTier))
            .Select(ToModelDto);

        return Ok(new { @object = "list", data });
    }

    [HttpGet("models/{slug}")]
    public async Task<IActionResult> GetModel(string slug)
    {
        var model = await db.Models.AsNoTracking().FirstOrDefaultAsync(m => m.ModelSlug == slug && m.IsActive);
        if (model is null || !AccessTiers.CallerCanAccess(Caller.ModelAccessTier, model.AccessTier))
            return ModelNotFound(slug);

        return Ok(ToModelDto(model));
    }

    private static object ToModelDto(Model m) => new
    {
        id = m.ModelSlug,
        @object = "model",
        created = new DateTimeOffset(m.CreatedAt).ToUnixTimeSeconds(),
        owned_by = "orchidllm",
        display_name = m.DisplayName,
        modality = m.Modality,
        access_tier = m.AccessTier,
        max_output_tokens = m.MaxOutputTokens,
        supports = new
        {
            streaming = m.SupportsStreaming,
            vision = m.SupportsVision,
            reasoning = m.SupportsReasoning,
            search = m.SupportsSearch,
            caching = m.SupportsCaching,
            function_calling = m.SupportsFunctionCalling,
        },
        deprecation_date = m.DeprecationDate,
    };

    // ---------------------------------------------------- /v1/chat/completions

    [HttpPost("chat/completions")]
    public async Task ChatCompletions()
    {
        var caller = Caller;
        var requestId = $"req_{Guid.NewGuid():N}";
        var ct = HttpContext.RequestAborted;

        // ---- Parse ----
        JsonObject? body;
        try
        {
            body = (await JsonNode.ParseAsync(Request.Body, cancellationToken: ct)) as JsonObject;
        }
        catch (JsonException)
        {
            body = null;
        }
        var modelSlug = body?["model"]?.GetValue<string>();
        if (body is null || string.IsNullOrWhiteSpace(modelSlug))
        {
            await WriteJsonError(StatusCodes.Status400BadRequest, "invalid_request_error",
                "Request body must be JSON with a 'model' field.");
            return;
        }
        var stream = body["stream"]?.GetValue<bool>() ?? false;
        var maxOutputTokens = body["max_tokens"]?.GetValue<int>() ?? body["max_completion_tokens"]?.GetValue<int>();

        // ---- Model + access ----
        var model = await router.ResolveModelAsync(modelSlug);
        if (model is null || !AccessTiers.CallerCanAccess(caller.ModelAccessTier, model.AccessTier))
        {
            await WriteJsonError(StatusCodes.Status404NotFound, "model_not_found",
                $"The model '{modelSlug}' does not exist or you do not have access to it.");
            return;
        }

        var promptChars = (body["messages"]?.ToJsonString() ?? string.Empty).Length;
        var inputTokenEstimate = Math.Max(1, promptChars / 4);

        // Demo hard context cap (plan §17a).
        if (caller.IsDemo && inputTokenEstimate > config.GetValue("Orchid:DemoContextCap", 33000))
        {
            await WriteJsonError(StatusCodes.Status400BadRequest, "context_length_exceeded",
                "Request exceeds the demo context limit. Create an account for larger contexts.");
            return;
        }

        // ---- Credit reservation (registered users only — demo traffic is never charged) ----
        var estimatedCost = CreditService.ComputeCost(model, inputTokenEstimate, maxOutputTokens ?? 1024);
        var reserved = 0;
        if (!caller.IsDemo)
        {
            if (!await credits.TryReserveAsync(caller.User!.Id, estimatedCost, requestId))
            {
                await WriteJsonError(StatusCodes.Status429TooManyRequests, "insufficient_quota",
                    "Insufficient credits for this request.");
                return;
            }
            reserved = estimatedCost;
        }

        var queueItem = new RequestQueueItem
        {
            Id = requestId,
            UserId = caller.User?.Id,
            ApiKeyId = caller.ApiKey?.Id,
            ModelId = model.Id,
            Priority = ResolvePriority(caller),
            Status = "pending",
            ReservedCredits = reserved,
            CreatedAt = DateTime.UtcNow,
        };
        db.RequestQueueItems.Add(queueItem);
        await db.SaveChangesAsync();

        var queueStopwatch = Stopwatch.StartNew();
        var attempted = new List<object>();
        var succeeded = false;
        RouteCandidate? winner = null;
        AdapterResult? lastResult = null;

        try
        {
            // ---- Queue slot (SSE heartbeats while waiting, plan §4) ----
            var slotTask = queue.WaitForSlotAsync(queueItem.Priority, ct);
            if (stream)
            {
                Response.StatusCode = StatusCodes.Status200OK;
                Response.ContentType = "text/event-stream";
                Response.Headers.CacheControl = "no-cache";
                await Response.StartAsync(ct);

                var heartbeat = TimeSpan.FromSeconds(config.GetValue("Orchid:HeartbeatIntervalSeconds", 15));
                while (await Task.WhenAny(slotTask, Task.Delay(heartbeat, ct)) != slotTask)
                {
                    await Response.WriteAsync(": heartbeat\n\n", ct);
                    await Response.Body.FlushAsync(ct);
                }
            }
            using var slot = await slotTask;
            queueStopwatch.Stop();

            queueItem.Status = "in_flight";
            queueItem.DispatchedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            // ---- Route + dispatch with fallback (plan §6) ----
            var candidates = await router.GetCandidatesAsync(model, caller, inputTokenEstimate);
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(config.GetValue("Orchid:ChatTimeoutSeconds", 300)));

            foreach (var candidate in candidates)
            {
                if (!await inFlight.TryEnterAsync(candidate.Provider.Id, candidate.Provider.MaxConcurrent))
                {
                    attempted.Add(new { provider_id = candidate.Provider.Id, outcome = "at_capacity" });
                    continue;
                }

                try
                {
                    await router.RecordDispatchAsync(candidate);
                    lastResult = await adapter.SendChatAsync(new AdapterChatRequest
                    {
                        Body = body,
                        BaseUrl = candidate.Provider.BaseUrl,
                        ProviderModelId = candidate.ModelProvider.ProviderModelId,
                        ApiKey = candidate.PlaintextKey,
                        Stream = stream,
                    }, stream ? Response.Body : null, timeoutCts.Token);
                }
                finally
                {
                    await inFlight.ExitAsync(candidate.Provider.Id);
                }

                attempted.Add(new { provider_id = candidate.Provider.Id, outcome = lastResult.Success ? "success" : $"http_{lastResult.UpstreamStatus?.ToString() ?? "network"}" });

                if (lastResult.Success)
                {
                    succeeded = true;
                    winner = candidate;
                    break;
                }

                await router.RecordFailureAsync(candidate, lastResult.UpstreamStatus, lastResult.RetryAfter);

                // A user-actionable rejection (bad request for this model) will fail on every
                // provider the same way — stop the fallback loop and surface it.
                if (lastResult.UserActionable) break;

                // Once bytes have gone out on a stream we cannot cleanly fall back either.
                if (stream && HttpContext.Response.HasStarted && lastResult.UpstreamStatus is null) break;
            }

            // ---- Settle ----
            if (succeeded)
            {
                var usage = lastResult!.Usage ?? new AdapterUsage(inputTokenEstimate, 1);
                var inputTokens = usage.InputTokens > 0 ? usage.InputTokens : inputTokenEstimate;
                var actualCost = caller.IsDemo ? 0 : CreditService.ComputeCost(model, inputTokens, usage.OutputTokens, usage.CacheReadTokens, usage.CacheWriteTokens);

                if (!caller.IsDemo)
                    await credits.ReconcileAsync(caller.User!.Id, reserved, actualCost, requestId);

                queueItem.Status = "completed";
                queueItem.ProviderId = winner!.Provider.Id;
                queueItem.ActualCredits = actualCost;
                queueItem.CompletedAt = DateTime.UtcNow;
                await WriteLogsAsync(requestId, caller, model, winner, attempted, "success", actualCost, (int)queueStopwatch.ElapsedMilliseconds);

                if (!stream)
                {
                    // Re-brand before returning: the upstream body's model field carries the
                    // provider's own model id (obfuscation policy §6). Streams pass through
                    // untouched in v1 — noted as a TODO in the checklist.
                    var responseBody = lastResult.ResponseBody!;
                    responseBody["model"] = model.ModelSlug;
                    Response.ContentType = "application/json";
                    await Response.WriteAsync(responseBody.ToJsonString(), ct);
                }
            }
            else
            {
                if (!caller.IsDemo)
                    await credits.ReleaseAsync(caller.User!.Id, reserved, requestId);

                queueItem.Status = "failed";
                queueItem.CompletedAt = DateTime.UtcNow;
                await WriteLogsAsync(requestId, caller, model, null, attempted, "fail", 0, (int)queueStopwatch.ElapsedMilliseconds);

                var (status, code, message) = lastResult is { UserActionable: true, UserMessage: not null }
                    ? (StatusCodes.Status400BadRequest, "invalid_request_error", lastResult.UserMessage)
                    : (StatusCodes.Status503ServiceUnavailable, "service_unavailable",
                       "No provider is currently available for this model. Please retry. You have not been charged.");

                if (stream && Response.HasStarted)
                {
                    // Headers are already out — deliver the error as a terminal SSE event.
                    var errorJson = JsonSerializer.Serialize(new { error = new { message, type = "invalid_request_error", code } });
                    await Response.WriteAsync($"data: {errorJson}\n\ndata: [DONE]\n\n", ct);
                    await Response.Body.FlushAsync(ct);
                }
                else
                {
                    await WriteJsonError(status, code, message);
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Client disconnected — zero charge, release everything.
            if (!caller.IsDemo && reserved > 0)
                await credits.ReleaseAsync(caller.User!.Id, reserved, requestId);
            queueItem.Status = "failed";
            queueItem.CompletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            logger.LogInformation("Request {RequestId} aborted by client while {Status}.", requestId, queueItem.Status);
        }
    }

    /// <summary>Plan §4: tier-configured priority; admins bypass the queue entirely (-1).</summary>
    private static int ResolvePriority(GatewayCaller caller)
    {
        if (caller.User?.Role == "admin") return -1;
        if (caller.IsDemo) return 0;
        return caller.Tier?.QueuePriorityStandard ?? 0;
    }

    private async Task WriteLogsAsync(string requestId, GatewayCaller caller, Model model, RouteCandidate? winner,
        List<object> attempted, string status, int creditsCharged, int queueWaitMs)
    {
        db.RequestLogs.Add(new RequestLog
        {
            UserId = caller.User?.Id,
            ApiKeyId = caller.ApiKey?.Id,
            ModelId = model.Id,
            ProviderId = winner?.Provider.Id,
            Endpoint = "/v1/chat/completions",
            Status = status,
            CreditsCharged = creditsCharged,
            CreatedAt = DateTime.UtcNow,
        });
        db.RoutingLogs.Add(new RoutingLog
        {
            RequestId = requestId,
            UserId = caller.User?.Id,
            KeyRefHash = winner?.KeyRefHash,
            ProvidersAttempted = JsonSerializer.Serialize(attempted),
            FinalProviderId = winner?.Provider.Id,
            RoutingReason = winner is null ? "all_candidates_failed" : "weight_order",
            QueueWaitMs = queueWaitMs,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private async Task WriteJsonError(int status, string code, string message)
    {
        Response.StatusCode = status;
        Response.ContentType = "application/json";
        await Response.WriteAsync(JsonSerializer.Serialize(new
        {
            error = new { message, type = "invalid_request_error", code },
        }));
    }

    private IActionResult ModelNotFound(string slug) => NotFound(new
    {
        error = new
        {
            message = $"The model '{slug}' does not exist or you do not have access to it.",
            type = "invalid_request_error",
            code = "model_not_found",
        },
    });
}
