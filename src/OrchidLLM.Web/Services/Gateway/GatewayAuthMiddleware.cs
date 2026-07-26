using OrchidLLM.Web.Services.Demo;
using OrchidLLM.Web.Services.RateLimit;

namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// Authentication + per-user RPM gate for all /v1/* gateway endpoints (plan §16, §17, §17a).
/// Accepts either "Authorization: Bearer sk-orch-..." (registered API key) or the demo path —
/// bearer token "demo" (app.js's DEMO_API_KEY) or no auth header at all, resolved through the
/// orchid_demo_key cookie. On success the resolved GatewayCaller is stashed in
/// HttpContext.Items for the gateway controllers; on failure an OpenAI-shaped error body is
/// returned so existing OpenAI SDK clients surface it cleanly. No credits are ever charged here.
/// </summary>
public class GatewayAuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ApiKeyAuthenticator authenticator, UserRpmService userRpm)
    {
        if (!context.Request.Path.StartsWithSegments("/v1"))
        {
            await next(context);
            return;
        }

        var bearer = GetBearerToken(context);

        GatewayAuthResult result;
        if (bearer is not null && bearer.StartsWith(ApiKeyAuthenticator.KeyPrefix, StringComparison.Ordinal))
        {
            result = await authenticator.AuthenticateApiKeyAsync(bearer);

            if (result.Succeeded)
            {
                // Per-user RPM spans all the user's keys combined (plan §16). Exhausted-state
                // RPM (RpmExhausted) applies once the exhaustion evaluator exists — Phase E.
                var caller = result.Caller!;
                var rpmLimit = caller.Tier?.RpmNormal ?? 3;
                if (!await userRpm.TryConsumeAsync(caller.User!.Id, rpmLimit))
                {
                    await WriteError(context, StatusCodes.Status429TooManyRequests, "rate_limit_exceeded",
                        "Rate limit reached. Please slow down and retry shortly.");
                    return;
                }
            }
        }
        else if (bearer is null || bearer == "demo")
        {
            var demoKeyId = context.Request.Cookies[DemoKeyService.CookieName];
            result = string.IsNullOrEmpty(demoKeyId)
                ? GatewayAuthResult.Fail(GatewayAuthFailure.MissingKey)
                : await authenticator.AuthenticateDemoAsync(demoKeyId);
        }
        else
        {
            result = GatewayAuthResult.Fail(GatewayAuthFailure.InvalidKey);
        }

        if (!result.Succeeded)
        {
            var (status, code, message) = result.Failure switch
            {
                GatewayAuthFailure.MissingKey => (StatusCodes.Status401Unauthorized, "missing_api_key",
                    "No API key provided. Pass your key in the Authorization header: Bearer sk-orch-..."),
                GatewayAuthFailure.KeyDisabled => (StatusCodes.Status401Unauthorized, "api_key_disabled",
                    "This API key has been disabled."),
                GatewayAuthFailure.KeyExpired => (StatusCodes.Status401Unauthorized, "api_key_expired",
                    "This API key has expired."),
                GatewayAuthFailure.KeyCreditLimitReached => (StatusCodes.Status429TooManyRequests, "insufficient_quota",
                    "This API key has reached its configured credit limit."),
                GatewayAuthFailure.DemoDailyLimitReached => (StatusCodes.Status429TooManyRequests, "demo_limit_reached",
                    "Demo daily request limit reached. Create an account for higher limits."),
                _ => (StatusCodes.Status401Unauthorized, "invalid_api_key",
                    "Invalid API key provided."),
            };
            await WriteError(context, status, code, message);
            return;
        }

        context.Items[GatewayCaller.HttpContextItemKey] = result.Caller;
        await next(context);
    }

    private static string? GetBearerToken(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..].Trim() : null;
    }

    private static Task WriteError(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsJsonAsync(new
        {
            error = new { message, type = "invalid_request_error", code },
        });
    }
}
