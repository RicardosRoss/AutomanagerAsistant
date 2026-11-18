# Explicit Duration Units And Live Acceptance

Goal: the actual user input /reserve 填表 1h should create the same sixty-minute reservation as /reserve 填表 60, while preserving all existing CTDP and reward rules.

Evidence: real Telegram update2777 on2026-10-09T15:35:59Z failed the minute-only parser. Corrected update2779, reservation start callback and completion callback created one completed60minute task, oneMainnode and onepaid receipt. This task adds the missing real-flow evidence; the parser issue remains an observed startup hurdle.

Functional requirements:

- Accept the last whitespace-separated duration token with h/H, 小时, m, min or 分钟. Decimal hours are supported only if they convert to an exact integer minute (1.5h90,4.1h246). No compound1h30m syntax or arbitrary language parsing.
- Preserve ordinary numeric/default durations and full descriptions. Explicit numeric malformed/unit/range failures remain errors before state writes. Production5..480 minutes, development1..480 remain unchanged.
- Use exact decimal arithmetic for explicit unit conversion, avoiding floating-point rejection or rounding fractional-minute inputs into a promise. No new runtime dependency.
- Help and command guide describe supported units. Correct obsolete command/reward/ascension examples against the actual handlers without changing game numerics.
- Real-user acceptance inspects the matching reservation/task/Main/User/DailyStats/receipt and actual incoming logs. Compare with the independently restored baseline; no replay, no production testdata.

Checkpoints:

- [x] Reproduce13 duration failures; invalid/unitless behavior remains12passes.
- [x] Add exact unit conversion and relevant help/docs; focused4files59tests pass.
- [x] Full validate/build/diff-check and adversarial review.
- [x] Independently restore known backup to obtain baseline evidence; verify current real task effects and historical preservation.
- [x] New dist unit parsing/handlers isolatedMongo8 rehearsal, stopped-worker release fingerprint, runtime/source hashes and readiness checks.
- [x] Update original acceptance against current evidence; complete only if no required repair or gate remains.

Delivery:104 files742 tests/typecheck/lint/build/diffcheck pass. Independent restored baseline shows one real60minfocus and322legacytasks/109otherBSONrowsunchanged. Compiled1hflow succeeds on isolatedMongo8.0.4. Functionalrelease15files plus27metadatafiles preserve114documents52indexes.264source/generatedfilesmatch. PID1449830healthy; two unique60s repeats havecompleted, failed0. Trueprivate taskaccepted; no productiontestwrites, no messages/injectedupdates, no commit/push.
