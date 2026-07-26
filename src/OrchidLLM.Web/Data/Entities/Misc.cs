using System.ComponentModel.DataAnnotations;

namespace OrchidLLM.Web.Data.Entities;

/// <summary>Scaffolded per plan §23 — full affiliate/referral rewards system is a later phase.</summary>
public class ReferralTransaction
{
    public int Id { get; set; }

    public int ReferrerUserId { get; set; }
    public User? ReferrerUser { get; set; }

    public int ReferredUserId { get; set; }
    public User? ReferredUser { get; set; }

    [MaxLength(100)]
    public string? PurchaseId { get; set; }

    public int CreditReward { get; set; }
    public DateTime GrantedAt { get; set; }
}

/// <summary>
/// Global error-label alias (admin Settings → Error Labels in Frontend-DEMO): renames a raw
/// upstream error into the provider-neutral message users see. Per-channel overrides live in
/// Provider.ErrorAliasOverrides and win over these global rows. Consumed by the gateway's
/// error-translation pipeline (plan §6 — no raw provider error text escapes unprocessed).
/// </summary>
public class ErrorLabel
{
    public int Id { get; set; }

    [MaxLength(20)]
    public string MatchType { get; set; } = "code"; // code|regex

    /// <summary>Raw upstream error code or regex to match against.</summary>
    [MaxLength(500)]
    public string Pattern { get; set; } = string.Empty;

    /// <summary>User-facing replacement label.</summary>
    [MaxLength(500)]
    public string Label { get; set; } = string.Empty;

    /// <summary>user_actionable errors surface the label verbatim; internal ones stay generic.</summary>
    [MaxLength(20)]
    public string Category { get; set; } = "internal"; // user_actionable|internal

    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; }
}

public class SystemSetting
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string SettingKey { get; set; } = string.Empty;

    public string? SettingValue { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; }

    public int? UpdatedBy { get; set; }
    public User? UpdatedByUser { get; set; }
}
