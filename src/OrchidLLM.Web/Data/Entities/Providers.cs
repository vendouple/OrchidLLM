using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

/// <summary>
/// A "Channel" in the admin UI — an upstream LLM API endpoint/aggregator (OpenRouter,
/// Together AI, etc.). Never exposed to end users by name (see Provider Obfuscation Policy).
/// </summary>
public class Provider
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string BaseUrl { get; set; } = string.Empty;

    [MaxLength(30)]
    public string AuthType { get; set; } = "bearer";

    [MaxLength(30)]
    public string Status { get; set; } = "active"; // active|rate_limited|out_of_credits|dead|disabled

    public DateTime? RateLimitUntil { get; set; }

    /// <summary>
    /// Backend safety cap only — the router still enforces CurrentInFlight &lt; MaxConcurrent.
    /// No longer the headline stat on the Channels grid/dashboard health list; that's RPM now.
    /// </summary>
    public int MaxConcurrent { get; set; } = 20;

    /// <summary>
    /// Live in-flight count. Tracked in Redis at runtime, not persisted — this column exists
    /// only as a fallback/inspection value.
    /// </summary>
    [NotMapped]
    public int CurrentInFlight { get; set; }

    /// <summary>
    /// Admin-configurable RPM ceiling for this channel (optional). The live current RPM is a
    /// Redis rolling counter (channel:rpm:{providerId}, 60s window) — this is just the cap.
    /// This is the field added for the Channels "concurrent -> RPM" UI change.
    /// </summary>
    public int? RpmCap { get; set; }

    public bool Free { get; set; }

    public int Weight { get; set; } = 10;

    [Column(TypeName = "json")]
    public string? Modalities { get; set; } // JSON { text: [...], image: [...], ... }

    [Column(TypeName = "json")]
    public string? ErrorAliasOverrides { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ModelProvider> ModelProviders { get; set; } = new List<ModelProvider>();
    public ICollection<ProviderKey> Keys { get; set; } = new List<ProviderKey>();
}

/// <summary>
/// One upstream API key in a channel's rotation pool. Keys are configured via the admin
/// Channels UI and stored encrypted at rest — this is the new direction replacing the
/// original .env-only key model (plan §6/§25 are aspirational on this point now).
/// </summary>
public class ProviderKey
{
    public int Id { get; set; }

    public int ProviderId { get; set; }
    public Provider? Provider { get; set; }

    /// <summary>AES-GCM ciphertext (base64), decrypted only at dispatch time via IProviderKeyCipher.</summary>
    public string KeyCipher { get; set; } = string.Empty;

    /// <summary>Masked display value, e.g. "sk-or-v1-a3f8...k2x1" — never the full key.</summary>
    [MaxLength(60)]
    public string KeyPreview { get; set; } = string.Empty;

    [MaxLength(20)]
    public string Status { get; set; } = "healthy"; // healthy|rate_limited|down

    public DateTime? RateLimitUntil { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Visible model lab/maker (OpenAI, Anthropic, Google, ...) — never a routing provider.
/// </summary>
public class ModelMaker
{
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Slug { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? IconUrl { get; set; }

    public string? Description { get; set; }

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Model
{
    public int Id { get; set; }

    [MaxLength(255)]
    public string DisplayName { get; set; } = string.Empty;

    public int? ModelMakerId { get; set; }
    public ModelMaker? ModelMaker { get; set; }

    [MaxLength(255)]
    public string ModelSlug { get; set; } = string.Empty;

    [MaxLength(30)]
    public string AccessTier { get; set; } = "free"; // demo|free|standard|premium|premium+|max|elite|admin

    [MaxLength(30)]
    public string Modality { get; set; } = "text"; // text|image|audio|video|music|multimodal

    [Column(TypeName = "json")]
    public string ContextWindowTiers { get; set; } = "[]"; // [{tokens, required_plan}]

    public bool SupportsStreaming { get; set; } = true;
    public bool SupportsVision { get; set; }
    public bool SupportsReasoning { get; set; }
    public bool SupportsSearch { get; set; }
    public bool SupportsCaching { get; set; }
    public bool SupportsFunctionCalling { get; set; }
    public int? MaxOutputTokens { get; set; }

    public string? PublicDescription { get; set; }
    public DateTime? DeprecationDate { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ModelProvider> Providers { get; set; } = new List<ModelProvider>();
    public ICollection<ModelTokenMultiplier> TokenMultipliers { get; set; } = new List<ModelTokenMultiplier>();
}

/// <summary>Maps a model to an upstream provider with routing metadata.</summary>
public class ModelProvider
{
    public int Id { get; set; }

    public int ModelId { get; set; }
    public Model? Model { get; set; }

    public int ProviderId { get; set; }
    public Provider? Provider { get; set; }

    [MaxLength(255)]
    public string ProviderModelId { get; set; } = string.Empty;

    // Lower = tried first (mirrors Provider.Weight's "lower = better" convention, chosen
    // over the plan's "higher = faster" wording since that's what the shipped Channels
    // UI and Frontend-DEMO both already use — see IMPLEMENTATION_CHECKLIST.md §1).
    public int SpeedPriority { get; set; }
    public int? ContextLimit { get; set; }

    [Column(TypeName = "json")]
    public string SupportsParams { get; set; } = "{}";

    public int MaxConcurrent { get; set; } = 5;

    [MaxLength(30)]
    public string Status { get; set; } = "active";

    public DateTime? RateLimitUntil { get; set; }
    public DateTime? LastChecked { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

public class ModelTokenMultiplier
{
    public int Id { get; set; }

    public int ModelId { get; set; }
    public Model? Model { get; set; }

    public int ContextTierMin { get; set; }
    public int? ContextTierMax { get; set; }

    public double MultiplierInput { get; set; } = 1.0;
    public double MultiplierOutput { get; set; } = 1.0;
    public double MultiplierCacheRead { get; set; } = 1.0;
    public double MultiplierCacheWrite { get; set; } = 1.0;

    [MaxLength(500)]
    public string? Notes { get; set; }
}
