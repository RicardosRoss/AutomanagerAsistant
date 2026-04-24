# Xuanjian Zifu Breakthrough Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `筑基 -> 紫府` 的破境法门从空壳占位改为真正影响准备条件、过程副作用和突破副产物的运行时层。

**Architecture:** 这轮沿用 `xuanjianCanonical -> BreakthroughEngine -> CultivationService` 主链，不启用四关分支。第一层扩 `BreakthroughMethodDefinition` 和多条 `zhuji_to_zifu` 法门 seed；第二层让 `BreakthroughEngine` 在紫府突破时消费法门兼容、环境和附加资源，并按法门发放副产物；第三层把过程副作用轻量挂到现有 `combatFlags`，同时更新文案与测试。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest

---

## File Map

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

## Task 1: Add real zhuji-to-zifu breakthrough method definitions

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`

- [ ] **Step 1: Write the failing config tests**
- [ ] **Step 2: Run `yarn vitest run tests/unit/config/xuanjianCanonical.test.ts` and verify it fails**
- [ ] **Step 3: Add compatibility fields and multiple `zhuji_to_zifu` breakthrough methods**
- [ ] **Step 4: Re-run the config test and verify it passes**

## Task 2: Make BreakthroughEngine enforce zifu process-method compatibility

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`

- [ ] **Step 1: Write the failing engine tests for lineage mismatch, missing environment, and method-specific bonus outcomes**
- [ ] **Step 2: Run `yarn vitest run tests/unit/services/BreakthroughEngine.test.ts` and verify it fails**
- [ ] **Step 3: Implement zifu compatibility, environment checks, bonus outcomes, and side-effect summaries**
- [ ] **Step 4: Re-run the engine test and verify it passes**

## Task 3: Persist zifu side effects and expose method-specific process text

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Write the failing integration tests for zifu process outcomes through `attemptBreakthrough`**
- [ ] **Step 2: Run `yarn vitest run tests/integration/xuanjian-task-cultivation-flow.test.ts` and verify the new slice fails**
- [ ] **Step 3: Persist side effects into `combatFlags` and enrich the breakthrough success message**
- [ ] **Step 4: Re-run the integration slice and verify it passes**

## Task 4: Update manual wording and run regression checks

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

- [ ] **Step 1: Update the manual to document the zifu process-method layer and its non-goals**
- [ ] **Step 2: Run `yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/BreakthroughEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts`**
- [ ] **Step 3: Run `yarn tsc --noEmit`**

## Self-Review

This plan covers:

1. 紫府过程法门 seed
2. 兼容 / 环境 / 附加材料校验
3. 副产物与副作用摘要
4. 服务层持久化与文案

It intentionally does not cover:

1. 四关求解
2. 真实死亡分支
3. `branchChoice / branchProofs`
