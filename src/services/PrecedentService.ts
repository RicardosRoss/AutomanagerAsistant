import { PrecedentRule } from '../models/index.js';
import logger from '../utils/logger.js';
import type { PrecedentRuleDocument } from '../types/models.js';

export interface ViolationInput {
  userId: number;
  chainType: 'main' | 'aux';
  chainId: string;
  behaviorKey: string;
}

export const VIOLATION_OPTIONS = ['break_chain', 'allow_forever'] as const;
export type ViolationOption = (typeof VIOLATION_OPTIONS)[number];

export interface ViolationResult {
  requiresDecision: boolean;
  options?: typeof VIOLATION_OPTIONS;
  decision?: 'allow_forever';
}

class PrecedentService {
  /**
   * Report a violation and check if a user decision is needed.
   *
   * - If a PrecedentRule with decision='allow_forever' exists for this
   *   userId + behaviorKey + chainType, the behavior is auto-allowed.
   * - Otherwise the user must choose between break_chain and allow_forever.
   */
  async reportViolation(input: ViolationInput): Promise<ViolationResult> {
    try {
      const existing = await PrecedentRule.findOne({
        userId: input.userId,
        'scope.behaviorKey': input.behaviorKey,
        'scope.chainType': input.chainType
      });

      if (existing && existing.decision === 'allow_forever') {
        logger.info(
          `PrecedentService: behavior "${input.behaviorKey}" auto-allowed for user ${input.userId}`,
          { userId: input.userId, behaviorKey: input.behaviorKey, chainType: input.chainType }
        );

        return {
          requiresDecision: false,
          decision: 'allow_forever'
        };
      }

      logger.info(
        `PrecedentService: new violation "${input.behaviorKey}" for user ${input.userId}`,
        { userId: input.userId, behaviorKey: input.behaviorKey, chainType: input.chainType }
      );

      return {
        requiresDecision: true,
        options: VIOLATION_OPTIONS
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`PrecedentService reportViolation failed: ${message}`, {
        userId: input.userId,
        behaviorKey: input.behaviorKey,
        chainType: input.chainType
      });
      throw new Error(`PrecedentService reportViolation 失败: ${message}`);
    }
  }

  /**
   * Apply an "allow forever" decision for a behavior.
   * Creates a PrecedentRule (upsert-safe thanks to the compound unique index).
   */
  async allowForever(input: {
    userId: number;
    chainType: 'main' | 'aux';
    behaviorKey: string;
  }): Promise<PrecedentRuleDocument> {
    try {
      const rule = await PrecedentRule.findOneAndUpdate(
        {
          userId: input.userId,
          'scope.behaviorKey': input.behaviorKey,
          'scope.chainType': input.chainType
        },
        {
          $setOnInsert: {
            userId: input.userId,
            scope: {
              behaviorKey: input.behaviorKey,
              chainType: input.chainType
            },
            decision: 'allow_forever',
            createdAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      logger.info(
        `PrecedentService: allow_forever set for "${input.behaviorKey}" (user ${input.userId}, ${input.chainType})`,
        { userId: input.userId, behaviorKey: input.behaviorKey, chainType: input.chainType }
      );

      return rule;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`PrecedentService allowForever failed: ${message}`, {
        userId: input.userId,
        behaviorKey: input.behaviorKey,
        chainType: input.chainType
      });
      throw new Error(`PrecedentService allowForever 失败: ${message}`);
    }
  }

  /**
   * Check whether a behavior is already allowed for a given user + chainType.
   */
  async isBehaviorAllowed(
    userId: number,
    behaviorKey: string,
    chainType: 'main' | 'aux'
  ): Promise<boolean> {
    try {
      const count = await PrecedentRule.countDocuments({
        userId,
        'scope.behaviorKey': behaviorKey,
        'scope.chainType': chainType,
        decision: 'allow_forever'
      });

      return count > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`PrecedentService isBehaviorAllowed failed: ${message}`, {
        userId,
        behaviorKey,
        chainType
      });
      throw new Error(`PrecedentService isBehaviorAllowed 失败: ${message}`);
    }
  }
}

export default PrecedentService;
