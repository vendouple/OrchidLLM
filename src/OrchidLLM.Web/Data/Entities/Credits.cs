using System.ComponentModel.DataAnnotations;

namespace OrchidLLM.Web.Data.Entities;

public class UserCredit
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public int CreditsStandard { get; set; }
    public int CreditsFast { get; set; }
    public int CreditsRollover { get; set; }
    public int CreditsReserved { get; set; }

    public DateTime LastUpdated { get; set; }
}

public class UserCreditLedger
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    [MaxLength(30)]
    public string Source { get; set; } = string.Empty; // sub|booster|rollover|reservation|reconcile|expiry|admin

    public int Amount { get; set; }
    public int BalanceAfter { get; set; }

    [MaxLength(100)]
    public string? ReferenceId { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }
}
