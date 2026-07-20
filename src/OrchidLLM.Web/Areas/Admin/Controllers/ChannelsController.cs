using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using OrchidLLM.Web.Services.RateLimit;

namespace OrchidLLM.Web.Areas.Admin.Controllers;

[Area("Admin")]
[Authorize(Roles = "admin")]
public class ChannelsController(OrchidDbContext db, ChannelRpmService rpm) : Controller
{
    public async Task<IActionResult> Index()
    {
        ViewData["Title"] = "Channels";
        ViewData["ActiveSection"] = "providers";

        var providers = await db.Providers.OrderBy(p => p.Weight).ToListAsync();
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
            ? await db.Providers.FindAsync(id.Value)
            : new Provider { Status = "active", MaxConcurrent = 20, Weight = 10 };

        if (provider is null) return NotFound();
        return View(provider);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Save(int? id, string name, string baseUrl, int weight, bool free,
        int maxConcurrent, int? rpmCap, string status)
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

        await db.SaveChangesAsync();
        return RedirectToAction(nameof(Index));
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

    public record ChannelRow(Provider Provider, int CurrentRpm);
}
