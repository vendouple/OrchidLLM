using Microsoft.EntityFrameworkCore;
using OrchidLLM.Web.Data;
using OrchidLLM.Web.Data.Entities;

namespace OrchidLLM.Web.Services.Billing;

/// <summary>
/// Credit reservation + reconciliation (plan §6/§7/§9). Flow per request:
/// estimate → TryReserveAsync (reject before queuing if balance is short) → dispatch →
/// ReconcileAsync on success (charge actuals in depletion order, release the rest) or
/// ReleaseAsync on any failure (zero charge — hard platform rule).
/// Depletion order (§7): booster fast → booster standard → rollover → subscription fast →
/// subscription standard. Booster pools are separate wallets, highest pack fast-priority first.
/// </summary>
public class CreditService(OrchidDbContext db)
{
    /// <summary>
    /// Crude pre-request token estimate (chars/4 + requested max output). Only used to size
    /// the reservation; the real charge comes from reconciliation against provider usage.
    /// </summary>
    public static int EstimateTokens(int promptChars, int? maxOutputTokens)
        => Math.Max(1, promptChars / 4) + (maxOutputTokens ?? 1024);

    /// <summary>
    /// Credit cost from token usage × the model's multiplier row for the context tier the
    /// input size falls into (plan §9). Falls back to 1.0 multipliers when no row matches.
    /// </summary>
    public static int ComputeCost(Model model, int inputTokens, int outputTokens, int cacheReadTokens = 0, int cacheWriteTokens = 0)
    {
        var tierRow = model.TokenMultipliers
            .Where(m => inputTokens >= m.ContextTierMin && (m.ContextTierMax is null || inputTokens < m.ContextTierMax))
            .OrderBy(m => m.ContextTierMin)
            .LastOrDefault();

        double cost =
            inputTokens * (tierRow?.MultiplierInput ?? 1.0) +
            outputTokens * (tierRow?.MultiplierOutput ?? 1.0) +
            cacheReadTokens * (tierRow?.MultiplierCacheRead ?? 1.0) +
            cacheWriteTokens * (tierRow?.MultiplierCacheWrite ?? 1.0);

        return (int)Math.Ceiling(cost);
    }

    /// <summary>Total spendable credits across every pool (subscription + rollover + active boosters), minus reservations.</summary>
    public async Task<int> GetAvailableAsync(int userId)
    {
        var credit = await db.UserCredits.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == userId);
        if (credit is null) return 0;

        var boosterTotal = await db.UserBoosterPacks.AsNoTracking()
            .Where(p => p.UserId == userId && p.IsActive)
            .SumAsync(p => p.CreditsStandardRemaining + p.CreditsFastRemaining);

        return credit.CreditsStandard + credit.CreditsFast + credit.CreditsRollover + boosterTotal - credit.CreditsReserved;
    }

    /// <summary>Reserves the estimate. False = insufficient balance (reject with no charge, plan §7).</summary>
    public async Task<bool> TryReserveAsync(int userId, int amount, string referenceId)
    {
        var credit = await db.UserCredits.FirstOrDefaultAsync(c => c.UserId == userId);
        if (credit is null) return false;

        var available = await GetAvailableAsync(userId);
        if (available < amount) return false;

        credit.CreditsReserved += amount;
        credit.LastUpdated = DateTime.UtcNow;
        AddLedger(userId, "reservation", -amount, credit, referenceId, $"Reserved {amount} for request");
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>Success path: releases the reservation and charges the actual cost in depletion order.</summary>
    public async Task ReconcileAsync(int userId, int reservedAmount, int actualAmount, string referenceId)
    {
        var credit = await db.UserCredits.FirstOrDefaultAsync(c => c.UserId == userId);
        if (credit is null) return;

        credit.CreditsReserved = Math.Max(0, credit.CreditsReserved - reservedAmount);

        var remaining = actualAmount;

        // 1–2. Booster wallets, fast then standard, highest pack fast-priority first (§12 stacking).
        var boosterPacks = await db.UserBoosterPacks
            .Include(p => p.Pack)
            .Where(p => p.UserId == userId && p.IsActive &&
                        (p.CreditsFastRemaining > 0 || p.CreditsStandardRemaining > 0))
            .ToListAsync();

        foreach (var pack in boosterPacks.OrderByDescending(p => p.Pack?.QueuePriorityFast ?? 0))
        {
            if (remaining <= 0) break;
            var take = Math.Min(pack.CreditsFastRemaining, remaining);
            pack.CreditsFastRemaining -= take;
            remaining -= take;
        }
        foreach (var pack in boosterPacks.OrderByDescending(p => p.Pack?.QueuePriorityStandard ?? 0))
        {
            if (remaining <= 0) break;
            var take = Math.Min(pack.CreditsStandardRemaining, remaining);
            pack.CreditsStandardRemaining -= take;
            remaining -= take;
        }

        // 3–5. Rollover → subscription fast → subscription standard.
        var fromRollover = Math.Min(credit.CreditsRollover, remaining);
        credit.CreditsRollover -= fromRollover;
        remaining -= fromRollover;

        var fromFast = Math.Min(credit.CreditsFast, remaining);
        credit.CreditsFast -= fromFast;
        remaining -= fromFast;

        // Standard absorbs whatever is left. Reservation should prevent overdraft; clamp at 0
        // anyway so a mid-flight balance change can never drive the pool negative.
        credit.CreditsStandard = Math.Max(0, credit.CreditsStandard - remaining);

        credit.LastUpdated = DateTime.UtcNow;
        AddLedger(userId, "reconcile", -actualAmount, credit, referenceId,
            $"Charged {actualAmount} (reserved {reservedAmount})");
        await db.SaveChangesAsync();
    }

    /// <summary>Failure path: release the full reservation — zero credits charged, ever (plan §6).</summary>
    public async Task ReleaseAsync(int userId, int reservedAmount, string referenceId)
    {
        var credit = await db.UserCredits.FirstOrDefaultAsync(c => c.UserId == userId);
        if (credit is null) return;

        credit.CreditsReserved = Math.Max(0, credit.CreditsReserved - reservedAmount);
        credit.LastUpdated = DateTime.UtcNow;
        AddLedger(userId, "reconcile", 0, credit, referenceId, $"Released {reservedAmount} (request failed, no charge)");
        await db.SaveChangesAsync();
    }

    private void AddLedger(int userId, string source, int amount, UserCredit credit, string referenceId, string notes)
    {
        db.UserCreditLedgers.Add(new UserCreditLedger
        {
            UserId = userId,
            Source = source,
            Amount = amount,
            BalanceAfter = credit.CreditsStandard + credit.CreditsFast + credit.CreditsRollover,
            ReferenceId = referenceId,
            Notes = notes,
            CreatedAt = DateTime.UtcNow,
        });
    }
}
