import {
  getDurationBaseValue,
  getGeneralAttainmentMultiplier,
  getMainLineageMultiplier,
  getMainMethodById,
  getRealmById,
  getRealmTemplateCoefficient,
  isUniversalDaoTrack,
  normalizeMainDaoTrack
} from '../config/xuanjianCanonical.js';
import {
  buildGuardianEncounter,
  listCombatEncounterIdsByRealm,
  rollEncounterLoot,
  rollGuardianPrototypeId
} from '../config/xuanjianCombat.js';
import type {
  DevEncounterType,
  DivinationBuff,
  PlayerCultivationState,
  RealmId
} from '../types/cultivationCanonical.js';
import type { CultivationEncounterResult } from '../types/services.js';

const FALLBACK_COMBAT_ENCOUNTER_ID = 'combatEncounter.taixi.roadside_wolf';
const FOCUS_SPECIALIZATION_REALM_ORDER: RealmId[] = [
  'realm.taixi',
  'realm.lianqi',
  'realm.zhuji',
  'realm.zifu',
  'realm.jindan',
  'realm.yuanying'
];

const FOCUS_ENCOUNTER_TABLE = [
  {
    id: 'encounter.none',
    threshold: 0.78,
    result: { type: 'none', message: null, spiritStoneDelta: 0, obtainedDefinitionIds: [] }
  },
  {
    id: 'encounter.stones_gain',
    threshold: 0.88,
    result: { type: 'stones', message: '偶得灵石', spiritStoneDelta: 8, obtainedDefinitionIds: [] }
  },
  {
    id: 'encounter.stones_loss',
    threshold: 0.93,
    result: { type: 'stones', message: '护道花费', spiritStoneDelta: -5, obtainedDefinitionIds: [] }
  },
  {
    id: 'encounter.material_drop',
    threshold: 0.97,
    result: {
      type: 'item',
      message: '得到破境辅材',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: ['material.yellow_breakthrough_token']
    }
  },
  {
    id: 'encounter.combat_trial',
    threshold: 0.995,
    result: {
      type: 'combat',
      message: '林间妖气骤起，奇妖来袭。',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: [],
      combatEncounterId: FALLBACK_COMBAT_ENCOUNTER_ID
    }
  },
  {
    id: 'encounter.pill_drop',
    threshold: 1,
    result: {
      type: 'item',
      message: '得到低阶丹药',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: ['consumable.low_cultivation_pill']
    }
  }
] as const satisfies ReadonlyArray<{
  id: string;
  threshold: number;
  result: CultivationEncounterResult;
}>;

function normalizeRoll(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.999999, value));
}

function isRealmAtLeast(currentRealmId: RealmId, floorRealmId: RealmId): boolean {
  const currentIndex = FOCUS_SPECIALIZATION_REALM_ORDER.indexOf(currentRealmId);
  const floorIndex = FOCUS_SPECIALIZATION_REALM_ORDER.indexOf(floorRealmId);
  return currentIndex >= 0 && floorIndex >= 0 && currentIndex >= floorIndex;
}

function pickCombatEncounterId(rng: () => number, realmId: RealmId) {
  const pool = listCombatEncounterIdsByRealm(realmId);
  if (pool.length === 0) {
    return FALLBACK_COMBAT_ENCOUNTER_ID;
  }

  const roll = normalizeRoll(rng());
  const index = Math.floor(roll * pool.length);
  return pool[index] ?? pool[0] ?? FALLBACK_COMBAT_ENCOUNTER_ID;
}

function getOfferRealmSubStageId(realmId: RealmId) {
  if (realmId === 'realm.zhuji') return 'realmSubStage.zhuji.middle';
  if (realmId === 'realm.lianqi') return 'realmSubStage.lianqi.5';
  return 'realmSubStage.taixi.qingyuan';
}

function buildOfferResult(realmId: RealmId, rng: () => number): CultivationEncounterResult {
  const loot = rollEncounterLoot(rng);
  const prototypeId = rollGuardianPrototypeId(rng, loot.tier);
  const generated = buildGuardianEncounter({
    prototypeId,
    realmId,
    realmSubStageId: getOfferRealmSubStageId(realmId),
    lootTier: loot.tier,
    seed: Math.floor(rng() * 1_000_000)
  });

  return {
    type: 'offer',
    message: `✨ 你发现了 ${loot.displayName}，却有守宝之物拦路。`,
    spiritStoneDelta: 0,
    obtainedDefinitionIds: [],
    offerSummary: {
      offerId: `offer_${Date.now()}`,
      lootDefinitionId: loot.definitionId,
      lootDisplayName: loot.displayName,
      lootTier: loot.tier,
      guardianStyle: generated.guardianStyle,
      riskTier: generated.riskTier,
      guardianEncounterId: generated.encounter.id,
      guardianName: generated.enemy.name
    }
  };
}

function materializeEncounterResult(
  encounter: CultivationEncounterResult,
  rng: () => number,
  realmId: RealmId
): CultivationEncounterResult {
  if (encounter.type === 'offer') {
    return buildOfferResult(realmId, rng);
  }

  if (encounter.type !== 'combat') {
    return {
      ...encounter,
      obtainedDefinitionIds: [...encounter.obtainedDefinitionIds]
    };
  }

  return {
    ...encounter,
    combatEncounterId: pickCombatEncounterId(rng, realmId),
    obtainedDefinitionIds: [...encounter.obtainedDefinitionIds]
  };
}

/**
 * 八卦结果 → 下次专注奇遇 buff 映射
 * 设计依据: xuanjian-encounter-codex.md §DivinationBuff
 *   - 大吉(乾卦): 奇遇+15%, 掉率+5%
 *   - 吉(兑卦): 奇遇+10%, 掉率+3%
 *   - 小吉(离卦): 奇遇+5%
 *   - 平(震卦/巽卦): 无 buff
 *   - 小凶~大凶(坎/艮/坤): 奇遇减少, 掉率降低
 */
const DIVINATION_BUFF_TABLE: Record<number, DivinationBuff> = {
  8: { encounterBonus: -0.15, qualityBonus: 0.05, expiresAfterNextFocus: true, label: '大吉加持', description: '下次专注奇遇概率+15%，掉率+5%' },
  7: { encounterBonus: -0.10, qualityBonus: 0.03, expiresAfterNextFocus: true, label: '吉运', description: '下次专注奇遇概率+10%，掉率+3%' },
  6: { encounterBonus: -0.05, qualityBonus: 0, expiresAfterNextFocus: true, label: '小吉', description: '下次专注奇遇概率+5%' },
  5: { encounterBonus: 0, qualityBonus: 0, expiresAfterNextFocus: true, label: '平卦', description: '下次专注无额外影响' },
  4: { encounterBonus: 0, qualityBonus: 0, expiresAfterNextFocus: true, label: '平卦', description: '下次专注无额外影响' },
  3: { encounterBonus: 0.05, qualityBonus: -0.02, expiresAfterNextFocus: true, label: '小凶', description: '下次专注奇遇概率-5%' },
  2: { encounterBonus: 0.10, qualityBonus: -0.03, expiresAfterNextFocus: true, label: '凶兆', description: '下次专注奇遇概率-10%' },
  1: { encounterBonus: 0.15, qualityBonus: -0.05, expiresAfterNextFocus: true, label: '大凶', description: '下次专注奇遇概率-15%' }
};

export function getDivinationBuff(roll: number): DivinationBuff {
  return DIVINATION_BUFF_TABLE[roll] ?? DIVINATION_BUFF_TABLE[5]!;
}

export function getFocusAttainmentDelta(nextFocusStreak: number): number {
  if (nextFocusStreak === 5) return 1;
  if (nextFocusStreak === 50) return 1;
  if (nextFocusStreak >= 100) return 1;
  return 0;
}

export function rollFocusEncounter(
  rng: () => number,
  realmId: RealmId,
  buff?: DivinationBuff | null,
  forcedEncounterType?: DevEncounterType | null
): CultivationEncounterResult {
  if (forcedEncounterType) {
    if (forcedEncounterType === 'none') {
      return {
        type: 'none',
        message: null,
        spiritStoneDelta: 0,
        obtainedDefinitionIds: []
      };
    }

    if (forcedEncounterType === 'offer') {
      return buildOfferResult(realmId, rng);
    }

    const forcedCandidates = FOCUS_ENCOUNTER_TABLE
      .map((entry) => entry.result)
      .filter((result) => result.type === forcedEncounterType);

    const selectedForced = forcedCandidates[Math.floor(rng() * forcedCandidates.length)] ?? forcedCandidates[0];
    const fallback = selectedForced ?? FOCUS_ENCOUNTER_TABLE[0]!.result;

    return materializeEncounterResult(fallback, rng, realmId);
  }

  const roll = rng();

  // Apply buff: shift the "nothing" threshold
  // Positive encounterBonus means LESS encounters (threshold goes up)
  // Negative encounterBonus means MORE encounters (threshold goes down)
  const encounterShift = buff?.encounterBonus ?? 0;
  const qualityShift = buff?.qualityBonus ?? 0;

  const adjustedTable = FOCUS_ENCOUNTER_TABLE.map((entry) => {
    if (entry.id === 'encounter.none') {
      // Shift nothing threshold: clamped to [0.3, 0.95]
      return { ...entry, threshold: Math.min(0.95, Math.max(0.3, entry.threshold + encounterShift)) };
    }
    if (entry.id === 'encounter.material_drop' || entry.id === 'encounter.pill_drop') {
      // Quality bonus shifts item thresholds down (makes items more likely)
      return { ...entry, threshold: Math.min(1.0, Math.max(entry.threshold - qualityShift, entry.threshold)) };
    }
    return entry;
  });

  const selected = adjustedTable.find((entry) => roll <= entry.threshold)?.result ?? adjustedTable[0]!.result;
  return materializeEncounterResult(selected, rng, realmId);
}

export function resolveFocusReward(input: {
  duration: number;
  rng: () => number;
  state: PlayerCultivationState;
  forcedEncounterType?: DevEncounterType | null;
}) {
  const baseValue = getDurationBaseValue(input.duration);
  const method = getMainMethodById(input.state.mainMethodId);
  const realm = getRealmById(input.state.realmId);
  const realmCoefficient = getRealmTemplateCoefficient(input.state.realmId);
  const attainmentMultiplier = getGeneralAttainmentMultiplier(input.state.cultivationAttainment);
  const normalizedMainDaoTrack = normalizeMainDaoTrack(input.state.mainDaoTrack);
  const methodLineageTag = 'lineageTag' in method ? method.lineageTag : undefined;
  const normalizedMethodLineage = methodLineageTag ? normalizeMainDaoTrack(methodLineageTag) : null;
  const shouldApplyLineageSpecialization =
    isRealmAtLeast(input.state.realmId, 'realm.zhuji')
    && !isUniversalDaoTrack(normalizedMainDaoTrack)
    && normalizedMethodLineage === normalizedMainDaoTrack;
  const sameSchoolMultiplier = shouldApplyLineageSpecialization
    ? getMainLineageMultiplier(input.state.cultivationAttainment)
    : 1;
  const totalPowerGain = Math.floor(
    baseValue * realmCoefficient * method.cultivationMultiplier * attainmentMultiplier * sameSchoolMultiplier
  );
  const shouldRollEncounter = baseValue > 0 || Boolean(input.forcedEncounterType);
  const noEncounterResult: CultivationEncounterResult = {
    type: 'none',
    message: null,
    spiritStoneDelta: 0,
    obtainedDefinitionIds: []
  };

  // Use pending divination buff, then clear it
  const buff = input.state.pendingDivinationBuff ?? null;

  return {
    realmName: realm.name,
    basePowerGain: baseValue,
    totalPowerGain,
    attainmentDelta: getFocusAttainmentDelta(input.state.focusStreak + 1),
    nextFocusStreak: input.state.focusStreak + 1,
    encounter: shouldRollEncounter
      ? rollFocusEncounter(input.rng, input.state.realmId, buff, input.forcedEncounterType)
      : noEncounterResult,
    divinationBuffUsed: buff
  };
}
