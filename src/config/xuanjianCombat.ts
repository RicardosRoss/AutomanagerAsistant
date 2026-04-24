import type {
  CombatEncounterDefinition,
  CombatOutcome,
  EncounterLootGrantMode,
  EncounterLootTier,
  EncounterRiskTier,
  GuardianStyle
} from '../types/cultivationCombat.js';
import type { RealmId } from '../types/cultivationCanonical.js';

export interface EnemyTemplateDefinition {
  id: string;
  name: string;
  realmId: RealmId;
  realmSubStageId: string;
  currentPower: number;
  dimensions: {
    attack: number;
    defense: number;
    sense: number;
    speed: number;
  };
  tags: string[];
}

export type GuardianPrototypeId =
  | 'guardian.rush'
  | 'guardian.guard'
  | 'guardian.movement'
  | 'guardian.sense'
  | 'guardian.support'
  | 'guardian.hybrid';

interface EncounterLootDefinition {
  id: string;
  definitionId: string;
  displayName: string;
  tier: EncounterLootTier;
  weight: number;
  grantMode: EncounterLootGrantMode;
  contentId?: string;
}

interface GuardianPrototypeDefinition {
  id: GuardianPrototypeId;
  style: GuardianStyle;
  tags: string[];
  names: {
    taixi: string;
    lianqi: string;
    zhuji: string;
    fallback: string;
  };
  dimensionsByRealm: Record<RealmId, EnemyTemplateDefinition['dimensions']>;
}

export const COMBAT_BALANCE = {
  maxRounds: 5,
  vitalityBase: 12,
  vitalityDefenseWeight: 2,
  initiativeSpeedWeight: 2,
  initiativeSenseWeight: 1,
  attackWeight: 2,
  mitigationWeight: 1
} as const;

const ENEMY_TEMPLATES: EnemyTemplateDefinition[] = [
  {
    id: 'enemy.taixi.roadside_wolf',
    name: '拦路青狼',
    realmId: 'realm.taixi',
    realmSubStageId: 'realmSubStage.taixi.qingyuan',
    currentPower: 72,
    dimensions: {
      attack: 6,
      defense: 4,
      sense: 3,
      speed: 5
    },
    tags: ['rush', 'speed']
  },
  {
    id: 'enemy.taixi.stonehide_boar',
    name: '石皮獠猪',
    realmId: 'realm.taixi',
    realmSubStageId: 'realmSubStage.taixi.yujing',
    currentPower: 86,
    dimensions: {
      attack: 5,
      defense: 7,
      sense: 2,
      speed: 3
    },
    tags: ['guard', 'defense']
  },
  {
    id: 'enemy.taixi.shadow_marten',
    name: '影纹山貂',
    realmId: 'realm.taixi',
    realmSubStageId: 'realmSubStage.taixi.qingyuan',
    currentPower: 74,
    dimensions: {
      attack: 5,
      defense: 3,
      sense: 4,
      speed: 7
    },
    tags: ['movement', 'flank']
  },
  {
    id: 'enemy.taixi.mist_crow',
    name: '雾羽妖鸦',
    realmId: 'realm.taixi',
    realmSubStageId: 'realmSubStage.taixi.lingchu',
    currentPower: 92,
    dimensions: {
      attack: 4,
      defense: 4,
      sense: 7,
      speed: 5
    },
    tags: ['sense', 'control']
  }
];

const ENCOUNTER_LOOT_POOL: EncounterLootDefinition[] = [
  {
    id: 'loot.pill.low_cultivation',
    definitionId: 'consumable.low_cultivation_pill',
    displayName: '低阶丹药',
    tier: '凡',
    weight: 40,
    grantMode: 'inventory'
  },
  {
    id: 'loot.token.yellow_breakthrough',
    definitionId: 'material.yellow_breakthrough_token',
    displayName: '黄阶破境辅材',
    tier: '黄',
    weight: 22,
    grantMode: 'inventory'
  },
  {
    id: 'loot.scroll.returning_origin_shield',
    definitionId: 'manual.art.returning_origin_shield',
    displayName: '归元盾传承玉简',
    tier: '玄',
    weight: 8,
    grantMode: 'deferred_battle_art',
    contentId: 'art.returning_origin_shield'
  },
  {
    id: 'loot.scroll.guarding_true_light',
    definitionId: 'manual.power.guarding_true_light',
    displayName: '护体真光残页',
    tier: '地',
    weight: 3,
    grantMode: 'deferred_divine_power',
    contentId: 'power.guarding_true_light'
  }
];

const GUARDIAN_PROTOTYPES: GuardianPrototypeDefinition[] = [
  {
    id: 'guardian.rush',
    style: 'rush',
    tags: ['rush', 'attack'],
    names: {
      taixi: '护宝凶妖',
      lianqi: '夺宝悍修',
      zhuji: '裂阵异妖',
      fallback: '护宝凶妖'
    },
    dimensionsByRealm: {
      'realm.taixi': { attack: 7, defense: 4, sense: 3, speed: 6 },
      'realm.lianqi': { attack: 8, defense: 5, sense: 4, speed: 7 },
      'realm.zhuji': { attack: 10, defense: 7, sense: 5, speed: 8 },
      'realm.zifu': { attack: 12, defense: 9, sense: 7, speed: 9 },
      'realm.jindan': { attack: 15, defense: 12, sense: 9, speed: 11 },
      'realm.yuanying': { attack: 18, defense: 15, sense: 12, speed: 13 }
    }
  },
  {
    id: 'guardian.guard',
    style: 'guard',
    tags: ['guard', 'defense'],
    names: {
      taixi: '守宝甲兽',
      lianqi: '镇府石傀',
      zhuji: '护陵甲将',
      fallback: '守宝甲兽'
    },
    dimensionsByRealm: {
      'realm.taixi': { attack: 5, defense: 8, sense: 3, speed: 2 },
      'realm.lianqi': { attack: 6, defense: 9, sense: 4, speed: 3 },
      'realm.zhuji': { attack: 7, defense: 11, sense: 5, speed: 4 },
      'realm.zifu': { attack: 9, defense: 13, sense: 6, speed: 5 },
      'realm.jindan': { attack: 11, defense: 16, sense: 8, speed: 6 },
      'realm.yuanying': { attack: 14, defense: 18, sense: 10, speed: 8 }
    }
  },
  {
    id: 'guardian.movement',
    style: 'movement',
    tags: ['movement', 'flank'],
    names: {
      taixi: '逐影灵兽',
      lianqi: '逐光飞盗',
      zhuji: '裂空遁妖',
      fallback: '逐影灵兽'
    },
    dimensionsByRealm: {
      'realm.taixi': { attack: 5, defense: 3, sense: 4, speed: 8 },
      'realm.lianqi': { attack: 6, defense: 4, sense: 5, speed: 9 },
      'realm.zhuji': { attack: 8, defense: 5, sense: 6, speed: 10 },
      'realm.zifu': { attack: 9, defense: 7, sense: 8, speed: 12 },
      'realm.jindan': { attack: 11, defense: 8, sense: 10, speed: 14 },
      'realm.yuanying': { attack: 13, defense: 10, sense: 12, speed: 16 }
    }
  },
  {
    id: 'guardian.sense',
    style: 'sense',
    tags: ['sense', 'control'],
    names: {
      taixi: '望气妖鸦',
      lianqi: '照魄瞳灵',
      zhuji: '镇神镜煞',
      fallback: '望气妖鸦'
    },
    dimensionsByRealm: {
      'realm.taixi': { attack: 4, defense: 4, sense: 8, speed: 5 },
      'realm.lianqi': { attack: 5, defense: 5, sense: 9, speed: 6 },
      'realm.zhuji': { attack: 6, defense: 6, sense: 11, speed: 7 },
      'realm.zifu': { attack: 8, defense: 8, sense: 13, speed: 9 },
      'realm.jindan': { attack: 10, defense: 9, sense: 15, speed: 11 },
      'realm.yuanying': { attack: 12, defense: 11, sense: 18, speed: 13 }
    }
  },
  {
    id: 'guardian.support',
    style: 'sense',
    tags: ['support', 'ward'],
    names: {
      taixi: '缠气藤魅',
      lianqi: '散雾药傀',
      zhuji: '拖轮幽鬼',
      fallback: '缠气藤魅'
    },
    dimensionsByRealm: {
      'realm.taixi': { attack: 4, defense: 6, sense: 5, speed: 4 },
      'realm.lianqi': { attack: 5, defense: 7, sense: 6, speed: 5 },
      'realm.zhuji': { attack: 6, defense: 8, sense: 7, speed: 6 },
      'realm.zifu': { attack: 8, defense: 10, sense: 9, speed: 7 },
      'realm.jindan': { attack: 10, defense: 12, sense: 11, speed: 8 },
      'realm.yuanying': { attack: 12, defense: 14, sense: 13, speed: 10 }
    }
  },
  {
    id: 'guardian.hybrid',
    style: 'hybrid',
    tags: ['elite', 'hybrid'],
    names: {
      taixi: '镇宝异种',
      lianqi: '守脉客卿',
      zhuji: '护陵镇将',
      fallback: '镇宝异种'
    },
    dimensionsByRealm: {
      'realm.taixi': { attack: 7, defense: 7, sense: 5, speed: 5 },
      'realm.lianqi': { attack: 8, defense: 8, sense: 6, speed: 6 },
      'realm.zhuji': { attack: 10, defense: 10, sense: 7, speed: 7 },
      'realm.zifu': { attack: 12, defense: 12, sense: 9, speed: 8 },
      'realm.jindan': { attack: 15, defense: 15, sense: 10, speed: 10 },
      'realm.yuanying': { attack: 18, defense: 18, sense: 12, speed: 12 }
    }
  }
];

const COMBAT_ENCOUNTERS: CombatEncounterDefinition[] = [
  {
    id: 'combatEncounter.taixi.roadside_wolf',
    enemyTemplateId: 'enemy.taixi.roadside_wolf',
    maxRounds: COMBAT_BALANCE.maxRounds,
    rewards: {
      spiritStoneDeltaOnWin: 3,
      attainmentDeltaOnWin: 1,
      obtainedDefinitionIdsOnWin: []
    },
    penalties: {
      injuryLevelOnLoss: 'light',
      spiritStoneDeltaOnLoss: -2
    }
  },
  {
    id: 'combatEncounter.taixi.stonehide_boar',
    enemyTemplateId: 'enemy.taixi.stonehide_boar',
    maxRounds: COMBAT_BALANCE.maxRounds,
    rewards: {
      spiritStoneDeltaOnWin: 4,
      attainmentDeltaOnWin: 1,
      obtainedDefinitionIdsOnWin: []
    },
    penalties: {
      injuryLevelOnLoss: 'light',
      spiritStoneDeltaOnLoss: -2
    }
  },
  {
    id: 'combatEncounter.taixi.shadow_marten',
    enemyTemplateId: 'enemy.taixi.shadow_marten',
    maxRounds: COMBAT_BALANCE.maxRounds,
    rewards: {
      spiritStoneDeltaOnWin: 3,
      attainmentDeltaOnWin: 1,
      obtainedDefinitionIdsOnWin: []
    },
    penalties: {
      injuryLevelOnLoss: 'light',
      spiritStoneDeltaOnLoss: -2
    }
  },
  {
    id: 'combatEncounter.taixi.mist_crow',
    enemyTemplateId: 'enemy.taixi.mist_crow',
    maxRounds: COMBAT_BALANCE.maxRounds,
    rewards: {
      spiritStoneDeltaOnWin: 4,
      attainmentDeltaOnWin: 2,
      obtainedDefinitionIdsOnWin: []
    },
    penalties: {
      injuryLevelOnLoss: 'light',
      spiritStoneDeltaOnLoss: -2
    }
  }
];

export function getEnemyTemplateById(id: string) {
  return ENEMY_TEMPLATES.find((entry) => entry.id === id) ?? null;
}

function pickWeightedEntry<T extends { weight: number }>(entries: T[], roll: number) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.max(0, roll) * totalWeight;

  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry;
    }
  }

  return entries[0] ?? null;
}

export function getCombatEncounterById(id: string) {
  return COMBAT_ENCOUNTERS.find((entry) => entry.id === id) ?? null;
}

export function getEncounterLootById(id: string) {
  return ENCOUNTER_LOOT_POOL.find((entry) => entry.id === id) ?? null;
}

export function getEncounterLootByDefinitionId(definitionId: string) {
  return ENCOUNTER_LOOT_POOL.find((entry) => entry.definitionId === definitionId) ?? null;
}

export function rollEncounterLoot(rng: () => number) {
  return pickWeightedEntry(ENCOUNTER_LOOT_POOL, rng()) ?? ENCOUNTER_LOOT_POOL[0]!;
}

export function rollGuardianPrototypeId(rng: () => number, lootTier: EncounterLootTier): GuardianPrototypeId {
  if (lootTier === '地') {
    return rng() < 0.5 ? 'guardian.hybrid' : 'guardian.sense';
  }

  if (lootTier === '玄') {
    return rng() < 0.5 ? 'guardian.guard' : 'guardian.hybrid';
  }

  if (lootTier === '黄') {
    return rng() < 0.5 ? 'guardian.rush' : 'guardian.guard';
  }

  return rng() < 0.5 ? 'guardian.rush' : 'guardian.movement';
}

export function listCombatEncounterIdsByRealm(realmId: RealmId) {
  if (realmId === 'realm.taixi') {
    return COMBAT_ENCOUNTERS
      .filter((entry) => entry.id.startsWith('combatEncounter.taixi.'))
      .map((entry) => entry.id);
  }

  return [];
}

export function formatCombatOutcomeLabel(outcome: CombatOutcome) {
  if (outcome === 'win') return '大胜';
  if (outcome === 'narrow_win') return '险胜';
  return '惜败';
}

export function formatInjuryLevelLabel(level: 'none' | 'light' | 'medium' | 'heavy') {
  if (level === 'light') return '轻伤';
  if (level === 'medium') return '中伤';
  if (level === 'heavy') return '重伤';
  return '无伤';
}

export function formatEncounterRiskTierLabel(tier: EncounterRiskTier) {
  if (tier === 'tough') return '棘手';
  if (tier === 'dangerous') return '凶险';
  if (tier === 'deadly') return '极险';
  return '寻常';
}

export function formatGuardianStyleLabel(style: GuardianStyle) {
  if (style === 'guard') return '坚守';
  if (style === 'movement') return '游走';
  if (style === 'sense') return '灵识';
  if (style === 'hybrid') return '混成';
  return '迅攻';
}

function getGeneratedEnemyName(prototype: GuardianPrototypeDefinition, realmId: RealmId) {
  if (realmId === 'realm.taixi') return prototype.names.taixi;
  if (realmId === 'realm.lianqi') return prototype.names.lianqi;
  if (realmId === 'realm.zhuji') return prototype.names.zhuji;
  return prototype.names.fallback;
}

function getGeneratedEnemyPower(realmId: RealmId, lootTier: EncounterLootTier) {
  const baseByRealm: Record<RealmId, number> = {
    'realm.taixi': 72,
    'realm.lianqi': 210,
    'realm.zhuji': 760,
    'realm.zifu': 1400,
    'realm.jindan': 3200,
    'realm.yuanying': 6400
  };
  const tierBonus: Record<EncounterLootTier, number> = {
    '凡': 0,
    '黄': 12,
    '玄': 26,
    '地': 48
  };

  return baseByRealm[realmId] + tierBonus[lootTier];
}

export function buildGuardianEncounter(input: {
  prototypeId: GuardianPrototypeId;
  realmId: RealmId;
  realmSubStageId: string;
  lootTier: EncounterLootTier;
  seed: number;
}) {
  const prototype = GUARDIAN_PROTOTYPES.find((entry) => entry.id === input.prototypeId)
    ?? GUARDIAN_PROTOTYPES.find((entry) => entry.id === 'guardian.rush')!;
  const riskTier: EncounterRiskTier = input.lootTier === '地'
    ? 'deadly'
    : input.lootTier === '玄'
      ? 'dangerous'
      : input.lootTier === '黄'
        ? 'tough'
        : 'ordinary';
  const enemy = {
    id: `generated.enemy.${input.prototypeId}.${input.seed}`,
    name: getGeneratedEnemyName(prototype, input.realmId),
    realmId: input.realmId,
    realmSubStageId: input.realmSubStageId,
    currentPower: getGeneratedEnemyPower(input.realmId, input.lootTier),
    dimensions: prototype.dimensionsByRealm[input.realmId],
    tags: [...prototype.tags]
  };
  const injuryLevelOnLoss: CombatEncounterDefinition['penalties']['injuryLevelOnLoss'] = input.lootTier === '地'
    ? 'medium'
    : 'light';

  return {
    guardianStyle: prototype.style,
    riskTier,
    enemy,
    encounter: {
      id: `generated.encounter.${input.prototypeId}.${input.seed}`,
      enemyTemplateId: enemy.id,
      maxRounds: COMBAT_BALANCE.maxRounds,
      rewards: {
        spiritStoneDeltaOnWin: input.lootTier === '地' ? 8 : 4,
        attainmentDeltaOnWin: input.lootTier === '地' ? 2 : 1,
        obtainedDefinitionIdsOnWin: []
      },
      penalties: {
        injuryLevelOnLoss,
        spiritStoneDeltaOnLoss: input.lootTier === '地' ? -4 : -2
      }
    }
  };
}
