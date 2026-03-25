import { User, DivinationHistory } from '../models/index.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import {
  BAGUA_DIVINATION,
  FORTUNE_EVENTS,
  canAttemptBreakthrough,
  calculateCultivationBonus,
  formatRealmDisplay,
  getCurrentRealm,
  getNextRealm,
  getRealmStage
} from '../config/cultivation.js';
import type { FortuneEvent } from '../types/cultivation.js';
import type {
  AscensionResult,
  BreakthroughResult,
  CultivationReward,
  CultivationStatusResult,
  DivinationCastResult,
  DivinationStatsResult
} from '../types/services.js';

class CultivationService {
  async getCultivationStatus(userId: number): Promise<CultivationStatusResult> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      const display = formatRealmDisplay(user.cultivation.spiritualPower);

      return {
        user,
        ...display,
        immortalStones: user.cultivation.immortalStones,
        ascensions: user.cultivation.ascensions,
        immortalMarks: user.cultivation.immortalMarks,
        breakthroughSuccesses: user.cultivation.breakthroughSuccesses,
        breakthroughFailures: user.cultivation.breakthroughFailures,
        canBreakthrough: canAttemptBreakthrough(user.cultivation.spiritualPower, display.realm)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取修仙状态失败: ${message}`, { userId });
      throw error;
    }
  }

  async awardCultivation(userId: number, duration: number): Promise<CultivationReward> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      const currentRealm = getCurrentRealm(user.cultivation.spiritualPower);
      const currentStage = getRealmStage(user.cultivation.spiritualPower, currentRealm);
      const bonus = calculateCultivationBonus(currentRealm, currentStage);
      const basePower = duration;
      const spiritualPower = Math.floor(basePower * bonus);
      const immortalStones = Math.floor(duration * 0.5);
      const fortuneEvent = this.checkFortuneEvent();
      const fortuneBonus = {
        power: 0,
        stones: 0,
        message: null as string | null
      };

      if (fortuneEvent) {
        user.cultivation.fortuneEventsTriggered += 1;

        if (fortuneEvent.reward.type === 'power') {
          if (typeof fortuneEvent.reward.amount === 'number') {
            fortuneBonus.power = fortuneEvent.reward.amount;
          } else if (typeof fortuneEvent.reward.multiplier === 'number') {
            fortuneBonus.power = Math.floor(spiritualPower * (fortuneEvent.reward.multiplier - 1));
          }
        } else if (fortuneEvent.reward.type === 'stones') {
          fortuneBonus.stones = fortuneEvent.reward.amount;
        } else {
          fortuneBonus.power = fortuneEvent.reward.power;
          fortuneBonus.stones = fortuneEvent.reward.stones;
        }

        fortuneBonus.message = fortuneEvent.message;

        logger.info(`仙缘触发: ${fortuneEvent.name}`, { userId, event: fortuneEvent.id });
      }

      const totalPower = spiritualPower + fortuneBonus.power;
      const totalStones = immortalStones + fortuneBonus.stones;
      const oldRealm = currentRealm;
      const oldSpiritualPower = user.cultivation.spiritualPower;

      user.addSpiritualPower(totalPower);
      user.addImmortalStones(totalStones);

      const newRealm = getCurrentRealm(user.cultivation.spiritualPower);
      const newStage = getRealmStage(user.cultivation.spiritualPower, newRealm);
      let realmChanged = false;

      if (newRealm.id !== oldRealm.id) {
        user.updateRealm(newRealm);
        realmChanged = true;
        logger.info(`境界提升: ${oldRealm.name} → ${newRealm.name}`, { userId });
      }

      user.updateRealmStage(newStage.name);
      await user.save();

      return {
        spiritualPower: totalPower,
        immortalStones: totalStones,
        bonus,
        fortuneEvent: fortuneBonus,
        oldRealm: oldRealm.name,
        newRealm: newRealm.name,
        newStage: newStage.name,
        realmChanged,
        oldSpiritualPower,
        newSpiritualPower: user.cultivation.spiritualPower
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`奖励修炼失败: ${message}`, { userId, duration });
      throw error;
    }
  }

  async castDivination(userId: number, betAmount: number): Promise<DivinationCastResult> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      if (user.cultivation.immortalStones < betAmount) {
        throw new Error(`仙石不足！当前仙石：${user.cultivation.immortalStones}，需要：${betAmount}`);
      }

      const roll = Math.floor(Math.random() * 8) + 1;
      const gua = BAGUA_DIVINATION[roll]!;
      const result = Math.floor(betAmount * gua.multiplier);
      const powerBefore = user.cultivation.spiritualPower;
      const realmBefore = user.cultivation.realm;
      const stonesBefore = user.cultivation.immortalStones;

      user.cultivation.immortalStones += result;

      const powerChange = result * 2;
      user.cultivation.spiritualPower += powerChange;

      if (user.cultivation.spiritualPower < 0) {
        user.cultivation.spiritualPower = 0;
      }

      const newRealm = getCurrentRealm(user.cultivation.spiritualPower);
      const newStage = getRealmStage(user.cultivation.spiritualPower, newRealm);
      const realmChanged = newRealm.name !== realmBefore;

      if (realmChanged) {
        user.updateRealm(newRealm);
        logger.info(`占卜导致境界变化: ${realmBefore} → ${newRealm.name}`, { userId, result });
      }

      user.updateRealmStage(newStage.name);
      user.recordDivination(result);

      const gameId = generateId('divination');
      await DivinationHistory.create({
        userId,
        gameId,
        betAmount,
        diceRoll: roll,
        guaName: gua.name,
        guaEmoji: gua.emoji,
        meaning: gua.meaning,
        multiplier: gua.multiplier,
        result,
        stonesAfter: user.cultivation.immortalStones,
        powerBefore,
        powerAfter: user.cultivation.spiritualPower,
        realmBefore,
        realmAfter: newRealm.name,
        realmChanged
      });

      await user.save();

      logger.info(`占卜完成: ${gua.name}`, {
        userId,
        roll,
        betAmount,
        result,
        realmChanged
      });

      return {
        roll,
        gua,
        betAmount,
        result,
        powerChange,
        stonesBefore,
        stonesAfter: user.cultivation.immortalStones,
        powerBefore,
        powerAfter: user.cultivation.spiritualPower,
        realmBefore,
        realmAfter: newRealm.name,
        realmChanged,
        newStage: newStage.name
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`占卜失败: ${message}`, { userId, betAmount });
      throw error;
    }
  }

  async attemptBreakthrough(userId: number): Promise<BreakthroughResult> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      const currentRealm = getCurrentRealm(user.cultivation.spiritualPower);

      if (!canAttemptBreakthrough(user.cultivation.spiritualPower, currentRealm)) {
        throw new Error(
          `灵力未达到境界巅峰，无法渡劫！\n当前灵力：${user.cultivation.spiritualPower}\n需要灵力：${currentRealm.maxPower}`
        );
      }

      if (currentRealm.id === 9) {
        throw new Error('大乘期需要使用 /ascension 命令飞升！');
      }

      const nextRealm = getNextRealm(currentRealm.id);
      if (!nextRealm) {
        throw new Error('已达最高境界');
      }

      const successRate = currentRealm.breakthrough.successRate;
      const roll = Math.random() * 100;
      const success = roll <= successRate;

      if (success) {
        user.updateRealm(nextRealm);
        user.updateRealmStage('初期');
        user.recordBreakthrough(true);

        if (nextRealm.id === 5) {
          user.addAchievement('化神真君');
        } else if (nextRealm.id === 9) {
          user.addAchievement('大乘至尊');
        }

        await user.save();
        logger.info(`渡劫成功: ${currentRealm.name} → ${nextRealm.name}`, { userId });

        return {
          success: true,
          message:
            `⚡⚡⚡ 天劫降临！\n\n${currentRealm.breakthrough.message}\n\n`
            + `🎊 成功突破至 ${nextRealm.emoji} ${nextRealm.name}！\n📖 称号：${nextRealm.title}`,
          oldRealm: currentRealm.name,
          newRealm: nextRealm.name,
          newTitle: nextRealm.title
        };
      }

      const penalty = currentRealm.breakthrough.failurePenalty;
      user.cultivation.spiritualPower -= penalty;
      user.recordBreakthrough(false);

      const newRealm = getCurrentRealm(user.cultivation.spiritualPower);
      const realmDemoted = newRealm.id < currentRealm.id;

      if (realmDemoted) {
        user.updateRealm(newRealm);
        const newStage = getRealmStage(user.cultivation.spiritualPower, newRealm);
        user.updateRealmStage(newStage.name);
      }

      await user.save();
      logger.warn('渡劫失败', { userId, penalty, realmDemoted });

      let message = `💥 天劫之力过于强大！渡劫失败！\n\n📉 灵力损失：${penalty}\n⚡ 当前灵力：${user.cultivation.spiritualPower}`;
      if (realmDemoted) {
        message += `\n\n😱 境界跌落至 ${newRealm.emoji} ${newRealm.name}`;
      }
      message += '\n\n💪 不要气馁，继续修炼，下次定能成功！';

      return {
        success: false,
        message,
        penalty,
        realmDemoted,
        newRealm: newRealm.name,
        currentPower: user.cultivation.spiritualPower
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`渡劫失败: ${message}`, { userId });
      throw error;
    }
  }

  async ascend(userId: number): Promise<AscensionResult> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      const currentRealm = getCurrentRealm(user.cultivation.spiritualPower);
      if (currentRealm.id !== 9) {
        throw new Error(`只有大乘期修士才能飞升！\n当前境界：${currentRealm.name}`);
      }

      const requiredPower = 50000;
      if (user.cultivation.spiritualPower < requiredPower) {
        throw new Error(`飞升需要 ${requiredPower} 灵力！\n当前灵力：${user.cultivation.spiritualPower}`);
      }

      user.ascend();

      if (user.cultivation.ascensions === 1) {
        user.addAchievement('首次飞升');
      } else if (user.cultivation.ascensions === 3) {
        user.addAchievement('三次飞升');
      } else if (user.cultivation.ascensions === 10) {
        user.addAchievement('飞升大能');
      }

      await user.save();

      logger.info('飞升成功', {
        userId,
        ascensionCount: user.cultivation.ascensions,
        immortalMarks: user.cultivation.immortalMarks
      });

      return {
        success: true,
        ascensionCount: user.cultivation.ascensions,
        immortalMarks: user.cultivation.immortalMarks,
        message:
          '☁️☁️☁️ 天门洞开！\n\n🌟 功德圆满，飞升仙界！\n\n'
          + `👑 获得仙位印记 x1\n📊 总飞升次数：${user.cultivation.ascensions}\n`
          + `💫 仙位印记：${user.cultivation.immortalMarks}\n\n`
          + '🔄 境界重置为炼气期，开启新一轮修仙之路！'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`飞升失败: ${message}`, { userId });
      throw error;
    }
  }

  async getDivinationHistory(userId: number, limit = 10) {
    try {
      return await DivinationHistory.getUserHistory(userId, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取占卜历史失败: ${message}`, { userId });
      throw error;
    }
  }

  async getDivinationStats(userId: number): Promise<DivinationStatsResult> {
    try {
      return await DivinationHistory.getUserStats(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取占卜统计失败: ${message}`, { userId });
      throw error;
    }
  }

  async getLeaderboard(type = 'power', limit = 10) {
    try {
      return await User.getCultivationLeaderboard(type, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取排行榜失败: ${message}`, { type, limit });
      throw error;
    }
  }

  checkFortuneEvent(): FortuneEvent | null {
    const roll = Math.random();
    let cumulativeProbability = 0;

    for (const event of FORTUNE_EVENTS) {
      cumulativeProbability += event.probability;
      if (roll <= cumulativeProbability) {
        return event;
      }
    }

    return null;
  }
}

export default CultivationService;
