using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;
using OrchidLLM.Web.Services.RateLimit;
using OrchidLLM.Web.Services.Security;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

var mySqlConnectionString = builder.Configuration.GetConnectionString("MySql");
builder.Services.AddDbContext<OrchidDbContext>(options =>
    options.UseMySql(mySqlConnectionString, ServerVersion.Create(new Version(8, 0, 0), Pomelo.EntityFrameworkCore.MySql.Infrastructure.ServerType.MySql)));

// AbortOnConnectFail = false so the app still boots for local/offline dev even if the
// Redis container isn't up yet — RPM reads just come back empty until it is.
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var redisConnectionString = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
    var options = ConfigurationOptions.Parse(redisConnectionString);
    options.AbortOnConnectFail = false;
    return ConnectionMultiplexer.Connect(options);
});
builder.Services.AddSingleton<ChannelRpmService>();
builder.Services.AddSingleton<IProviderKeyCipher, ProviderKeyCipher>();
builder.Services.AddHttpClient("channel-probe", client => client.Timeout = TimeSpan.FromSeconds(6));

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.AccessDeniedPath = "/Account/Login";
    })
    .AddGitHub(options =>
    {
        options.ClientId = builder.Configuration["Authentication:GitHub:ClientId"] ?? "";
        options.ClientSecret = builder.Configuration["Authentication:GitHub:ClientSecret"] ?? "";
        options.Scope.Add("read:user");
        options.Scope.Add("user:email");
        options.SaveTokens = true;

        // Upsert the OrchidLLM user record from the GitHub profile and stamp role/tier claims
        // before the cookie sign-in completes. Mirrors login.js's session shape (user_id,
        // username, display_name, provider, role, tier) but persisted in MySQL.
        options.Events.OnCreatingTicket = async context =>
        {
            var db = context.HttpContext.RequestServices.GetRequiredService<OrchidDbContext>();
            var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();

            var githubId = context.User.GetProperty("id").GetInt64().ToString();
            var login = context.User.TryGetProperty("login", out var loginProp) ? loginProp.GetString() ?? githubId : githubId;
            var name = context.User.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
            var avatarUrl = context.User.TryGetProperty("avatar_url", out var avatarProp) ? avatarProp.GetString() : null;
            var email = context.User.TryGetProperty("email", out var emailProp) ? emailProp.GetString() : null;

            var authProvider = await db.UserAuthProviders
                .Include(x => x.User)
                .FirstOrDefaultAsync(x => x.Provider == "github" && x.ProviderUserId == githubId);

            User user;
            if (authProvider is not null)
            {
                user = authProvider.User!;
                user.DisplayName = name ?? user.DisplayName;
                user.AvatarUrl = avatarUrl ?? user.AvatarUrl;
            }
            else
            {
                var defaultTierName = config["Orchid:DefaultSignupTier"] ?? "Free";
                var defaultTier = await db.SubscriptionTiers.FirstOrDefaultAsync(t => t.Name == defaultTierName);

                user = new User
                {
                    Username = login!,
                    DisplayName = name ?? login,
                    Email = email,
                    AvatarUrl = avatarUrl,
                    Role = "user",
                    ReferralCode = Guid.NewGuid().ToString("N")[..12],
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                };
                db.Users.Add(user);
                await db.SaveChangesAsync(); // need User.Id assigned before dependent rows

                db.UserAuthProviders.Add(new UserAuthProvider
                {
                    UserId = user.Id,
                    Provider = "github",
                    ProviderUserId = githubId,
                    Email = email,
                    LinkedAt = DateTime.UtcNow,
                });

                db.UserCredits.Add(new UserCredit { UserId = user.Id, LastUpdated = DateTime.UtcNow });

                if (defaultTier is not null)
                {
                    db.UserSubscriptions.Add(new UserSubscription
                    {
                        UserId = user.Id,
                        TierId = defaultTier.Id,
                        Status = "active",
                        CurrentPeriodStart = DateTime.UtcNow,
                    });
                }
            }

            var adminHandles = config.GetSection("Orchid:AdminGithubHandles").Get<string[]>() ?? [];
            user.Role = adminHandles.Any(h => string.Equals(h, login, StringComparison.OrdinalIgnoreCase)) ? "admin" : "user";
            user.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();

            context.Identity!.AddClaim(new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()));
            context.Identity!.AddClaim(new Claim(ClaimTypes.Name, user.Username));
            context.Identity!.AddClaim(new Claim(ClaimTypes.Role, user.Role));
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "areas",
    pattern: "{area:exists}/{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
