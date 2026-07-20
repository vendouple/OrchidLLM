using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Data;

/// <summary>
/// Seeds the common model-maker list and default system settings — same seed content as
/// the previous schema.sql (model makers + heartbeat/demo-limit/admin-handle settings).
/// Tiers and models are admin-configured from the Admin panel, not seeded.
/// </summary>
public static class SeedData
{
    public static void Apply(ModelBuilder b)
    {
        b.Entity<ModelMaker>().HasData(
            new ModelMaker { Id = 1, Name = "OpenAI", Slug = "openai", SortOrder = 10, IsActive = true, CreatedAt = SeedTimestamp, UpdatedAt = SeedTimestamp },
            new ModelMaker { Id = 2, Name = "Anthropic", Slug = "anthropic", SortOrder = 20, IsActive = true, CreatedAt = SeedTimestamp, UpdatedAt = SeedTimestamp },
            new ModelMaker { Id = 3, Name = "Google", Slug = "google", SortOrder = 30, IsActive = true, CreatedAt = SeedTimestamp, UpdatedAt = SeedTimestamp },
            new ModelMaker { Id = 4, Name = "Meta", Slug = "meta", SortOrder = 40, IsActive = true, CreatedAt = SeedTimestamp, UpdatedAt = SeedTimestamp },
            new ModelMaker { Id = 5, Name = "Mistral AI", Slug = "mistral-ai", SortOrder = 50, IsActive = true, CreatedAt = SeedTimestamp, UpdatedAt = SeedTimestamp }
        );

        b.Entity<SystemSetting>().HasData(
            new SystemSetting { Id = 1, SettingKey = "default_signup_tier", SettingValue = "Free", Description = "Name of the default tier assigned to new users on signup", IsActive = true, UpdatedAt = SeedTimestamp },
            new SystemSetting { Id = 2, SettingKey = "demo_requests_per_day", SettingValue = "20", Description = "Max demo key requests per day", IsActive = true, UpdatedAt = SeedTimestamp },
            new SystemSetting { Id = 3, SettingKey = "demo_context_cap", SettingValue = "33000", Description = "Max context tokens for demo key users", IsActive = true, UpdatedAt = SeedTimestamp },
            new SystemSetting { Id = 4, SettingKey = "heartbeat_interval_seconds", SettingValue = "15", Description = "SSE heartbeat interval while request is queued", IsActive = true, UpdatedAt = SeedTimestamp },
            new SystemSetting { Id = 5, SettingKey = "batch_discount_rate", SettingValue = "0.5", Description = "Default batch request discount (0.5 = 50% off)", IsActive = true, UpdatedAt = SeedTimestamp },
            new SystemSetting { Id = 6, SettingKey = "admin_github_handles", SettingValue = "vendouple", Description = "Comma-separated GitHub usernames with admin role", IsActive = true, UpdatedAt = SeedTimestamp }
        );
    }

    // EF Core HasData seed values must be static/deterministic (no DateTime.Now) so migrations are reproducible.
    private static readonly DateTime SeedTimestamp = new(2026, 7, 20, 0, 0, 0, DateTimeKind.Utc);
}
