# Nautilus Reminders Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans sequentially in the existing isolated repair checkout. Preserve its pre-existing changes. No commit or push is requested.

**Goal:** Sync Nautilus day plans to the VPS and deliver Telegram reminders at their scheduled start times.

**Architecture:** A CLI bridge reads the same Nautilus engine output, sends a snapshot through SSH to a loopback authenticated API, and atomically persists it in MongoDB. A separate Bull queue reconciles reminders and dispatches them; callback actions enter the existing task preparation flow.

**Tech Stack:** Node.js, TypeScript, Mongoose 7, Bull 4, Express 4, moment-timezone, Vitest, SSH.

**Spec:** `docs/superpowers/specs/2026-10-10-nautilus-reminders-design.md`

## Global Constraints

- Use the Nautilus engine, `Asia/Shanghai`, MongoDB authority and Bull scheduling.
- Do not create a commitment on import or reminder delivery.
- Only the configured user may import and act on reminders.
- Preserve existing changes; deploy only `telegram-self-control-bot` after backup and validation.

## Tasks

- [x] Inspect the current bot, skill and scheduling engine; write the contract and risk matrix.
- [x] Implement snapshot validation and atomic persistence with tests first: `src/models/ScheduledPlan.ts`, `src/services/ScheduleService.ts`, `src/utils/scheduleSnapshot.ts`.
- [x] Implement delivery/reconciliation and owner-bound callbacks with real MongoDB/Redis and failure tests. Wire `src/bot.ts`, `src/handlers/taskDraftCommands.ts` and `src/config/bot.ts`.
- [x] Implement loopback API and SSH importer with auth/malformed/readiness tests: `src/routes/scheduleSync.ts`, `scripts/import-nautilus.mjs`, `src/app.ts`, config/types.
- [x] Implement and test `integrations/nautilus-planner/bot-sync.cjs`, install it into the existing skill, and add an automatic post-write hook and instructions. Use an isolated vault for fixed, flex, cross-midnight, empty and overflow cases.
- [x] Run focused tests, `yarn validate`, `yarn build`, `git diff --check`, and Claude read-only adversarial review; resolve material findings. Final: 111 files / 796 tests; Claude followup passes.
- [x] Rehearse with MongoDB 8; refresh production, back up, deploy, verify source/build hashes, health, index readiness, recovery and actual Telegram reminder receipt. Shanghai 17:20 test delivered as message 2788 at +1182ms, once. Actual 2026-10-11 note does not exist; no invented tomorrow plan was created.

## Test Matrix

| 测试类型 | 测试场景 | 输入/前置条件 | 预期结果 | 测试层级 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| 正常/时间 | 固定、pinned、flex、跨午夜 | 未来一天/上海时区/分钟 >1440 | 持久化正确 UTC deadline，无自动承诺 | 集成/CLI | P0 |
| 幂等/并发 | 相同快照重复、同时更新和发送 | 同一日期、不同生成时间 | 单一计划、保留投递状态、拒绝旧快照 | MongoDB 集成 | P0 |
| 状态 | 修改/删除/已完成/空计划 | 已排队项/旧 token | 旧 job 不发消息、旧按钮无效 | 集成 | P0 |
| 安全 | 缺密钥/错误密钥/外部 IP/其他用户 | HTTP/私聊回调 | 拒绝，无用户数据变化或泄漏 | API/回调 | P0 |
| 输入 | 坏日期/时区/分钟/标题/数量/JSON | 非法 payload | 明确 400，无脏数据 | API/单元 | P1 |
| 恢复 | 重启/Redis job 丢失/已完成 job | Mongo 原 deadline | 稳定 job ID，恢复未投递项 | 真实 Redis 集成 | P0 |
| 外部失败 | 429/永久拒绝/超时/响应畸形/崩溃 | Telegram sender mock，真实 Mongo | 有限重试，未知不重复，状态可查 | 集成 | P0 |
| 过期 | 导入过去/停机过长/已结束 | deadline 边界 | 新过期项不补发；有效迟到明确提示 | 集成 | P1 |
| 业务 | 提醒后点击准备/预约/略过 | 本人有效日程 token | 有准备无承诺；确认才复用 CTDP | Bot/准备集成 | P0 |
| 排程失败 | 固定冲突/格式损坏/超载 | 引擎输出 | 拒绝冲突；列出排不下项目 | CLI 集成 | P1 |
| 真实投递 | 明确的临时测试日程 | 已授权 Telegram 私聊 | 到点发送，保存 message_id；不改变主链 | 生产验收 | P0 |

Run failing tests first, implement the named contracts, then run focused tests. Broaden validation once the integration is complete. Update this checklist after each completed task.
