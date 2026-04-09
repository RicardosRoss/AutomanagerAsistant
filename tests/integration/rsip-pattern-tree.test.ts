/**
 * RSIP (定式树) 模式系统测试
 *
 * 这些测试定义了 RSIP 协议中定式树的核心行为：
 * - 树形结构的创建、查询和删除
 * - 级联删除语义
 * - 定式树节点管理
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RSIPService from '../../src/services/RSIPService.js';
import { PatternTree } from '../../src/models/index.js';
import { generateId } from '../../src/utils/index.js';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 定式树结构测试 — RSIPService
// ---------------------------------------------------------------------------
describe('RSIP 定式树结构', () => {
  const userId = globalThis.testUserId;
  let rsipService: RSIPService;

  beforeEach(() => {
    rsipService = new RSIPService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('addPattern 无 parentId 时应创建根节点', async () => {
    const result = await rsipService.addPattern(userId, { title: '晨间定式' });

    expect(result.tree).toBeDefined();
    expect(result.tree.treeId).toBeDefined();
    expect(result.newNodeId).toBeDefined();

    // Verify the node was added
    const root = result.tree.nodes.find((n) => n.nodeId === result.newNodeId);
    expect(root).toBeDefined();
    expect(root!.title).toBe('晨间定式');
    expect(root!.parentId).toBeNull();
  });

  test('addPattern 有 parentId 时应创建子节点', async () => {
    // Set up tree manually to bypass daily limit
    const today = todayStr();
    const rootId = generateId('pn');
    const treeId = generateId('pt');
    await PatternTree.create({
      userId,
      treeId,
      nodes: [{
        nodeId: rootId,
        parentId: null,
        title: '晨间定式',
        status: 'pending',
        createdOn: today,
        children: []
      }],
      limits: { maxNewPatternsPerDay: 2 }
    });

    // Add child via service
    const childResult = await rsipService.addPattern(userId, {
      title: '冥想 10 分钟',
      parentId: rootId
    });

    expect(childResult.newNodeId).toBeDefined();

    const child = childResult.tree.nodes.find((n) => n.nodeId === childResult.newNodeId);
    expect(child).toBeDefined();
    expect(child!.parentId).toBe(rootId);
    expect(child!.title).toBe('冥想 10 分钟');

    // Verify parent's children array updated
    const updatedRoot = childResult.tree.nodes.find((n) => n.nodeId === rootId);
    expect(updatedRoot!.children).toContain(childResult.newNodeId);
  });

  test('deletePatternStack 应级联删除目标节点及所有子节点', async () => {
    // Set up tree manually with multiple nodes
    const today = todayStr();
    const rootId = generateId('pn');
    const child1Id = generateId('pn');
    const child2Id = generateId('pn');
    const treeId = generateId('pt');
    await PatternTree.create({
      userId,
      treeId,
      nodes: [
        {
          nodeId: rootId,
          parentId: null,
          title: '工作前定式',
          status: 'pending',
          createdOn: today,
          children: [child1Id, child2Id]
        },
        {
          nodeId: child1Id,
          parentId: rootId,
          title: '检查邮件',
          status: 'pending',
          createdOn: today,
          children: []
        },
        {
          nodeId: child2Id,
          parentId: rootId,
          title: '整理桌面',
          status: 'pending',
          createdOn: today,
          children: []
        }
      ],
      limits: { maxNewPatternsPerDay: 1 }
    });

    // Delete root should cascade to all children
    const summary = await rsipService.deletePatternStack(treeId, rootId);

    expect(summary.removedNodeIds).toHaveLength(3);
    expect(summary.removedNodeIds).toEqual(
      expect.arrayContaining([rootId, child1Id, child2Id])
    );

    // Verify nodes are removed from tree
    const tree = await PatternTree.findOne({ treeId });
    expect(tree!.nodes).toHaveLength(0);
  });

  test('getPatternTree 应返回完整的节点层级', async () => {
    // Set up tree manually
    const today = todayStr();
    const rootId = generateId('pn');
    const childId = generateId('pn');
    await PatternTree.create({
      userId,
      treeId: generateId('pt'),
      nodes: [
        { nodeId: rootId, parentId: null, title: '学习定式', status: 'pending', createdOn: today, children: [childId] },
        { nodeId: childId, parentId: rootId, title: '复习笔记', status: 'pending', createdOn: today, children: [] }
      ],
      limits: { maxNewPatternsPerDay: 1 }
    });

    const fullTree = await rsipService.getPatternTree(userId);

    expect(fullTree).not.toBeNull();
    expect(fullTree!.nodes).toHaveLength(2);

    const root = fullTree!.nodes.find((n) => !n.parentId);
    const child = fullTree!.nodes.find((n) => n.parentId === root?.nodeId);

    expect(root!.title).toBe('学习定式');
    expect(child!.title).toBe('复习笔记');
    expect(child!.parentId).toBe(root!.nodeId);
  });

  test('每天最多新增一个定式', async () => {
    await rsipService.addPattern(userId + 100, { title: '第一个定式' });

    await expect(
      rsipService.addPattern(userId + 100, { title: '第二个定式' })
    ).rejects.toThrow('今日已添加过新定式');
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

    expect(violation.requiresDecision).toBe(true);

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

    await precedentService.allowForever({
      userId,
      chainType: 'main',
      behaviorKey: 'stretch_break'
    });

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
