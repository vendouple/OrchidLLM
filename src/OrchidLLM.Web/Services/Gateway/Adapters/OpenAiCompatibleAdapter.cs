using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace OrchidLLM.Web.Services.Gateway.Adapters;

/// <summary>
/// Adapter for OpenAI-compatible upstreams (OpenRouter, Groq, Together, most aggregators).
/// Forwards /chat/completions, streams SSE through unmodified, extracts usage for billing
/// (from the response body, a stream usage chunk, or a chars/4 estimate as last resort),
/// and translates errors per the obfuscation policy — no upstream headers or raw error
/// text ever reach the caller.
/// </summary>
public class OpenAiCompatibleAdapter(IHttpClientFactory httpClientFactory) : IProviderAdapter
{
    public const string HttpClientName = "gateway-dispatch";

    private const string InternalErrorMessage = "Service temporarily unavailable. Please retry.";

    public async Task<AdapterResult> SendChatAsync(AdapterChatRequest request, Stream? streamTarget, CancellationToken ct)
    {
        var body = (JsonObject)request.Body.DeepClone();
        body["model"] = request.ProviderModelId;
        body["stream"] = request.Stream;
        foreach (var param in request.RemoveParams)
            body.Remove(param);

        var url = request.BaseUrl.TrimEnd('/') + "/chat/completions";
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", request.ApiKey);

        HttpResponseMessage response;
        try
        {
            var client = httpClientFactory.CreateClient(HttpClientName);
            response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            return new AdapterResult { Success = false, UpstreamStatus = null, UserMessage = InternalErrorMessage };
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
                return await TranslateErrorAsync(response, request.ErrorRules, ct);

            return request.Stream && streamTarget is not null
                ? await ForwardStreamAsync(response, request, streamTarget, ct)
                : await ReadNonStreamingAsync(response, request, ct);
        }
    }

    private static async Task<AdapterResult> ReadNonStreamingAsync(HttpResponseMessage response, AdapterChatRequest request, CancellationToken ct)
    {
        var text = await response.Content.ReadAsStringAsync(ct);
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(text);
        }
        catch (JsonException)
        {
            node = null;
        }
        if (node is not JsonObject obj) // non-JSON or array body = malformed upstream response
            return new AdapterResult { Success = false, UpstreamStatus = 502, UserMessage = InternalErrorMessage };

        if (request.PublicModelId is not null)
            obj["model"] = request.PublicModelId; // obfuscation §6: never leak the provider's model id

        return new AdapterResult
        {
            Success = true,
            ResponseBody = obj,
            Usage = ExtractUsage(obj["usage"]) ?? EstimateUsageFromBody(obj),
        };
    }

    /// <summary>
    /// Copies SSE lines through verbatim while shadow-parsing them for a usage chunk and an
    /// output-size fallback estimate. Upstream headers are never forwarded — only body lines.
    /// </summary>
    private static async Task<AdapterResult> ForwardStreamAsync(HttpResponseMessage response, AdapterChatRequest request, Stream target, CancellationToken ct)
    {
        AdapterUsage? usage = null;
        var outputChars = 0;

        // leaveOpen everywhere: the target is the live client response stream — the
        // controller still owns it after we return (e.g. to append a terminal SSE error).
        try
        {
            await using var upstream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(upstream, leaveOpen: false);
            await using var writer = new StreamWriter(target, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = false };

            while (await reader.ReadLineAsync(ct) is { } line)
            {
                var outLine = line;

                if (line.StartsWith("data:", StringComparison.Ordinal))
                {
                    var payload = line[5..].Trim();
                    if (payload.Length > 0 && payload != "[DONE]")
                    {
                        try
                        {
                            var chunk = JsonNode.Parse(payload);
                            usage ??= ExtractUsage(chunk?["usage"]);
                            var delta = chunk?["choices"]?[0]?["delta"]?["content"]?.GetValue<string>();
                            outputChars += delta?.Length ?? 0;

                            // Obfuscation §6: re-stamp the provider's model id on every chunk.
                            if (request.PublicModelId is not null && chunk is JsonObject obj && obj.ContainsKey("model"))
                            {
                                obj["model"] = request.PublicModelId;
                                outLine = "data: " + obj.ToJsonString();
                            }
                        }
                        catch (JsonException)
                        {
                            // Not our chunk to understand — forward it verbatim.
                        }
                    }
                }

                await writer.WriteAsync(outLine);
                await writer.WriteAsync('\n');
                if (line.Length == 0)
                    await writer.FlushAsync(ct); // event boundary — push the chunk to the client now
            }
            await writer.FlushAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException && !ct.IsCancellationRequested)
        {
            // Upstream died mid-stream. Bytes may already be with the client — the controller
            // detects HasStarted + null status and appends a terminal SSE error event.
            return new AdapterResult { Success = false, UpstreamStatus = null, UserMessage = InternalErrorMessage };
        }

        return new AdapterResult
        {
            Success = true,
            Usage = usage ?? new AdapterUsage(0, Math.Max(1, outputChars / 4)),
        };
    }

    private static async Task<AdapterResult> TranslateErrorAsync(HttpResponseMessage response, IReadOnlyList<ErrorTranslationRule> rules, CancellationToken ct)
    {
        var status = (int)response.StatusCode;
        var retryAfter = response.Headers.RetryAfter?.Delta;

        // Raw upstream text is inspected for classification only — never surfaced.
        string raw;
        try { raw = await response.Content.ReadAsStringAsync(ct); }
        catch { raw = string.Empty; }

        // Admin-configured translations first (channel overrides were prepended by the caller).
        // A user_actionable rule surfaces its label; an internal rule still shows the generic
        // message — the label is for admin log display, not the caller.
        var matchedRule = rules.FirstOrDefault(r => r.Matches(raw));
        if (matchedRule is { Category: "user_actionable" })
        {
            return new AdapterResult
            {
                Success = false,
                UpstreamStatus = status,
                UserMessage = matchedRule.Label,
                UserActionable = true,
                RetryAfter = retryAfter,
            };
        }
        if (matchedRule is not null)
        {
            return new AdapterResult
            {
                Success = false,
                UpstreamStatus = status,
                UserMessage = InternalErrorMessage,
                UserActionable = false,
                RetryAfter = retryAfter,
            };
        }

        if (status is >= 400 and < 500 && status != 401 && status != 402 && status != 403 && status != 429)
        {
            var (message, actionable) = ClassifyUserError(raw);
            return new AdapterResult
            {
                Success = false,
                UpstreamStatus = status,
                UserMessage = message,
                UserActionable = actionable,
                RetryAfter = retryAfter,
            };
        }

        return new AdapterResult
        {
            Success = false,
            UpstreamStatus = status,
            UserMessage = InternalErrorMessage,
            UserActionable = false,
            RetryAfter = retryAfter,
        };
    }

    /// <summary>Plan §6 error translation — a fixed provider-neutral phrasebook, keyed off common upstream signals.</summary>
    private static (string Message, bool Actionable) ClassifyUserError(string rawBody)
    {
        var lower = rawBody.ToLowerInvariant();
        if (lower.Contains("context") && (lower.Contains("length") || lower.Contains("exceed") || lower.Contains("too long")))
            return ("Request exceeds the maximum context length for this model.", true);
        if (lower.Contains("tool") && (lower.Contains("support") || lower.Contains("not available")))
            return ("Tool calling is not supported by the selected model configuration.", true);
        if (lower.Contains("image") && lower.Contains("support"))
            return ("Image input is not supported by the selected model configuration.", true);
        if (lower.Contains("content") && (lower.Contains("policy") || lower.Contains("filter") || lower.Contains("moderation")))
            return ("The request was declined by the model's content policy.", true);
        return ("The request was rejected as invalid for the selected model configuration.", true);
    }

    private static AdapterUsage? ExtractUsage(JsonNode? usage)
    {
        if (usage is null) return null;
        var input = usage["prompt_tokens"]?.GetValue<int>() ?? 0;
        var output = usage["completion_tokens"]?.GetValue<int>() ?? 0;
        var cacheRead = usage["prompt_tokens_details"]?["cached_tokens"]?.GetValue<int>() ?? 0;
        if (input == 0 && output == 0) return null;
        return new AdapterUsage(input, output, cacheRead);
    }

    private static AdapterUsage EstimateUsageFromBody(JsonNode? body)
    {
        var content = body?["choices"]?[0]?["message"]?["content"]?.GetValue<string>() ?? string.Empty;
        return new AdapterUsage(0, Math.Max(1, content.Length / 4));
    }
}
