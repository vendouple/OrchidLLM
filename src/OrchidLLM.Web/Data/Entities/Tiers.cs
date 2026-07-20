using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

public class SubscriptionTier
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? DisplayColorToken { get; set; }

    public int SortOrder { get; set; }

    // Pricing
    public decimal PriceIdrMonthly { get; set; }
    public decimal PriceUsdMonthly { get; set; }
    public decimal PriceIdrYearly { get; set; }
    public decimal PriceUsdYearly { get; set; }

    // Credits
    public int CreditsStandardMonthly { get; set; }
    public int CreditsFastMonthly { get; set; }

    // Queue priority
    public int QueuePriorityStandard { get; set; }
    public int QueuePriorityFast { get; set; }
    public int QueuePriorityExhausted { get; set; }

    // Rate limits (per-user RPM — distinct from the per-channel RPM added for Channels admin UI)
    public int RpmNormal { get; set; } = 3;
    public int RpmExhausted { get; set; }

    // Concurrency (per-user concurrent in-flight requests — distinct from per-channel concurrency)
    public int MaxConcurrentRequests { get; set; } = 1;
    public int MaxConcurrentExhausted { get; set; }

    // Batch (cosmetic tier perk for Phase 1 — see plan: real batch backend is a later phase)
    public int BatchQueueSlots { get; set; }

    // API keys
    public int MaxApiKeys { get; set; } = 1;

    // Rollover
    public bool SupportsRollover { get; set; }
    public double RolloverPercentage { get; set; }
    public int RolloverMaxCap { get; set; }

    // Features
    public bool SupportsCompression { get; set; }
    public bool StrictParamsOption { get; set; }

    // Model access
    [MaxLength(50)]
    public string ModelAccessTier { get; set; } = "free";

    // Billing cycles
    public bool SupportsMonthlyBilling { get; set; } = true;
    public bool SupportsYearlyBilling { get; set; }

    // Exhaustion behaviour
    [MaxLength(50)]
    public string ExhaustionModelAccess { get; set; } = "locked";

    [MaxLength(50)]
    public string ExhaustionContextLock { get; set; } = "lock_to_base";

    public bool ExhaustionBatchAccess { get; set; }

    [MaxLength(500)]
    public string? ExhaustionMessage { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<SubscriptionTierBillingOption> BillingOptions { get; set; } = new List<SubscriptionTierBillingOption>();
}

public class SubscriptionTierBillingOption
{
    public int Id { get; set; }

    public int TierId { get; set; }
    public SubscriptionTier? Tier { get; set; }

    [MaxLength(20)]
    public string Cycle { get; set; } = "monthly"; // monthly|yearly|lifetime

    public bool IsAvailable { get; set; } = true;
    public double DiscountPercentage { get; set; }
    public DateTime? DiscountExpiresAt { get; set; }
}
