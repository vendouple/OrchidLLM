using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Data;

public class OrchidDbContext(DbContextOptions<OrchidDbContext> options) : DbContext(options)
{
    public DbSet<SubscriptionTier> SubscriptionTiers => Set<SubscriptionTier>();
    public DbSet<SubscriptionTierBillingOption> SubscriptionTierBillingOptions => Set<SubscriptionTierBillingOption>();

    public DbSet<User> Users => Set<User>();
    public DbSet<UserAuthProvider> UserAuthProviders => Set<UserAuthProvider>();
    public DbSet<UserSubscription> UserSubscriptions => Set<UserSubscription>();

    public DbSet<UserCredit> UserCredits => Set<UserCredit>();
    public DbSet<UserCreditLedger> UserCreditLedgers => Set<UserCreditLedger>();

    public DbSet<BoosterPack> BoosterPacks => Set<BoosterPack>();
    public DbSet<BoosterPackWallet> BoosterPackWallets => Set<BoosterPackWallet>();
    public DbSet<BoosterPackTargetingRule> BoosterPackTargetingRules => Set<BoosterPackTargetingRule>();
    public DbSet<UserBoosterPack> UserBoosterPacks => Set<UserBoosterPack>();

    public DbSet<Provider> Providers => Set<Provider>();
    public DbSet<ModelMaker> ModelMakers => Set<ModelMaker>();
    public DbSet<Model> Models => Set<Model>();
    public DbSet<ModelProvider> ModelProviders => Set<ModelProvider>();
    public DbSet<ModelTokenMultiplier> ModelTokenMultipliers => Set<ModelTokenMultiplier>();

    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<DemoKey> DemoKeys => Set<DemoKey>();

    public DbSet<RequestQueueItem> RequestQueueItems => Set<RequestQueueItem>();
    public DbSet<BatchRequest> BatchRequests => Set<BatchRequest>();

    public DbSet<UserCompressionSetting> UserCompressionSettings => Set<UserCompressionSetting>();
    public DbSet<UserContextTierPreference> UserContextTierPreferences => Set<UserContextTierPreference>();

    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<AdminNotification> AdminNotifications => Set<AdminNotification>();
    public DbSet<UserDismissedAnnouncement> UserDismissedAnnouncements => Set<UserDismissedAnnouncement>();

    public DbSet<RequestLog> RequestLogs => Set<RequestLog>();
    public DbSet<RoutingLog> RoutingLogs => Set<RoutingLog>();
    public DbSet<AdminSqlQueryLog> AdminSqlQueryLogs => Set<AdminSqlQueryLog>();

    public DbSet<ReferralTransaction> ReferralTransactions => Set<ReferralTransaction>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // ---- Unique constraints ----
        b.Entity<SubscriptionTier>().HasIndex(x => x.Name).IsUnique();
        b.Entity<SubscriptionTierBillingOption>().HasIndex(x => new { x.TierId, x.Cycle }).IsUnique();

        b.Entity<User>().HasIndex(x => x.Username).IsUnique();
        b.Entity<User>().HasIndex(x => x.ReferralCode).IsUnique();
        b.Entity<UserAuthProvider>().HasIndex(x => new { x.Provider, x.ProviderUserId }).IsUnique();
        b.Entity<UserSubscription>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<UserCredit>().HasIndex(x => x.UserId).IsUnique();

        b.Entity<Provider>().HasIndex(x => x.Name).IsUnique();
        b.Entity<ModelMaker>().HasIndex(x => x.Slug).IsUnique();
        b.Entity<Model>().HasIndex(x => x.ModelSlug).IsUnique();
        b.Entity<ModelProvider>().HasIndex(x => new { x.ModelId, x.ProviderId }).IsUnique();

        b.Entity<ApiKey>().HasIndex(x => x.KeyHash).IsUnique();

        b.Entity<UserCompressionSetting>().HasIndex(x => new { x.UserId, x.ModelId, x.TierIndex }).IsUnique();
        b.Entity<UserContextTierPreference>().HasIndex(x => new { x.UserId, x.ModelId, x.TierIndex }).IsUnique();
        b.Entity<UserDismissedAnnouncement>().HasIndex(x => new { x.UserId, x.AnnouncementId }).IsUnique();

        b.Entity<SystemSetting>().HasIndex(x => x.SettingKey).IsUnique();

        // ---- Query-pattern indexes ----
        b.Entity<RequestQueueItem>().HasIndex(x => new { x.Status, x.Priority, x.CreatedAt });
        b.Entity<RequestLog>().HasIndex(x => new { x.UserId, x.CreatedAt });
        b.Entity<RoutingLog>().HasIndex(x => x.CreatedAt);
        b.Entity<UserCreditLedger>().HasIndex(x => new { x.UserId, x.CreatedAt });

        // ---- Decimal precision (money) ----
        foreach (var prop in new[] { nameof(SubscriptionTier.PriceIdrMonthly), nameof(SubscriptionTier.PriceUsdMonthly), nameof(SubscriptionTier.PriceIdrYearly), nameof(SubscriptionTier.PriceUsdYearly) })
            b.Entity<SubscriptionTier>().Property(prop).HasColumnType("decimal(14,2)");
        b.Entity<BoosterPack>().Property(x => x.PriceIdr).HasColumnType("decimal(14,2)");
        b.Entity<BoosterPack>().Property(x => x.PriceUsd).HasColumnType("decimal(14,2)");

        // ---- Relationships needing explicit delete-behavior (avoid multiple-cascade-path errors) ----
        b.Entity<User>()
            .HasOne(x => x.Referrer)
            .WithMany()
            .HasForeignKey(x => x.ReferredBy)
            .OnDelete(DeleteBehavior.Restrict);

        b.Entity<UserAuthProvider>()
            .HasOne(x => x.User).WithMany(x => x.AuthProviders)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<UserSubscription>()
            .HasOne(x => x.User).WithOne(x => x.Subscription)
            .HasForeignKey<UserSubscription>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<UserSubscription>()
            .HasOne(x => x.Tier).WithMany()
            .HasForeignKey(x => x.TierId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<UserSubscription>()
            .HasOne(x => x.PendingTier).WithMany()
            .HasForeignKey(x => x.PendingTierId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<UserCredit>()
            .HasOne(x => x.User).WithOne(x => x.Credits)
            .HasForeignKey<UserCredit>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<ReferralTransaction>()
            .HasOne(x => x.ReferrerUser).WithMany()
            .HasForeignKey(x => x.ReferrerUserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ReferralTransaction>()
            .HasOne(x => x.ReferredUser).WithMany()
            .HasForeignKey(x => x.ReferredUserId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<Announcement>()
            .HasOne(x => x.RelatedAnnouncement).WithMany()
            .HasForeignKey(x => x.RelatedAnnouncementId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<AdminNotification>()
            .HasOne(x => x.ReadByUser).WithMany()
            .HasForeignKey(x => x.ReadBy).OnDelete(DeleteBehavior.SetNull);

        b.Entity<SystemSetting>()
            .HasOne(x => x.UpdatedByUser).WithMany()
            .HasForeignKey(x => x.UpdatedBy).OnDelete(DeleteBehavior.SetNull);

        b.Entity<RequestQueueItem>()
            .HasOne(x => x.User).WithMany()
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<RequestLog>()
            .HasOne(x => x.User).WithMany()
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<RoutingLog>()
            .HasOne(x => x.User).WithMany()
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<AdminSqlQueryLog>()
            .HasOne(x => x.AdminUser).WithMany()
            .HasForeignKey(x => x.AdminUserId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<BoosterPack>()
            .HasOne(x => x.PermanentBaseTier).WithMany()
            .HasForeignKey(x => x.PermanentBaseTierId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<UserCompressionSetting>()
            .HasOne(x => x.CompressionModel).WithMany()
            .HasForeignKey(x => x.CompressionModelId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<UserCompressionSetting>()
            .HasOne(x => x.Model).WithMany()
            .HasForeignKey(x => x.ModelId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<UserContextTierPreference>()
            .HasOne(x => x.Model).WithMany()
            .HasForeignKey(x => x.ModelId).OnDelete(DeleteBehavior.Restrict);

        SeedData.Apply(b);
    }
}
