# Xuanjian Zhuji Breakthrough Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `练气 -> 筑基` 收敛为“主修功法决定结果，破境法门决定过程”的正式运行时模型，并兼容当前存档。

**Architecture:** 这轮沿用现有 `xuanjianCanonical -> BreakthroughEngine -> CultivationService` 主链，不改动战斗和高境界分支系统。第一层在 canonical 定义里补 `lianqi route methods`、`zhujiOutcome` 和 `breakthrough methods`；第二层把 `BreakthroughEngine` 改为读取主修结果映射与破境法门过程定义；第三层在 `CultivationService/CultivationStateAdapter` 收敛旧存档与突破后的主修切换；最后更新测试与手册。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest

---

## File Map

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

## Task 1: Add explicit lianqi routes and breakthrough-method definitions

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run `yarn vitest run tests/unit/config/xuanjianCanonical.test.ts` and verify it fails**
- [ ] **Step 3: Add `zhujiOutcome`, `BreakthroughMethodDefinition`, route main methods, and lookup helpers**
- [ ] **Step 4: Re-run the focused config test and verify it passes**

## Task 2: Rewrite breakthrough readiness/attempt around main-method outcomes

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`

- [ ] **Step 1: Write the failing engine tests for lianqi route methods and selected breakthrough methods**
- [ ] **Step 2: Run `yarn vitest run tests/unit/services/BreakthroughEngine.test.ts` and verify it fails**
- [ ] **Step 3: Implement main-method outcome locking, breakthrough-method compatibility, and process summary**
- [ ] **Step 4: Re-run the focused engine test and verify it passes**

## Task 3: Normalize legacy pre-zhuji methods and switch to zhuji methods on success

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Write the failing integration tests for old pre-zhuji snapshots and successful zhuji switching**
- [ ] **Step 2: Run `yarn vitest run tests/integration/xuanjian-task-cultivation-flow.test.ts` and verify the new slice fails**
- [ ] **Step 3: Implement legacy normalization and successful post-breakthrough method switching**
- [ ] **Step 4: Re-run the integration slice and verify it passes**

## Task 4: Update manual wording and run regression checks

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

- [ ] **Step 1: Update the manual to state that zhuji outcome is determined by main method and breakthrough method only affects process**
- [ ] **Step 2: Run `yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/BreakthroughEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts`**
- [ ] **Step 3: Run `yarn vitest run tests/unit/services/CultivationRewardEngine.test.ts tests/unit/handlers/cultivationCommands.test.ts` for regression coverage**

## Self-Review

This plan covers:

1. 主修功法显式筑基结果
2. 破境法门过程语义
3. 旧存档兼容
4. 突破成功后的主修切换

It intentionally does not cover:

1. 紫府四关真实分支
2. 破境随机失败系统
3. 玩家侧切换命令
