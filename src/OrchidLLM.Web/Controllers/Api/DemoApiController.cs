using Microsoft.AspNetCore.Mvc;
using OrchidLLM.Web.Services.Demo;

namespace OrchidLLM.Web.Controllers.Api;

/// <summary>
/// Demo key JSON API (checklist §2 — POST /api/demo/key). Returns the same session shape
/// login.js stores as orchid_demo_session, so the ported frontend can swap its localStorage
/// write for this response. The key itself also rides in the HttpOnly orchid_demo_key cookie;
/// the body copy exists because the demo UI shows the remaining-requests pill client-side.
/// </summary>
[ApiController]
[Route("api/demo")]
public class DemoApiController(DemoKeyService demoKeys) : ControllerBase
{
    [HttpPost("key")]
    public async Task<IActionResult> Issue([FromBody] IssueRequest? request)
    {
        var key = await demoKeys.IssueAsync(request?.Platform);

        Response.Cookies.Append(DemoKeyService.CookieName, key.Id, new CookieOptions
        {
            Expires = DateTimeOffset.UtcNow.AddDays(30),
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
        });

        return Ok(new
        {
            demo_key = key.Id,
            platform = key.Platform,
            requests_today = 0,
            max_requests_day = demoKeys.MaxRequestsPerDay,
            context_cap = demoKeys.ContextCap,
            model_access = "demo",
            created_at = key.CreatedAt,
        });
    }

    /// <summary>Remaining daily quota for the demo banner pill. Reads the cookie-bound key.</summary>
    [HttpGet("remaining")]
    public async Task<IActionResult> Remaining()
    {
        var demoKeyId = Request.Cookies[DemoKeyService.CookieName];
        if (string.IsNullOrEmpty(demoKeyId))
            return Ok(new { active = false });

        var remaining = await demoKeys.GetRemainingAsync(demoKeyId);
        return Ok(new { active = true, remaining, max_requests_day = demoKeys.MaxRequestsPerDay });
    }

    public record IssueRequest(string? Platform);
}
