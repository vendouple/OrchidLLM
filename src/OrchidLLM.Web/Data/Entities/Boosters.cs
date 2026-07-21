using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

public class BoosterPack
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Column(TypeName = "json")]
    public string EligibleTiers { get; set; } = "[]"; // JSON array of tier IDs; empty = all

    public decimal PriceIdr { get; set; }
    public decimal PriceUsd { get; set; }
    public int CreditsStandard { get; set; }
    public int CreditsFast { get; set; }
    public int QueuePriorityStandard { get; set; }
    public int QueuePriorityFast { get; set; }

    [MaxLength(50)]
    public string ModelAccessTier { get; set; } = "free";

    [Column(TypeName = "json")]
    public string ContextUnlockTiers { get; set; } = "[]";

    // No duration/permanent fields by design (plan v3.1.2 correction): pack credits never
    // expire after purchase, only IgnorePlanLock governs invalidation on plan downgrade.
    public bool IgnorePlanLock { get; set; }
    public int MaxPurchasesPerUser { get; set; } = -1;
    public int MaxTotalPurchases { get; set; } = -1;

    public DateTime? AvailableFrom { get; set; }
    public DateTime? AvailableUntil { get; set; }

    // Storefront UI metadata
    [MaxLength(100)]
    public string? BadgeText { get; set; }

    [MaxLength(9)]
    public string? GradientStart { get; set; }

    [MaxLength(9)]
    public string? GradientEnd { get; set; }

    public bool IsFeatured { get; set; }
    public int DisplayOrder { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }

    public ICollection<BoosterPackWallet> Wallets { get; set; } = new List<BoosterPackWallet>();
    public ICollection<BoosterPackTargetingRule> TargetingRules { get; set; } = new List<BoosterPackTargetingRule>();
}

/// <summary>
/// Split-Fuel wallets: a single pack purchase can provision multiple separate credit
/// wallets with independent priority/model-access (plan §12). A single-wallet pack is
/// just one child row.
/// </summary>
public class BoosterPackWallet
{
    public int Id { get; set; }

    public int PackId { get; set; }
    public BoosterPack? Pack { get; set; }

    [MaxLength(50)]
    public string Label { get; set; } = string.Empty; // e.g. "Fast", "Standard"

    public int CreditsAmount { get; set; }
    public int QueuePriority { get; set; }

    [MaxLength(50)]
    public string ModelAccessTier { get; set; } = "free";

    [Column(TypeName = "json")]
    public string? ContextUnlockTiers { get; set; }
}

/// <summary>
/// Personalization/targeting rules controlling which users see a pack (plan §12).
/// </summary>
public class BoosterPackTargetingRule
{
    public int Id { get; set; }

    public int PackId { get; set; }
    public BoosterPack? Pack { get; set; }

    [MaxLength(30)]
    public string RuleType { get; set; } = string.Empty; // activity|tenure|churn_risk|financial|new_subscriber

    [MaxLength(10)]
    public string Operator { get; set; } = "gt"; // gt|lt|gte|lte|eq|between

    public double ValueA { get; set; }
    public double? ValueB { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "days"; // days|months|idr|usd|requests|purchases

    [MaxLength(20)]
    public string? TimeframeType { get; set; } // lifetime|rolling|fixed|null

    public DateTime? TimeframeStart { get; set; }
    public DateTime? TimeframeEnd { get; set; }

    public int LogicGroup { get; set; }
}

public class UserBoosterPack
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int PackId { get; set; }
    public BoosterPack? Pack { get; set; }

    public DateTime PurchasedAt { get; set; }
    // No ExpiresAt: pack credits do not expire after purchase (plan v3.1.2) — only
    // plan-lock invalidation (IsActive/InvalidatedAt below) can remove them unspent.

    public int CreditsStandardRemaining { get; set; }
    public int CreditsFastRemaining { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime? InvalidatedAt { get; set; }

    [MaxLength(200)]
    public string? InvalidationReason { get; set; }
}
