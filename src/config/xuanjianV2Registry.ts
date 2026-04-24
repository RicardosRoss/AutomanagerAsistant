import type { LineageId, RealmId } from '../types/cultivationCanonical.js';
import type { PlayerCultivationState } from '../types/cultivationCanonical.js';
import type { BattleLoadoutState } from '../types/cultivationV2.js';
import type { RuntimeReadyBattleArtProfile, RuntimeReadyDivinePowerProfile } from '../types/cultivationV2.js';

export type RealmSubStageDefinition = {
  id: string;
  parentRealmId: RealmId;
  order: number;
  label: string;
  displayName: string;
  minPowerInclusive: number;
  maxPowerExclusive: number;
  isFallback?: boolean;
};

export interface BattleArtRegistryEntry {
  id: string;
  runtimeReady: boolean;
  category: 'attack' | 'guard' | 'movement' | 'support';
  tags: string[];
  lineageTag?: LineageId;
  requiredRealmId: RealmId;
  requiredRealmSubStageId?: string;
}

export interface DivinePowerRegistryEntry {
  id: string;
  runtimeReady: boolean;
  category: 'burst' | 'control' | 'ward' | 'domain';
  tags: string[];
  lineageTag?: LineageId;
  requiredRealmId: RealmId;
  requiredRealmSubStageId?: string;
  zifuAcquisition?: {
    minExistingPowerCount: number;
    proofRequirementIds?: string[];
  };
}

const REALM_NAMES: Record<RealmId, string> = {
  'realm.taixi': '胎息',
  'realm.lianqi': '练气',
  'realm.zhuji': '筑基',
  'realm.zifu': '紫府',
  'realm.jindan': '金丹',
  'realm.yuanying': '元婴'
};

const CONTENT_NAMES: Record<string, string> = {
  'art.basic_guarding_hand': '基础护身手',
  'art.cloud_step': '云步',
  'art.wind_breaking_palm': '破风掌',
  'art.earth_wall_seal': '土墙印',
  'art.flowing_shadow_step': '流影步',
  'art.spirit_gathering_chant': '聚灵咒',
  'art.golden_light_art': '金光术',
  'art.black_water_sword_art': '玄水剑诀',
  'art.fire_sparrow_art': '火雀术',
  'art.folding_feather_spear': '折羽枪',
  'art.surging_river_step': '越河湍流步',
  'art.blood_escape_art': '血遁术',
  'art.clear_eye_spirit_gaze': '清目灵瞳',
  'art.returning_origin_shield': '归元盾',
  'art.heart_cauldron_dispel': '心鼎消厄',
  'art.profound_broad_healing': '玄闳术',
  'art.morning_glow_stride': '朝霞御行',
  'art.cloudfall_glide': '云中金落',
  'art.flaming_step': '蹈焰行',
  'art.high_sun_subduing_light': '上曜伏光',
  'art.emperor_diverging_light': '帝岐光',
  'art.south_emperor_binding_law': '南帝玄擭法',
  'art.heavenly_punishment_execution': '天神收夷罚杀',
  'art.crimson_split_spear': '裂红枪',
  'art.heavenly_net_guard': '天罗护势',
  'power.spirit_flash': '灵闪',
  'power.binding_mist': '缚雾',
  'power.guarding_true_light': '护体真光',
  'power.thunder_domain_mark': '雷域印',
  'power.void_breaking_ray': '破虚光',
  'power.invoking_heaven_gate': '谒天门',
  'power.scarlet_sundering_bolt': '赤断镞',
  'power.imperial_gaze_origin': '帝观元',
  'power.long_bright_steps': '长明阶',
  'power.great_departure_book': '大离书',
  'power.treading_peril': '君蹈危',
  'power.southern_sorrow_water': '南惆水',
  'power.hundred_bodies': '千百身',
  'power.clear_heart': '昭澈心',
  'power.no_purple_garment': '不紫衣',
  'power.asking_two_forgetfulness': '请两忘',
  'power.rank_from_luo': '位从罗',
  'power.orderly_conquest': '顺平征',
  'power.locust_shade_ghost': '槐荫鬼',
  'power.resonant_spring_voice': '洞泉声',
  'power.zifu_first_light': '紫府初照',
  'goldNature.direct_mingyang': '明阳金性',
  'jindan_path.direct_gold': '正法求金'
};

export const XUANJIAN_STARTER_BATTLE_ART_IDS = ['art.basic_guarding_hand', 'art.cloud_step'] as const;

export function getStarterBattleArtIds(): string[] {
  return [...XUANJIAN_STARTER_BATTLE_ART_IDS];
}

export function createDefaultBattleLoadoutState(): BattleLoadoutState {
  return {
    equippedBattleArtIds: [XUANJIAN_STARTER_BATTLE_ART_IDS[0]],
    equippedDivinePowerIds: [],
    equippedArtifactIds: [],
    activeSupportArtId: null
  };
}

const REALM_SUB_STAGES: RealmSubStageDefinition[] = [
  { id: 'realmSubStage.taixi.xuanjing', parentRealmId: 'realm.taixi', order: 1, label: '玄景', displayName: '胎息·玄景', minPowerInclusive: 0, maxPowerExclusive: 20 },
  { id: 'realmSubStage.taixi.chengming', parentRealmId: 'realm.taixi', order: 2, label: '承明', displayName: '胎息·承明', minPowerInclusive: 20, maxPowerExclusive: 40 },
  { id: 'realmSubStage.taixi.zhouxing', parentRealmId: 'realm.taixi', order: 3, label: '周行', displayName: '胎息·周行', minPowerInclusive: 40, maxPowerExclusive: 60 },
  { id: 'realmSubStage.taixi.qingyuan', parentRealmId: 'realm.taixi', order: 4, label: '青元', displayName: '胎息·青元', minPowerInclusive: 60, maxPowerExclusive: 80 },
  { id: 'realmSubStage.taixi.yujing', parentRealmId: 'realm.taixi', order: 5, label: '玉京', displayName: '胎息·玉京', minPowerInclusive: 80, maxPowerExclusive: 100 },
  { id: 'realmSubStage.taixi.lingchu', parentRealmId: 'realm.taixi', order: 6, label: '灵初', displayName: '胎息·灵初', minPowerInclusive: 100, maxPowerExclusive: 120 },
  { id: 'realmSubStage.lianqi.1', parentRealmId: 'realm.lianqi', order: 1, label: '一层', displayName: '练气·一层', minPowerInclusive: 120, maxPowerExclusive: 153 },
  { id: 'realmSubStage.lianqi.2', parentRealmId: 'realm.lianqi', order: 2, label: '二层', displayName: '练气·二层', minPowerInclusive: 153, maxPowerExclusive: 187 },
  { id: 'realmSubStage.lianqi.3', parentRealmId: 'realm.lianqi', order: 3, label: '三层', displayName: '练气·三层', minPowerInclusive: 187, maxPowerExclusive: 220 },
  { id: 'realmSubStage.lianqi.4', parentRealmId: 'realm.lianqi', order: 4, label: '四层', displayName: '练气·四层', minPowerInclusive: 220, maxPowerExclusive: 253 },
  { id: 'realmSubStage.lianqi.5', parentRealmId: 'realm.lianqi', order: 5, label: '五层', displayName: '练气·五层', minPowerInclusive: 253, maxPowerExclusive: 287 },
  { id: 'realmSubStage.lianqi.6', parentRealmId: 'realm.lianqi', order: 6, label: '六层', displayName: '练气·六层', minPowerInclusive: 287, maxPowerExclusive: 320 },
  { id: 'realmSubStage.lianqi.7', parentRealmId: 'realm.lianqi', order: 7, label: '七层', displayName: '练气·七层', minPowerInclusive: 320, maxPowerExclusive: 353 },
  { id: 'realmSubStage.lianqi.8', parentRealmId: 'realm.lianqi', order: 8, label: '八层', displayName: '练气·八层', minPowerInclusive: 353, maxPowerExclusive: 387 },
  { id: 'realmSubStage.lianqi.9', parentRealmId: 'realm.lianqi', order: 9, label: '九层', displayName: '练气·九层', minPowerInclusive: 387, maxPowerExclusive: 420 },
  { id: 'realmSubStage.zhuji.early', parentRealmId: 'realm.zhuji', order: 1, label: '初层', displayName: '筑基·初层', minPowerInclusive: 420, maxPowerExclusive: 654 },
  { id: 'realmSubStage.zhuji.middle', parentRealmId: 'realm.zhuji', order: 2, label: '中层', displayName: '筑基·中层', minPowerInclusive: 654, maxPowerExclusive: 887 },
  { id: 'realmSubStage.zhuji.late', parentRealmId: 'realm.zhuji', order: 3, label: '后层', displayName: '筑基·后层', minPowerInclusive: 887, maxPowerExclusive: 1120 },
  { id: 'realmSubStage.zifu.early', parentRealmId: 'realm.zifu', order: 1, label: '初期', displayName: '紫府·初期', minPowerInclusive: 1120, maxPowerExclusive: 1495 },
  { id: 'realmSubStage.zifu.middle', parentRealmId: 'realm.zifu', order: 2, label: '中期', displayName: '紫府·中期', minPowerInclusive: 1495, maxPowerExclusive: 1870 },
  { id: 'realmSubStage.zifu.late', parentRealmId: 'realm.zifu', order: 3, label: '后期', displayName: '紫府·后期', minPowerInclusive: 1870, maxPowerExclusive: 2245 },
  { id: 'realmSubStage.zifu.perfect', parentRealmId: 'realm.zifu', order: 4, label: '圆满', displayName: '紫府·圆满', minPowerInclusive: 2245, maxPowerExclusive: 2620 },
  { id: 'realmSubStage.jindan.default', parentRealmId: 'realm.jindan', order: 1, label: '金丹', displayName: '金丹', minPowerInclusive: 2620, maxPowerExclusive: 5620, isFallback: true },
  { id: 'realmSubStage.yuanying.default', parentRealmId: 'realm.yuanying', order: 1, label: '元婴', displayName: '元婴', minPowerInclusive: 5620, maxPowerExclusive: Number.POSITIVE_INFINITY, isFallback: true }
];

const BATTLE_ART_REGISTRY: BattleArtRegistryEntry[] = [
  {
    id: 'art.basic_guarding_hand',
    runtimeReady: true,
    category: 'guard',
    tags: ['starter', 'defense'],
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.cloud_step',
    runtimeReady: true,
    category: 'movement',
    tags: ['starter', 'speed'],
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.wind_breaking_palm',
    runtimeReady: true,
    category: 'attack',
    tags: ['starter', 'attack'],
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.earth_wall_seal',
    runtimeReady: true,
    category: 'guard',
    tags: ['defense', 'stability'],
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'art.flowing_shadow_step',
    runtimeReady: true,
    category: 'movement',
    tags: ['speed', 'evasion'],
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'art.spirit_gathering_chant',
    runtimeReady: true,
    category: 'support',
    tags: ['support', 'focus'],
    requiredRealmId: 'realm.taixi',
    requiredRealmSubStageId: 'realmSubStage.taixi.yujing'
  },
  {
    id: 'art.golden_light_art',
    runtimeReady: true,
    category: 'attack',
    tags: ['jin', 'starter-attack'],
    lineageTag: 'duijin',
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.black_water_sword_art',
    runtimeReady: true,
    category: 'attack',
    tags: ['water', 'sword'],
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'art.fire_sparrow_art',
    runtimeReady: true,
    category: 'attack',
    tags: ['fire', 'burst'],
    lineageTag: 'lihuo',
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.folding_feather_spear',
    runtimeReady: true,
    category: 'attack',
    tags: ['spear', 'combo'],
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.surging_river_step',
    runtimeReady: true,
    category: 'movement',
    tags: ['movement', 'evasion'],
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.blood_escape_art',
    runtimeReady: true,
    category: 'movement',
    tags: ['movement', 'survival'],
    requiredRealmId: 'realm.taixi'
  },
  {
    id: 'art.clear_eye_spirit_gaze',
    runtimeReady: true,
    category: 'support',
    tags: ['support', 'sense'],
    lineageTag: 'pinshui',
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'art.returning_origin_shield',
    runtimeReady: true,
    category: 'guard',
    tags: ['guard', 'shield'],
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'art.heart_cauldron_dispel',
    runtimeReady: true,
    category: 'support',
    tags: ['support', 'dispel'],
    lineageTag: 'zhengmu',
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'art.profound_broad_healing',
    runtimeReady: true,
    category: 'support',
    tags: ['support', 'healing'],
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'art.morning_glow_stride',
    runtimeReady: true,
    category: 'movement',
    tags: ['movement', 'glow'],
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'art.cloudfall_glide',
    runtimeReady: true,
    category: 'movement',
    tags: ['movement', 'distance'],
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'art.flaming_step',
    runtimeReady: true,
    category: 'movement',
    tags: ['movement', 'fire'],
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'art.high_sun_subduing_light',
    runtimeReady: false,
    category: 'attack',
    tags: ['quasi-divine', 'pending-balance'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'art.emperor_diverging_light',
    runtimeReady: false,
    category: 'attack',
    tags: ['quasi-divine', 'pending-balance'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'art.south_emperor_binding_law',
    runtimeReady: false,
    category: 'attack',
    tags: ['quasi-divine', 'control', 'pending-balance'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'art.heavenly_punishment_execution',
    runtimeReady: false,
    category: 'attack',
    tags: ['quasi-divine', 'execution', 'pending-balance'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'art.crimson_split_spear',
    runtimeReady: false,
    category: 'attack',
    tags: ['ambiguous', 'pending-balance'],
    lineageTag: 'mingyang',
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'art.heavenly_net_guard',
    runtimeReady: false,
    category: 'guard',
    tags: ['ambiguous', 'pending-balance'],
    requiredRealmId: 'realm.zhuji'
  }
] as const;

const DIVINE_POWER_REGISTRY: DivinePowerRegistryEntry[] = [
  {
    id: 'power.spirit_flash',
    runtimeReady: true,
    category: 'burst',
    tags: ['starter', 'burst'],
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'power.binding_mist',
    runtimeReady: true,
    category: 'control',
    tags: ['control', 'mist'],
    requiredRealmId: 'realm.lianqi'
  },
  {
    id: 'power.guarding_true_light',
    runtimeReady: true,
    category: 'ward',
    tags: ['ward', 'protection'],
    requiredRealmId: 'realm.zhuji'
  },
  {
    id: 'power.thunder_domain_mark',
    runtimeReady: true,
    category: 'domain',
    tags: ['domain', 'thunder'],
    requiredRealmId: 'realm.zhuji',
    requiredRealmSubStageId: 'realmSubStage.zhuji.middle'
  },
  {
    id: 'power.void_breaking_ray',
    runtimeReady: false,
    category: 'burst',
    tags: ['ambiguous', 'pending-balance'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.invoking_heaven_gate',
    runtimeReady: true,
    category: 'domain',
    tags: ['zifu', 'mingyang', 'suppression'],
    lineageTag: 'mingyang',
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.scarlet_sundering_bolt',
    runtimeReady: true,
    category: 'burst',
    tags: ['zifu', 'mingyang', 'burst'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.imperial_gaze_origin',
    runtimeReady: true,
    category: 'domain',
    tags: ['zifu', 'mingyang', 'command'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.long_bright_steps',
    runtimeReady: true,
    category: 'ward',
    tags: ['zifu', 'mingyang', 'support'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.great_departure_book',
    runtimeReady: true,
    category: 'burst',
    tags: ['zifu', 'lihuo', 'burst'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.treading_peril',
    runtimeReady: true,
    category: 'burst',
    tags: ['zifu', 'body', 'rush'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.southern_sorrow_water',
    runtimeReady: true,
    category: 'ward',
    tags: ['zifu', 'water', 'defense'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.hundred_bodies',
    runtimeReady: true,
    category: 'ward',
    tags: ['zifu', 'shaqi', 'survival'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.clear_heart',
    runtimeReady: true,
    category: 'control',
    tags: ['zifu', 'mingyang', 'fate'],
    requiredRealmId: 'realm.zifu',
    zifuAcquisition: {
      minExistingPowerCount: 1,
      proofRequirementIds: ['proof.mingyang_fate_anchor']
    }
  },
  {
    id: 'power.no_purple_garment',
    runtimeReady: true,
    category: 'ward',
    tags: ['zifu', 'jueyin', 'ward'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.asking_two_forgetfulness',
    runtimeReady: true,
    category: 'control',
    tags: ['zifu', 'duijin', 'fate'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.rank_from_luo',
    runtimeReady: true,
    category: 'domain',
    tags: ['zifu', 'lihuo', 'fate'],
    lineageTag: 'duijin',
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.orderly_conquest',
    runtimeReady: true,
    category: 'control',
    tags: ['zifu', 'lihuo', 'suppression'],
    lineageTag: 'lihuo',
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.locust_shade_ghost',
    runtimeReady: true,
    category: 'domain',
    tags: ['zifu', 'magic', 'borrow-power'],
    requiredRealmId: 'realm.zifu'
  },
  {
    id: 'power.resonant_spring_voice',
    runtimeReady: false,
    category: 'control',
    tags: ['dual-class', 'pending-balance'],
    requiredRealmId: 'realm.zifu'
  }
] as const;

const BATTLE_ART_BALANCE_PROFILES: Record<string, RuntimeReadyBattleArtProfile> = {
  'art.basic_guarding_hand': {
    definitionId: 'art.basic_guarding_hand',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.7, senseWeight: 0.1, speedWeight: 0.1 },
    actionProfile: { actionType: 'guard', tags: ['starter', 'guard'] }
  },
  'art.cloud_step': {
    definitionId: 'art.cloud_step',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.1, senseWeight: 0.1, speedWeight: 0.7 },
    actionProfile: { actionType: 'movement', tags: ['starter', 'movement'] }
  },
  'art.wind_breaking_palm': {
    definitionId: 'art.wind_breaking_palm',
    balanceProfile: { version: 1, attackWeight: 0.7, defenseWeight: 0.1, senseWeight: 0.1, speedWeight: 0.1 },
    actionProfile: { actionType: 'attack', tags: ['starter', 'attack'] }
  },
  'art.earth_wall_seal': {
    definitionId: 'art.earth_wall_seal',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.75, senseWeight: 0.1, speedWeight: 0.05 },
    actionProfile: { actionType: 'guard', tags: ['defense', 'stability'] }
  },
  'art.flowing_shadow_step': {
    definitionId: 'art.flowing_shadow_step',
    balanceProfile: { version: 1, attackWeight: 0.15, defenseWeight: 0.1, senseWeight: 0.2, speedWeight: 0.55 },
    actionProfile: { actionType: 'movement', tags: ['speed', 'evasion'] }
  },
  'art.spirit_gathering_chant': {
    definitionId: 'art.spirit_gathering_chant',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.25, senseWeight: 0.45, speedWeight: 0.2 },
    actionProfile: { actionType: 'support', tags: ['support', 'focus'] }
  },
  'art.golden_light_art': {
    definitionId: 'art.golden_light_art',
    balanceProfile: { version: 1, attackWeight: 0.65, defenseWeight: 0.1, senseWeight: 0.1, speedWeight: 0.15 },
    actionProfile: { actionType: 'attack', tags: ['jin', 'starter-attack'] }
  },
  'art.black_water_sword_art': {
    definitionId: 'art.black_water_sword_art',
    balanceProfile: { version: 1, attackWeight: 0.6, defenseWeight: 0.1, senseWeight: 0.15, speedWeight: 0.15 },
    actionProfile: { actionType: 'attack', tags: ['water', 'sword'] }
  },
  'art.fire_sparrow_art': {
    definitionId: 'art.fire_sparrow_art',
    balanceProfile: { version: 1, attackWeight: 0.68, defenseWeight: 0.05, senseWeight: 0.12, speedWeight: 0.15 },
    actionProfile: { actionType: 'attack', tags: ['fire', 'burst'] }
  },
  'art.folding_feather_spear': {
    definitionId: 'art.folding_feather_spear',
    balanceProfile: { version: 1, attackWeight: 0.58, defenseWeight: 0.15, senseWeight: 0.1, speedWeight: 0.17 },
    actionProfile: { actionType: 'attack', tags: ['spear', 'combo'] }
  },
  'art.surging_river_step': {
    definitionId: 'art.surging_river_step',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.12, senseWeight: 0.18, speedWeight: 0.6 },
    actionProfile: { actionType: 'movement', tags: ['movement', 'evasion'] }
  },
  'art.blood_escape_art': {
    definitionId: 'art.blood_escape_art',
    balanceProfile: { version: 1, attackWeight: 0.08, defenseWeight: 0.12, senseWeight: 0.15, speedWeight: 0.65 },
    actionProfile: { actionType: 'movement', tags: ['movement', 'survival'] }
  },
  'art.clear_eye_spirit_gaze': {
    definitionId: 'art.clear_eye_spirit_gaze',
    balanceProfile: { version: 1, attackWeight: 0.08, defenseWeight: 0.15, senseWeight: 0.55, speedWeight: 0.22 },
    actionProfile: { actionType: 'support', tags: ['support', 'sense'] }
  },
  'art.returning_origin_shield': {
    definitionId: 'art.returning_origin_shield',
    balanceProfile: { version: 1, attackWeight: 0.05, defenseWeight: 0.72, senseWeight: 0.08, speedWeight: 0.15 },
    actionProfile: { actionType: 'guard', tags: ['guard', 'shield'] }
  },
  'art.heart_cauldron_dispel': {
    definitionId: 'art.heart_cauldron_dispel',
    balanceProfile: { version: 1, attackWeight: 0.08, defenseWeight: 0.32, senseWeight: 0.35, speedWeight: 0.25 },
    actionProfile: { actionType: 'support', tags: ['support', 'dispel'] }
  },
  'art.profound_broad_healing': {
    definitionId: 'art.profound_broad_healing',
    balanceProfile: { version: 1, attackWeight: 0.05, defenseWeight: 0.28, senseWeight: 0.42, speedWeight: 0.25 },
    actionProfile: { actionType: 'support', tags: ['support', 'healing'] }
  },
  'art.morning_glow_stride': {
    definitionId: 'art.morning_glow_stride',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.12, senseWeight: 0.23, speedWeight: 0.55 },
    actionProfile: { actionType: 'movement', tags: ['movement', 'glow'] }
  },
  'art.cloudfall_glide': {
    definitionId: 'art.cloudfall_glide',
    balanceProfile: { version: 1, attackWeight: 0.12, defenseWeight: 0.1, senseWeight: 0.23, speedWeight: 0.55 },
    actionProfile: { actionType: 'movement', tags: ['movement', 'distance'] }
  },
  'art.flaming_step': {
    definitionId: 'art.flaming_step',
    balanceProfile: { version: 1, attackWeight: 0.14, defenseWeight: 0.1, senseWeight: 0.16, speedWeight: 0.6 },
    actionProfile: { actionType: 'movement', tags: ['movement', 'fire'] }
  }
};

const DIVINE_POWER_BALANCE_PROFILES: Record<string, RuntimeReadyDivinePowerProfile> = {
  'power.spirit_flash': {
    definitionId: 'power.spirit_flash',
    balanceProfile: {
      version: 1,
      attackWeight: 0.55,
      defenseWeight: 0.05,
      senseWeight: 0.25,
      speedWeight: 0.15,
      stabilityWeight: 0.1
    },
    actionProfile: { actionType: 'burst', tags: ['starter', 'burst'] }
  },
  'power.binding_mist': {
    definitionId: 'power.binding_mist',
    balanceProfile: {
      version: 1,
      attackWeight: 0.2,
      defenseWeight: 0.2,
      senseWeight: 0.35,
      speedWeight: 0.25,
      stabilityWeight: 0.15
    },
    actionProfile: { actionType: 'control', tags: ['control', 'mist'] }
  },
  'power.guarding_true_light': {
    definitionId: 'power.guarding_true_light',
    balanceProfile: {
      version: 1,
      attackWeight: 0.1,
      defenseWeight: 0.45,
      senseWeight: 0.25,
      speedWeight: 0.2,
      stabilityWeight: 0.25
    },
    actionProfile: { actionType: 'ward', tags: ['ward', 'protection'] }
  },
  'power.thunder_domain_mark': {
    definitionId: 'power.thunder_domain_mark',
    balanceProfile: {
      version: 1,
      attackWeight: 0.3,
      defenseWeight: 0.15,
      senseWeight: 0.35,
      speedWeight: 0.2,
      stabilityWeight: 0.2
    },
    actionProfile: { actionType: 'domain', tags: ['domain', 'thunder'] }
  },
  'power.invoking_heaven_gate': {
    definitionId: 'power.invoking_heaven_gate',
    balanceProfile: {
      version: 1,
      attackWeight: 0.34,
      defenseWeight: 0.16,
      senseWeight: 0.34,
      speedWeight: 0.16,
      stabilityWeight: 0.22
    },
    actionProfile: { actionType: 'domain', tags: ['zifu', 'mingyang', 'suppression'] }
  },
  'power.scarlet_sundering_bolt': {
    definitionId: 'power.scarlet_sundering_bolt',
    balanceProfile: {
      version: 1,
      attackWeight: 0.58,
      defenseWeight: 0.05,
      senseWeight: 0.22,
      speedWeight: 0.15,
      stabilityWeight: 0.14
    },
    actionProfile: { actionType: 'burst', tags: ['zifu', 'mingyang', 'burst'] }
  },
  'power.imperial_gaze_origin': {
    definitionId: 'power.imperial_gaze_origin',
    balanceProfile: {
      version: 1,
      attackWeight: 0.26,
      defenseWeight: 0.14,
      senseWeight: 0.38,
      speedWeight: 0.22,
      stabilityWeight: 0.22
    },
    actionProfile: { actionType: 'domain', tags: ['zifu', 'mingyang', 'command'] }
  },
  'power.long_bright_steps': {
    definitionId: 'power.long_bright_steps',
    balanceProfile: {
      version: 1,
      attackWeight: 0.2,
      defenseWeight: 0.24,
      senseWeight: 0.34,
      speedWeight: 0.22,
      stabilityWeight: 0.18
    },
    actionProfile: { actionType: 'ward', tags: ['zifu', 'mingyang', 'support'] }
  },
  'power.great_departure_book': {
    definitionId: 'power.great_departure_book',
    balanceProfile: {
      version: 1,
      attackWeight: 0.62,
      defenseWeight: 0.04,
      senseWeight: 0.2,
      speedWeight: 0.14,
      stabilityWeight: 0.16
    },
    actionProfile: { actionType: 'burst', tags: ['zifu', 'lihuo', 'burst'] }
  },
  'power.treading_peril': {
    definitionId: 'power.treading_peril',
    balanceProfile: {
      version: 1,
      attackWeight: 0.48,
      defenseWeight: 0.14,
      senseWeight: 0.16,
      speedWeight: 0.22,
      stabilityWeight: 0.18
    },
    actionProfile: { actionType: 'burst', tags: ['zifu', 'body', 'rush'] }
  },
  'power.southern_sorrow_water': {
    definitionId: 'power.southern_sorrow_water',
    balanceProfile: {
      version: 1,
      attackWeight: 0.12,
      defenseWeight: 0.38,
      senseWeight: 0.28,
      speedWeight: 0.22,
      stabilityWeight: 0.24
    },
    actionProfile: { actionType: 'ward', tags: ['zifu', 'water', 'defense'] }
  },
  'power.hundred_bodies': {
    definitionId: 'power.hundred_bodies',
    balanceProfile: {
      version: 1,
      attackWeight: 0.18,
      defenseWeight: 0.36,
      senseWeight: 0.24,
      speedWeight: 0.22,
      stabilityWeight: 0.26
    },
    actionProfile: { actionType: 'ward', tags: ['zifu', 'shaqi', 'survival'] }
  },
  'power.clear_heart': {
    definitionId: 'power.clear_heart',
    balanceProfile: {
      version: 1,
      attackWeight: 0.18,
      defenseWeight: 0.12,
      senseWeight: 0.42,
      speedWeight: 0.28,
      stabilityWeight: 0.22
    },
    actionProfile: { actionType: 'control', tags: ['zifu', 'mingyang', 'fate'] }
  },
  'power.no_purple_garment': {
    definitionId: 'power.no_purple_garment',
    balanceProfile: {
      version: 1,
      attackWeight: 0.1,
      defenseWeight: 0.42,
      senseWeight: 0.3,
      speedWeight: 0.18,
      stabilityWeight: 0.26
    },
    actionProfile: { actionType: 'ward', tags: ['zifu', 'jueyin', 'ward'] }
  },
  'power.asking_two_forgetfulness': {
    definitionId: 'power.asking_two_forgetfulness',
    balanceProfile: {
      version: 1,
      attackWeight: 0.16,
      defenseWeight: 0.14,
      senseWeight: 0.4,
      speedWeight: 0.3,
      stabilityWeight: 0.22
    },
    actionProfile: { actionType: 'control', tags: ['zifu', 'duijin', 'fate'] }
  },
  'power.rank_from_luo': {
    definitionId: 'power.rank_from_luo',
    balanceProfile: {
      version: 1,
      attackWeight: 0.22,
      defenseWeight: 0.12,
      senseWeight: 0.4,
      speedWeight: 0.26,
      stabilityWeight: 0.22
    },
    actionProfile: { actionType: 'domain', tags: ['zifu', 'lihuo', 'fate'] }
  },
  'power.orderly_conquest': {
    definitionId: 'power.orderly_conquest',
    balanceProfile: {
      version: 1,
      attackWeight: 0.24,
      defenseWeight: 0.12,
      senseWeight: 0.38,
      speedWeight: 0.26,
      stabilityWeight: 0.2
    },
    actionProfile: { actionType: 'control', tags: ['zifu', 'lihuo', 'suppression'] }
  },
  'power.locust_shade_ghost': {
    definitionId: 'power.locust_shade_ghost',
    balanceProfile: {
      version: 1,
      attackWeight: 0.2,
      defenseWeight: 0.16,
      senseWeight: 0.38,
      speedWeight: 0.26,
      stabilityWeight: 0.24
    },
    actionProfile: { actionType: 'domain', tags: ['zifu', 'magic', 'borrow-power'] }
  }
};

const REALM_ORDER: RealmId[] = [
  'realm.taixi',
  'realm.lianqi',
  'realm.zhuji',
  'realm.zifu',
  'realm.jindan',
  'realm.yuanying'
];

function isRealmAtLeast(currentRealmId: RealmId, floorRealmId: RealmId): boolean {
  const currentIndex = REALM_ORDER.indexOf(currentRealmId);
  const floorIndex = REALM_ORDER.indexOf(floorRealmId);
  return currentIndex >= floorIndex;
}

function isSubStageAtLeast(currentSubStageId: string, requiredSubStageId: string): boolean {
  const current = getRealmSubStageById(currentSubStageId);
  const required = getRealmSubStageById(requiredSubStageId);
  if (!current || !required) {
    return false;
  }
  return current.parentRealmId === required.parentRealmId && current.order >= required.order;
}

function isBattleArtUnlocked(entry: BattleArtRegistryEntry, state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>): boolean {
  if (!isRealmAtLeast(state.realmId, entry.requiredRealmId)) {
    return false;
  }
  if (!entry.requiredRealmSubStageId) {
    return true;
  }
  if (state.realmId !== getRealmSubStageById(entry.requiredRealmSubStageId)?.parentRealmId) {
    return isRealmAtLeast(state.realmId, entry.requiredRealmId);
  }
  return isSubStageAtLeast(state.realmSubStageId, entry.requiredRealmSubStageId);
}

function isDivinePowerUnlocked(entry: DivinePowerRegistryEntry, state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>): boolean {
  if (!isRealmAtLeast(state.realmId, entry.requiredRealmId)) {
    return false;
  }
  if (!entry.requiredRealmSubStageId) {
    return true;
  }
  if (state.realmId !== getRealmSubStageById(entry.requiredRealmSubStageId)?.parentRealmId) {
    return isRealmAtLeast(state.realmId, entry.requiredRealmId);
  }
  return isSubStageAtLeast(state.realmSubStageId, entry.requiredRealmSubStageId);
}

export function getRealmSubStageById(id: string) {
  return REALM_SUB_STAGES.find((item) => item.id === id) ?? null;
}

export function getRealmSubStagesByRealmId(realmId: RealmId) {
  return REALM_SUB_STAGES.filter((item) => item.parentRealmId === realmId);
}

export function resolveRealmSubStageId(realmId: RealmId, currentPower: number) {
  const candidates = getRealmSubStagesByRealmId(realmId);
  if (candidates.length === 0) {
    throw new Error(`Realm sub-stage definitions missing for ${realmId}`);
  }

  const first = candidates[0]!;
  const last = candidates[candidates.length - 1]!;
  const safePower = Number.isFinite(currentPower) ? currentPower : first.minPowerInclusive;
  const lastCeiling = Number.isFinite(last.maxPowerExclusive) ? last.maxPowerExclusive - 1 : safePower;
  const clampedPower = Math.max(first.minPowerInclusive, Math.min(safePower, lastCeiling));
  const resolved = candidates.find((item) => clampedPower >= item.minPowerInclusive && clampedPower < item.maxPowerExclusive);
  return (resolved ?? last).id;
}

export function formatRealmSubStageDisplay(input: { realmId: RealmId; currentPower: number; realmSubStageId?: string | null }) {
  const subStageId = resolveRealmSubStageId(input.realmId, input.currentPower);
  const subStage = getRealmSubStageById(subStageId);
  const realmName = REALM_NAMES[input.realmId];

  if (!subStage || subStage.isFallback) {
    return { fullName: realmName, realmName, subStageName: null };
  }

  return {
    fullName: subStage.displayName,
    realmName,
    subStageName: subStage.label
  };
}

export function getBattleArtRegistryEntry(id: string) {
  return BATTLE_ART_REGISTRY.find((item) => item.id === id) ?? null;
}

export function getBattleArtRegistryEntries() {
  return [...BATTLE_ART_REGISTRY];
}

export function getRuntimeContentName(id: string) {
  return CONTENT_NAMES[id] ?? id;
}

export function getRuntimeContentNameMap() {
  return { ...CONTENT_NAMES };
}

export function projectBattleArtRuntimeProfile(id: string): RuntimeReadyBattleArtProfile {
  const profile = BATTLE_ART_BALANCE_PROFILES[id];
  const entry = getBattleArtRegistryEntry(id);
  if (!profile) {
    throw new Error(`Battle art runtime profile not found: ${id}`);
  }
  if (entry?.lineageTag) {
    return {
      ...profile,
      lineageTag: entry.lineageTag
    };
  }
  return profile;
}

export function getDivinePowerRegistryEntry(id: string) {
  return DIVINE_POWER_REGISTRY.find((item) => item.id === id) ?? null;
}

export function getDivinePowerRegistryEntries() {
  return [...DIVINE_POWER_REGISTRY];
}

export function projectDivinePowerRuntimeProfile(id: string): RuntimeReadyDivinePowerProfile {
  const profile = DIVINE_POWER_BALANCE_PROFILES[id];
  const entry = getDivinePowerRegistryEntry(id);
  if (!profile) {
    throw new Error(`Divine power runtime profile not found: ${id}`);
  }
  if (entry?.lineageTag) {
    return {
      ...profile,
      lineageTag: entry.lineageTag
    };
  }
  return profile;
}

export function getRuntimeReadyContentBatch() {
  const battleArts = getBattleArtRegistryEntries()
    .filter((entry) => entry.runtimeReady)
    .map((entry) => ({
      entry,
      runtimeProfile: projectBattleArtRuntimeProfile(entry.id)
    }));
  const divinePowers = getDivinePowerRegistryEntries()
    .filter((entry) => entry.runtimeReady)
    .map((entry) => ({
      entry,
      runtimeProfile: projectDivinePowerRuntimeProfile(entry.id)
    }));

  return {
    battleArts,
    divinePowers
  };
}

export function isBattleArtRuntimeReadyForState(
  id: string,
  state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>
) {
  const entry = getBattleArtRegistryEntry(id);
  return Boolean(entry && entry.runtimeReady && isBattleArtUnlocked(entry, state));
}

export function isDivinePowerRuntimeReadyForState(
  id: string,
  state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>
) {
  const entry = getDivinePowerRegistryEntry(id);
  return Boolean(entry && entry.runtimeReady && isDivinePowerUnlocked(entry, state));
}

export function getUnlockedRuntimeReadyBattleArts(
  state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>
) {
  return getBattleArtRegistryEntries()
    .filter((entry) => entry.runtimeReady && isBattleArtUnlocked(entry, state))
    .map((entry) => ({
      entry,
      runtimeProfile: projectBattleArtRuntimeProfile(entry.id)
    }));
}

export function getUnlockedRuntimeReadyDivinePowers(
  state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>
) {
  return getDivinePowerRegistryEntries()
    .filter((entry) => entry.runtimeReady && isDivinePowerUnlocked(entry, state))
    .map((entry) => ({
      entry,
      runtimeProfile: projectDivinePowerRuntimeProfile(entry.id)
    }));
}

export function getBattleSlotLimits(
  state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>
) {
  if (state.realmId === 'realm.taixi') {
    if (isSubStageAtLeast(state.realmSubStageId, 'realmSubStage.taixi.yujing')) {
      return {
        battleArtSlots: 2,
        supportSlots: 1,
        divinePowerSlots: 0
      };
    }

    return {
      battleArtSlots: 1,
      supportSlots: 0,
      divinePowerSlots: 0
    };
  }

  if (state.realmId === 'realm.zifu' || state.realmId === 'realm.jindan' || state.realmId === 'realm.yuanying') {
    return {
      battleArtSlots: 2,
      supportSlots: 1,
      divinePowerSlots: 1
    };
  }

  return {
    battleArtSlots: 2,
    supportSlots: 1,
    divinePowerSlots: 0
  };
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function resolveBattleArtCandidates(state: PlayerCultivationState): string[] {
  const loadoutIds = state.battleLoadout.equippedBattleArtIds;
  const equippedIds = state.equippedBattleArtIds;
  const knownIds = state.knownBattleArtIds;
  const primaryIds = loadoutIds.length > 0 ? loadoutIds : (equippedIds.length > 0 ? equippedIds : knownIds);
  const supportId = state.battleLoadout.activeSupportArtId;

  return uniqueIds([
    ...primaryIds,
    ...(supportId ? [supportId] : [])
  ]);
}

function resolveDivinePowerCandidates(state: PlayerCultivationState): string[] {
  const loadoutIds = state.battleLoadout.equippedDivinePowerIds;
  const equippedIds = state.equippedDivinePowerIds;
  const knownIds = state.knownDivinePowerIds;
  return uniqueIds(
    loadoutIds.length > 0 ? loadoutIds : (equippedIds.length > 0 ? equippedIds : knownIds)
  );
}

export function projectCombatLoadout(state: PlayerCultivationState) {
  const slotLimits = getBattleSlotLimits(state);
  const battleArtIds = resolveBattleArtCandidates(state)
    .filter((id) => {
      const entry = getBattleArtRegistryEntry(id);
      return Boolean(
        entry
        && entry.category !== 'support'
        && entry.runtimeReady
        && isBattleArtUnlocked(entry, state)
      );
    });

  const limitedBattleArtIds = battleArtIds.slice(0, slotLimits.battleArtSlots);
  const safeBattleArtIds = limitedBattleArtIds.length > 0
    ? limitedBattleArtIds
    : createDefaultBattleLoadoutState().equippedBattleArtIds.slice(0, slotLimits.battleArtSlots);
  const supportArtId = slotLimits.supportSlots > 0 ? state.battleLoadout.activeSupportArtId : null;
  const supportBattleArtIds = supportArtId
    ? [supportArtId].filter((id) => {
      const entry = getBattleArtRegistryEntry(id);
      return Boolean(
        entry
        && entry.category === 'support'
        && entry.runtimeReady
        && isBattleArtUnlocked(entry, state)
      );
    })
    : [];
  const projectedBattleArtIds = uniqueIds([
    ...safeBattleArtIds,
    ...supportBattleArtIds
  ]);
  const battleArtProfiles = projectedBattleArtIds.map((id) => projectBattleArtRuntimeProfile(id));

  const divinePowerIds = resolveDivinePowerCandidates(state)
    .filter((id) => {
      const entry = getDivinePowerRegistryEntry(id);
      return Boolean(entry && entry.runtimeReady && isDivinePowerUnlocked(entry, state));
    })
    .slice(0, slotLimits.divinePowerSlots);
  const divinePowerProfiles = divinePowerIds.map((id) => projectDivinePowerRuntimeProfile(id));

  return {
    battleArtIds: projectedBattleArtIds,
    battleArtProfiles,
    activeSupportArtId: supportBattleArtIds[0] ?? null,
    divinePowerIds,
    divinePowerProfiles,
    slotLimits
  };
}
