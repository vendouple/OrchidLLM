using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using OrchidLLM.Web.Services.RateLimit;
using OrchidLLM.Web.Services.Security;

namespace OrchidLLM.Web.Areas.Admin.Controllers;

[Area("Admin")]
[Authorize(Roles = "admin")]
public class ChannelsController(OrchidDbContext db, ChannelRpmService rpm, IProviderKeyCipher cipher, IHttpClientFactory httpClientFactory) : Controller
{
    public async Task<IActionResult> Index()
    {
        ViewData["Title"] = "Channels";
        ViewData["ActiveSection"] = "providers";

        var providers = await db.Providers.Include(p => p.Keys).OrderBy(p => p.Weight).ToListAsync();
        var currentRpm = await rpm.GetCurrentRpmAsync(providers.Select(p => p.Id));

        var rows = providers.Select(p => new ChannelRow(p, currentRpm.GetValueOrDefault(p.Id))).ToList();
        return View(rows);
    }

    [HttpGet]
    public async Task<IActionResult> Edit(int? id)
    {
        ViewData["Title"] = id.HasValue ? "Edit Channel" : "Add Channel";
        ViewData["ActiveSection"] = "providers";

        var provider = id.HasValue
            ? await db.Providers.Include(p => p.Keys).FirstOrDefaultAsync(p => p.Id == id.Value)
            : new Provider { Status = "active", MaxConcurrent = 20, Weight = 10 };

        if (provider is null) return NotFound();

        var vm = new ChannelEditViewModel
        {
            Provider = provider,
            Modalities = ParseModalities(provider.Modalities),
            ErrorAliasOverrides = ParseErrorAliases(provider.ErrorAliasOverrides),
        };
        return View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Save(int? id, string name, string baseUrl, int weight, bool free,
        int maxConcurrent, int? rpmCap, string status,
        string[]? modalityName, string[]? modalityParams,
        string[]? eaMatchType, string[]? eaPattern, string[]? eaLabel,
        string? bulkKeys)
    {
        Provider provider;
        if (id.HasValue)
        {
            var existing = await db.Providers.FindAsync(id.Value);
            if (existing is null) return NotFound();
            provider = existing;
        }
        else
        {
            provider = new Provider { CreatedAt = DateTime.UtcNow };
            db.Providers.Add(provider);
        }

        provider.Name = name;
        provider.BaseUrl = baseUrl;
        provider.Weight = weight;
        provider.Free = free;
        provider.MaxConcurrent = maxConcurrent;
        provider.RpmCap = rpmCap;
        provider.Status = status;
        provider.UpdatedAt = DateTime.UtcNow;
        provider.Modalities = BuildModalitiesJson(modalityName, modalityParams);
        provider.ErrorAliasOverrides = BuildErrorAliasesJson(eaMatchType, eaPattern, eaLabel);

        // Save first so a brand-new provider has an Id to hang keys off of.
        await db.SaveChangesAsync();

        foreach (var rawKey in ParseKeyLines(bulkKeys))
        {
            db.ProviderKeys.Add(new ProviderKey
            {
                ProviderId = provider.Id,
                KeyCipher = cipher.Encrypt(rawKey),
                KeyPreview = cipher.Mask(rawKey),
                Status = "healthy",
                CreatedAt = DateTime.UtcNow,
            });
        }
        if (!string.IsNullOrWhiteSpace(bulkKeys))
        {
            await db.SaveChangesAsync();
        }

        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteKey(int providerId, int keyId)
    {
        var key = await db.ProviderKeys.FirstOrDefaultAsync(k => k.Id == keyId && k.ProviderId == providerId);
        if (key is not null)
        {
            db.ProviderKeys.Remove(key);
            await db.SaveChangesAsync();
        }
        return RedirectToAction(nameof(Edit), new { id = providerId });
    }

    /// <summary>
    /// Lightweight reachability probe (HEAD request, short timeout). This is a real check —
    /// not a mock — but intentionally generic: authenticating against each provider's own
    /// API shape is out of scope until the Phase 7 adapter layer exists (see plan §Phase 7).
    /// </summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Probe(int id)
    {
        var provider = await db.Providers.Include(p => p.Keys).FirstOrDefaultAsync(p => p.Id == id);
        if (provider is null) return NotFound();

        var reachable = await ProbeReachabilityAsync(provider.BaseUrl);
        if (reachable)
        {
            if (provider.Status is "rate_limited" or "dead")
            {
                provider.Status = "active";
            }
            provider.RateLimitUntil = null;
            foreach (var key in provider.Keys.Where(k => k.Status == "rate_limited"))
            {
                key.Status = "healthy";
            }
        }
        else if (provider.Status == "active")
        {
            provider.Status = "dead";
        }
        provider.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        TempData["ProbeResult"] = reachable
            ? $"{provider.Name} responded — marked active."
            : $"{provider.Name} unreachable — marked dead.";
        return RedirectToAction(nameof(Index));
    }

    private async Task<bool> ProbeReachabilityAsync(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
        {
            return false;
        }

        var client = httpClientFactory.CreateClient("channel-probe");
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Head, uri);
            // Any response at all — even 401/404 — means the host is up and routable;
            // we're checking reachability here, not authenticating.
            using var response = await client.SendAsync(request);
            return true;
        }
        catch
        {
            return false;
        }
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id)
    {
        var provider = await db.Providers.FindAsync(id);
        if (provider is not null)
        {
            db.Providers.Remove(provider);
            await db.SaveChangesAsync();
        }
        return RedirectToAction(nameof(Index));
    }

    private static Dictionary<string, List<string>> ParseModalities(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, List<string>>>(json) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    private static string BuildModalitiesJson(string[]? names, string[]? paramsCsv)
    {
        var dict = new Dictionary<string, List<string>>();
        if (names is not null)
        {
            for (var i = 0; i < names.Length; i++)
            {
                var name = names[i]?.Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(name)) continue;
                var csv = paramsCsv is not null && i < paramsCsv.Length ? paramsCsv[i] ?? "" : "";
                var parms = csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
                dict[name] = parms;
            }
        }
        return JsonSerializer.Serialize(dict);
    }

    private static List<ErrorAliasRow> ParseErrorAliases(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<List<ErrorAliasRow>>(json) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    private static string BuildErrorAliasesJson(string[]? matchTypes, string[]? patterns, string[]? labels)
    {
        var rows = new List<ErrorAliasRow>();
        if (patterns is not null)
        {
            for (var i = 0; i < patterns.Length; i++)
            {
                var pattern = patterns[i]?.Trim();
                var label = labels is not null && i < labels.Length ? labels[i]?.Trim() : null;
                if (string.IsNullOrEmpty(pattern) || string.IsNullOrEmpty(label)) continue;
                var matchType = matchTypes is not null && i < matchTypes.Length ? matchTypes[i] : "code";
                rows.Add(new ErrorAliasRow(matchType ?? "code", pattern, label));
            }
        }
        return JsonSerializer.Serialize(rows);
    }

    private static IEnumerable<string> ParseKeyLines(string? text) =>
        (text ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public static readonly string[] BaseModalities = ["text", "image", "audio", "video", "music"];

    public record ChannelRow(Provider Provider, int CurrentRpm);
    public record ErrorAliasRow(string MatchType, string Pattern, string Label);
}

public class ChannelEditViewModel
{
    public Provider Provider { get; set; } = new();
    public Dictionary<string, List<string>> Modalities { get; set; } = new();
    public List<ChannelsController.ErrorAliasRow> ErrorAliasOverrides { get; set; } = new();
}
