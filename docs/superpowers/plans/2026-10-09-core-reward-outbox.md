# Core Reward Outbox Implementation Plan

> For agentic workers: use superpowers:executing-plans in the current authorized repair session; execute sequentially without sub-agents. Track each checkpoint below.

Goal: Save focus success and allow the next task without waiting for optional reward recovery.

Architecture: Core Task/User/Main state retains its existing fenced settlement. User core statistics atomically append an ordered focus-reward intent; a separate Bull processor awards the oldest ready intent through the existing atomic receipt API. Task reward fields are projections, independent of core settlement.

Tech Stack: TypeScript 5.9.3, Mongoose 7.8.7, Bull 4.16.5, Node.js 23.1.0 on VPS, standalone MongoDB 8.0.4.

Spec: `docs/superpowers/plans/2026-10-09-core-reward-spec.md`

## Global Constraints

- Existing 60-minute power threshold and cultivation numeric rules remain unchanged.
- Single worker; no native timers, commits, pushes or production test records.
- Legacy missing reward protocol fields do not authorize asset replay.

## Task 1: Durable Core Success

Files: `src/services/TaskService.ts`, `src/models/User.ts`, `src/models/TaskChain.ts`, `src/types/models.ts`, `src/types/services.ts`, `tests/integration/core-reward-outbox.test.ts`.

- [x] Write and run failures for reward fault/paused award with successful core Task/User/Main state and a valid next start.
- [x] Add User pending focus intents and separate Task reward status/protocol fields, without defaulting old records into the queue.
- [x] Append the intent in the same User receipt/statistics pipeline; remove reward I/O from core settlement.
- [x] Preserve canonical seed normalization using the oldest intent's captured pre-core streak.
- [x] Run core recovery, old data and trusted-time tests at this checkpoint.

## Task 2: Ordered Reward Recovery

Files: new `src/services/FocusRewardService.ts`, `src/services/CultivationService.ts`, `src/models/User.ts`, `tests/integration/focus-reward-recovery.test.ts`.

Interfaces: `recover(userId?, onPaid?)`, `pendingFocusRewards[]`, `awardCultivation(userId, duration, taskId)`.

- [x] Write failures for seed streak, ordered two-task payout, claim/commit/flag response loss, pending buffs and pending offers.
- [x] Claim a separate Task reward token, award only the ready User queue head, reconcile paid receipts, and remove intents atomically with assets.
- [x] Protect game mutation order while keeping read-only status and offer resolution available.
- [x] Verify inventory grants survive canonical state replacement and share the reward receipt commit.
- [x] Run real User reward tests, including interruption and both lease layers.

## Task 3: Scheduling, Core Projection And User Feedback

Files: `src/services/QueueService.ts`, `src/services/CTDPService.ts`, `src/bot.ts`, `src/handlers/taskCommands.ts`, `src/handlers/cultivationCommands.ts` and related tests.

- [x] Add a named reward processor and repeat job to the existing maintenance queue; keep core startup recovery independent.
- [x] Trigger recovery after core response without awaiting it; persist enough state for startup/periodic recovery.
- [x] Recover terminal core results and MainChain projection without paying rewards or choosing unselected precedents.
- [x] Show focus completion first, separate optional reward notices, pending reward status and valid encounter controls.
- [x] Verify repeat uniqueness and Redis recovery for both job kinds using isolated real Redis.

## Task 4: Review And Delivery

- [x] Reconcile old tests with the intended core/reward separation; retain numerical, idempotency and ownership assertions.
- [x] Run adversarial review, full `yarn validate --maxWorkers=2`, `yarn build` and `git diff --check`.
- [x] Rehearse the new dist on isolated MongoDB 8.0.4, preserving all production records.
- [x] Stop only the target PM2 worker, audit document/index fingerprints, deploy, restart and verify HTTP/queue/dependency readiness.
- [x] Update repair progress and keep the full goal active until remaining acceptance requirements are proved.

Checkpoint 2026-10-09: focused core/reward/real-Redis suite 24/24; SIGKILL after core and asset commits passed; both lease takeover layers and core-save/reward-projection concurrency passed. A guard/account-load race was reproduced and an account-snapshot check added; its final focused/full recheck is pending. Full legacy compatibility pass is in progress; no Phase25 production deployment yet.

Delivery checkpoint: 101 files677 tests full validation exit0; build/diff-check exit0. Independent Mongo8.0.4 rehearsal passed and exited; stopped-worker production111 BSON documents52 indexes unchanged. Phase25 deployed PID1433193, both repeat kinds completed and HTTP/PM2/Mongo/Redis ready. Overall goal remains active; real Telegram incoming-user acceptance is still pending.
