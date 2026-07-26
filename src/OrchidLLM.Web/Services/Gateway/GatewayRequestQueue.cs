namespace OrchidLLM.Web.Services.Gateway;

/// <summary>
/// Priority admission queue for gateway requests (plan §4). Higher priority = admitted
/// first; FIFO within the same priority. The waiting HTTP handler holds its connection
/// (SSE heartbeats are sent by the controller while waiting) and is released when a
/// dispatch slot frees up.
///
/// v1 deviation from plan (recorded in IMPLEMENTATION_CHECKLIST §3): the pending set is
/// in-memory rather than a Redis sorted set. Completion signalling needs an in-process
/// handle either way (the HTTP request is parked here), so Redis buys nothing until the
/// app runs multi-instance — revisit then. RequestQueueItem rows still record queue
/// history in MySQL for the admin Queue view.
/// </summary>
public class GatewayRequestQueue(IConfiguration config)
{
    private sealed record Waiter(long Sequence, int Priority, TaskCompletionSource Tcs);

    private readonly Lock _lock = new();
    private readonly List<Waiter> _pending = [];
    private long _sequence;
    private int _inFlight;

    private int MaxConcurrentDispatch => config.GetValue("Orchid:MaxConcurrentDispatch", 50);

    public int PendingCount { get { lock (_lock) return _pending.Count; } }
    public int InFlightCount { get { lock (_lock) return _inFlight; } }

    /// <summary>
    /// Waits for a dispatch slot. Priority -1 is the admin bypass (plan §4): it skips the
    /// queue entirely and does not count against the dispatch cap.
    /// </summary>
    public async Task<QueueSlot> WaitForSlotAsync(int priority, CancellationToken ct)
    {
        if (priority == -1)
            return new QueueSlot(this, counted: false);

        TaskCompletionSource tcs;
        Waiter waiter;
        lock (_lock)
        {
            if (_inFlight < MaxConcurrentDispatch && _pending.Count == 0)
            {
                _inFlight++;
                return new QueueSlot(this, counted: true);
            }

            tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            waiter = new Waiter(_sequence++, priority, tcs);
            _pending.Add(waiter);
        }

        await using var registration = ct.Register(() =>
        {
            bool removed;
            lock (_lock) removed = _pending.Remove(waiter);
            if (removed) tcs.TrySetCanceled(ct);
        });

        await tcs.Task; // throws OperationCanceledException if the client disconnected
        return new QueueSlot(this, counted: true);
    }

    internal void ReleaseSlot(bool counted)
    {
        if (!counted) return;

        Waiter? next = null;
        lock (_lock)
        {
            _inFlight--;
            if (_inFlight < MaxConcurrentDispatch && _pending.Count > 0)
            {
                // Highest priority first, then FIFO by sequence.
                next = _pending.OrderByDescending(w => w.Priority).ThenBy(w => w.Sequence).First();
                _pending.Remove(next);
                _inFlight++;
            }
        }
        next?.Tcs.TrySetResult();
    }
}

/// <summary>Dispose to free the slot (and admit the next queued request).</summary>
public sealed class QueueSlot(GatewayRequestQueue queue, bool counted) : IDisposable
{
    private bool _released;

    public void Dispose()
    {
        if (_released) return;
        _released = true;
        queue.ReleaseSlot(counted);
    }
}
