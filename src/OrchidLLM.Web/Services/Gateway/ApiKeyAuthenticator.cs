using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Services.Demo;

namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// Resolves and validates gateway credentials (plan §17): sk-orch-* API keys by SHA-256
/// hash lookup, and demo keys (§17a) via DemoKeyService's daily counter. Plaintext keys
/// are never stored or logged — only the hash is compared.
/// </summary>
public class ApiKeyAuthenticator(OrchidDbContext db, DemoKeyService demoKeys)
{
    public const string KeyPrefix = "sk-orch-";

    public static string Hash(string plaintextKey)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(plaintextKey));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public async Task<GatewayAuthResult> AuthenticateApiKeyAsync(string plaintextKey)
    {
        if (!plaintextKey.StartsWith(KeyPrefix, StringComparison.Ordinal))
            return GatewayAuthResult.Fail(GatewayAuthFailure.InvalidKey);

        var hash = Hash(plaintextKey);
        var apiKey = await db.ApiKeys
            .Include(k => k.User!).ThenInclude(u => u.Subscription!).ThenInclude(s => s.Tier)
            .FirstOrDefaultAsync(k => k.KeyHash == hash);

        if (apiKey?.User is null || apiKey.User.DeletedAt is not null)
            return GatewayAuthResult.Fail(GatewayAuthFailure.InvalidKey);
        if (!apiKey.IsActive)
            return GatewayAuthResult.Fail(GatewayAuthFailure.KeyDisabled);
        if (apiKey.ExpiresAt is not null && apiKey.ExpiresAt <= DateTime.UtcNow)
            return GatewayAuthResult.Fail(GatewayAuthFailure.KeyExpired);
        // Total limit is permanent once hit (plan §17); daily usage resets are a billing-cron
        // concern — the gateway only compares the running counters here.
        if (apiKey.CreditLimitTotal is not null && apiKey.CreditUsedTotal >= apiKey.CreditLimitTotal)
            return GatewayAuthResult.Fail(GatewayAuthFailure.KeyCreditLimitReached);
        if (apiKey.CreditLimitDaily is not null && apiKey.CreditUsedToday >= apiKey.CreditLimitDaily)
            return GatewayAuthResult.Fail(GatewayAuthFailure.KeyCreditLimitReached);

        apiKey.LastUsedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return GatewayAuthResult.Success(new GatewayCaller
        {
            IsDemo = false,
            User = apiKey.User,
            ApiKey = apiKey,
            Tier = apiKey.User.Subscription?.Tier,
        });
    }

    /// <summary>Demo path — consumes one unit of the daily quota per authenticated request.</summary>
    public async Task<GatewayAuthResult> AuthenticateDemoAsync(string demoKeyId)
    {
        var remaining = await demoKeys.TryConsumeAsync(demoKeyId);
        return remaining switch
        {
            null => GatewayAuthResult.Fail(GatewayAuthFailure.InvalidKey),
            < 0 => GatewayAuthResult.Fail(GatewayAuthFailure.DemoDailyLimitReached),
            _ => GatewayAuthResult.Success(new GatewayCaller { IsDemo = true, DemoKeyId = demoKeyId }),
        };
    }
}
