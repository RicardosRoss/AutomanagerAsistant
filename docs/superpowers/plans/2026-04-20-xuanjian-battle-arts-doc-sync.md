# 玄鉴战斗法门与神通文档补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐玄鉴修炼文档中缺失的战斗法门/术法/神通层，并把功法、战斗法门、神通、破境法门四者的职责拆清。

**Architecture:** 以 `docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md` 为上位设计，先补 spec 的战斗构筑拆层，再同步 `combat`、`encounter`、`dev-manual` 三份文档。实现范围仅限文档口径重构，不改运行时代码。

**Tech Stack:** Markdown, NotebookLM 校订结论, 现有修仙文档

---

### Task 1: 补写上位 spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md`

- [ ] **Step 1: 加入遗漏问题描述**
  在背景或目标中明确：当前文档缺少独立的战斗法门/神通层，导致“功法承担全部战斗构筑”。

- [ ] **Step 2: 明确成长结构拆层**
  增加“战斗法门/术法”和“神通”两条长期构筑线，并区分“破境法门”不属于战斗技能层。

- [ ] **Step 3: 补充字段与验收标准**
  为后续文档同步增加 `artSlots`、`divinePowerSlots`、`daoInsightScaling` 等字段说明，并把“战斗法门/神通系统已显式建模”加入验收标准。

### Task 2: 重写战斗系统中的构筑层

**Files:**
- Modify: `docs/cultivation/xuanjian-combat-system.md`

- [ ] **Step 1: 重写功法职责**
  把功法从“直接提供修为包”改成“修炼倍率、战斗偏向、法门承载、神通上限”的平台层。

- [ ] **Step 2: 增加战斗法门与神通规则**
  新增术法/秘法/兵术/身法/遁法/神通的分类、境界解锁、槽位建议、道行联动。

- [ ] **Step 3: 更新战斗档案结构**
  在 `CombatProfile` 和相关数据结构中加入 `battleArts`、`movementArt`、`divinePowers` 等字段，并在效果字段中加入法门/神通相关效果位。

### Task 3: 重写奇遇图鉴中的技能类目

**Files:**
- Modify: `docs/cultivation/xuanjian-encounter-codex.md`

- [ ] **Step 1: 拆分功法与战斗法门**
  将现有“功法秘术”拆成主修功法、战斗法门/秘术、神通、破境法门四类。

- [ ] **Step 2: 补入代表性原文条目**
  用 NotebookLM 已核实的代表性名称补充术法/神通示例，如 `月阙剑弧`、`大离白熙光`、`云中金落`、`清目灵瞳`、`谒天门`、`君蹈危`、`天下明`。

- [ ] **Step 3: 同步奇遇机制与数据结构**
  扩展掉落类别、效果字段和硬性条件说明，明确神通与破境法门的高阶限定。

### Task 4: 同步开发手册与校验

**Files:**
- Modify: `docs/cultivation/xuanjian-dev-manual.md`

- [ ] **Step 1: 补写修行要素体系**
  在“功法体系”附近新增“战斗法门与神通体系”，说明四层关系：功法、战斗法门、神通、破境法门。

- [ ] **Step 2: 同步实现层数据模型**
  在类型、配置和资源映射段落里体现新增类别和字段。

- [ ] **Step 3: 运行文档自检**
  运行 `rg -n "TODO|TBD|占位|FIXME"` 和 `git diff --check`，确认没有占位和格式问题。
