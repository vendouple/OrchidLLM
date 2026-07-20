using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

public class ApiKey
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    [MaxLength(64)]
    public string KeyHash { get; set; } = string.Empty; // SHA-256, never store plaintext

    [MaxLength(30)]
    public string KeyPreview { get; set; } = string.Empty; // "sk-orch-abc...xyz"

    [MaxLength(100)]
    public string Label { get; set; } = "My Key";

    public bool IsActive { get; set; } = true;

    public int? CreditLimitTotal { get; set; } // null = unlimited
    public int? CreditLimitDaily { get; set; }

    [MaxLength(20)]
    public string CreditLimitReset { get; set; } = "daily"; // daily|weekly|monthly|never

    public int CreditUsedToday { get; set; }
    public int CreditUsedTotal { get; set; }

    [Column(TypeName = "json")]
    public string? ModelWhitelist { get; set; } // JSON array of model slugs; null = all

    public bool ExposeBalance { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public class DemoKey
{
    [Key]
    [MaxLength(36)]
    public string Id { get; set; } = string.Empty; // UUID = the key itself

    [MaxLength(20)]
    public string Platform { get; set; } = "web_desktop"; // web_desktop|web_mobile

    public int RequestsToday { get; set; }
    public int TotalRequests { get; set; }
    public DateOnly LastRequestDay { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime LastUsedAt { get; set; }
}
