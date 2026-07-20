using System.ComponentModel.DataAnnotations;

namespace OrchidLLM.Web.Data.Entities;

/// <summary>
/// Backing table for QueueWorkerService's poll loop and the Admin "Queue" section.
/// </summary>
public class RequestQueueItem
{
    [Key]
    [MaxLength(80)]
    public string Id { get; set; } = string.Empty;

    public int? UserId { get; set; }
    public User? User { get; set; }

    public int? ApiKeyId { get; set; }
    public int? ModelId { get; set; }
    public int? ProviderId { get; set; }

    public int Priority { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending"; // pending|in_flight|completed|failed

    [MaxLength(500)]
    public string? PayloadRef { get; set; }

    public int ReservedCredits { get; set; }
    public int? ActualCredits { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? DispatchedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>
/// Schema scaffolded per plan §14 — real batch submission/processing backend is a
/// later phase (Phase 1 only needs subscription_tiers.BatchQueueSlots to exist as a number).
/// </summary>
public class BatchRequest
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int? ApiKeyId { get; set; }
    public int? ModelId { get; set; }

    [MaxLength(200)]
    public string? ProviderBatchJobId { get; set; }

    public string? Payload { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "pending"; // pending|submitted|polling|completed|failed

    public int QueuePriority { get; set; }
    public double DiscountRate { get; set; } = 0.5;
    public int ReservedCredits { get; set; }
    public int? ActualCreditsCharged { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? ResponsePayload { get; set; }
}
