/**
 * RSIP (定式树) 模式系统测试
 *
 * 这些测试定义了 RSIP 协议中定式树的核心行为：
 * - 树形结构的创建、查询和删除
 * - 级联删除语义
 * - 定式执行与"下必为例"判例系统的交互
 *
 * 当前实现缺少 RSIPService、PatternTree、PrecedentRule 等模块，
 * 因此测试会在 import 阶段失败——这正是预期的结果。
 *
 * 一旦实现任务 5-6 完成，这些测试应当全部通过。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 定式树结构测试 — RSIPService（尚未实现）
// ---------------------------------------------------------------------------
describe('RSIP 定式树结构', () => {
  const userId = globalThis.testUserId;
  let rsipService: any;

  beforeEach(async () => {
    // RSIPService 尚未实现，下面的 import 会失败。
    // 当实现完成后，替换为真实导入：
    // import RSIPService from '../../src/services/RSIPService.js';
    try {
      const mod = await import('../../src/services/RSIPService.js');
      rsipService = new mod.default();
    } catch {
      rsipService = null;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('创建定式树应返回根节点和树 ID', async () => {
    expect.hasAssertions();

    expect(rsipService).not.toBeNull();

    const tree = await rsipService.createPatternTree(userId, {
      name: '晨间定式',
      description: '每日早上的固定流程'
    });

    expect(tree.treeId).toBeDefined();
    expect(tree.rootNode.name).toBe('晨间定式');
    expect(tree.rootNode.parentNodeId).toBeNull();
  });

  test('应能在根节点下添加子定式', async () => {
    expect.hasAssertions();

    expect(rsipService).not.toBeNull();

    const tree = await rsipService.createPatternTree(userId, {
      name: '晨间定式',
      description: '每日早上的固定流程'
    });

    const child = await rsipService.addChildNode(tree.treeId, tree.rootNode.nodeId, {
      name: '冥想 10 分钟',
      duration: 10
    });

    expect(child.parentNodeId).toBe(tree.rootNode.nodeId);
    expect(child.name).toBe('冥想 10 分钟');
  });

  test('删除父定式时必须级联删除全部子定式', async () => {
    expect.hasAssertions();

    expect(rsipService).not.toBeNull();

    const tree = await rsipService.createPatternTree(userId, {
      name: '工作前定式',
      description: '开始工作前的准备流程'
    });

    const child1 = await rsipService.addChildNode(tree.treeId, tree.rootNode.nodeId, {
      name: '检查邮件',
      duration: 5
    });
    const child2 = await rsipService.addChildNode(tree.treeId, tree.rootNode.nodeId, {
      name: '整理桌面',
      duration: 3
    });

    // 删除根节点应级联删除所有子节点
    const summary = await rsipService.deletePatternStack(tree.treeId, tree.rootNode.nodeId);

    expect(summary.removedNodeIds).toHaveLength(3);
    expect(summary.removedNodeIds).toEqual(
      expect.arrayContaining([
        tree.rootNode.nodeId,
        child1.nodeId,
        child2.nodeId
      ])
    );

    // 树应被标记为已删除或不存在
    const lookup = await rsipService.getPatternTree(tree.treeId);
    expect(lookup).toBeNull();
  });

  test('获取定式树应包含完整的节点层级', async () => {
    expect.hasAssertions();

    expect(rsipService).not.toBeNull();

    const tree = await rsipService.createPatternTree(userId, {
      name: '学习定式',
      description: '开始学习前的准备'
    });

    await rsipService.addChildNode(tree.treeId, tree.rootNode.nodeId, {
      name: '复习笔记',
      duration: 10
    });

    const fullTree = await rsipService.getPatternTree(tree.treeId);

    expect(fullTree.nodes).toHaveLength(2);
    expect(fullTree.nodes[0].name).toBe('学习定式');
    expect(fullTree.nodes[1].name).toBe('复习笔记');
    expect(fullTree.nodes[1].parentNodeId).toBe(fullTree.nodes[0].nodeId);
  });
});

// ---------------------------------------------------------------------------
// 定式执行测试
// ---------------------------------------------------------------------------
describe('RSIP 定式执行', () => {
  const userId = globalThis.testUserId;
  let rsipService: any;

  beforeEach(async () => {
    try {
      const mod = await import('../../src/services/RSIPService.js');
      rsipService = new mod.default();
    } catch {
      rsipService = null;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('执行定式树应按顺序创建每个节点对应的任务', async () => {
    expect.hasAssertions();

    expect(rsipService).not.toBeNull();

    const tree = await rsipService.createPatternTree(userId, {
      name: '晨间定式',
      description: '每日早上的固定流程'
    });

    await rsipService.addChildNode(tree.treeId, tree.rootNode.nodeId, {
      name: '冥想',
      duration: 10
    });
    await rsipService.addChildNode(tree.treeId, tree.rootNode.nodeId, {
      name: '计划今日',
      duration: 5
    });

    const result = await rsipService.executePatternTree(tree.treeId, userId);

    expect(result.createdTasks).toHaveLength(3); // root + 2 children
    expect(result.createdTasks[0].description).toBe('晨间定式');
    expect(result.createdTasks[1].description).toBe('冥想');
    expect(result.createdTasks[2].description).toBe('计划今日');
  });
});

// ---------------------------------------------------------------------------
// 下必为例 — PrecedentService
// ---------------------------------------------------------------------------
describe('下必为例 - PrecedentService 判例系统', () => {
  const userId = globalThis.testUserId;
  let precedentService: any;

  beforeEach(async () => {
    try {
      const mod = await import('../../src/services/PrecedentService.js');
      precedentService = new mod.default();
    } catch {
      precedentService = null;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('出现新违规时，只允许 break 或 allow_forever 两种决定', async () => {
    expect.hasAssertions();

    expect(precedentService).not.toBeNull();

    const violation = await precedentService.reportViolation({
      userId,
      chainType: 'main',
      chainId: 'chain_test_precedent',
      behaviorKey: 'reply_message'
    });

    // 违规必须要求用户做出决定
    expect(violation.requiresDecision).toBe(true);

    // 只允许两种决定
    expect(violation.options).toEqual(
      expect.arrayContaining(['break_chain', 'allow_forever'])
    );
    expect(violation.options).toHaveLength(2);
  });

  test('allow_forever 应创建永久判例规则', async () => {
    expect.hasAssertions();

    expect(precedentService).not.toBeNull();

    const rule = await precedentService.allowForever({
      userId,
      chainType: 'main',
      behaviorKey: 'phone_call'
    });

    expect(rule).toBeDefined();
    expect(rule.scope.behaviorKey).toBe('phone_call');
    expect(rule.decision).toBe('allow_forever');
  });

  test('已有判例的行为不应再次触发违规', async () => {
    expect.hasAssertions();

    expect(precedentService).not.toBeNull();

    // 先允许该行为
    await precedentService.allowForever({
      userId,
      chainType: 'main',
      behaviorKey: 'stretch_break'
    });

    // 再次触发同一行为不应要求决定
    const violation2 = await precedentService.reportViolation({
      userId,
      chainType: 'main',
      chainId: 'chain_test_precedent_skip',
      behaviorKey: 'stretch_break'
    });

    expect(violation2.requiresDecision).toBe(false);
    expect(violation2.decision).toBe('allow_forever');
  });
});
