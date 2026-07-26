using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// The authenticated identity behind a /v1/* gateway request — either a registered user's
/// API key or an anonymous demo key. Stashed in HttpContext.Items by GatewayAuthMiddleware
/// and read by the gateway controllers.
/// </summary>
public class GatewayCaller
{
    public const string HttpContextItemKey = "OrchidGatewayCaller";

    public bool IsDemo { get; init; }

    // API-key callers
    public User? User { get; init; }
    public ApiKey? ApiKey { get; init; }
    public SubscriptionTier? Tier { get; init; }

    // Demo callers
    public string? DemoKeyId { get; init; }

    /// <summary>Model access tier label used for catalog/model filtering (plan §5).</summary>
    public string ModelAccessTier => IsDemo ? "demo" : Tier?.ModelAccessTier ?? "free";
}

/// <summary>Why gateway authentication failed — mapped to an OpenAI-shaped error response.</summary>
public enum GatewayAuthFailure
{
    MissingKey,
    InvalidKey,
    KeyDisabled,
    KeyExpired,
    KeyCreditLimitReached,
    DemoDailyLimitReached,
}

public class GatewayAuthResult
{
    public GatewayCaller? Caller { get; private init; }
    public GatewayAuthFailure? Failure { get; private init; }

    public bool Succeeded => Caller is not null;

    public static GatewayAuthResult Success(GatewayCaller caller) => new() { Caller = caller };
    public static GatewayAuthResult Fail(GatewayAuthFailure failure) => new() { Failure = failure };
}
