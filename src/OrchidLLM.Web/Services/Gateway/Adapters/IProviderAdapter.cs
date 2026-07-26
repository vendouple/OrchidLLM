using System.Text.Json.Nodes;

namespace OrchidLLM.Web.Services.Gateway.Adapters;

public record AdapterUsage(int InputTokens, int OutputTokens, int CacheReadTokens = 0, int CacheWriteTokens = 0);

/// <summary>
/// Outcome of one upstream dispatch attempt. Per the obfuscation policy (plan §6), adapters
/// classify errors as user-actionable (translated, provider-neutral message surfaced) or
/// internal (generic message only) — raw upstream error text never escapes the adapter.
/// </summary>
public class AdapterResult
{
    public bool Success { get; init; }

    /// <summary>Upstream HTTP status on failure; null = network error/timeout.</summary>
    public int? UpstreamStatus { get; init; }

    public TimeSpan? RetryAfter { get; init; }

    /// <summary>Token usage for billing. On streams without a usage chunk this is estimated.</summary>
    public AdapterUsage? Usage { get; init; }

    /// <summary>Full response body (non-streaming success only; streams write directly to the client).</summary>
    public JsonNode? ResponseBody { get; init; }

    /// <summary>Translated, provider-neutral message safe to show the caller.</summary>
    public string? UserMessage { get; init; }

    /// <summary>True = surface UserMessage as a 4xx; false = generic 503 retry message.</summary>
    public bool UserActionable { get; init; }
}

public class AdapterChatRequest
{
    /// <summary>Client's request body; the adapter swaps in the provider's model id.</summary>
    public required JsonObject Body { get; init; }
    public required string BaseUrl { get; init; }
    public required string ProviderModelId { get; init; }
    public required string ApiKey { get; init; }
    public required bool Stream { get; init; }
}

/// <summary>
/// One adapter per upstream provider family (plan Phase 7). Phase 1 ships the
/// OpenAI-compatible adapter only; provider rows select their adapter by AuthType/family
/// once more families exist.
/// </summary>
public interface IProviderAdapter
{
    /// <summary>
    /// Dispatches a chat completion. When streaming, SSE bytes are forwarded to
    /// <paramref name="streamTarget"/> as they arrive (headers must already be sent by the
    /// caller); the result then carries usage only.
    /// </summary>
    Task<AdapterResult> SendChatAsync(AdapterChatRequest request, Stream? streamTarget, CancellationToken ct);
}
