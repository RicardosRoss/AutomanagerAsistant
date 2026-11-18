import AuxChain from '../models/AuxChain.js';
import type { AuxChainDocument, IReservationHistoryEntry } from '../types/models.js';
import PrecedentService, { type ViolationOption } from './PrecedentService.js';
import { randomBytes, randomUUID } from 'node:crypto';

interface ReservationQueue {
  cancelReservation(id: string): Promise<boolean>;
  rescheduleReservation(id: string, delay: number): Promise<string | number | undefined>;
}

class AuxiliaryRulesService {
  constructor(private queue: ReservationQueue | null) {}

  async request(
    userId: number,
    reservationId: string,
    behaviorKey: string,
    delayMinutes?: number
  ): Promise<AuxChainDocument> {
    const chain = await AuxChain.findOne({
      userId,
      status: 'active',
      'pendingReservation.reservationId': reservationId
    });
    if (!chain?.pendingReservation) throw new Error('预约不存在或已处理');
    if (chain.pendingReservation.status === 'starting') throw new Error('预约正在启动，请稍后查看任务状态');
    if (chain.pendingDecision?.chosenDecision) throw new Error('判例决定正在处理，请重试之前选择的选项');
    if (chain.pendingDecision && chain.pendingDecision.behaviorKey !== behaviorKey) {
      throw new Error('请先处理当前预约的判例决定');
    }
    if (delayMinutes !== undefined && (!Number.isInteger(delayMinutes) || delayMinutes <= 0 || delayMinutes > 15)) {
      throw new Error('延期只能为1到15分钟，且必须按下必为例处理');
    }
    const precedent = new PrecedentService();
    const violation = await precedent.reportViolation({
      userId,
      chainType: 'aux',
      chainId: chain.chainId,
      behaviorKey
    });
    const requested = await AuxChain.findOneAndUpdate({
      _id: chain._id,
      status: 'active',
      'pendingReservation.reservationId': reservationId,
      'pendingReservation.status': { $in: ['pending', 'expired'] },
      pendingDecision: { $exists: false }
    }, { $set: {
      pendingDecision: {
        behaviorKey, delayMinutes, decisionToken: randomBytes(10).toString('hex'),
        ...(!violation.requiresDecision ? { chosenDecision: 'allow_forever', resolutionAt: new Date() } : {})
      },
      ...(behaviorKey === 'missed_start' ? { 'pendingReservation.status': 'expired' } : {})
    } }, { new: true });
    if (!requested) {
      const current = await AuxChain.findById(chain._id);
      if (current?.pendingReservation?.status === 'starting') throw new Error('预约正在启动，请稍后查看任务状态');
      if (!current?.pendingDecision || current.pendingDecision.behaviorKey !== behaviorKey) {
        throw new Error('预约状态已变化，请先处理当前判例');
      }
      return current;
    }
    if (!violation.requiresDecision) {
      return this.resolve(userId, reservationId, 'allow_forever', requested.pendingDecision?.decisionToken);
    }
    return requested;
  }

  /** Omitted token means a trusted caller claims the current case; Telegram must supply its displayed token. */
  async resolve(
    userId: number, reservationId: string, decision: ViolationOption, expectedDecisionToken?: string
  ): Promise<AuxChainDocument> {
    if (decision !== 'break_chain' && decision !== 'allow_forever') throw new Error('无效的判例决定');
    let existing = await AuxChain.findOne({
      userId,
      status: 'active',
      'pendingReservation.reservationId': reservationId
    });
    if (!existing?.pendingReservation || !existing.pendingDecision) throw new Error('待处理的预约判例不存在');
    if (expectedDecisionToken && existing.pendingDecision.decisionToken !== expectedDecisionToken) {
      throw new Error('判例按钮已过期，请用 /reserve_status 查看当前判例');
    }
    if (!existing.pendingDecision.decisionToken) existing = await this.ensureDecisionToken(existing);
    const pending = existing.pendingDecision;
    if (!pending?.decisionToken) throw new Error('预约判例状态已变化，请重新查看');
    expectedDecisionToken ??= pending.decisionToken;
    const processingToken = randomUUID();
    const now = new Date();
    const chain = await AuxChain.findOneAndUpdate(
      {
        _id: existing._id,
        'pendingReservation.reservationId': reservationId,
        'pendingDecision.behaviorKey': pending.behaviorKey,
        'pendingDecision.decisionToken': pending.decisionToken,
        'pendingDecision.processingUntil': { $not: { $gt: now } },
        'pendingDecision.chosenDecision': { $in: [null, decision] }
      },
      {
        $set: {
          'pendingDecision.processingToken': processingToken,
          'pendingDecision.processingUntil': new Date(now.getTime() + 60000),
          'pendingDecision.chosenDecision': decision,
          'pendingDecision.resolutionId': pending.resolutionId ?? randomUUID(),
          'pendingDecision.resolutionAt': pending.resolutionAt ?? now
        }
      },
      { new: true }
    );
    if (!chain?.pendingReservation || !chain.pendingDecision) {
      if (expectedDecisionToken) {
        const current = await AuxChain.findById(existing._id);
        if (current?.pendingDecision?.decisionToken !== expectedDecisionToken) {
          throw new Error('判例按钮已过期，请用 /reserve_status 查看当前判例');
        }
      }
      throw new Error('判例正在处理或已选择另一决定，请稍后重试');
    }
    const { behaviorKey, delayMinutes } = chain.pendingDecision;
    const reservation = chain.pendingReservation;
    const entry: IReservationHistoryEntry = {
      resolutionId: chain.pendingDecision.resolutionId,
      reservationId,
      signal: reservation.signal,
      duration: reservation.duration,
      createdAt: reservation.createdAt,
      status: behaviorKey === 'missed_start' ? 'expired' : delayMinutes ? 'delayed' : 'cancelled'
    };
    const owner = { _id: chain._id, 'pendingDecision.processingToken': processingToken };
    try {
      if (decision === 'allow_forever') {
        await new PrecedentService().allowForever({ userId, chainType: 'aux', chainId: chain.chainId, behaviorKey });
        if (delayMinutes) {
          entry.delayMinutes = delayMinutes;
          entry.delayedAt = chain.pendingDecision.resolutionAt;
          reservation.status = 'pending';
          const resolutionAt = chain.pendingDecision.resolutionAt;
          if (!resolutionAt || !Number.isFinite(resolutionAt.getTime())) throw new Error('判例决定时间无效，请重新查看');
          reservation.deadlineAt = new Date(resolutionAt.getTime() + delayMinutes * 60000);
        } else {
          chain.pendingReservation = undefined;
        }
      } else if (decision === 'break_chain') {
        chain.status = 'inactive';
        chain.completedReservations = 0;
        chain.pendingReservation = undefined;
      } else {
        throw new Error('无效的判例决定');
      }
      const updated = await AuxChain.findOneAndUpdate(
        owner,
        {
          $set: {
            status: chain.status, completedReservations: chain.completedReservations,
            ...(chain.pendingReservation ? { pendingReservation: chain.pendingReservation } : {})
          },
          $unset: { pendingDecision: 1, ...(chain.pendingReservation ? {} : { pendingReservation: 1 }) },
          $push: { reservationHistory: entry }
        },
        { new: true }
      );
      if (!updated) throw new Error('判例处理已过期，请重新查看预约状态');
      await this.syncResolvedQueue(reservationId, updated);
      return updated;
    } catch (error) {
      const persisted = await AuxChain.findById(chain._id);
      if (persisted?.reservationHistory.some((item) => item.resolutionId === entry.resolutionId)) {
        await this.syncResolvedQueue(reservationId, persisted);
        return persisted;
      }
      await AuxChain.updateOne(owner, {
        $unset: {
          'pendingDecision.processingToken': 1,
          'pendingDecision.processingUntil': 1
        }
      });
      throw error;
    }
  }

  private async ensureDecisionToken(chain: AuxChainDocument): Promise<AuxChainDocument> {
    if (chain.pendingDecision?.decisionToken) return chain;
    const updated = await AuxChain.findOneAndUpdate({
      _id: chain._id, status: 'active',
      'pendingReservation.reservationId': chain.pendingReservation?.reservationId,
      'pendingDecision.behaviorKey': chain.pendingDecision?.behaviorKey,
      'pendingDecision.resolutionId': chain.pendingDecision?.resolutionId ?? { $exists: false },
      'pendingDecision.decisionToken': { $exists: false }
    }, { $set: { 'pendingDecision.decisionToken': randomBytes(10).toString('hex') } }, { new: true });
    if (!updated?.pendingDecision?.decisionToken) throw new Error('预约判例状态已变化，请重新查看');
    return updated;
  }

  async recoverSelectedDecision(reservationId: string): Promise<boolean> {
    let chain = await AuxChain.findOne({ status: 'active', 'pendingReservation.reservationId': reservationId });
    if (!chain?.pendingDecision?.chosenDecision) return false;
    chain = await this.ensureDecisionToken(chain);
    const decision = chain.pendingDecision!.chosenDecision!;
    if (chain.pendingDecision?.processingUntil && chain.pendingDecision.processingUntil.getTime() > Date.now()) {
      return true;
    }
    await this.resolve(chain.userId, reservationId, decision, chain.pendingDecision?.decisionToken);
    return true;
  }

  private async syncResolvedQueue(reservationId: string, chain: AuxChainDocument): Promise<void> {
    try {
      const reservation = chain.pendingReservation;
      if (reservation?.reservationId === reservationId && reservation.deadlineAt) {
        await this.queue?.rescheduleReservation(
          reservationId, Math.max(0, reservation.deadlineAt.getTime() - Date.now())
        );
      } else {
        await this.queue?.cancelReservation(reservationId);
      }
    } catch (error) {
      // MongoDB has committed the decision. The persistent reconciler repairs
      // the disposable queue state without asking the user to decide again.
      console.warn('⚠️ 判例已落库，队列同步失败，等待预约对账恢复', {
        reservationId, error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async expire(reservationId: string): Promise<{ expired: boolean; auxChain: AuxChainDocument | null }> {
    const chain = await AuxChain.findOne({ status: 'active', 'pendingReservation.reservationId': reservationId });
    if (chain?.pendingReservation?.status === 'starting') return { expired: false, auxChain: null };
    if (chain?.pendingDecision) return { expired: true, auxChain: chain };
    if (!chain?.pendingReservation?.deadlineAt || chain.pendingReservation.deadlineAt.getTime() > Date.now()) {
      return { expired: false, auxChain: null };
    }
    return { expired: true, auxChain: await this.request(chain.userId, reservationId, 'missed_start') };
  }
}

export default AuxiliaryRulesService;
