using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;

namespace OrchidLLM.Web.Areas.Dashboard.Controllers;

[Area("Dashboard")]
[Authorize]
public class HomeController(IWebHostEnvironment env) : Controller
{
    /// <summary>
    /// Serves the ported Frontend-DEMO dashboard (wwwroot/dashboard/users.html). The page's
    /// session comes from /api/auth/session-bootstrap.js, so users.js runs against the real
    /// signed-in identity; section data still comes from demo seeds until each section's
    /// API lands (IMPLEMENTATION_PLAN_V1 Phase C).
    /// </summary>
    public IActionResult Index()
    {
        var path = Path.Combine(env.WebRootPath, "dashboard", "users.html");
        return PhysicalFile(path, "text/html");
    }
}
