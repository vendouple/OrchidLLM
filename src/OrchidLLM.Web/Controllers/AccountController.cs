using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Controllers;

public class AccountController(OrchidDbContext db) : Controller
{
    [HttpGet]
    public IActionResult Login() => View();

    /// <summary>Kicks off the real GitHub OAuth handshake (replaces the demo's simulated flow).</summary>
    [HttpGet]
    public IActionResult ExternalLogin(string provider = "GitHub", string? returnUrl = null)
    {
        var redirectUrl = Url.Action(nameof(ExternalLoginCallback), "Account", new { returnUrl });
        var properties = new AuthenticationProperties { RedirectUri = redirectUrl };
        return Challenge(properties, provider);
    }

    /// <summary>
    /// Lands here after the cookie sign-in from OnCreatingTicket (Program.cs) has already
    /// completed — the user/role/tier upsert happens there, not here. This just redirects
    /// to the dashboard once the authenticated cookie is in place.
    /// </summary>
    [HttpGet]
    public IActionResult ExternalLoginCallback(string? returnUrl = null)
    {
        if (!User.Identity?.IsAuthenticated ?? true)
        {
            TempData["LoginError"] = "GitHub sign-in did not complete. Please try again.";
            return RedirectToAction(nameof(Login));
        }

        return LocalRedirect(returnUrl ?? "/Dashboard");
    }

    /// <summary>Issues a real demo session (DemoKeys row + cookie) — replaces the demo's localStorage-only flow.</summary>
    [HttpPost]
    public async Task<IActionResult> TryDemo([FromBody] TryDemoRequest? request)
    {
        var demoKeyId = Guid.NewGuid().ToString();
        var platform = request?.Platform == "web_mobile" ? "web_mobile" : "web_desktop";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        db.DemoKeys.Add(new DemoKey
        {
            Id = demoKeyId,
            Platform = platform,
            RequestsToday = 0,
            TotalRequests = 0,
            LastRequestDay = today,
            CreatedAt = DateTime.UtcNow,
            LastUsedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        Response.Cookies.Append("orchid_demo_key", demoKeyId, new CookieOptions
        {
            Expires = DateTimeOffset.UtcNow.AddDays(30),
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
        });

        return Json(new { demoKeyPreview = demoKeyId[..8] });
    }

    [HttpPost]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return RedirectToAction(nameof(Login));
    }

    public record TryDemoRequest(string? Platform);
}
