using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OrchidLLM.Web.Data.Entities;

public class Announcement
{
    public int Id { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

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
    public DateTime? BannerExpiresAt { get; set; }
    public bool IsActive { get; set; } = true;

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

public class UserDismissedAnnouncement
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int AnnouncementId { get; set; }
    public Announcement? Announcement { get; set; }

    public DateTime DismissedAt { get; set; }
}
