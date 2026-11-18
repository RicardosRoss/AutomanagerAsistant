# Core Completion And Optional Rewards

Goal: A completed focus task advances its CTDP chain and allows the next task even when optional cultivation rewards fail or wait for recovery.

Functional requirements:

- Core confirmation, trusted minutes, User statistics, MainChain node and reminder cleanup keep their existing recovery contracts.
- A new successful confirmation records a durable reward intent with its core statistics, exactly once per task. Core completion does not call or wait for reward calculation.
- Reward assets settle in the User intent order. Paid Task projection repair can run independently of unpaid intents. The existing 60-minute power threshold, multipliers, encounter rules, focus attainment, divination buffs and inventory effects remain intact.
- An unpaid intent preserves the legacy focus baseline so later core statistics and read-only cultivation views cannot bootstrap an extra reward streak.
- Each intent's baseline becomes authoritative only when it reaches the head and canonical state still needs legacy seed normalization. A malformed head blocks that account's rewards for audit; other accounts and core tasks continue. `/realm` exposes the pending count.
- Rewards and completed reward receipts still commit together in one versioned User save. The paid intent is removed in that same commit; projection repair never replays assets.
- Expired leases allow live-worker takeover. User version fencing and Task reward tokens reject stale writes; no wall-clock bound on database I/O is assumed. A failed replacement can defer recovery until its lease expires and a later recovery cycle runs.
- Cultivation mutations wait for prior focus rewards; core task creation/completion never waits for those optional mutations. Read-only cultivation status and resolving an existing encounter offer remain available.
- A pending offer pauses later rewards instead of silently replacing the player's choice; status provides the original offer actions.
- Reuse the existing Bull maintenance queue with a separate reward processor/repeat job. Startup core reconciliation does not await cultivation recovery.
- Core node projection can recover after a committed Task result, including process exit before MainChain save.
- New confirmations use an explicit reward protocol version. Missing historical reward intent is not evidence of unpaid assets and must not be replayed automatically.

Non-functional requirements:

- Single PM2 fork worker; versioned User receipts and Task owner filters remain authoritative. No new database topology or dependency.
- No native application timers. Preserve `.env`, historical data, backups and unrelated worktree changes.
- No commit or push. Deploy only after full validation, independent MongoDB 8.0.4 rehearsal and stopped-worker document/index audit.

Acceptance criteria:

- A failing or paused award function cannot delay core completion or the next CTDP start.
- Deferred awards for two tasks produce the original focus streak/attainment and one receipt each; a core break does not get reversed by reward recovery.
- Crash/response-loss recovery leaves one core result and one reward effect. Legacy unknown entries are not awarded.
- Pending game commands cannot reorder effects or create phantom histories. Pending offers can be resolved without deadlocking recovery.
- Core success uses focus language and next-task controls. Optional payout notifications do not rerun completion; authoritative balances remain viewable if a notification is lost.
- Both maintenance job kinds recover uniquely after Redis data loss; reward failure does not stop core polling or startup.

Non-goals: arbitrary external writers, multiple simultaneous polling workers, global exactly-once Telegram delivery, historical asset recalculation or receipt pruning.

Authority: `论自控力.md`, CTDP Main Chain steps 2-3. Reward failure is absent from the core success definition; existing cultivation values are preserved as an optional subsystem.
