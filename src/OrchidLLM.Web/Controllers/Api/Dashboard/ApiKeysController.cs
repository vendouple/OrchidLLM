using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using OrchidLLM.Web.Services.Gateway;

namespace OrchidLLM.Web.Controllers.Api.Dashboard;

/// <summary>
/// Dashboard API-key management (plan §17), backing users.js's API Keys section.
/// Key format sk-orch-[optional_sanitized_prefix]-[32 chars]; plaintext is returned
/// exactly once (on create/rotate) and only the SHA-256 hash is stored.
/// </summary>
[ApiController]
[Route("api/dashboard/keys")]
[Authorize]
public class ApiKeysController(OrchidDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = CurrentUserId();
        var keys = await db.ApiKeys.AsNoTracking()
            .Where(k => k.UserId == userId)
            .OrderByDescending(k => k.CreatedAt)
            .ToListAsync();

        return Ok(keys.Select(ToDto));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateKeyRequest request)
    {
        var userId = CurrentUserId();

        // Plan §17 downgrade retention: existing keys survive a downgrade, but no NEW keys
        // until the count is back under the tier's limit.
        var tierLimit = await db.UserSubscriptions
            .Where(s => s.UserId == userId)
            .Select(s => (int?)s.Tier!.MaxApiKeys)
            .FirstOrDefaultAsync() ?? 1;
        var currentCount = await db.ApiKeys.CountAsync(k => k.UserId == userId);
        if (currentCount >= tierLimit)
        {
            return BadRequest(new
            {
                error = $"You have {currentCount} keys and your plan allows {tierLimit}. Delete one to add new keys.",
            });
        }

        var (plaintext, key) = GenerateKey(userId, request);
        db.ApiKeys.Add(key);
        await db.SaveChangesAsync();

        // Plaintext rides this one response and is never retrievable again.
        return Ok(new { key = plaintext, record = ToDto(key) });
    }

    /// <summary>New value, old one instantly invalid, config preserved (plan §17).</summary>
    [HttpPost("{id:int}/rotate")]
    public async Task<IActionResult> Rotate(int id)
    {
        var key = await FindOwnKeyAsync(id);
        if (key is null) return NotFound();

        var plaintext = BuildPlaintext(ExtractPrefix(key.KeyPreview));
        key.KeyHash = ApiKeyAuthenticator.Hash(plaintext);
        key.KeyPreview = Preview(plaintext);
        await db.SaveChangesAsync();

        return Ok(new { key = plaintext, record = ToDto(key) });
    }

    [HttpPost("{id:int}/pause")]
    public Task<IActionResult> Pause(int id) => SetActive(id, false);

    [HttpPost("{id:int}/enable")]
    public Task<IActionResult> Enable(int id) => SetActive(id, true);

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var key = await FindOwnKeyAsync(id);
        if (key is null) return NotFound();

        db.ApiKeys.Remove(key);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // ---------------------------------------------------------------- helpers

    private int CurrentUserId()
        => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private async Task<ApiKey?> FindOwnKeyAsync(int id)
        => await db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id && k.UserId == CurrentUserId());

    private async Task<IActionResult> SetActive(int id, bool active)
    {
        var key = await FindOwnKeyAsync(id);
        if (key is null) return NotFound();

        key.IsActive = active;
        await db.SaveChangesAsync();
        return Ok(ToDto(key));
    }

    private (string Plaintext, ApiKey Key) GenerateKey(int userId, CreateKeyRequest request)
    {
        var prefix = SanitizePrefix(request.Prefix);
        var plaintext = BuildPlaintext(prefix);

        return (plaintext, new ApiKey
        {
            UserId = userId,
            KeyHash = ApiKeyAuthenticator.Hash(plaintext),
            KeyPreview = Preview(plaintext),
            Label = string.IsNullOrWhiteSpace(request.Label) ? "My Key" : request.Label.Trim()[..Math.Min(100, request.Label.Trim().Length)],
            IsActive = true,
            CreditLimitTotal = request.CreditLimitTotal,
            CreditLimitDaily = request.CreditLimitDaily,
            CreditLimitReset = request.CreditLimitReset is "weekly" or "monthly" or "never" ? request.CreditLimitReset : "daily",
            ModelWhitelist = request.ModelWhitelist is { Count: > 0 } ? JsonSerializer.Serialize(request.ModelWhitelist) : null,
            ExposeBalance = request.ExposeBalance ?? false,
            ExpiresAt = request.ExpiresAt,
            CreatedAt = DateTime.UtcNow,
        });
    }

    private static string BuildPlaintext(string? prefix)
    {
        var random = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(); // 32 chars
        return string.IsNullOrEmpty(prefix)
            ? $"{ApiKeyAuthenticator.KeyPrefix}{random}"
            : $"{ApiKeyAuthenticator.KeyPrefix}{prefix}-{random}";
    }

    /// <summary>Plan §17: user prefix is sanitised — lowercase alphanumerics, max 12 chars.</summary>
    private static string? SanitizePrefix(string? prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix)) return null;
        var cleaned = Regex.Replace(prefix.ToLowerInvariant(), "[^a-z0-9]", "");
        return cleaned.Length == 0 ? null : cleaned[..Math.Min(12, cleaned.Length)];
    }

    /// <summary>"sk-orch-abc...xyz" — first 12 + last 4 chars (plan §17).</summary>
    private static string Preview(string plaintext)
        => $"{plaintext[..12]}...{plaintext[^4..]}";

    /// <summary>Recovers the user prefix from a stored preview so rotation keeps it.</summary>
    private static string? ExtractPrefix(string keyPreview)
    {
        var head = keyPreview.Split("...")[0];
        if (!head.StartsWith(ApiKeyAuthenticator.KeyPrefix, StringComparison.Ordinal)) return null;
        var afterBase = head[ApiKeyAuthenticator.KeyPrefix.Length..];
        var dash = afterBase.IndexOf('-');
        return dash > 0 ? afterBase[..dash] : null;
    }

    private static object ToDto(ApiKey k) => new
    {
        id = k.Id,
        label = k.Label,
        preview = k.KeyPreview,
        status = k.IsActive ? "active" : "paused",
        created = k.CreatedAt,
        lastUsed = k.LastUsedAt,
        creditsUsed = k.CreditUsedTotal,
        creditLimit = k.CreditLimitTotal,
        creditLimitDaily = k.CreditLimitDaily,
        limitInterval = k.CreditLimitReset,
        exposeBalance = k.ExposeBalance,
        modelWhitelist = k.ModelWhitelist is null ? null : JsonSerializer.Deserialize<List<string>>(k.ModelWhitelist),
        expiresAt = k.ExpiresAt,
    };

    public record CreateKeyRequest(
        string? Label,
        string? Prefix,
        int? CreditLimitTotal,
        int? CreditLimitDaily,
        string? CreditLimitReset,
        List<string>? ModelWhitelist,
        bool? ExposeBalance,
        DateTime? ExpiresAt);
}
