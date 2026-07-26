using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using OrchidLLM.Web.Models;

namespace OrchidLLM.Web.Controllers;

public class HomeController : Controller
{
    // The public chat/index page (Frontend-DEMO index.html) is a Phase 5 port; until then
    // the root sends visitors to sign-in, which also offers the demo path.
    public IActionResult Index() => RedirectToAction("Login", "Account");

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
