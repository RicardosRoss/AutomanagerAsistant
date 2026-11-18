# Callback Transport Boundaries

Goal: malformed legacy action IDs cannot prevent the user from reading task/status/pattern pages or send malformed data into core processing.

Authority: `论自控力.md` requires explicit reliable task and reservation choices. Telegram Bot API `InlineKeyboardButton.callback_data` accepts 1-64 bytes. This change protects transport without changing CTDP or reward rules.

Scope: shared message helper and callback entry, plus real-model regression coverage. No database migration, identifier truncation/remapping, new callback session store, callback grammar redesign or new runtime dependency.

Requirements:

- Validate strings using UTF-8 bytes, rejecting empty or over64 data, control characters and unpaired surrogate code points. Allow existing valid Unicode within64 bytes.
- Outbound inline keyboards remove only invalid callback buttons, drop empty rows, preserve other button types and safe controls, and append a readable notice. Do not mutate supplied options, raw IDs or stored documents.
- An entirely invalid keyboard is omitted. Plaintext chunking keeps safe controls on the final message and retains the original body in order.
- Formatted text close to Telegram's limit keeps its original markup and entity offsets; the small warning is sent separately first so it cannot make the formatted body exceed the limit.
- Invalid inbound data is refused after the existing private-origin check and before deduplication/business operations. No personal state changes or consumed update key. Valid actions preserve original ownership/token/deadline/ACK behavior.
- Run focused red/green, full validation/build/diff-check, independent Mongo8.0.4 rendered-message rehearsal, stopped-worker fingerprints, controlled release and current readiness checks.

Checkpoints:

- [x] Reproduce10 focused failures in old helper/entry.
- [x] Add shared data validation, outgoing keyboard filtering and inbound rejection.
- [x] Initial focused34/34 core transport/ACK/model tests and typecheck pass.
- [x] Complete new UTF-8 boundary cases and full validation/build/diff-check.
- [x] Adversarial review and isolated Mongo8.0.4 rendered-message/data-preservation verification.
- [x] Release and verify, keeping overall goal active until true user-flow acceptance.

Delivery:102files691tests validation/build/diff-check exit0; isolatedMongo8.0.4 originalBSON/indexes preserved; production111documents52indexes unchanged; targetPID1434997 healthy, both maintenance jobkinds completed. Goalactive, liveuserpipeline onlyverified status/reservepreparation, notcommit/start/complete.
