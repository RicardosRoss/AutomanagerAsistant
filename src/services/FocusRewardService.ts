import { randomUUID } from 'node:crypto';
import { TaskChain, User } from '../models/index.js';
import type { ITask, TaskChainDocument } from '../types/models.js';
import type { CultivationReward, CultivationServiceDependency } from '../types/services.js';
import logger from '../utils/logger.js';

type PaidCallback = (userId: number, taskId: string, reward: CultivationReward, task: ITask) => Promise<void>;
interface PaidNotice { userId: number; task: ITask; reward: CultivationReward }

const pendingTask = {
  status: 'completed', settlementStatus: 'settled', rewardProtocolVersion: 1, rewardApplied: { $ne: true }
};

class FocusRewardService {
  constructor(private cultivation: CultivationServiceDependency) {}

  async recover(userId?: number, onPaid?: PaidCallback): Promise<void> {
    const scope = userId === undefined ? {} : { userId };
    const [tasks, users] = await Promise.all([
      TaskChain.distinct('userId', { ...scope, tasks: { $elemMatch: pendingTask } }),
      User.distinct('userId', { ...scope, 'pendingFocusRewards.0': { $exists: true } })
    ]);
    let failures = 0;
    for (const id of new Set<number>([...tasks, ...users])) {
      const outcome = await this.recoverUser(id);
      failures += outcome.failures;
      for (const notice of outcome.notices) {
        try {
          await onPaid?.(id, notice.task.taskId, notice.reward, notice.task);
        } catch (error) {
          logger.warn('奖励已到账，附加通知未送达，可在境界页查看', { userId: id,
            error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (failures) throw new Error(`${failures} 项附加奖励等待恢复，专注任务不受影响`);
  }

  private async recoverUser(userId: number): Promise<{ notices: PaidNotice[]; failures: number }> {
    const notices: PaidNotice[] = [];
    try {
      const user = await User.findOne({ userId });
      if (!user) throw new Error('奖励账户不存在，需要审计');
      const chains = await TaskChain.find({ userId, tasks: { $elemMatch: pendingTask } });
      for (const chain of chains) {
        for (const task of chain.tasks) {
          if (!this.eligible(task)) continue;
          const receipt = user.focusRewardReceipts?.find(
            entry => entry.taskId === task.taskId && entry.status === 'settled'
          );
          if (!receipt?.reward) {
            // A paid worker may have committed after this scan's account read.
            const current = await User.findOne({ userId });
            const hasIntent = current?.pendingFocusRewards?.some(entry => entry.taskId === task.taskId);
            const hasReceipt = current?.focusRewardReceipts?.some(
              entry => entry.taskId === task.taskId && entry.status === 'settled' && entry.reward
            );
            if (!hasIntent && !hasReceipt) throw new Error('新协议奖励缺少意图和资产收据，需要审计');
            continue;
          }
          const paid = await this.apply(chain, task, receipt.reward as unknown as CultivationReward);
          if (paid) notices.push(paid);
        }
      }
      // Limit one account's batch so a large backlog cannot starve other users.
      for (let count = 0; count < 20; count += 1) {
        const current = await User.findOne({ userId });
        if (!current) throw new Error('奖励账户不存在，需要审计');
        const head = current.pendingFocusRewards?.[0];
        if (!head) break;
        if (current.cultivation.canonical?.state.combatFlags.pendingEncounterOffer) break;
        const chain = await TaskChain.findOne({ userId, 'tasks.taskId': head.taskId });
        const task = chain?.tasks.find(entry => entry.taskId === head.taskId);
        if (!chain || !task || task.status !== 'completed' || task.rewardProtocolVersion !== 1) {
          throw new Error('附加奖励意图缺少有效专注确认，需要审计');
        }
        if (task.settlementStatus !== 'settled') break;
        if (task.rewardApplied) {
          const receipt = current.focusRewardReceipts?.find(
            entry => entry.taskId === head.taskId && entry.status === 'settled'
          );
          if (!receipt?.reward) throw new Error('奖励标记缺少资产收据，需要审计');
          await this.removePaidIntent(userId, head.taskId);
          continue;
        }
        const paid = await this.apply(chain, task);
        if (!paid) break;
        notices.push(paid);
      }
      return { notices, failures: 0 };
    } catch (error) {
      logger.error('附加奖励恢复失败，核心专注记录保留', { userId,
        error: error instanceof Error ? error.message : String(error) });
      return { notices, failures: 1 };
    }
  }

  private eligible(task: ITask): boolean {
    return task.status === 'completed' && task.settlementStatus === 'settled' &&
      task.rewardProtocolVersion === 1 && !task.rewardApplied;
  }

  private async apply(
    chain: TaskChainDocument, task: ITask, cached?: CultivationReward
  ): Promise<PaidNotice | null> {
    const token = randomUUID();
    const now = new Date();
    const claimed = await TaskChain.findOneAndUpdate({ _id: chain._id, userId: chain.userId, tasks: {
      $elemMatch: { ...pendingTask, taskId: task.taskId, $or: [
        { rewardStatus: { $in: ['pending', 'needs_retry'] } },
        { rewardStatus: 'processing', rewardLeaseUntil: { $lte: now } }
      ] }
    } }, { $set: { 'tasks.$.rewardStatus': 'processing', 'tasks.$.rewardToken': token,
      'tasks.$.rewardLeaseUntil': new Date(now.getTime() + 60000) }, $unset: { 'tasks.$.rewardError': 1 }
    }, { new: true });
    if (!claimed) return null;
    const owned = { _id: chain._id, userId: chain.userId, tasks: { $elemMatch: {
      taskId: task.taskId, rewardProtocolVersion: 1, rewardStatus: 'processing', rewardToken: token
    } } };
    try {
      if (!cached) {
        const before = await User.findOne({ userId: chain.userId });
        const head = before?.pendingFocusRewards?.[0];
        if (!head || head.taskId !== task.taskId || head.duration !== task.actualDuration) {
          throw new Error('奖励顺序或可信时长已变化，需要审计');
        }
        await this.cultivation.awardCultivation(chain.userId, head.duration, task.taskId);
      }
      const account = await User.findOne({ userId: chain.userId });
      const receipt = account?.focusRewardReceipts?.find(
        entry => entry.taskId === task.taskId && entry.status === 'settled'
      );
      if (!receipt?.reward) throw new Error('奖励尚无原子资产收据，等待恢复');
      const reward = receipt.reward as unknown as CultivationReward;
      await this.removePaidIntent(chain.userId, task.taskId);
      // Reward-only fields do not bump the core chain version or replace its task array.
      const updated = await TaskChain.findOneAndUpdate(owned, { $set: {
        'tasks.$.rewardApplied': true, 'tasks.$.rewardSnapshot': reward, 'tasks.$.rewardStatus': 'settled'
      }, $unset: {
        'tasks.$.rewardToken': 1, 'tasks.$.rewardLeaseUntil': 1, 'tasks.$.rewardError': 1
      } }, { new: true });
      if (!updated) throw new Error('奖励投影认领已变化，可从资产收据恢复');
      return { userId: chain.userId, task: updated.tasks.find(entry => entry.taskId === task.taskId)!, reward };
    } catch (error) {
      await TaskChain.updateOne(owned, { $set: { 'tasks.$.rewardStatus': 'needs_retry',
        'tasks.$.rewardError': error instanceof Error ? error.message : String(error) },
      $unset: { 'tasks.$.rewardToken': 1, 'tasks.$.rewardLeaseUntil': 1 } });
      throw error;
    }
  }

  private async removePaidIntent(userId: number, taskId: string): Promise<void> {
    const result = await User.updateOne({ userId, 'pendingFocusRewards.0.taskId': taskId,
      focusRewardReceipts: { $elemMatch: { taskId, status: 'settled', reward: { $exists: true } } }
    }, { $pull: { pendingFocusRewards: { taskId } }, $inc: { __v: 1 } });
    if (!result.matchedCount && await User.exists({ userId, 'pendingFocusRewards.taskId': taskId })) {
      logger.warn('奖励意图清理未匹配，保留有序意图等待恢复审计', { userId, taskId });
    }
  }
}

export default FocusRewardService;
