using System.ComponentModel.DataAnnotations;

namespace OrchidLLM.Web.Data.Entities;

/// <summary>
/// Per-model, per-context-tier compression config — lives on the model detail card only
/// (never in Settings), matching the demo's fully-built compression UI in users.js.
/// </summary>
public class UserCompressionSetting
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int ModelId { get; set; }
    public Model? Model { get; set; }

    public int TierIndex { get; set; } // 1,2,3 matching context tier

    public bool Enabled { get; set; }

    public int? CompressionModelId { get; set; }
    public Model? CompressionModel { get; set; }

    public string? BasePromptLocked { get; set; } // admin-set, read-only to user
    public string? SystemPromptAppend { get; set; }
}

public class UserContextTierPreference
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int ModelId { get; set; }
    public Model? Model { get; set; }

    public int TierIndex { get; set; }

    [MaxLength(20)]
    public string Behaviour { get; set; } = "allow"; // allow|compress|error
}
