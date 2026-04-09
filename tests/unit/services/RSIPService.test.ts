import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import mongoose from 'mongoose';
import PatternTree from '../../../src/models/PatternTree.js';
import RSIPService from '../../../src/services/RSIPService.js';

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('RSIPService', () => {
  let service: RSIPService;
  const userId = 555666777;

  beforeEach(() => {
    service = new RSIPService();
  });

  afterEach(async () => {
    // Clean up PatternTree collection
    await mongoose.models.PatternTree?.deleteMany({});
  });

  // ─── PatternTree Model ───────────────────────────────────────────────────

  describe('PatternTree model', () => {
    test('findOrCreateForUser creates a new tree if none exists', async () => {
      const tree = await PatternTree.findOrCreateForUser(userId);

      expect(tree).toBeDefined();
      expect(tree.userId).toBe(userId);
      expect(tree.treeId).toBeDefined();
      expect(tree.treeId).toMatch(/^pt_/);
      expect(tree.nodes).toEqual([]);
      expect(tree.limits.maxNewPatternsPerDay).toBe(1);
    });

    test('findOrCreateForUser returns existing tree', async () => {
      const first = await PatternTree.findOrCreateForUser(userId);
      const second = await PatternTree.findOrCreateForUser(userId);

      expect(second.treeId).toBe(first.treeId);
      expect(second._id.toString()).toBe(first._id.toString());
    });

    test('findOrCreateForUser 在并发调用下只应创建一棵树', async () => {
      const originalCreate = PatternTree.create.bind(PatternTree);
      const createSpy = vi.spyOn(PatternTree, 'create').mockImplementation(async (...args: any[]) => {
        await new Promise((resolve) => {
          globalThis.setTimeout(resolve, 20);
        });

        return originalCreate(...args);
      });

      const results = await Promise.allSettled([
        PatternTree.findOrCreateForUser(userId),
        PatternTree.findOrCreateForUser(userId)
      ]);

      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof PatternTree.findOrCreateForUser>>> =>
          result.status === 'fulfilled'
      );

      expect(fulfilled).toHaveLength(2);
      expect(new Set(fulfilled.map((result) => result.value.treeId)).size).toBe(1);
      expect(await PatternTree.countDocuments({ userId })).toBe(1);
      expect(createSpy.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── addPattern ───────────────────────────────────────────────────────────

  describe('addPattern', () => {
    test('adds a root node when no parentId provided', async () => {
      const result = await service.addPattern(userId, { title: '早起' });

      expect(result.newNodeId).toBeDefined();
      expect(result.newNodeId).toMatch(/^pn_/);
      expect(result.tree).toBeDefined();

      const node = result.tree.nodes.find((n) => n.nodeId === result.newNodeId);
      expect(node).toBeDefined();
      expect(node!.title).toBe('早起');
      expect(node!.parentId).toBeNull();
      expect(node!.status).toBe('pending');
      expect(node!.createdOn).toBe(todayStr());
      expect(node!.children).toEqual([]);
    });

    test('adds a child node when parentId provided', async () => {
      const root = await service.addPattern(userId, { title: '早起' });

      // Move root's createdOn to yesterday so we can add a child today
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': root.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      const child = await service.addPattern(userId, {
        title: '晨跑',
        parentId: root.newNodeId
      });

      // Need to verify against fresh DB state
      const tree = await PatternTree.findOne({ userId });
      expect(tree).toBeDefined();

      const rootNode = tree!.nodes.find((n) => n.nodeId === root.newNodeId);
      expect(rootNode).toBeDefined();
      expect(rootNode!.children).toContain(child.newNodeId);

      const childNode = tree!.nodes.find((n) => n.nodeId === child.newNodeId);
      expect(childNode).toBeDefined();
      expect(childNode!.parentId).toBe(root.newNodeId);
      expect(childNode!.title).toBe('晨跑');
    });

    test('throws when daily limit reached (1 per day by default)', async () => {
      await service.addPattern(userId, { title: '第一个定式' });

      await expect(
        service.addPattern(userId, { title: '第二个定式' })
      ).rejects.toThrow('今日已添加过新定式');
    });

    test('allows adding again on a different day', async () => {
      // Add first pattern
      const first = await service.addPattern(userId, { title: 'Day 1 定式' });

      // Manually change createdOn to yesterday to simulate a different day
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': first.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      // Should now allow another pattern today
      const second = await service.addPattern(userId, { title: 'Day 2 定式' });
      expect(second.newNodeId).toBeDefined();
    });

    test('throws if parentId does not exist in tree', async () => {
      // First create a tree with a node, then move it to yesterday
      const root = await service.addPattern(userId, { title: '占位' });
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': root.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      await expect(
        service.addPattern(userId, { title: '孤儿节点', parentId: 'pn_nonexistent' })
      ).rejects.toThrow();
    });
  });

  // ─── deletePatternStack ──────────────────────────────────────────────────

  describe('deletePatternStack', () => {
    test('deletes a leaf node (no children)', async () => {
      // Build: root -> child
      const root = await service.addPattern(userId, { title: '根' });

      // Simulate next day for child
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': root.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      const child = await service.addPattern(userId, { title: '叶子', parentId: root.newNodeId });

      const tree = await PatternTree.findOne({ userId });
      const result = await service.deletePatternStack(tree!.treeId, child.newNodeId);

      expect(result.removedNodeIds).toEqual([child.newNodeId]);

      // Verify parent's children array is updated
      const updatedTree = await PatternTree.findOne({ userId });
      const rootNode = updatedTree!.nodes.find((n) => n.nodeId === root.newNodeId);
      expect(rootNode!.children).not.toContain(child.newNodeId);
    });

    test('cascade-deletes all descendants using stack', async () => {
      // Build tree:
      //   root
      //   ├── childA
      //   │   └── grandChild
      //   └── childB

      const root = await service.addPattern(userId, { title: '根' });

      // Move root to yesterday
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': root.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      const childA = await service.addPattern(userId, { title: 'A', parentId: root.newNodeId });

      // Move childA to yesterday
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': childA.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      const grandChild = await service.addPattern(userId, { title: '孙', parentId: childA.newNodeId });

      // Move grandChild to yesterday
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': grandChild.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      const childB = await service.addPattern(userId, { title: 'B', parentId: root.newNodeId });

      // Delete childA (should cascade to grandChild but NOT touch childB)
      const tree = await PatternTree.findOne({ userId });
      const result = await service.deletePatternStack(tree!.treeId, childA.newNodeId);

      // Should have removed childA and grandChild
      expect(result.removedNodeIds).toHaveLength(2);
      expect(result.removedNodeIds).toContain(childA.newNodeId);
      expect(result.removedNodeIds).toContain(grandChild.newNodeId);
      expect(result.removedNodeIds).not.toContain(childB.newNodeId);

      // Verify remaining nodes
      const updatedTree = await PatternTree.findOne({ userId });
      const remainingIds = updatedTree!.nodes.map((n) => n.nodeId);
      expect(remainingIds).toContain(root.newNodeId);
      expect(remainingIds).toContain(childB.newNodeId);
      expect(remainingIds).not.toContain(childA.newNodeId);
      expect(remainingIds).not.toContain(grandChild.newNodeId);

      // root's children should only have childB
      const rootNode = updatedTree!.nodes.find((n) => n.nodeId === root.newNodeId);
      expect(rootNode!.children).toEqual([childB.newNodeId]);
    });

    test('deleting root removes entire tree nodes', async () => {
      const root = await service.addPattern(userId, { title: '根' });

      // Move root to yesterday
      await PatternTree.updateOne(
        { userId, 'nodes.nodeId': root.newNodeId },
        { $set: { 'nodes.$.createdOn': yesterdayStr() } }
      );

      const child = await service.addPattern(userId, { title: '子', parentId: root.newNodeId });

      const tree = await PatternTree.findOne({ userId });
      const result = await service.deletePatternStack(tree!.treeId, root.newNodeId);

      expect(result.removedNodeIds).toHaveLength(2);
      expect(result.removedNodeIds).toContain(root.newNodeId);
      expect(result.removedNodeIds).toContain(child.newNodeId);

      const updatedTree = await PatternTree.findOne({ userId });
      expect(updatedTree!.nodes).toHaveLength(0);
    });

    test('throws if treeId not found', async () => {
      await expect(
        service.deletePatternStack('pt_nonexistent', 'pn_any')
      ).rejects.toThrow();
    });

    test('throws if nodeId not found in tree', async () => {
      await service.addPattern(userId, { title: '根' });
      const tree = await PatternTree.findOne({ userId });

      await expect(
        service.deletePatternStack(tree!.treeId, 'pn_nonexistent')
      ).rejects.toThrow();
    });
  });

  // ─── getPatternTree ──────────────────────────────────────────────────────

  describe('getPatternTree', () => {
    test('returns null when no tree exists', async () => {
      const result = await service.getPatternTree(userId);
      expect(result).toBeNull();
    });

    test('returns the tree when it exists', async () => {
      await service.addPattern(userId, { title: '有树了' });
      const result = await service.getPatternTree(userId);

      expect(result).toBeDefined();
      expect(result!.userId).toBe(userId);
      expect(result!.nodes.length).toBeGreaterThan(0);
    });
  });
});
