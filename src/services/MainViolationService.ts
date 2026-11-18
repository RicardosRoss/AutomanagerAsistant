import { randomBytes, randomUUID } from 'node:crypto';
import { MainChain, TaskChain, User } from '../models/index.js';
import type { MainChainDocument } from '../types/models.js';
import PrecedentService, { type ViolationOption } from './PrecedentService.js';
import TaskService from './TaskService.js';
import { withUserProtocolLock } from '../utils/taskCreationLock.js';

interface ReminderQueue {
  cancelTaskReminders(taskId: string): Promise<number>;
}

class MainViolationService {
  private tasks: TaskService;

  constructor(queue: ReminderQueue | null, tasks?: TaskService) {
    this.tasks = tasks ?? new TaskService(queue as never);
  }

  async report(userId: number, behaviorKey: string): Promise<{
    requiresDecision: boolean; pending?: MainChainDocument['pendingViolation']
  }> {
    return withUserProtocolLock(userId, () => this.reportWithinProtocol(userId, behaviorKey));
  }

  private async reportWithinProtocol(userId: number, behaviorKey: string): Promise<{
    requiresDecision: boolean; pending?: MainChainDocument['pendingViolation']
  }> {
    const chain = await MainChain.findOne({ userId, status: 'active' });
    if (!chain) throw new Error('主链不存在或已经断裂');
    if (chain.pendingViolation) {
      const current = await this.ensureDecisionToken(chain);
      return { requiresDecision: true, pending: current.pendingViolation };
    }
    if (!behaviorKey.trim() || behaviorKey.length > 200) {
      throw new Error('违规行为必须为1到200个字符；使用 /violation <行为> 上报');
    }
    const precedent = await new PrecedentService().reportViolation({
      userId,
      chainType: 'main',
      chainId: chain.chainId,
      behaviorKey: behaviorKey.trim()
    });
    if (!precedent.requiresDecision) return precedent;
    const updated = await MainChain.findOneAndUpdate(
      { _id: chain._id, status: 'active', pendingViolation: { $exists: false } },
      {
        $inc: { __v: 1 },
        $set: { pendingViolation: {
          behaviorKey: behaviorKey.trim(), reportedAt: new Date(), decisionToken: randomBytes(10).toString('hex')
        } }
      },
      { new: true }
    );
    if (!updated) throw new Error('主链判例状态已变化，请重新查看');
    return { requiresDecision: true, pending: updated.pendingViolation };
  }

  /** Omitted token means a trusted caller claims the current case; Telegram must supply its displayed token. */
  async resolve(userId: number, decision: ViolationOption, expectedDecisionToken?: string) {
    if (decision !== 'break_chain' && decision !== 'allow_forever') throw new Error('无效的判例决定');
    let existing = await MainChain.findOne({ userId, status: 'active' });
    if (!existing?.pendingViolation) {
      if (expectedDecisionToken) {
        const resolved = await this.readResolution(userId, expectedDecisionToken, decision);
        if (resolved) return resolved;
      }
      if (expectedDecisionToken) throw new Error('判例按钮已过期，请用 /violation 查看当前判例');
      throw new Error('待处理的主链判例不存在');
    }
    if (expectedDecisionToken && existing.pendingViolation.decisionToken !== expectedDecisionToken) {
      throw new Error('判例按钮已过期，请用 /violation 查看当前判例');
    }
    if (!existing.pendingViolation.decisionToken) existing = await this.ensureDecisionToken(existing);
    const pending = existing.pendingViolation;
    if (!pending?.decisionToken) throw new Error('主链判例状态已变化，请重新查看');
    expectedDecisionToken ??= pending.decisionToken;
    const taskChain = await TaskChain.findOne({ userId, status: 'active' });
    const taskIds = pending.taskIds ?? taskChain?.tasks.filter(task => {
      const node = existing!.nodes.find(entry => entry.taskId === task.taskId);
      if (task.creationState === 'initializing' || task.creationState === 'rolling_back') return false;
      if (task.mainChainId && !node) return false;
      if (task.status === 'running') return true;
      const confirmed = task.status === 'completed' || task.status === 'failed';
      const known = ['pending', 'processing', 'needs_retry', 'settled'].includes(task.settlementStatus ?? '');
      return confirmed && known && (node?.status === 'running' ||
        !task.mainChainId && task.settlementStatus !== 'settled');
    }).map(task => task.taskId) ?? [];
    const token = randomUUID();
    const now = new Date();
    const chain = await MainChain.findOneAndUpdate(
      {
        _id: existing._id,
        status: 'active',
        'pendingViolation.behaviorKey': pending.behaviorKey,
        'pendingViolation.decisionToken': pending.decisionToken,
        'pendingViolation.processingUntil': { $not: { $gt: now } },
        'pendingViolation.decision': { $in: [null, decision] }
      },
      {
        $set: {
          'pendingViolation.processingToken': token,
          'pendingViolation.processingUntil': new Date(now.getTime() + 60000),
          'pendingViolation.decision': decision,
          'pendingViolation.taskIds': taskIds,
          'pendingViolation.taskChainId': pending.taskChainId ?? taskChain?.chainId ?? null
        }
      },
      { new: true }
    );
    if (!chain?.pendingViolation) {
      const current = await MainChain.findOne({ _id: existing._id, status: 'active' });
      if (expectedDecisionToken && current?.pendingViolation?.decisionToken !== expectedDecisionToken) {
        throw new Error('判例按钮已过期，请用 /violation 查看当前判例');
      }
      throw new Error('主链判例正在处理或已选择另一决定');
    }
    // The chosen option remains sticky if any downstream step fails.
    try {
      if (decision === 'allow_forever') {
        await new PrecedentService().allowForever({
          userId,
          chainType: 'main',
          chainId: chain.chainId,
          behaviorKey: chain.pendingViolation.behaviorKey
        });
        return await this.finish(chain, token, false);
      }
      for (const taskId of chain.pendingViolation.taskIds ?? []) {
        await this.assertOwner(chain, token);
        const current = await TaskChain.findOne({ userId, 'tasks.taskId': taskId });
        const task = current?.tasks.find((entry) => entry.taskId === taskId);
        if (!task) throw new Error('主链判例关联任务不存在，需要审计');
        if (task.status === 'failed' && task.settlementStatus === 'settled') continue;
        if (task.status === 'completed') {
          if (task.settlementStatus !== 'settled') {
            await this.tasks.finishConfirmedTaskBeforeBreak(
              userId, taskId, chain.pendingViolation.decisionToken!, token
            );
          }
          continue;
        }
        await this.tasks.completeTask(userId, taskId, false, '主链判例选择断链');
      }
      await this.assertOwner(chain, token);
      if (chain.pendingViolation.taskChainId) {
        await TaskChain.updateOne({ userId, chainId: chain.pendingViolation.taskChainId, status: 'active' }, {
          $set: {
            status: 'broken', totalTasks: 0, completedTasks: 0, failedTasks: 0, totalMinutes: 0,
            averageTaskDuration: 0, brokenAt: new Date(), brokenReason: '主链判例选择断链'
          }, $inc: { __v: 1 }
        });
      }
      await this.assertOwner(chain, token);
      await User.updateOne({ userId }, { $set: { 'stats.currentStreak': 0 }, $inc: { __v: 1 } });
      return await this.finish(chain, token, true);
    } catch (error) {
      const resolved = await this.readResolution(userId, expectedDecisionToken, decision);
      if (resolved) return resolved;
      await MainChain.updateOne({ _id: chain._id, 'pendingViolation.processingToken': token }, {
        $unset: { 'pendingViolation.processingToken': 1, 'pendingViolation.processingUntil': 1 }
      });
      throw error;
    }
  }

  async recoverSelectedDecisions(userId?: number): Promise<void> {
    const cursor = MainChain.find({
      ...(userId === undefined ? {} : { userId }),
      status: 'active', 'pendingViolation.decision': { $in: ['break_chain', 'allow_forever'] },
      'pendingViolation.processingUntil': { $not: { $gt: new Date() } }
    }).cursor();
    let failures = 0;
    for await (const chain of cursor) {
      try {
        const current = await this.ensureDecisionToken(chain);
        const pending = current.pendingViolation!;
        await this.resolve(current.userId, pending.decision!, pending.decisionToken);
      } catch (error) {
        failures += 1;
        console.error('主链已选判例恢复失败', { chainId: chain.chainId, error: String(error) });
      }
    }
    if (failures) throw new Error(`${failures} 个主链判例等待恢复`);
  }

  private async readResolution(userId: number, decisionToken: string, decision: ViolationOption) {
    const chain = await MainChain.findOne({
      userId, violationResolutions: { $elemMatch: { decisionToken, decision } }
    });
    return chain ? { decision, chain, replayed: true } : null;
  }

  private async assertOwner(chain: MainChainDocument, token: string): Promise<void> {
    if (!(await MainChain.exists({
      _id: chain._id, status: 'active', 'pendingViolation.processingToken': token,
      'pendingViolation.processingUntil': { $gt: new Date() }
    }))) throw new Error('主链判例处理租约已过期，等待恢复');
  }

  private async ensureDecisionToken(chain: MainChainDocument): Promise<MainChainDocument> {
    if (chain.pendingViolation?.decisionToken) return chain;
    const updated = await MainChain.findOneAndUpdate({
      _id: chain._id, status: 'active',
      'pendingViolation.behaviorKey': chain.pendingViolation?.behaviorKey,
      'pendingViolation.reportedAt': chain.pendingViolation?.reportedAt,
      'pendingViolation.decisionToken': { $exists: false }
    }, { $set: { 'pendingViolation.decisionToken': randomBytes(10).toString('hex') } }, { new: true });
    if (updated?.pendingViolation?.decisionToken) return updated;
    const current = await MainChain.findOne({ _id: chain._id, status: 'active' });
    if (!current?.pendingViolation?.decisionToken) throw new Error('主链判例状态已变化，请重新查看');
    return current;
  }

  private async finish(chain: MainChainDocument, token: string, broken: boolean) {
    const updated = await MainChain.findOneAndUpdate(
      {
        _id: chain._id,
        status: 'active',
        'pendingViolation.processingToken': token,
        'pendingViolation.processingUntil': { $gt: new Date() }
      },
      {
        ...(broken ? { $set: { status: 'broken', nodes: [], levelCounters: { unit: 0, group: 0, cluster: 0 } } } : {}),
        $unset: { pendingViolation: 1 },
        $inc: { __v: 1 },
        $push: { violationResolutions: {
          decisionToken: chain.pendingViolation!.decisionToken,
          decision: broken ? 'break_chain' : 'allow_forever', settledAt: new Date()
        } }
      },
      { new: true }
    );
    if (!updated) throw new Error('主链判例处理已过期，请重新查看状态');
    return { decision: broken ? 'break_chain' : 'allow_forever', chain: updated, replayed: false };
  }
}

export default MainViolationService;
