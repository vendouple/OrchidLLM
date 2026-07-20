using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

/// <summary>30-day retention. User-visible activity (never shows provider/routing detail).</summary>
public class RequestLog
{
    public int Id { get; set; }

    public int? UserId { get; set; }
    public User? User { get; set; }

    public int? ApiKeyId { get; set; }
    public int? ModelId { get; set; }
    public int? ProviderId { get; set; }

    [MaxLength(100)]
    public string Endpoint { get; set; } = string.Empty;

    [MaxLength(10)]
    public string Status { get; set; } = "success"; // success|fail

    public int CreditsCharged { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>15-day retention. Admin-only full routing detail — key refs obfuscated, never plaintext.</summary>
public class RoutingLog
{
    public int Id { get; set; }

    [MaxLength(80)]
    public string? RequestId { get; set; }

    public int? UserId { get; set; }
    public User? User { get; set; }

    [MaxLength(64)]
    public string? KeyRefHash { get; set; }

    [Column(TypeName = "json")]
    public string? ProvidersAttempted { get; set; } // JSON array of obfuscated route references

    [Column(TypeName = "json")]
    public string? ParamsStripped { get; set; }

    public int? FinalProviderId { get; set; }

    [MaxLength(200)]
    public string? RoutingReason { get; set; }

    public int? QueueWaitMs { get; set; }
    public int? TtftMs { get; set; }

    public DateTime CreatedAt { get; set; }
}

public class AdminSqlQueryLog
{
    public int Id { get; set; }

    public int? AdminUserId { get; set; }
    public User? AdminUser { get; set; }

    public string QueryText { get; set; } = string.Empty;
    public bool DestructiveOverride { get; set; }
    public int RowCount { get; set; }
    public int DurationMs { get; set; }
    public DateTime ExecutedAt { get; set; }
}
