import type {
  BaguaDivination,
  CultivationRealm,
  FortuneEvent,
  RealmDisplay,
  RealmStage
} from '../types/cultivation.js';

/**
 * 修仙境界配置
 * 定义九大境界及其属性
 */
export const REALM_STAGES: Record<'early' | 'middle' | 'late' | 'peak', RealmStage> = {
  early: { name: '初期', progress: [0, 33], bonus: 1.0 },
  middle: { name: '中期', progress: [34, 66], bonus: 1.1 },
  late: { name: '后期', progress: [67, 99], bonus: 1.2 },
  peak: { name: '大圆满', progress: [100, 100], bonus: 1.3 }
};

export const CULTIVATION_REALMS: CultivationRealm[] = [
  {
    id: 1,
    name: '炼气期',
    nameEn: 'Qi Refining',
    minPower: 0,
    maxPower: 999,
    title: '炼气修士',
    emoji: '🌱',
    color: '#90EE90',
    description: '初入修行，炼化体内杂质，感应天地灵气',
    cultivationBonus: 1.0,
    breakthrough: {
      difficulty: 'easy',
      successRate: 95,
      failurePenalty: 0,
      message: '天降甘霖，助你突破！'
    }
  },
  {
    id: 2,
    name: '筑基期',
    nameEn: 'Foundation',
    minPower: 1000,
    maxPower: 2499,
    title: '筑基修士',
    emoji: '🏔️',
    color: '#8B4513',
    description: '筑基固本，凝聚灵力根基，为日后修行打下坚实基础',
    cultivationBonus: 1.0,
    breakthrough: {
      difficulty: 'medium',
      successRate: 90,
      failurePenalty: 100,
      message: '地火燃烧，淬炼根基！'
    }
  },
  {
    id: 3,
    name: '金丹期',
    nameEn: 'Golden Core',
    minPower: 2500,
    maxPower: 4999,
    title: '金丹真人',
    emoji: '💊',
    color: '#FFD700',
    description: '凝结金丹，灵力质变，寿元大增',
    cultivationBonus: 1.2,
    breakthrough: {
      difficulty: 'medium',
      successRate: 85,
      failurePenalty: 200,
      message: '金丹凝聚，光耀九天！'
    }
  },
  {
    id: 4,
    name: '元婴期',
    nameEn: 'Nascent Soul',
    minPower: 5000,
    maxPower: 7999,
    title: '元婴上人',
    emoji: '👶✨',
    color: '#9370DB',
    description: '元婴脱体，神识外放，掌握灵魂奥秘',
    cultivationBonus: 1.3,
    breakthrough: {
      difficulty: 'hard',
      successRate: 80,
      failurePenalty: 500,
      message: '元婴诞生，神识暴涨！'
    }
  },
  {
    id: 5,
    name: '化神期',
    nameEn: 'Soul Formation',
    minPower: 8000,
    maxPower: 11999,
    title: '化神真君',
    emoji: '🔮',
    color: '#4169E1',
    description: '神魂合一，掌握神通法术，移山填海',
    cultivationBonus: 1.5,
    breakthrough: {
      difficulty: 'hard',
      successRate: 75,
      failurePenalty: 1000,
      message: '化神成功，掌握神通！'
    }
  },
  {
    id: 6,
    name: '炼虚期',
    nameEn: 'Void Refinement',
    minPower: 12000,
    maxPower: 16999,
    title: '炼虚尊者',
    emoji: '🌌',
    color: '#191970',
    description: '炼化虚空，跨越天地，洞悉天道玄机',
    cultivationBonus: 1.7,
    breakthrough: {
      difficulty: 'very_hard',
      successRate: 70,
      failurePenalty: 2000,
      message: '虚空炼化，天地为炉！'
    }
  },
  {
    id: 7,
    name: '合体期',
    nameEn: 'Integration',
    minPower: 17000,
    maxPower: 23999,
    title: '合体大能',
    emoji: '☯️',
    color: '#800080',
    description: '天人合一，与道相合，一念之间改天换地',
    cultivationBonus: 2.0,
    breakthrough: {
      difficulty: 'very_hard',
      successRate: 65,
      failurePenalty: 3000,
      message: '天人合一，道法自然！'
    }
  },
  {
    id: 8,
    name: '渡劫期',
    nameEn: 'Tribulation',
    minPower: 24000,
    maxPower: 32999,
    title: '渡劫期修士',
    emoji: '⚡',
    color: '#FF4500',
    description: '经历天劫考验，每次突破都伴随天雷降临',
    cultivationBonus: 2.5,
    breakthrough: {
      difficulty: 'extreme',
      successRate: 60,
      failurePenalty: 5000,
      message: '九天雷劫，涅槃重生！'
    }
  },
  {
    id: 9,
    name: '大乘期',
    nameEn: 'Mahayana',
    minPower: 33000,
    maxPower: Infinity,
    title: '大乘期至尊',
    emoji: '🌟',
    color: '#FFD700',
    description: '功德圆满，距离飞升仅一步之遥',
    cultivationBonus: 3.0,
    breakthrough: {
      difficulty: 'ascension',
      successRate: 50,
      failurePenalty: 10000,
      message: '功德圆满，天门洞开！'
    }
  }
];

export const BAGUA_DIVINATION: Record<number, BaguaDivination> = {
  1: { name: '坤卦', meaning: '大凶', multiplier: -4, emoji: '☷', color: '#8B0000' },
  2: { name: '艮卦', meaning: '凶', multiplier: -2, emoji: '☶', color: '#DC143C' },
  3: { name: '坎卦', meaning: '小凶', multiplier: -1, emoji: '☵', color: '#FF6347' },
  4: { name: '巽卦', meaning: '平', multiplier: -0.5, emoji: '☴', color: '#FFA500' },
  5: { name: '震卦', meaning: '平', multiplier: 0.5, emoji: '☳', color: '#FFD700' },
  6: { name: '离卦', meaning: '小吉', multiplier: 1, emoji: '☲', color: '#9ACD32' },
  7: { name: '兑卦', meaning: '吉', multiplier: 2, emoji: '☱', color: '#32CD32' },
  8: { name: '乾卦', meaning: '大吉', multiplier: 4, emoji: '☰', color: '#008000' }
};

export const FORTUNE_EVENTS: FortuneEvent[] = [
  {
    id: 'heavenly_stone',
    name: '天降灵石',
    probability: 0.05,
    reward: { type: 'stones', amount: 50 },
    message: '✨ 天降灵石！获得 50 灵石！'
  },
  {
    id: 'enlightenment',
    name: '顿悟',
    probability: 0.03,
    reward: { type: 'power', multiplier: 1.5 },
    message: '💡 顿悟！本次修炼灵力获得 1.5 倍加成！'
  },
  {
    id: 'spirit_spring',
    name: '灵泉洗礼',
    probability: 0.02,
    reward: { type: 'power', amount: 100 },
    message: '💧 偶遇灵泉，获得额外 100 灵力！'
  },
  {
    id: 'ancient_scroll',
    name: '古籍秘法',
    probability: 0.01,
    reward: { type: 'both', power: 200, stones: 100 },
    message: '📜 发现古籍秘法！获得 200 修为和 100 灵石！'
  }
];

export function getCurrentRealm(spiritualPower: number): CultivationRealm {
  for (let i = CULTIVATION_REALMS.length - 1; i >= 0; i -= 1) {
    const realm = CULTIVATION_REALMS[i];
    if (realm && spiritualPower >= realm.minPower) {
      return realm;
    }
  }
  return CULTIVATION_REALMS[0]!;
}

export function getRealmById(id: number): CultivationRealm {
  return CULTIVATION_REALMS.find((realm) => realm.id === id) ?? CULTIVATION_REALMS[0]!;
}

export function getNextRealm(currentRealmId: number): CultivationRealm | null {
  const nextId = currentRealmId + 1;
  return CULTIVATION_REALMS.find((realm) => realm.id === nextId) ?? null;
}

export function getRealmStage(spiritualPower: number, realm: CultivationRealm): RealmStage {
  const powerInRealm = spiritualPower - realm.minPower;
  const realmRange = realm.maxPower === Infinity ? 10000 : realm.maxPower - realm.minPower + 1;
  const percentage = Math.min((powerInRealm / realmRange) * 100, 100);

  if (percentage >= 100) return REALM_STAGES.peak;
  if (percentage >= 67) return REALM_STAGES.late;
  if (percentage >= 34) return REALM_STAGES.middle;
  return REALM_STAGES.early;
}

export function formatRealmDisplay(spiritualPower: number): RealmDisplay {
  const realm = getCurrentRealm(spiritualPower);
  const stage = getRealmStage(spiritualPower, realm);

  return {
    realm,
    stage,
    fullName: `${realm.emoji} ${realm.name}（${stage.name}）`,
    title: realm.title,
    progress: spiritualPower - realm.minPower,
    nextRealmProgress: realm.maxPower === Infinity ? null : realm.maxPower - spiritualPower + 1
  };
}

export function canAttemptBreakthrough(spiritualPower: number, realm: CultivationRealm): boolean {
  if (realm.maxPower === Infinity) {
    return spiritualPower >= 50000;
  }

  return spiritualPower >= realm.maxPower;
}

export function calculateCultivationBonus(realm: CultivationRealm, stage: RealmStage): number {
  return realm.cultivationBonus * stage.bonus;
}

export {
  XUANJIAN_BREAKTHROUGH_REQUIREMENTS,
  XUANJIAN_MAIN_METHODS,
  XUANJIAN_REALMS,
  formatCanonicalRealmDisplay,
  formatCanonicalStage,
  getBreakthroughRequirement,
  getCanonicalRealmByPower,
  getCanonicalRealmStage,
  getDurationBaseValue,
  getGeneralAttainmentMultiplier,
  getMainMethodById,
  getRealmTemplateCoefficient,
  getSameSchoolCultivationMultiplier
} from './xuanjianCanonical.js';

export { getRealmById as getCanonicalRealmById } from './xuanjianCanonical.js';

export default {
  REALM_STAGES,
  CULTIVATION_REALMS,
  BAGUA_DIVINATION,
  FORTUNE_EVENTS,
  getCurrentRealm,
  getRealmById,
  getNextRealm,
  getRealmStage,
  formatRealmDisplay,
  canAttemptBreakthrough,
  calculateCultivationBonus
};
