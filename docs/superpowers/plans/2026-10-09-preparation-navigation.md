# Preparation Navigation Repair

Goal: checking status or reopening preparation must help the user continue the same intended task without erasing entered content or establishing an unintended commitment.

Authority: `论自控力.md` CTDP main/auxiliary steps and startup resistance discussion. Preparation supports choosing an explicit task before the reservation signal or sacred marker; it has no CTDP commitment by itself.

Scope: Core status, draft rendering/resume and one existing reservation-status callback route. Preserve all core settlement, reward and reservation timing rules, current expiry, raw documents and history. No additional messages sent to production users as part of release tests.

Requirements:

- Status exposes the valid current draft, including pre-account drafts, with token-bound resume and cancel. Submitting drafts expose progress only. Resume displays the existing screen or recovers the existing submission; never invokes confirmation.
- Empty same-mode preparation reopens a valid existing draft without changing description, duration, token, expiry or timestamps. Selecting another mode preserves content, duration and expiry but rotates the token, making old controls stale. An explicit new description retains replacement behavior.
- Expired, replaced or foreign draft tokens cannot resume or commit. Reject trailing callback data rather than executing a truncated prefix action.
- Status actions prioritize protocol read failure/refresh, active main decision, core pending result, running or initializing task, current reservation, draft and finally idle reservation preparation. Optional pattern/precedent counters cannot disable core task controls.
- Read active MainChain before historical fallback, so a recently edited broken record cannot hide the active chain's pending decision.
- Changing status or rendering a draft has no task/reservation write. Direct commitment still requires the existing explicit confirmation.
- Cancel success requires an actual draft deletion; a concurrent state change cannot be described as no commitment. Current-worker active submissions cannot be lease-reset while still running; restart recovery assumes the old polling worker has stopped, as required by deployment.

Checkpoints:

- [x] Reproduce draft reset/status navigation/trailing action failures (8 failures) and three lookup/interleaving regressions.
- [x] Add status actions, same-mode preservation, token resume and exact callback shape.
- [x] Separate optional counters, prioritize active MainChain and keep concurrent submission rendering accurate.
- [x] Verify focused and full validation/build/diff-check, preserving old draft and ownership contracts.
- [x] Adversarial review, independent Mongo8.0.4 new-dist rehearsal and stopped-worker release audit.
- [x] Deploy, verify current readiness, update progress and keep full goal active pending true user-flow acceptance.

Delivery: currentfull103files713tests validation/build/diff-check exit0; independentMongo8.0.4 rawdraft/originalBSON/index invariancepassedandexited; production111documents52indexesunchanged; PID1436399healthy, Mongo/Redisready, bothrepeatscompletedfailed0. Overallgoalactive andtrueusercommit/start/completepending.
