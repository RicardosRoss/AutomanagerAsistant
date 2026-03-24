# TypeScript Phase 0-2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将项目的 TypeScript 重构首个可审阅 PR 落到 `Phase 0-2`，建立 TS/Vitest 基础设施并迁移类型定义层与底层叶子模块。

**Architecture:** 保持运行时行为不变，先用回归测试锁定 `helpers` 和 `cultivation config` 的关键行为，再替换测试/构建基础设施，最后把 `types/`、`constants`、`helpers`、`cultivation config`、`production config` 迁移为 TypeScript。为保证首个 PR 可验证，额外只处理阻塞验证的测试对齐项，不提前迁移 models/services/bot。

**Tech Stack:** Node.js ESM, TypeScript, Vitest, ESLint, Mongoose, Redis

---

### Task 1: 锁定叶子模块行为

**Files:**
- Modify: `tests/unit/utils/helpers.test.js`
- Create: `tests/unit/config/cultivation.test.js`

**Step 1: 写回归测试**

- 为 `formatDate(null)` 增加明确断言，要求返回 `无效日期`
- 为 `getCurrentRealm()`、`getRealmStage()`、`getNextRealm()` 增加最小行为断言

**Step 2: 运行测试并确认 RED**

Run: `npm test -- tests/unit/utils/helpers.test.js --runInBand`
Expected: `formatDate(null)` 相关断言失败

**Step 3: 暂不修改生产代码**

- 保持失败状态，进入基础设施迁移和源文件转换

### Task 2: 建立 TypeScript/Vitest 基础设施

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `jest.config.js`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.eslintrc.cjs`

**Step 1: 更新依赖与脚本**

- 新增 `typescript`、`tsx`、`vitest`、`@vitest/coverage-v8`、`@types/*`、`@typescript-eslint/*`
- 移除 Jest / nodemon / airbnb import 相关依赖
- 将脚本切换为 `build/start/dev/test/typecheck/validate`

**Step 2: 创建配置文件**

- 新建 `tsconfig.json`
- 新建 `vitest.config.ts`
- 将 ESLint 配置迁移到 `.eslintrc.cjs`

**Step 3: 运行基础设施命令**

Run: `npm install`
Run: `npx tsc --version`
Expected: TypeScript 已可用

### Task 3: 迁移类型定义层与叶子模块

**Files:**
- Create: `src/types/index.ts`
- Create: `src/types/config.ts`
- Create: `src/types/cultivation.ts`
- Create: `src/types/models.ts`
- Create: `src/types/services.ts`
- Delete: `src/utils/constants.js`
- Add: `src/utils/constants.ts`
- Delete: `src/utils/helpers.js`
- Add: `src/utils/helpers.ts`
- Delete: `src/config/cultivation.js`
- Add: `src/config/cultivation.ts`
- Delete: `config/production.js`
- Add: `config/production.ts`

**Step 1: 先迁移类型文件**

- 补足 `DeepPartial`、修仙相关实体、服务返回值占位类型

**Step 2: 迁移叶子模块**

- `constants.ts` 使用 `as const`
- `helpers.ts` 添加显式参数/返回类型与泛型
- 修复 `formatDate(null)` 为无效输入
- `cultivation.ts` 用接口约束配置常量
- `production.ts` 导出 `DeepPartial<AppConfig>`

**Step 3: 运行目标测试**

Run: `npx vitest run tests/unit/utils/helpers.test.ts tests/unit/config/cultivation.test.ts`
Expected: 两个测试文件通过

### Task 4: 迁移测试文件到 Vitest 并对齐阻塞基线

**Files:**
- Delete/Add: `tests/setup.js` -> `tests/setup.ts`
- Delete/Add: `tests/system-validation.test.js` -> `tests/system-validation.test.ts`
- Delete/Add: `tests/unit/utils/helpers.test.js` -> `tests/unit/utils/helpers.test.ts`
- Delete/Add: `tests/unit/models/User.test.js` -> `tests/unit/models/User.test.ts`
- Delete/Add: `tests/unit/services/TaskService.test.js` -> `tests/unit/services/TaskService.test.ts`
- Modify: `tests/unit/services/TaskService.test.ts`
- Create: `tests/globals.d.ts`

**Step 1: 迁移现有 Jest 测试到 Vitest**

- 改扩展名
- 替换 `jest` mock API 为 `vi`
- 更新 setup 与全局类型声明

**Step 2: 对齐阻塞基线**

- 将 `TaskService` 中“创建第二个运行中任务”的测试改为匹配当前“自动取消旧任务并启动新任务”的真实行为

**Step 3: 运行测试并确认 GREEN**

Run: `npm test`
Expected: 当前纳入 Vitest 的测试全部通过

### Task 5: 类型检查、构建、提交与 PR

**Files:**
- Modify as needed based on verification output

**Step 1: 完整验证**

Run: `npm run lint`
Run: `npm run typecheck`
Run: `npm run build`
Run: `npm test`
Expected: 全部 exit 0

**Step 2: 提交**

Run: `git checkout -b refactor/typescript-phase0-2`
Run: `git add <relevant files>`
Run: `git commit -m "refactor: migrate phase 0-2 to typescript"`

**Step 3: 创建 PR**

Run: `git push -u origin refactor/typescript-phase0-2`
Run: `gh pr create --fill`
Expected: 产出可审阅 PR；若 `gh` 不可用，则提供推送分支与 PR 文案
