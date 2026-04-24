import type {
  BreakthroughMethodDefinition,
  BreakthroughTransitionId,
  CanonicalMainMethod,
  DivinePowerBreakthroughRequirement,
  FoundationDefinition,
  LineageId,
  MainMethodZhujiOutcome,
  RealmId,
  SpecializedLineageId
} from '../types/cultivationCanonical.js';
import { formatRealmSubStageDisplay } from './xuanjianV2Registry.js';

type StageName =
  | '玄景' | '承明' | '周行' | '青元' | '玉京' | '灵初'
  | '一层' | '二层' | '三层' | '四层' | '五层' | '六层' | '七层' | '八层' | '九层'
  | '初期' | '中期' | '后期' | '圆满'
  | '前期';

export const UNIVERSAL_DAO_TRACK = 'universal' as const;

const MAIN_DAO_TRACK_LABELS: Record<LineageId, string> = {
  universal: '通用',
  mingyang: '明阳',
  zhengmu: '正木',
  pinshui: '牝水',
  lihuo: '离火',
  duijin: '兑金'
};

export const XUANJIAN_REALMS = [
  { id: 'realm.taixi', name: '胎息', minPower: 0, maxPower: 119, coefficient: 1.0, nextPower: 120 },
  { id: 'realm.lianqi', name: '练气', minPower: 120, maxPower: 419, coefficient: 1.0, nextPower: 420 },
  { id: 'realm.zhuji', name: '筑基', minPower: 420, maxPower: 1119, coefficient: 1.05, nextPower: 1120 },
  { id: 'realm.zifu', name: '紫府', minPower: 1120, maxPower: 2619, coefficient: 1.1, nextPower: 2620 },
  { id: 'realm.jindan', name: '金丹', minPower: 2620, maxPower: 5619, coefficient: 1.15, nextPower: 5620 },
  { id: 'realm.yuanying', name: '元婴', minPower: 5620, maxPower: 10620, coefficient: 1.2, nextPower: null }
] as const;

const LIANQI_ROUTE_OUTCOMES: Record<SpecializedLineageId, MainMethodZhujiOutcome> = {
  mingyang: {
    foundationId: 'foundation.zhuji_mingyang',
    mainDaoTrack: 'mingyang',
    continuationMethodId: 'method.zhuji_mingyang_script',
    grade: 5
  },
  lihuo: {
    foundationId: 'foundation.zhuji_lihuo',
    mainDaoTrack: 'lihuo',
    continuationMethodId: 'method.zhuji_lihuo_script',
    grade: 5
  },
  duijin: {
    foundationId: 'foundation.zhuji_duijin',
    mainDaoTrack: 'duijin',
    continuationMethodId: 'method.zhuji_duijin_script',
    grade: 5
  },
  pinshui: {
    foundationId: 'foundation.zhuji_pinshui',
    mainDaoTrack: 'pinshui',
    continuationMethodId: 'method.zhuji_pinshui_script',
    grade: 5
  },
  zhengmu: {
    foundationId: 'foundation.zhuji_zhengmu',
    mainDaoTrack: 'zhengmu',
    continuationMethodId: 'method.zhuji_zhengmu_script',
    grade: 5
  }
};

export const XUANJIAN_FOUNDATIONS: FoundationDefinition[] = [
  {
    id: 'foundation.zhuji_mingyang',
    name: '明阳筑基',
    mainDaoTrack: 'mingyang',
    firstDivinePowerId: 'power.invoking_heaven_gate'
  },
  {
    id: 'foundation.zhuji_lihuo',
    name: '离火筑基',
    mainDaoTrack: 'lihuo',
    firstDivinePowerId: 'power.great_departure_book'
  },
  {
    id: 'foundation.zhuji_duijin',
    name: '兑金筑基',
    mainDaoTrack: 'duijin',
    firstDivinePowerId: 'power.asking_two_forgetfulness'
  },
  {
    id: 'foundation.zhuji_pinshui',
    name: '牝水筑基',
    mainDaoTrack: 'pinshui',
    firstDivinePowerId: 'power.southern_sorrow_water'
  },
  {
    id: 'foundation.zhuji_zhengmu',
    name: '正木筑基',
    mainDaoTrack: 'zhengmu',
    firstDivinePowerId: 'power.hundred_bodies'
  }
];

const LEGACY_PRE_ZHUJI_METHOD_MAP: Record<string, string> = {
  'method.zhuji_mingyang_script': 'method.lianqi_mingyang_route',
  'method.zhuji_lihuo_script': 'method.lianqi_lihuo_route',
  'method.zhuji_duijin_script': 'method.lianqi_duijin_route',
  'method.zhuji_pinshui_script': 'method.lianqi_pinshui_route',
  'method.zhuji_zhengmu_script': 'method.lianqi_zhengmu_route'
};

export const XUANJIAN_MAIN_METHODS: CanonicalMainMethod[] = [
  {
    id: 'method.starter_tuna',
    name: '玄门吐纳法',
    category: 'main_method',
    tier: '凡',
    realmFloor: 'realm.taixi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['starter', 'universal'],
    dropScope: 'common',
    enabledInV1: true,
    reservedForV2: false,
    grade: 1,
    cultivationMultiplier: 1,
    combatBias: { attack: 0, defense: 0, sense: 0, speed: 0 },
    foundationAffinity: ['foundation.unshaped'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.taixi_to_lianqi'],
    requiredAura: [],
    lineageTag: undefined
  },
  {
    id: 'method.lianqi_mingyang_route',
    name: '明阳引基诀',
    category: 'main_method',
    tier: '黄',
    realmFloor: 'realm.lianqi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['mingyang', 'lianqi'],
    dropScope: 'heritage',
    enabledInV1: true,
    reservedForV2: false,
    grade: 3,
    cultivationMultiplier: 1.03,
    combatBias: { attack: 1, defense: 0, sense: 1, speed: 0 },
    foundationAffinity: ['foundation.zhuji_mingyang'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.lianqi_to_zhuji_base'],
    requiredAura: [],
    lineageTag: 'mingyang',
    zhujiOutcome: LIANQI_ROUTE_OUTCOMES.mingyang
  },
  {
    id: 'method.lianqi_lihuo_route',
    name: '离火引基诀',
    category: 'main_method',
    tier: '黄',
    realmFloor: 'realm.lianqi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['lihuo', 'lianqi'],
    dropScope: 'heritage',
    enabledInV1: true,
    reservedForV2: false,
    grade: 3,
    cultivationMultiplier: 1.03,
    combatBias: { attack: 1, defense: 0, sense: 0, speed: 1 },
    foundationAffinity: ['foundation.zhuji_lihuo'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.lianqi_to_zhuji_base'],
    requiredAura: [],
    lineageTag: 'lihuo',
    zhujiOutcome: LIANQI_ROUTE_OUTCOMES.lihuo
  },
  {
    id: 'method.lianqi_duijin_route',
    name: '兑金引基诀',
    category: 'main_method',
    tier: '黄',
    realmFloor: 'realm.lianqi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['duijin', 'lianqi'],
    dropScope: 'heritage',
    enabledInV1: true,
    reservedForV2: false,
    grade: 3,
    cultivationMultiplier: 1.03,
    combatBias: { attack: 1, defense: 1, sense: 0, speed: 0 },
    foundationAffinity: ['foundation.zhuji_duijin'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.lianqi_to_zhuji_base'],
    requiredAura: [],
    lineageTag: 'duijin',
    zhujiOutcome: LIANQI_ROUTE_OUTCOMES.duijin
  },
  {
    id: 'method.lianqi_pinshui_route',
    name: '牝水引基诀',
    category: 'main_method',
    tier: '黄',
    realmFloor: 'realm.lianqi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['pinshui', 'lianqi'],
    dropScope: 'heritage',
    enabledInV1: true,
    reservedForV2: false,
    grade: 3,
    cultivationMultiplier: 1.03,
    combatBias: { attack: 0, defense: 1, sense: 1, speed: 0 },
    foundationAffinity: ['foundation.zhuji_pinshui'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.lianqi_to_zhuji_base'],
    requiredAura: [],
    lineageTag: 'pinshui',
    zhujiOutcome: LIANQI_ROUTE_OUTCOMES.pinshui
  },
  {
    id: 'method.lianqi_zhengmu_route',
    name: '正木引基诀',
    category: 'main_method',
    tier: '黄',
    realmFloor: 'realm.lianqi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['zhengmu', 'lianqi'],
    dropScope: 'heritage',
    enabledInV1: true,
    reservedForV2: false,
    grade: 3,
    cultivationMultiplier: 1.03,
    combatBias: { attack: 0, defense: 1, sense: 0, speed: 1 },
    foundationAffinity: ['foundation.zhuji_zhengmu'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.lianqi_to_zhuji_base'],
    requiredAura: [],
    lineageTag: 'zhengmu',
    zhujiOutcome: LIANQI_ROUTE_OUTCOMES.zhengmu
  },
  {
    id: 'method.zhuji_mingyang_script',
    name: '上府明谒经',
    category: 'main_method',
    tier: '玄',
    realmFloor: 'realm.zhuji',
    realmCeiling: 'realm.zifu',
    source: 'runtime.seed',
    tags: ['mingyang', 'zhuji'],
    dropScope: 'heritage',
    enabledInV1: false,
    reservedForV2: false,
    grade: 5,
    cultivationMultiplier: 1.08,
    combatBias: { attack: 1, defense: 0, sense: 1, speed: 0 },
    foundationAffinity: ['foundation.zhuji_mingyang'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: [],
    requiredAura: [],
    lineageTag: 'mingyang',
    zifuPowerCoverage: {
      candidatePowerIds: [
        'power.clear_heart',
        'power.long_bright_steps',
        'power.imperial_gaze_origin'
      ],
      maxPowerCount: 5
    }
  },
  {
    id: 'method.zhuji_lihuo_script',
    name: '大离书',
    category: 'main_method',
    tier: '玄',
    realmFloor: 'realm.zhuji',
    realmCeiling: 'realm.zifu',
    source: 'runtime.seed',
    tags: ['lihuo', 'zhuji'],
    dropScope: 'heritage',
    enabledInV1: false,
    reservedForV2: false,
    grade: 5,
    cultivationMultiplier: 1.08,
    combatBias: { attack: 1, defense: 0, sense: 0, speed: 1 },
    foundationAffinity: ['foundation.zhuji_lihuo'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: [],
    requiredAura: [],
    lineageTag: 'lihuo'
  },
  {
    id: 'method.zhuji_duijin_script',
    name: '兑金真录',
    category: 'main_method',
    tier: '玄',
    realmFloor: 'realm.zhuji',
    realmCeiling: 'realm.zifu',
    source: 'runtime.seed',
    tags: ['duijin', 'zhuji'],
    dropScope: 'heritage',
    enabledInV1: false,
    reservedForV2: false,
    grade: 5,
    cultivationMultiplier: 1.08,
    combatBias: { attack: 1, defense: 1, sense: 0, speed: 0 },
    foundationAffinity: ['foundation.zhuji_duijin'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: [],
    requiredAura: [],
    lineageTag: 'duijin'
  },
  {
    id: 'method.zhuji_pinshui_script',
    name: '牝水归藏篇',
    category: 'main_method',
    tier: '玄',
    realmFloor: 'realm.zhuji',
    realmCeiling: 'realm.zifu',
    source: 'runtime.seed',
    tags: ['pinshui', 'zhuji'],
    dropScope: 'heritage',
    enabledInV1: false,
    reservedForV2: false,
    grade: 5,
    cultivationMultiplier: 1.08,
    combatBias: { attack: 0, defense: 1, sense: 1, speed: 0 },
    foundationAffinity: ['foundation.zhuji_pinshui'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: [],
    requiredAura: [],
    lineageTag: 'pinshui'
  },
  {
    id: 'method.zhuji_zhengmu_script',
    name: '正木长生录',
    category: 'main_method',
    tier: '玄',
    realmFloor: 'realm.zhuji',
    realmCeiling: 'realm.zifu',
    source: 'runtime.seed',
    tags: ['zhengmu', 'zhuji'],
    dropScope: 'heritage',
    enabledInV1: false,
    reservedForV2: false,
    grade: 5,
    cultivationMultiplier: 1.08,
    combatBias: { attack: 0, defense: 1, sense: 0, speed: 1 },
    foundationAffinity: ['foundation.zhuji_zhengmu'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: [],
    requiredAura: [],
    lineageTag: 'zhengmu'
  }
] as const;

export const XUANJIAN_BREAKTHROUGH_METHODS: BreakthroughMethodDefinition[] = [
  {
    id: 'breakthrough.taixi_to_lianqi_base',
    name: '吐纳引气术',
    applicableTransition: 'taixi_to_lianqi',
    successRateBonus: 0,
    stabilityDelta: 0,
    requiredItems: []
  },
  {
    id: 'breakthrough.lianqi_to_zhuji_base',
    name: '凝基内转术',
    applicableTransition: 'lianqi_to_zhuji',
    successRateBonus: 0,
    stabilityDelta: 0,
    requiredItems: []
  },
  {
    id: 'breakthrough.zhuji_to_zifu_base',
    name: '飞举仙基术',
    applicableTransition: 'zhuji_to_zifu',
    successRateBonus: 0,
    stabilityDelta: 0,
    requiredItems: [],
    bonusOutcomeIds: ['power.zifu_first_light'],
    compatibility: {
      requiresFoundation: true
    }
  },
  {
    id: 'breakthrough.zifu_divine_power_base',
    name: '紫府衍神术',
    applicableTransition: 'zifu_divine_power',
    successRateBonus: 0,
    stabilityDelta: 0,
    requiredItems: []
  },
  {
    id: 'breakthrough.zhuji_to_zifu_mingyang_manifest',
    name: '明阳化神秘法',
    applicableTransition: 'zhuji_to_zifu',
    successRateBonus: 0.1,
    stabilityDelta: 2,
    requiredItems: [{ definitionId: 'material.mingyang_manifest_token', count: 1 }],
    requiredEnvironment: ['env.mingyang_surge'],
    sideEffects: ['zifu_mingyang_burn'],
    bonusOutcomeIds: ['power.invoking_heaven_gate'],
    compatibility: {
      requiresFoundation: true,
      allowedLineages: ['mingyang'],
      minMethodGrade: 5
    }
  },
  {
    id: 'breakthrough.zhuji_to_zifu_lihuo_manifest',
    name: '离火化神秘法',
    applicableTransition: 'zhuji_to_zifu',
    successRateBonus: 0.1,
    stabilityDelta: 2,
    requiredItems: [{ definitionId: 'material.lihuo_manifest_token', count: 1 }],
    requiredEnvironment: ['env.lihuo_surge'],
    sideEffects: ['zifu_lihuo_scorch'],
    bonusOutcomeIds: ['power.orderly_conquest'],
    compatibility: {
      requiresFoundation: true,
      allowedLineages: ['lihuo'],
      minMethodGrade: 5
    }
  },
  {
    id: 'breakthrough.zhuji_to_zifu_duijin_manifest',
    name: '兑金化神秘法',
    applicableTransition: 'zhuji_to_zifu',
    successRateBonus: 0.1,
    stabilityDelta: 2,
    requiredItems: [{ definitionId: 'material.duijin_manifest_token', count: 1 }],
    requiredEnvironment: ['env.duijin_surge'],
    sideEffects: ['zifu_duijin_strain'],
    bonusOutcomeIds: ['power.rank_from_luo'],
    compatibility: {
      requiresFoundation: true,
      allowedLineages: ['duijin'],
      minMethodGrade: 5
    }
  },
  {
    id: 'breakthrough.zifu_to_jindan_direct_gold',
    name: '正法求金',
    applicableTransition: 'zifu_to_jindan',
    successRateBonus: 0.12,
    stabilityDelta: 3,
    requiredItems: [{ definitionId: 'material.same_origin_treasure', count: 1 }],
    sideEffects: ['jindan_path.direct_gold'],
    bonusOutcomeIds: ['goldNature.direct_mingyang'],
    compatibility: {
      requiredKnownPowerIds: [
        'power.invoking_heaven_gate',
        'power.clear_heart',
        'power.long_bright_steps',
        'power.imperial_gaze_origin',
        'power.scarlet_sundering_bolt'
      ],
      minMethodGrade: 5
    },
    jindanRoute: {
      pathType: 'direct_gold',
      resultGoldNatureTag: 'goldNature.direct_mingyang',
      failureRisk: 'medium',
      requiredPowerPattern: {
        requiredPowerIds: [
          'power.invoking_heaven_gate',
          'power.clear_heart',
          'power.long_bright_steps',
          'power.imperial_gaze_origin',
          'power.scarlet_sundering_bolt'
        ]
      }
    }
  }
] as const;

export type CanonicalRealmTemplate = (typeof XUANJIAN_REALMS)[number];

export interface CanonicalRealmStage {
  name: StageName;
}

export interface CanonicalRealmDisplay {
  realm: {
    id: RealmId;
    name: string;
    minPower: number;
    maxPower: number;
  };
  stage: CanonicalRealmStage;
  fullName: string;
  title: string;
}

interface BreakthroughRequirementItem {
  definitionId: string;
  count: number;
}

interface BreakthroughRequirement {
  targetRealmId: RealmId;
  requiredPower: number;
  requiredAttainment: number;
  requiredItems: BreakthroughRequirementItem[];
}

function normalizeAttainment(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeRealmProgress(currentPower: number, realmId: RealmId): number {
  const realm = getRealmById(realmId);
  const safePower = Number.isFinite(currentPower) ? currentPower : realm.minPower;
  const clampedPower = Math.min(Math.max(safePower, realm.minPower), realm.maxPower);
  const span = realm.maxPower - realm.minPower;

  if (span <= 0) {
    return 100;
  }

  return Math.floor(((clampedPower - realm.minPower) / span) * 100);
}

export function getCanonicalRealmByPower(power: number): CanonicalRealmTemplate {
  const normalizedPower = Number.isFinite(power) ? power : 0;

  for (let i = XUANJIAN_REALMS.length - 1; i >= 0; i -= 1) {
    const realm = XUANJIAN_REALMS[i];
    if (realm && normalizedPower >= realm.minPower) {
      return realm;
    }
  }

  return XUANJIAN_REALMS[0]!;
}

export function getRealmById(realmId: RealmId): CanonicalRealmTemplate {
  return findCanonicalRealmById(realmId) ?? XUANJIAN_REALMS[0]!;
}

export function getRealmTemplateCoefficient(realmId: RealmId): number {
  return getRealmById(realmId).coefficient;
}

export function getMainMethodById(methodId: string): CanonicalMainMethod {
  return findMainMethodById(methodId) ?? XUANJIAN_MAIN_METHODS[0]!;
}

export function getFoundationById(foundationId: string): FoundationDefinition | null {
  return XUANJIAN_FOUNDATIONS.find((foundation) => foundation.id === foundationId) ?? null;
}

export function resolveFirstDivinePowerFromFoundation(foundationId: string): string | null {
  return getFoundationById(foundationId)?.firstDivinePowerId ?? null;
}

export function getBreakthroughMethodById(methodId: string): BreakthroughMethodDefinition | null {
  return XUANJIAN_BREAKTHROUGH_METHODS.find((method) => method.id === methodId) ?? null;
}

export function getBreakthroughTransitionByRealm(currentRealmId: RealmId): BreakthroughTransitionId | null {
  switch (currentRealmId) {
    case 'realm.taixi':
      return 'taixi_to_lianqi';
    case 'realm.lianqi':
      return 'lianqi_to_zhuji';
    case 'realm.zhuji':
      return 'zhuji_to_zifu';
    case 'realm.zifu':
      return 'zifu_to_jindan';
    default:
      return null;
  }
}

export function getDefaultBreakthroughMethodId(currentRealmId: RealmId): string | null {
  const transition = getBreakthroughTransitionByRealm(currentRealmId);
  const method = transition
    ? XUANJIAN_BREAKTHROUGH_METHODS.find((item) => item.applicableTransition === transition)
    : null;

  return method?.id ?? null;
}

export function findCanonicalRealmById(realmId: string): CanonicalRealmTemplate | null {
  return XUANJIAN_REALMS.find((realm) => realm.id === realmId) ?? null;
}

export function findMainMethodById(methodId: string): CanonicalMainMethod | null {
  return XUANJIAN_MAIN_METHODS.find((method) => method.id === methodId) ?? null;
}

export function normalizeMainMethodIdForRealm(methodId: string, realmId: RealmId): string {
  if (realmId !== 'realm.taixi' && realmId !== 'realm.lianqi') {
    return methodId;
  }

  return LEGACY_PRE_ZHUJI_METHOD_MAP[methodId] ?? methodId;
}

export function resolveZhujiOutcomeFromMainMethod(methodId: string): MainMethodZhujiOutcome | null {
  const normalizedMethodId = normalizeMainMethodIdForRealm(methodId, 'realm.lianqi');
  const method = findMainMethodById(normalizedMethodId) ?? findMainMethodById(methodId);

  if (!method) {
    return null;
  }

  if (method.zhujiOutcome) {
    return method.zhujiOutcome;
  }

  if (!method.lineageTag) {
    return null;
  }

  const continuationMethodId = method.id.startsWith('method.zhuji_')
    ? method.id
    : LIANQI_ROUTE_OUTCOMES[method.lineageTag]?.continuationMethodId;
  const foundationId = method.foundationAffinity[0];
  if (!continuationMethodId || !foundationId) {
    return null;
  }

  return {
    foundationId,
    mainDaoTrack: method.lineageTag,
    continuationMethodId,
    grade: method.grade
  };
}

export function getDurationBaseValue(duration: number): number {
  if (!Number.isFinite(duration) || duration < 60) {
    return 0;
  }

  return 1 + Math.floor((duration - 60) / 30);
}

export function getGeneralAttainmentMultiplier(attainment: number): number {
  const safeAttainment = normalizeAttainment(attainment);
  const firstBand = Math.min(safeAttainment, 10);
  const secondBand = Math.min(Math.max(safeAttainment - 10, 0), 20);
  const thirdBand = Math.min(Math.max(safeAttainment - 30, 0), 30);
  const fourthBand = Math.max(safeAttainment - 60, 0);

  const multiplier = 1
    + firstBand * 0.02
    + secondBand * 0.01
    + thirdBand * 0.005
    + fourthBand * 0.002;

  return Number(multiplier.toFixed(3));
}

export function normalizeMainDaoTrack(track: string | null | undefined): LineageId {
  const normalized = track?.trim().toLowerCase();

  if (!normalized || normalized === 'neutral' || normalized === UNIVERSAL_DAO_TRACK) {
    return UNIVERSAL_DAO_TRACK;
  }

  if (normalized in MAIN_DAO_TRACK_LABELS) {
    return normalized as LineageId;
  }

  return UNIVERSAL_DAO_TRACK;
}

export function isUniversalDaoTrack(track: string | null | undefined): boolean {
  return normalizeMainDaoTrack(track) === UNIVERSAL_DAO_TRACK;
}

export function getMainLineageMultiplier(attainment: number): number {
  const safeAttainment = normalizeAttainment(attainment);

  if (safeAttainment >= 60) return 1.08;
  if (safeAttainment >= 30) return 1.05;
  if (safeAttainment >= 10) return 1.02;
  return 1;
}

export function getMainDaoTrackDisplayName(track: string | null | undefined): string {
  return MAIN_DAO_TRACK_LABELS[normalizeMainDaoTrack(track)];
}

export function getSameSchoolCultivationMultiplier(
  attainment: number,
  mainDaoTrack: string,
  methodTags: readonly string[]
): number {
  const normalizedMainDaoTrack = normalizeMainDaoTrack(mainDaoTrack);
  if (isUniversalDaoTrack(normalizedMainDaoTrack)) {
    return 1;
  }

  const hasMatchingLineageTag = methodTags.some(
    (tag) => normalizeMainDaoTrack(tag) === normalizedMainDaoTrack
  );

  if (!hasMatchingLineageTag) {
    return 1;
  }

  return getMainLineageMultiplier(attainment);
}

/**
 * 胎息六轮：玄景→承明→周行→青元→玉京→灵初
 * 原文明确六轮名称，进度按百分比均分。
 */
function getTaixiStage(progress: number): StageName {
  if (progress < 17) return '玄景';
  if (progress < 33) return '承明';
  if (progress < 50) return '周行';
  if (progress < 67) return '青元';
  if (progress < 84) return '玉京';
  return '灵初';
}

/**
 * 练气九层：一层~九层
 * 原文明确"练气本九层"，按百分比均分九段。
 */
function getLianqiStage(progress: number): StageName {
  if (progress < 12) return '一层';
  if (progress < 23) return '二层';
  if (progress < 34) return '三层';
  if (progress < 45) return '四层';
  if (progress < 56) return '五层';
  if (progress < 67) return '六层';
  if (progress < 78) return '七层';
  if (progress < 89) return '八层';
  return '九层';
}

/**
 * 筑基三层：初期/中期/后期
 * 原文明确"筑基虽然只有三层"。
 */
function getZhujiStage(progress: number): StageName {
  if (progress < 34) return '初期';
  if (progress < 67) return '中期';
  return '后期';
}

/**
 * 紫府四阶段：初期/中期/后期/圆满
 * 原文无明确细分，产品层四阶段。
 */
function getZifuStage(progress: number): StageName {
  if (progress < 25) return '初期';
  if (progress < 50) return '中期';
  if (progress < 75) return '后期';
  return '圆满';
}

/**
 * 金丹三阶段：前期/中期/后期
 * 原文明确"皆是金丹前期""已至金丹后期"。
 */
function getJindanStage(progress: number): StageName {
  if (progress < 34) return '前期';
  if (progress < 67) return '中期';
  return '后期';
}

/**
 * 元婴：产品层默认三阶段
 * 原文语料不足，暂用初期/中期/后期。
 */
function getYuanyingStage(progress: number): StageName {
  if (progress < 34) return '初期';
  if (progress < 67) return '中期';
  return '后期';
}

export function getCanonicalRealmStageInRealm(currentPower: number, realmId: RealmId): CanonicalRealmStage {
  const progress = normalizeRealmProgress(currentPower, realmId);
  const stageName = getStageNameByRealm(realmId, progress);
  return { name: stageName };
}

function getStageNameByRealm(realmId: RealmId, progress: number): StageName {
  switch (realmId) {
    case 'realm.taixi': return getTaixiStage(progress);
    case 'realm.lianqi': return getLianqiStage(progress);
    case 'realm.zhuji': return getZhujiStage(progress);
    case 'realm.zifu': return getZifuStage(progress);
    case 'realm.jindan': return getJindanStage(progress);
    case 'realm.yuanying': return getYuanyingStage(progress);
    default: return getTaixiStage(progress);
  }
}

/**
 * @deprecated Use getCanonicalRealmStageInRealm for realm-specific stage names.
 */
export function getCanonicalRealmStage(power: number): CanonicalRealmStage {
  return { name: getTaixiStage(power) };
}

export function formatCanonicalStage(power: number): StageName {
  return getTaixiStage(power);
}

export function formatCanonicalRealmDisplay(state: { realmId: RealmId; currentPower: number; realmSubStageId?: string | null }): CanonicalRealmDisplay {
  const realm = getRealmById(state.realmId);
  const stage = getCanonicalRealmStageInRealm(state.currentPower, state.realmId).name;
  const subStageDisplay = formatRealmSubStageDisplay(state);

  return {
    realm: {
      id: realm.id,
      name: realm.name,
      minPower: realm.minPower,
      maxPower: realm.maxPower
    },
    stage: {
      name: (subStageDisplay.subStageName ?? stage) as StageName
    },
    fullName: subStageDisplay.fullName,
    title: realm.name
  };
}

export const XUANJIAN_BREAKTHROUGH_REQUIREMENTS = {
  'realm.taixi': {
    targetRealmId: 'realm.lianqi',
    requiredPower: 120,
    requiredAttainment: 0,
    requiredItems: []
  },
  'realm.lianqi': {
    targetRealmId: 'realm.zhuji',
    requiredPower: 420,
    requiredAttainment: 10,
    requiredItems: [{ definitionId: 'material.yellow_breakthrough_token', count: 1 }]
  },
  'realm.zhuji': {
    targetRealmId: 'realm.zifu',
    requiredPower: 1120,
    requiredAttainment: 10,
    requiredItems: [{ definitionId: 'material.mysterious_breakthrough_token', count: 1 }]
  },
  'realm.zifu': {
    targetRealmId: 'realm.jindan',
    requiredPower: 2620,
    requiredAttainment: 80,
    requiredItems: [{ definitionId: 'material.jindan_gold_catalyst', count: 1 }]
  }
} as const satisfies Partial<Record<RealmId, BreakthroughRequirement>>;

export const ZIFU_DIVINE_POWER_REQUIREMENTS: DivinePowerBreakthroughRequirement[] = [
  {
    id: 'breakthrough.zifu_power_2_base',
    targetPowerOrdinal: 2,
    requiredPower: 1360,
    requiredAttainment: 18,
    requiredItems: [
      {
        definitionId: 'material.zifu_second_power_token',
        count: 1
      }
    ]
  }
];

export function getBreakthroughRequirement(realmId: RealmId) {
  const requirements = XUANJIAN_BREAKTHROUGH_REQUIREMENTS as Partial<Record<RealmId, BreakthroughRequirement>>;
  return requirements[realmId] ?? null;
}

export function getDivinePowerBreakthroughRequirement(
  targetPowerOrdinal: DivinePowerBreakthroughRequirement['targetPowerOrdinal']
) {
  return ZIFU_DIVINE_POWER_REQUIREMENTS.find(
    (requirement) => requirement.targetPowerOrdinal === targetPowerOrdinal
  ) ?? null;
}

export {
  createDefaultBattleLoadoutState,
  formatRealmSubStageDisplay,
  getBattleArtRegistryEntry,
  getBattleArtRegistryEntries,
  getBattleSlotLimits,
  getDivinePowerRegistryEntry,
  getDivinePowerRegistryEntries,
  getRealmSubStageById,
  getRealmSubStagesByRealmId,
  getRuntimeContentName,
  getRuntimeContentNameMap,
  getStarterBattleArtIds,
  getRuntimeReadyContentBatch,
  getUnlockedRuntimeReadyBattleArts,
  getUnlockedRuntimeReadyDivinePowers,
  isBattleArtRuntimeReadyForState,
  isDivinePowerRuntimeReadyForState,
  projectCombatLoadout,
  resolveRealmSubStageId,
  projectBattleArtRuntimeProfile,
  projectDivinePowerRuntimeProfile
} from './xuanjianV2Registry.js';
