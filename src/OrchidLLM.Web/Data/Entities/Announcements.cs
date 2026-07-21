using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

public class Announcement
{
    public int Id { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    /// <summary>Shorter title for the banner strip; falls back to <see cref="Title"/> when null.</summary>
    [MaxLength(255)]
    public string? BannerTitle { get; set; }

    public string? Description { get; set; }

    [MaxLength(20)]
    public string Type { get; set; } = "announcement"; // announcement|changelog|both

    [MaxLength(20)]
    public string Tone { get; set; } = "info"; // info|warning|error|success|neutral|changelog

    [MaxLength(100)]
    public string? VersionTag { get; set; }

    public int? RelatedAnnouncementId { get; set; }
    public Announcement? RelatedAnnouncement { get; set; }

    public bool IsBanner { get; set; }

    /// <summary>true = user can dismiss the banner themselves; false = persists until admin acts (plan §21).</summary>
    public bool IsBannerDismissible { get; set; } = true;

    /// <summary>When reached, the entry soft-disappears from banner and user-facing views. Null = stays until IsActive=false.</summary>
    public DateTime? ExpiresAt { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>Original publish time; never changed on edit.</summary>
    public DateTime PostedAt { get; set; }

    /// <summary>Set on every subsequent admin edit; null if never edited since posting.</summary>
    public DateTime? LastEditedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public int? CreatedBy { get; set; }
    public User? CreatedByUser { get; set; }
}

public class AdminNotification
{
    public int Id { get; set; }

    [MaxLength(50)]
    public string Type { get; set; } = "system"; // system|provider|billing|security|routing|user

    [MaxLength(20)]
    public string Severity { get; set; } = "info"; // info|warning|error|critical

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    public string? Message { get; set; }

    [MaxLength(50)]
    public string? EntityType { get; set; }

    [MaxLength(100)]
    public string? EntityId { get; set; }

    [Column(TypeName = "json")]
    public string Metadata { get; set; } = "{}";

    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public int? ReadBy { get; set; }
    public User? ReadByUser { get; set; }

    public DateTime CreatedAt { get; set; }
}

/// <summary>Banner dismissals only — the Announcements page itself is never user-dismissible (plan §21).</summary>
public class UserDismissedBanner
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int AnnouncementId { get; set; }
    public Announcement? Announcement { get; set; }

    public DateTime DismissedAt { get; set; }
}

/// <summary>Read-state, written on click from banner, bell list, or the Announcements page — counts equally.</summary>
public class UserReadAnnouncement
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int AnnouncementId { get; set; }
    public Announcement? Announcement { get; set; }

    public DateTime ReadAt { get; set; }
}
