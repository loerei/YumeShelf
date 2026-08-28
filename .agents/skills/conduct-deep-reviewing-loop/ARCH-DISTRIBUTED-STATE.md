# Architectural Subdocument: Distributed State, Consensus & Sagas

## Domain Audit Checklist

### 1. Distributed Consensus & Replication
- [ ] Quorum Requirements: Verify that write operations in consensus protocols (Raft, Paxos) mandate explicit majority quorums ($N/2 + 1$).
- [ ] Leader Election Safety: Ensure lease timers for leader node heartbeats prevent split-brain conditions during transient network delays.

### 2. Distributed Transactions & Saga Pattern
- [ ] Compensating Actions: Verify that every step in an orchestration or choreography saga defines an idempotent, deterministic compensating transaction for failure rollbacks.
- [ ] Forward Recovery vs. Backward Rollback: Ensure state machines explicitly handle partial execution states; verify saga state persistence across coordinator restarts.

### 3. Distributed Locking Mechanics
- [ ] Lock TTL & Fencing Tokens: Confirm all distributed locks (Redis/Redlock, Consul, Zookeeper) use monotonic fencing tokens to invalidate stale writes from stalled lock holders.
- [ ] Non-Atomic Release Guards: Ensure lock releases verify ownership tokens (Lua scripts in Redis) to prevent releasing locks held by other threads.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unfenced Distributed Lock Execution

```python
# BAD: Lock can expire while long_running_task executes.
# A second worker acquires the lock, leading to concurrent execution and data corruption.
def process_work():
    if redis.set("lock:resource", "holder_1", px=5000, nx=True):
        long_running_task() # May take 10 seconds!
        redis.delete("lock:resource") # May delete lock acquired by worker 2!

# GOOD: Use monotonic fencing token and ownership validation script.
def process_work():
    lock_value = str(uuid.uuid4())
    if redis.set("lock:resource", lock_value, px=5000, nx=True):
        try:
            fencing_token = state_store.increment_fencing_token()
            long_running_task(fencing_token)
        finally:
            # Atomic release using Lua
            lua_release = """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """
            redis.eval(lua_release, 1, "lock:resource", lock_value)
```

## Failure Modes & Mitigations

- Split-Brain Concurrent Writes: Require client-side fencing validation at the storage layer; storage must reject incoming writes with lower sequence/fencing numbers.
- Uncompensated Partial Saga Failure: Require durable event logging before executing each saga step; unacknowledged steps must trigger automated recovery workers upon startup.
