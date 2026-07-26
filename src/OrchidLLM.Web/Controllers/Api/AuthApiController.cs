using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;

namespace OrchidLLM.Web.Controllers.Api;

/// <summary>
/// JSON session bridge for the ported frontend. index.js's checkAuth()/setAuthUi() already
/// call GET /api/auth/session and POST /api/auth/logout and read exactly the shape returned
/// here ({authenticated, user:{username, display_name, avatar}, tier, isAdmin}) — this
/// replaces the demo's localStorage orchid_session fallback.
/// </summary>
[ApiController]
[Route("api/auth")]
public class AuthApiController(OrchidDbContext db) : ControllerBase
{
    [HttpGet("session")]
    public async Task<IActionResult> Session()
    {
        if (User.Identity?.IsAuthenticated != true)
            return Ok(new { authenticated = false });

        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(idClaim, out var userId))
            return Ok(new { authenticated = false });

        var user = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId && u.DeletedAt == null)
            .Select(u => new
            {
                u.Username,
                u.DisplayName,
                u.AvatarUrl,
                u.Role,
                TierName = db.UserSubscriptions
                    .Where(s => s.UserId == u.Id)
                    .Select(s => s.Tier!.Name)
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync();

        if (user is null)
            return Ok(new { authenticated = false });

        return Ok(new
        {
            authenticated = true,
            user = new
            {
                username = user.Username,
                display_name = user.DisplayName,
                avatar = user.AvatarUrl,
            },
            tier = user.TierName ?? "free",
            isAdmin = user.Role == "admin",
        });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Ok(new { ok = true });
    }

    /// <summary>
    /// Session bridge for the ported dashboard (Phase C): emits JS that writes the real
    /// ASP.NET auth session into the orchid_session localStorage key the demo-derived
    /// users.js reads, merging over any extra keys the dashboard has written back
    /// (cycle, nextRenewal, ...). When signed out it clears the key so users.js redirects
    /// to login. Loaded via &lt;script src&gt; before users.js — never cached.
    /// </summary>
    [HttpGet("session-bootstrap.js")]
    public async Task<IActionResult> SessionBootstrap()
    {
        Response.Headers.CacheControl = "no-store";

        string script;
        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (User.Identity?.IsAuthenticated == true && int.TryParse(idClaim, out var userId))
        {
            var user = await db.Users
                .AsNoTracking()
                .Where(u => u.Id == userId && u.DeletedAt == null)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.DisplayName,
                    u.Role,
                    TierName = db.UserSubscriptions
                        .Where(s => s.UserId == u.Id)
                        .Select(s => s.Tier!.Name)
                        .FirstOrDefault(),
                })
                .FirstOrDefaultAsync();

            if (user is not null)
            {
                var sessionJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    user_id = user.Id,
                    username = user.Username,
                    display_name = user.DisplayName,
                    provider = "github",
                    role = user.Role,
                    tier = (user.TierName ?? "free").ToLowerInvariant(),
                });
                script = $$"""
                    (function () {
                      var fresh = {{sessionJson}};
                      var existing = {};
                      try { existing = JSON.parse(localStorage.getItem('orchid_session') || '{}') || {}; } catch (e) {}
                      // Server identity wins; dashboard-written extras (cycle, nextRenewal, ...) survive.
                      var merged = Object.assign({}, existing, fresh);
                      merged.logged_in_at = existing.logged_in_at || new Date().toISOString();
                      localStorage.setItem('orchid_session', JSON.stringify(merged));
                    })();
                    """;
            }
            else
            {
                script = "localStorage.removeItem('orchid_session');";
            }
        }
        else
        {
            script = "localStorage.removeItem('orchid_session');";
        }

        return Content(script, "application/javascript");
    }
}
