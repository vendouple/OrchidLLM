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
