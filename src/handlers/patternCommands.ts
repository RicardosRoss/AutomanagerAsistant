import { sendTelegramMessage, databaseErrorNotice } from '../utils/telegramMessages.js';
import type TelegramBot from 'node-telegram-bot-api';
import RSIPService from '../services/RSIPService.js';

class PatternCommandHandlers {
  private service = new RSIPService();

  constructor(private bot: TelegramBot) {}

  async handle(userId: number, input = ''): Promise<void> {
    const [action = '', ...args] = input.trim().split(/\s+/);
    try {
      if (action === 'add' || action === 'child') {
        const parentId = action === 'child' ? args.shift() : undefined;
        await this.service.addPattern(userId, { title: args.join(' '), parentId });
      } else if (['done', 'fail', 'delete'].includes(action)) {
        const nodeId = args[0];
        if (!nodeId) throw new Error('请指定定式编号');
        if (action === 'delete') {
          const tree = await this.service.getPatternTree(userId);
          if (!tree) throw new Error('定式不存在');
          const result = await this.service.deletePatternStack(tree.treeId, nodeId, userId);
          await sendTelegramMessage(this.bot,
            userId,
            `已删除该定式及其后代，共${result.removedNodeIds.length}个。今日新增额度不会恢复。`
          );
        } else {
          const result = await this.service.recordExecution(userId, nodeId, action === 'done');
          await sendTelegramMessage(this.bot,
            userId,
            action === 'done'
              ? `已记录执行：${result.title}`
              : `已回溯：${result.title}，同时移除${result.removedNodeIds.length}个定式。可以从更容易的上游动作重新探索。`
          );
        }
      } else if (action && action !== 'list') {
        throw new Error('可使用 /patterns add 内容、child 父编号 内容、done 编号、fail 编号、delete 编号');
      }
      await this.show(userId, Number(args[0] ?? 0));
    } catch (error) {
      const notice = databaseErrorNotice(error) ?? (error instanceof Error ? error.message : '定式操作失败，请重试');
      await sendTelegramMessage(this.bot, userId, `❌ ${notice}`);
    }
  }

  async show(userId: number, offset = 0): Promise<void> {
    const tree = await this.service.getPatternTree(userId);
    const nodes = tree?.nodes ?? [];
    const start = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    const page = nodes.slice(start, start + 10);
    const guide =
      '每天最多增加一个小规则，优先选容易做到的上游动作。\n' +
      '某条失败或删除时，它和所有后代一起回溯。\n\n' +
      '新增：/patterns add 进书房前把手机放门外\n' +
      '接在已有定式后：/patterns child 父编号 新规则';
    await sendTelegramMessage(this.bot,
      userId,
      `RSIP 定式树（${nodes.length}个）\n\n` +
        page.map((node) => `${node.parentId ? '↳ ' : ''}${node.title}\n编号：${node.nodeId}`).join('\n\n') +
        `\n\n${guide}`,
      {
        reply_markup: {
          inline_keyboard: [
            ...page.map((node) => [
              { text: `已执行：${node.title.slice(0, 16)}`, callback_data: `pattern:done:${node.nodeId}` },
              { text: '失败，回溯此分支', callback_data: `pattern:fail:${node.nodeId}` }
            ]),
            ...(start + 10 < nodes.length ? [[{ text: '下一页', callback_data: `pattern:list:${start + 10}` }]] : [])
          ]
        }
      }
    );
  }
}

export default PatternCommandHandlers;
