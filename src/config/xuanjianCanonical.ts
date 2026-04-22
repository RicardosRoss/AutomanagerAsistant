import type { LineageId, RealmId } from '../types/cultivationCanonical.js';
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

export const XUANJIAN_MAIN_METHODS = [
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
    requiredAura: []
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
    lineageTag: 'mingyang'
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

export type CanonicalRealmTemplate = (typeof XUANJIAN_REALMS)[number];
export type CanonicalMainMethod = (typeof XUANJIAN_MAIN_METHODS)[number];

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

export function findCanonicalRealmById(realmId: string): CanonicalRealmTemplate | null {
  return XUANJIAN_REALMS.find((realm) => realm.id === realmId) ?? null;
}

export function findMainMethodById(methodId: string): CanonicalMainMethod | null {
  return XUANJIAN_MAIN_METHODS.find((method) => method.id === methodId) ?? null;
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
  }
} as const satisfies Partial<Record<RealmId, BreakthroughRequirement>>;

export function getBreakthroughRequirement(realmId: RealmId) {
  const requirements = XUANJIAN_BREAKTHROUGH_REQUIREMENTS as Partial<Record<RealmId, BreakthroughRequirement>>;
  return requirements[realmId] ?? null;
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
