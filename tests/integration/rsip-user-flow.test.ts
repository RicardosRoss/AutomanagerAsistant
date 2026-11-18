import { describe, expect, test } from 'vitest';
import RSIPService from '../../src/services/RSIPService.js';
import { PatternTree, User } from '../../src/models/index.js';
import SelfControlBot from '../../src/bot.js';

describe('RSIP 原文规则与用户入口', () => {
  test("deleting today's addition does not restore the daily allowance", async () => {
    const service = new RSIPService();
    const first = await service.addPattern(813001, { title: '进书房前把手机放门外' });
    await service.deletePatternStack(first.tree.treeId, first.newNodeId);
    await expect(service.addPattern(813001, { title: '再加一个' })).rejects.toThrow('今日');
    expect((await PatternTree.findOne({ userId: 813001 }))?.nodes).toHaveLength(0);
  });

  test('simultaneous additions cannot exceed one per user-local day', async () => {
    await User.create({ userId: 813002, settings: { timezone: 'Asia/Shanghai' } });
    const service = new RSIPService();
    const results = await Promise.allSettled([
      service.addPattern(813002, { title: '小规则一' }),
      service.addPattern(813002, { title: '小规则二' })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await PatternTree.findOne({ userId: 813002 }))?.nodes).toHaveLength(1);
  });

  test('failure removes descendants, preserves siblings, and checks ownership', async () => {
    await PatternTree.create({
      userId: 813003,
      treeId: 'backtrack-tree',
      nodes: [
        { nodeId: 'root', title: '手机不进卧室', parentId: null, children: ['child'], createdOn: '2026-10-01' },
        { nodeId: 'child', title: '按时睡觉', parentId: 'root', children: [], createdOn: '2026-10-02' },
        { nodeId: 'other', title: '回家洗澡', parentId: null, children: [], createdOn: '2026-10-03' }
      ]
    });
    const service = new RSIPService();
    await expect(service.recordExecution(813004, 'root', false)).rejects.toThrow('不存在');
    expect((await PatternTree.findOne({ userId: 813003 }))?.nodes).toHaveLength(3);
    const result = await service.recordExecution(813003, 'root', false);
    expect(result.removedNodeIds).toEqual(['root', 'child']);
    expect((await PatternTree.findOne({ userId: 813003 }))?.nodes.map((node) => node.nodeId)).toEqual(['other']);
  });

  test('/patterns add and execution callbacks update the real tree without command-only placeholders', async () => {
    const bot = new SelfControlBot();
    const messages: string[] = [];
    bot.bot = {
      sendMessage: async (_id: number, text: string) => {
        messages.push(text);
      }
    } as never;
    await bot.handleCommand({
      from: { id: 813005 }, chat: { id: 813005, type: 'private' }, text: '/patterns add 进书房前放下手机'
    } as never);
    const tree = (await PatternTree.findOne({ userId: 813005 }))!;
    expect(tree.nodes[0]?.title).toBe('进书房前放下手机');
    await bot.handleQuickCallback(813005, `pattern:done:${tree.nodes[0]!.nodeId}`);
    expect((await PatternTree.findById(tree._id))?.nodes[0]?.status).toBe('active');
    expect(messages.at(-1)).toContain('进书房前放下手机');
  });
});
