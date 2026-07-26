using System.ComponentModel.DataAnnotations;

namespace OrchidLLM.Web.Data.Entities;

/// <summary>
/// One-time next-billing-cycle offer (plan §13) — a discount, credit bonus, or both, applied
/// exactly once to the user's upcoming cycle. Multi-cycle offers are intentionally unsupported;
/// only one active (unused) offer per user at a time, enforced in the billing service.
/// </summary>
public class UserNextCycleOffer
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    [MaxLength(20)]
    public string OfferType { get; set; } = "discount"; // discount|credit_bonus|both

    /// <summary>0.20 = 20% off. Null when OfferType = credit_bonus.</summary>
    public double? DiscountPercentage { get; set; }

    /// <summary>Added to the next cycle's credit grant. Null when OfferType = discount.</summary>
    public int? BonusCredits { get; set; }

    [MaxLength(20)]
    public string? BonusCreditType { get; set; } // standard|fast|null

    [MaxLength(500)]
    public string Message { get; set; } = string.Empty; // shown in dashboard banner/modal

    /// <summary>The specific billing cycle start date this offer applies to.</summary>
    public DateOnly AppliesToCycle { get; set; }

    /// <summary>Flipped once the cycle processes; record kept for audit, no further effect.</summary>
    public bool IsUsed { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Admin who issued it manually; null = system-generated (targeting engine).</summary>
    public int? CreatedBy { get; set; }
    public User? CreatedByUser { get; set; }
}

/// <summary>
/// Churn-prevention save offer shown during the cancellation flow, bracketed by subscription
/// tenure (mirrors Frontend-DEMO's RETENTION_OFFERS_SEED / admin Settings → Retention Offers).
/// Longer-tenured users match the highest MinTenureMonths bracket they qualify for.
/// </summary>
public class RetentionOffer
{
    public int Id { get; set; }

    public int MinTenureMonths { get; set; }

    /// <summary>0.30 = 30% off next billing cycle if the user accepts the save offer.</summary>
    public double DiscountPercent { get; set; }

    /// <summary>Instant bonus credits granted if the user keeps the subscription.</summary>
    public int BonusCredits { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; }
}
