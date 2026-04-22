import { User, DivinationHistory } from '../models/index.js';
import { generateId } from '../utils/index.js';
import logger from '../utils/logger.js';
import {
  BAGUA_DIVINATION,
  FORTUNE_EVENTS,
  getCurrentRealm
} from '../config/cultivation.js';
import {
  getBattleArtRegistryEntry,
  getBattleSlotLimits,
  getDivinePowerRegistryEntry,
  formatCanonicalRealmDisplay,
  formatCanonicalStage,
  getRuntimeContentName,
  getUnlockedRuntimeReadyBattleArts,
  getUnlockedRuntimeReadyDivinePowers,
  getCanonicalRealmByPower,
  getMainMethodById,
  projectCombatLoadout,
  getRealmById,
  resolveRealmSubStageId
} from '../config/xuanjianCanonical.js';
import { evaluateBreakthroughReadiness, resolveBreakthroughAttempt } from './BreakthroughEngine.js';
import CombatService from './CombatService.js';
import { getDivinationBuff, resolveFocusReward } from './CultivationRewardEngine.js';
import { resolveInjuryRecovery } from './InjuryRecoveryEngine.js';
import type { FortuneEvent } from '../types/cultivation.js';
import type { DevEncounterScript, DevEncounterType } from '../types/cultivationCanonical.js';
import type { IUserCultivationCanonical } from '../types/models.js';
import type {
  AscensionResult,
  BreakthroughResult,
  CultivationReward,
  CultivationStatusResult,
  DivinationCastResult,
  DivinationStatsResult
} from '../types/services.js';

interface LoadoutContentOption {
  id: string;
  name: string;
  category: string;
  equipped: boolean;
}

interface CombatLoadoutStatusResult {
  realmName: string;
  battleArts: LoadoutContentOption[];
  supportArt: { id: string; name: string } | null;
  divinePowers: Array<{ id: string; name: string; equipped: boolean }>;
  availableBattleArts: LoadoutContentOption[];
  availableSupportArts: Array<{ id: string; name: string }>;
  availableDivinePowers: Array<{ id: string; name: string; category: string; equipped: boolean }>;
}

class CultivationService {
  combatService = new CombatService();

  private isDevEncounterEnabled() {
    return (process.env.NODE_ENV ?? 'development') !== 'production';
  }

  private getDevEncounterScriptFromCanonical(canonical: IUserCultivationCanonical): DevEncounterScript | null {
    const rawScript = canonical.state.combatFlags.devEncounterScript;
    if (!rawScript || typeof rawScript !== 'object') {
      return null;
    }

    const script = rawScript as Partial<DevEncounterScript>;
    if (
      typeof script.type !== 'string'
      || !Number.isInteger(script.remainingUses)
      || !script.createdAt
      || !script.updatedAt
    ) {
      return null;
    }

    return {
      type: script.type as DevEncounterType,
      remainingUses: script.remainingUses as number,
      createdAt: new Date(script.createdAt),
      updatedAt: new Date(script.updatedAt)
    };
  }

  private setDevEncounterScriptValue(canonical: IUserCultivationCanonical, script: DevEncounterScript | null) {
    if (script) {
      canonical.state.combatFlags.devEncounterScript = script;
      return;
    }

    delete canonical.state.combatFlags.devEncounterScript;
  }

  private getDevCombatDetailEnabled(canonical: IUserCultivationCanonical): boolean {
    return canonical.state.combatFlags.devCombatDetailEnabled === true;
  }

  private setDevCombatDetailEnabledValue(canonical: IUserCultivationCanonical, enabled: boolean) {
    if (enabled) {
      canonical.state.combatFlags.devCombatDetailEnabled = true;
      return;
    }

    delete canonical.state.combatFlags.devCombatDetailEnabled;
  }

  private normalizePhaseAState(canonical: IUserCultivationCanonical): boolean {
    let changed = false;

    if (!canonical.state.realmSubStageId) {
      canonical.state.realmSubStageId = 'realmSubStage.taixi.xuanjing';
      changed = true;
    }

    if (!canonical.state.branchCultivationAttainments) {
      canonical.state.branchCultivationAttainments = {};
      changed = true;
    }

    if (!canonical.state.battleLoadout) {
      canonical.state.battleLoadout = {
        equippedBattleArtIds: canonical.state.equippedBattleArtIds.slice(0, 1),
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: null
      };
      changed = true;
    }

    if (!canonical.state.cooldowns) {
      canonical.state.cooldowns = {};
      changed = true;
    }

    if (!canonical.state.combatFlags) {
      canonical.state.combatFlags = {};
      changed = true;
    }

    if (!canonical.state.combatHistorySummary) {
      canonical.state.combatHistorySummary = [];
      changed = true;
    }

    if (!canonical.state.injuryState) {
      canonical.state.injuryState = {
        level: 'none',
        modifiers: []
      };
      changed = true;
    }

    return changed;
  }

  private syncRealmSubStage(canonical: IUserCultivationCanonical): boolean {
    const nextSubStageId = resolveRealmSubStageId(canonical.state.realmId, canonical.state.currentPower);
    if (canonical.state.realmSubStageId === nextSubStageId) {
      return false;
    }

    canonical.state.realmSubStageId = nextSubStageId;
    return true;
  }

  private formatCombatLoadoutStatus(canonical: IUserCultivationCanonical): CombatLoadoutStatusResult {
    const display = formatCanonicalRealmDisplay(canonical.state);
    const projectedLoadout = projectCombatLoadout(canonical.state);
    const unlockedBattleArts = getUnlockedRuntimeReadyBattleArts(canonical.state)
      .filter(({ entry }) => canonical.state.knownBattleArtIds.includes(entry.id));
    const unlockedDivinePowers = getUnlockedRuntimeReadyDivinePowers(canonical.state)
      .filter(({ entry }) => canonical.state.knownDivinePowerIds.includes(entry.id));

    const availableBattleArts = unlockedBattleArts
      .filter(({ entry }) => entry.category !== 'support')
      .map(({ entry }) => ({
        id: entry.id,
        name: getRuntimeContentName(entry.id),
        category: entry.category,
        equipped: projectedLoadout.battleArtIds.includes(entry.id)
      }));

    const availableSupportArts = unlockedBattleArts
      .filter(({ entry }) => entry.category === 'support')
      .map(({ entry }) => ({
        id: entry.id,
        name: getRuntimeContentName(entry.id)
      }));

    const availableDivinePowers = unlockedDivinePowers.map(({ entry }) => ({
      id: entry.id,
      name: getRuntimeContentName(entry.id),
      category: entry.category,
      equipped: projectedLoadout.divinePowerIds.includes(entry.id)
    }));

    const battleArts = availableBattleArts.filter((item) => item.equipped);
    const supportArt = projectedLoadout.activeSupportArtId
      ? availableSupportArts.find((item) => item.id === projectedLoadout.activeSupportArtId) ?? null
      : null;
    const divinePowers = availableDivinePowers.filter((item) => item.equipped);

    return {
      realmName: display.fullName,
      battleArts,
      supportArt,
      divinePowers,
      availableBattleArts,
      availableSupportArts,
      availableDivinePowers
    };
  }

  private uniqueIds(ids: string[]) {
    return [...new Set(ids)];
  }

  async getCombatLoadoutStatus(userId: number): Promise<CombatLoadoutStatusResult> {
    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    const normalizedPhaseA = this.normalizePhaseAState(canonical);
    const normalizedPhaseB = this.syncRealmSubStage(canonical);
    if (normalizedPhaseA || normalizedPhaseB) {
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();
    }

    return this.formatCombatLoadoutStatus(canonical);
  }

  async updateBattleArtLoadout(userId: number, ids: string[]): Promise<CombatLoadoutStatusResult> {
    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.syncRealmSubStage(canonical);
    const slotLimits = getBattleSlotLimits(canonical.state);

    const nextIds = this.uniqueIds(ids);
    if (nextIds.length === 0) {
      throw new Error('至少需要选择一门主战法门');
    }
    if (nextIds.length > slotLimits.battleArtSlots) {
      throw new Error(`当前境界最多只能配装 ${slotLimits.battleArtSlots} 门主战法门`);
    }

    const availableIds = new Set(
      getUnlockedRuntimeReadyBattleArts(canonical.state)
        .filter(({ entry }) => entry.category !== 'support' && canonical.state.knownBattleArtIds.includes(entry.id))
        .map(({ entry }) => entry.id)
    );
    const invalidIds = nextIds.filter((id) => !availableIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`以下法门当前不可配装：${invalidIds.join('、')}`);
    }

    canonical.state.battleLoadout.equippedBattleArtIds = nextIds;
    canonical.state.equippedBattleArtIds = nextIds;
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return this.formatCombatLoadoutStatus(canonical);
  }

  async updateSupportArtLoadout(userId: number, id: string | null): Promise<CombatLoadoutStatusResult> {
    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.syncRealmSubStage(canonical);
    const slotLimits = getBattleSlotLimits(canonical.state);

    if (id && slotLimits.supportSlots === 0) {
      throw new Error('当前境界尚未开启辅助法门槽');
    }

    if (id) {
      const availableIds = new Set(
        getUnlockedRuntimeReadyBattleArts(canonical.state)
          .filter(({ entry }) => entry.category === 'support' && canonical.state.knownBattleArtIds.includes(entry.id))
          .map(({ entry }) => entry.id)
      );
      if (!availableIds.has(id)) {
        throw new Error(`辅助法门当前不可配装：${id}`);
      }
    }

    canonical.state.battleLoadout.activeSupportArtId = id;
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return this.formatCombatLoadoutStatus(canonical);
  }

  async updateDivinePowerLoadout(userId: number, ids: string[]): Promise<CombatLoadoutStatusResult> {
    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.syncRealmSubStage(canonical);
    const slotLimits = getBattleSlotLimits(canonical.state);

    const nextIds = this.uniqueIds(ids);
    if (slotLimits.divinePowerSlots === 0) {
      if (nextIds.length === 0) {
        return this.formatCombatLoadoutStatus(canonical);
      }
      throw new Error('当前境界尚未开启神通槽');
    }
    if (nextIds.length > slotLimits.divinePowerSlots) {
      throw new Error(`当前境界最多只能配装 ${slotLimits.divinePowerSlots} 门神通`);
    }
    const availableIds = new Set(
      getUnlockedRuntimeReadyDivinePowers(canonical.state)
        .filter(({ entry }) => canonical.state.knownDivinePowerIds.includes(entry.id))
        .map(({ entry }) => entry.id)
    );
    const invalidIds = nextIds.filter((id) => !availableIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`以下神通当前不可配装：${invalidIds.join('、')}`);
    }

    canonical.state.battleLoadout.equippedDivinePowerIds = nextIds;
    canonical.state.equippedDivinePowerIds = nextIds;
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return this.formatCombatLoadoutStatus(canonical);
  }

  async getCultivationStatus(userId: number): Promise<CultivationStatusResult> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }
      const canonical = user.ensureCanonicalCultivation();
      const normalizedPhaseA = this.normalizePhaseAState(canonical);
      const normalizedPhaseB = this.syncRealmSubStage(canonical);
      if (normalizedPhaseA || normalizedPhaseB) {
        user.replaceCanonicalCultivation(canonical);
      }
      user.syncLegacyCultivationShell();
      if (normalizedPhaseA || normalizedPhaseB || user.isModified('cultivation.canonical') || user.isModified('cultivation')) {
        await user.save();
      }
      const display = formatCanonicalRealmDisplay(canonical.state);
      const mainMethod = getMainMethodById(canonical.state.mainMethodId);
      const readiness = evaluateBreakthroughReadiness({
        currentRealmId: canonical.state.realmId,
        currentPower: canonical.state.currentPower,
        cultivationAttainment: canonical.state.cultivationAttainment,
        mainMethodId: canonical.state.mainMethodId,
        inventory: canonical.inventory
      });
      const realmSpan = display.realm.maxPower - display.realm.minPower;
      const progress = realmSpan <= 0
        ? 100
        : Math.floor(((canonical.state.currentPower - display.realm.minPower) / realmSpan) * 100);
      const clampedProgress = Math.max(0, Math.min(100, progress));
      const nextRealmProgress = readiness.reason === 'max_realm'
        ? null
        : Math.max(0, display.realm.maxPower + 1 - canonical.state.currentPower);

      return {
        user,
        realm: {
          id: user.cultivation.realmId,
          canonicalId: display.realm.id,
          name: display.realm.name,
          minPower: display.realm.minPower,
          maxPower: display.realm.maxPower
        },
        stage: display.stage,
        fullName: display.fullName,
        title: display.title,
        progress: clampedProgress,
        nextRealmProgress,
        immortalStones: user.cultivation.immortalStones,
        ascensions: user.cultivation.ascensions,
        immortalMarks: user.cultivation.immortalMarks,
        breakthroughSuccesses: user.cultivation.breakthroughSuccesses,
        breakthroughFailures: user.cultivation.breakthroughFailures,
        canBreakthrough: readiness.ready,
        breakthroughReady: readiness.ready,
        breakthroughReadiness: readiness,
        cultivationAttainment: canonical.state.cultivationAttainment,
        mainMethodName: mainMethod.name,
        knownBattleArtCount: canonical.state.knownBattleArtIds.length,
        knownDivinePowerCount: canonical.state.knownDivinePowerIds.length,
        canonicalState: canonical.state,
        activeBuff: canonical.state.pendingDivinationBuff
          ? `${canonical.state.pendingDivinationBuff.label}：${canonical.state.pendingDivinationBuff.description}`
          : null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`获取修仙状态失败: ${message}`, { userId });
      throw error;
    }
  }

  async setDevEncounterScript(userId: number, type: DevEncounterType, count: number): Promise<DevEncounterScript> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在开发环境可用');
    }

    if (!['none', 'stones', 'item', 'combat'].includes(type)) {
      throw new Error('奇遇类别必须是 none / stones / item / combat');
    }

    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new Error('次数必须是 1 到 20 的整数');
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    const now = new Date();
    const script: DevEncounterScript = {
      type,
      remainingUses: count,
      createdAt: now,
      updatedAt: now
    };
    this.setDevEncounterScriptValue(canonical, script);
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return script;
  }

  async getDevEncounterScript(userId: number): Promise<DevEncounterScript | null> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在开发环境可用');
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    return this.getDevEncounterScriptFromCanonical(canonical);
  }

  async clearDevEncounterScript(userId: number): Promise<void> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在开发环境可用');
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.setDevEncounterScriptValue(canonical, null);
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();
  }

  async setDevCombatDetailEnabled(userId: number, enabled: boolean): Promise<boolean> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在测试环境可用');
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.setDevCombatDetailEnabledValue(canonical, enabled);
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return enabled;
  }

  async getDevCombatDetailStatus(userId: number): Promise<boolean> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在测试环境可用');
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    return this.getDevCombatDetailEnabled(canonical);
  }

  async grantBattleArtsForTesting(userId: number, ids: string[]): Promise<{
    grantedIds: string[];
    grantedNames: string[];
  }> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在测试环境可用');
    }

    const nextIds = this.uniqueIds(ids);
    if (nextIds.length === 0) {
      throw new Error('至少需要提供一门法门');
    }

    const invalidIds = nextIds.filter((id) => !getBattleArtRegistryEntry(id));
    if (invalidIds.length > 0) {
      throw new Error(`以下法门不存在：${invalidIds.join('、')}`);
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.syncRealmSubStage(canonical);

    canonical.state.knownBattleArtIds = this.uniqueIds([
      ...canonical.state.knownBattleArtIds,
      ...nextIds
    ]);

    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return {
      grantedIds: nextIds,
      grantedNames: nextIds.map((id) => getRuntimeContentName(id))
    };
  }

  async grantDivinePowersForTesting(userId: number, ids: string[]): Promise<{
    grantedIds: string[];
    grantedNames: string[];
  }> {
    if (!this.isDevEncounterEnabled()) {
      throw new Error('该命令仅在测试环境可用');
    }

    const nextIds = this.uniqueIds(ids);
    if (nextIds.length === 0) {
      throw new Error('至少需要提供一门神通');
    }

    const invalidIds = nextIds.filter((id) => !getDivinePowerRegistryEntry(id));
    if (invalidIds.length > 0) {
      throw new Error(`以下神通不存在：${invalidIds.join('、')}`);
    }

    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('用户不存在');
    }

    const canonical = user.ensureCanonicalCultivation();
    this.normalizePhaseAState(canonical);
    this.syncRealmSubStage(canonical);

    canonical.state.knownDivinePowerIds = this.uniqueIds([
      ...canonical.state.knownDivinePowerIds,
      ...nextIds
    ]);

    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    return {
      grantedIds: nextIds,
      grantedNames: nextIds.map((id) => getRuntimeContentName(id))
    };
  }

  async awardCultivation(userId: number, duration: number): Promise<CultivationReward> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }
      const canonical = user.ensureCanonicalCultivation();
      this.normalizePhaseAState(canonical);
      const oldRealmId = canonical.state.realmId;
      const oldRealmName = getRealmById(oldRealmId).name;
      const oldSpiritualPower = canonical.state.currentPower;
      const devEncounterScript = this.getDevEncounterScriptFromCanonical(canonical);

      const resolution = resolveFocusReward({
        duration,
        rng: Math.random,
        state: canonical.state,
        forcedEncounterType: devEncounterScript?.type ?? null
      });
      const injuryRecovery = resolveInjuryRecovery({
        duration,
        rawPowerGain: resolution.totalPowerGain,
        injuryLevel: canonical.state.injuryState.level
      });
      let encounter = resolution.encounter;
      let combatAttainmentDelta = 0;
      const awardedPowerGain = injuryRecovery.finalPowerGain;

      canonical.state.currentPower += awardedPowerGain;
      canonical.state.cultivationAttainment += resolution.attainmentDelta;
      canonical.state.focusStreak = resolution.nextFocusStreak;
      canonical.state.lastCultivationAt = new Date();
      canonical.state.realmId = getCanonicalRealmByPower(canonical.state.currentPower).id;
      if (injuryRecovery.applied) {
        canonical.state.injuryState = {
          level: injuryRecovery.nextInjuryLevel,
          modifiers: injuryRecovery.nextInjuryLevel === 'none' ? [] : canonical.state.injuryState.modifiers
        };
      }
      this.syncRealmSubStage(canonical);
      if (encounter.type === 'combat' && encounter.combatEncounterId) {
        const combat = this.combatService.resolveEncounterCombat({
          canonical,
          combatEncounterId: encounter.combatEncounterId,
          seed: Math.floor(Math.random() * 1_000_000)
        });
        const devCombatDetailEnabled = this.getDevCombatDetailEnabled(canonical);

        combatAttainmentDelta = combat.patch.cultivationAttainmentDelta;
        canonical.state.cultivationAttainment += combatAttainmentDelta;
        canonical.state.injuryState = {
          level: combat.patch.injuryLevel,
          modifiers: combat.patch.injuryLevel === 'none' ? [] : ['combat_loss']
        };
        canonical.state.cooldowns = {
          ...canonical.state.cooldowns,
          ...combat.patch.cooldownPatch
        };
        canonical.state.combatHistorySummary = [
          ...canonical.state.combatHistorySummary.slice(-4),
          {
            encounterId: combat.resolution.encounterId,
            result: combat.resolution.outcome,
            happenedAt: new Date(),
            summary: combat.resolution.summary,
            enemyName: combat.resolution.enemyName
          }
        ];
        encounter = {
          ...encounter,
          spiritStoneDelta: combat.patch.spiritStoneDelta,
          obtainedDefinitionIds: combat.patch.obtainedDefinitionIds,
          combatSummary: {
            encounterId: combat.resolution.encounterId,
            enemyName: combat.resolution.enemyName,
            result: combat.resolution.outcome,
            summary: combat.resolution.summary,
            injuryLevel: combat.patch.injuryLevel,
            rounds: devCombatDetailEnabled ? combat.resolution.rounds : undefined
          }
        };
      }
      // Consume divination buff after focus encounter
      canonical.state.pendingDivinationBuff = null;
      if (devEncounterScript) {
        const nextRemainingUses = devEncounterScript.remainingUses - 1;
        if (nextRemainingUses <= 0) {
          this.setDevEncounterScriptValue(canonical, null);
        } else {
          this.setDevEncounterScriptValue(canonical, {
            ...devEncounterScript,
            remainingUses: nextRemainingUses,
            updatedAt: new Date()
          });
        }
      }
      user.cultivation.totalSpiritualPowerEarned += awardedPowerGain;
      user.cultivation.peakSpiritualPower = Math.max(user.cultivation.peakSpiritualPower, canonical.state.currentPower);

      user.addImmortalStones(encounter.spiritStoneDelta);
      for (const definitionId of encounter.obtainedDefinitionIds) {
        user.grantInventoryDefinition(definitionId, encounter.type === 'combat' ? 'encounter' : 'focus');
      }
      if (encounter.type !== 'none') {
        user.cultivation.fortuneEventsTriggered += 1;
      }

      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();
      await user.save();

      const realmChanged = oldRealmId !== canonical.state.realmId;
      const readiness = evaluateBreakthroughReadiness({
        currentRealmId: canonical.state.realmId,
        currentPower: canonical.state.currentPower,
        cultivationAttainment: canonical.state.cultivationAttainment,
        mainMethodId: canonical.state.mainMethodId,
        inventory: canonical.inventory
      });

      return {
        spiritualPower: awardedPowerGain,
        immortalStones: encounter.spiritStoneDelta,
        cultivationAttainment: canonical.state.cultivationAttainment,
        cultivationAttainmentDelta: resolution.attainmentDelta + combatAttainmentDelta,
        mainMethodName: getMainMethodById(canonical.state.mainMethodId).name,
        encounter,
        injuryRecovery: injuryRecovery.applied
          ? {
            applied: true,
            previousLevel: injuryRecovery.previousInjuryLevel,
            nextLevel: injuryRecovery.nextInjuryLevel,
            summary: injuryRecovery.summary
          }
          : null,
        bonus: 1,
        fortuneEvent: {
          power: 0,
          stones: encounter.spiritStoneDelta,
          message: encounter.message
        },
        oldRealm: oldRealmName,
        newRealm: getRealmById(canonical.state.realmId).name,
        newStage: formatCanonicalStage(canonical.state.currentPower),
        realmChanged,
        oldSpiritualPower,
        newSpiritualPower: user.cultivation.spiritualPower,
        breakthroughReady: readiness.ready
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
      const canonical = user.ensureCanonicalCultivation();
      this.normalizePhaseAState(canonical);
      user.syncLegacyCultivationShell();

      if (!Number.isFinite(betAmount) || betAmount <= 0) {
        throw new Error('下注金额必须大于 0');
      }

      if (user.cultivation.immortalStones < betAmount) {
        throw new Error(`灵石不足！当前灵石：${user.cultivation.immortalStones}，需要：${betAmount}`);
      }

      const roll = Math.floor(Math.random() * 8) + 1;
      const gua = BAGUA_DIVINATION[roll]!;
      const result = Math.floor(betAmount * gua.multiplier);
      const powerBefore = user.cultivation.spiritualPower;
      const realmBefore = user.cultivation.realm;
      const stonesBefore = user.cultivation.immortalStones;

      // Set divination buff for next focus encounter
      const buff = getDivinationBuff(roll);
      canonical.state.pendingDivinationBuff = buff;
      user.replaceCanonicalCultivation(canonical);

      user.cultivation.immortalStones += result;
      user.recordDivination(result);
      user.syncLegacyCultivationShell();

      const powerAfter = user.cultivation.spiritualPower;
      const realmAfter = user.cultivation.realm;
      const realmChanged = false;
      const powerChange = 0;
      const newStage = user.cultivation.realmStage;

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
        powerAfter,
        realmBefore,
        realmAfter,
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
        powerAfter,
        realmBefore,
        realmAfter,
        realmChanged,
        newStage,
        buff
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
      const canonical = user.ensureCanonicalCultivation();
      this.normalizePhaseAState(canonical);
      const currentRealm = getRealmById(canonical.state.realmId);
      const result = resolveBreakthroughAttempt({
        currentRealmId: canonical.state.realmId,
        currentPower: canonical.state.currentPower,
        cultivationAttainment: canonical.state.cultivationAttainment,
        mainMethodId: canonical.state.mainMethodId,
        inventory: canonical.inventory,
        knownDivinePowerIds: canonical.state.knownDivinePowerIds
      });

      if (!result.success) {
        const reasonMessage = result.reason === 'max_realm'
          ? '已达当前体系最高境界，暂无更高可突破境界。'
          : result.reason === 'missing_requirement'
            ? '突破配置缺失，请联系管理员。'
            : `突破条件不足：${result.missing.join('、') || '未知条件'}`;
        return {
          success: false,
          message: `⚠️ 破境条件未满足\n\n${reasonMessage}`,
          penalty: 0,
          realmDemoted: false,
          newRealm: currentRealm.name,
          currentPower: canonical.state.currentPower
        };
      }

      const oldRealmName = currentRealm.name;
      const nextRealm = getRealmById(result.targetRealmId);
      canonical.state.realmId = result.targetRealmId;
      canonical.state.currentPower = Math.max(canonical.state.currentPower, nextRealm.minPower);
      this.syncRealmSubStage(canonical);
      canonical.inventory = result.updatedInventory;
      canonical.state.inventoryItemIds = result.updatedInventory
        .filter((item) => !item.used && item.stackCount > 0)
        .map((item) => item.instanceId);
      canonical.state.knownDivinePowerIds = result.updatedKnownDivinePowerIds;
      if (result.resetBreakthroughState) {
        canonical.breakthrough = result.nextBreakthroughState;
      }

      user.recordBreakthrough(true);
      user.replaceCanonicalCultivation(canonical);
      user.syncLegacyCultivationShell();

      // Update peak tracking after successful breakthrough
      if (user.cultivation.realmId > user.cultivation.peakRealmId) {
        user.cultivation.peakRealm = user.cultivation.realm;
        user.cultivation.peakRealmId = user.cultivation.realmId;
      }
      user.cultivation.peakSpiritualPower = Math.max(
        user.cultivation.peakSpiritualPower,
        canonical.state.currentPower
      );

      await user.save();

      logger.info(`渡劫成功: ${oldRealmName} → ${nextRealm.name}`, { userId });
      return {
        success: true,
        message: `⚡⚡⚡ 天劫降临！\n\n🎊 成功突破至 ${nextRealm.name}！\n📖 称号：${nextRealm.name}修士`,
        oldRealm: oldRealmName,
        newRealm: nextRealm.name,
        newTitle: `${nextRealm.name}修士`
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
      const canonical = user.ensureCanonicalCultivation();
      this.normalizePhaseAState(canonical);

      const currentRealm = getRealmById(canonical.state.realmId);
      if (canonical.state.realmId !== 'realm.yuanying') {
        throw new Error(`只有元婴修士才能飞升！\n当前境界：${currentRealm.name}`);
      }

      const requiredPower = 50000;
      if (canonical.state.currentPower < requiredPower) {
        throw new Error(`飞升需要 ${requiredPower} 修为！\n当前修为：${canonical.state.currentPower}`);
      }

      user.ascend();
      const ascendedCanonical = user.ensureCanonicalCultivation();
      this.normalizePhaseAState(ascendedCanonical);
      this.syncRealmSubStage(ascendedCanonical);
      user.replaceCanonicalCultivation(ascendedCanonical);
      user.syncLegacyCultivationShell();

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
