using System.ComponentModel.DataAnnotations;

namespace OrchidLLM.Web.Data.Entities;

public class User
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    [MaxLength(255)]
    public string? Email { get; set; }

    [MaxLength(500)]
    public string? AvatarUrl { get; set; }

    [MaxLength(20)]
    public string Role { get; set; } = "user"; // user|admin

    public bool StrictParams { get; set; }

    // Referral
    public int? ReferredBy { get; set; }
    public User? Referrer { get; set; }

    [MaxLength(32)]
    public string? ReferralCode { get; set; }

    // Notification preferences (JSON)
    public string NotificationPrefs { get; set; } = "{\"billing\":true,\"announcements\":true,\"newsletter\":false}";

    // Soft delete
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public DateTime? DeletionScheduledAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<UserAuthProvider> AuthProviders { get; set; } = new List<UserAuthProvider>();
    public UserSubscription? Subscription { get; set; }
    public UserCredit? Credits { get; set; }
}

public class UserAuthProvider
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    [MaxLength(20)]
    public string Provider { get; set; } = "github"; // github|google

    [MaxLength(100)]
    public string ProviderUserId { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? Email { get; set; }

    public DateTime LinkedAt { get; set; }
}

public class UserSubscription
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int TierId { get; set; }
    public SubscriptionTier? Tier { get; set; }

    [MaxLength(30)]
    public string Status { get; set; } = "active"; // active|cancelled|expired|pending_upgrade

    [MaxLength(20)]
    public string BillingCycle { get; set; } = "monthly";

    [MaxLength(10)]
    public string Currency { get; set; } = "IDR";

    public DateTime CurrentPeriodStart { get; set; }
    public DateTime? CurrentPeriodEnd { get; set; }

    public int? PendingTierId { get; set; }
    public SubscriptionTier? PendingTier { get; set; }

    public DateTime CreatedAt { get; set; }
}
