import {
  getMainLineageMultiplier,
  getRealmById,
  getRealmSubStageById,
  isUniversalDaoTrack,
  normalizeMainDaoTrack,
  projectCombatLoadout
} from '../config/xuanjianCanonical.js';
import { COMBAT_BALANCE } from '../config/xuanjianCombat.js';
import type { PlayerCultivationState } from '../types/cultivationCanonical.js';
import type { CombatantSnapshot } from '../types/cultivationCombat.js';
import type { RuntimeReadyBattleArtProfile, RuntimeReadyDivinePowerProfile } from '../types/cultivationV2.js';

function getInjuryPenalty(level: PlayerCultivationState['injuryState']['level']) {
  if (level === 'light') return 1;
  if (level === 'medium') return 2;
  if (level === 'heavy') return 4;
  return 0;
}

const ZHUJI_MIN_POWER = getRealmById('realm.zhuji').minPower;

function isRealmAtLeastZhuji(realmId: PlayerCultivationState['realmId']) {
  return getRealmById(realmId).minPower >= ZHUJI_MIN_POWER;
}

function getLineageSpecializationMultiplier(
  state: PlayerCultivationState,
  profileLineageTag: string | undefined
) {
  const normalizedMainDaoTrack = normalizeMainDaoTrack(state.mainDaoTrack);
  if (isUniversalDaoTrack(normalizedMainDaoTrack)) {
    return 1;
  }
  if (!isRealmAtLeastZhuji(state.realmId)) {
    return 1;
  }
  if (!profileLineageTag) {
    return 1;
  }

  const normalizedProfileLineage = normalizeMainDaoTrack(profileLineageTag);
  if (normalizedProfileLineage !== normalizedMainDaoTrack) {
    return 1;
  }

  return getMainLineageMultiplier(state.cultivationAttainment);
}

function getBattleArtBias(
  state: PlayerCultivationState,
  profile: RuntimeReadyBattleArtProfile,
  dimension: keyof RuntimeReadyBattleArtProfile['balanceProfile']
) {
  const baseBias = (profile.balanceProfile[dimension] - 0.25) * 4;
  return baseBias * getLineageSpecializationMultiplier(state, profile.lineageTag);
}

function getDivinePowerBias(
  state: PlayerCultivationState,
  profile: RuntimeReadyDivinePowerProfile,
  dimension: keyof RuntimeReadyDivinePowerProfile['balanceProfile']
) {
  const baseBias = profile.balanceProfile[dimension] * 3;
  return baseBias * getLineageSpecializationMultiplier(state, profile.lineageTag);
}

export function buildPlayerCombatSnapshot(state: PlayerCultivationState): CombatantSnapshot {
  const subStage = getRealmSubStageById(state.realmSubStageId);
  const loadout = projectCombatLoadout(state);
  const battleArtIds = loadout.battleArtIds;
  const subStageOrder = subStage?.order ?? 1;
  const injuryPenalty = getInjuryPenalty(state.injuryState.level);
  const battleArtAttackBias = loadout.battleArtProfiles.reduce((sum, profile) => (
    sum + getBattleArtBias(state, profile, 'attackWeight')
  ), 0);
  const battleArtDefenseBias = loadout.battleArtProfiles.reduce((sum, profile) => (
    sum + getBattleArtBias(state, profile, 'defenseWeight')
  ), 0);
  const battleArtSenseBias = loadout.battleArtProfiles.reduce((sum, profile) => (
    sum + getBattleArtBias(state, profile, 'senseWeight')
  ), 0);
  const battleArtSpeedBias = loadout.battleArtProfiles.reduce((sum, profile) => (
    sum + getBattleArtBias(state, profile, 'speedWeight')
  ), 0);
  const divineAttackBias = loadout.divinePowerProfiles.reduce((sum, profile) => (
    sum + getDivinePowerBias(state, profile, 'attackWeight')
  ), 0);
  const divineDefenseBias = loadout.divinePowerProfiles.reduce((sum, profile) => (
    sum + getDivinePowerBias(state, profile, 'defenseWeight')
  ), 0);
  const divineSenseBias = loadout.divinePowerProfiles.reduce((sum, profile) => (
    sum + getDivinePowerBias(state, profile, 'senseWeight')
  ), 0);
  const divineSpeedBias = loadout.divinePowerProfiles.reduce((sum, profile) => (
    sum + getDivinePowerBias(state, profile, 'speedWeight')
  ), 0);
  const divineStabilityBias = loadout.divinePowerProfiles.reduce((sum, profile) => (
    sum + (profile.balanceProfile.stabilityWeight * 4 * getLineageSpecializationMultiplier(state, profile.lineageTag))
  ), 0);

  const dimensions = {
    attack: 6 + subStageOrder + battleArtAttackBias + divineAttackBias,
    defense: 6 + subStageOrder + battleArtDefenseBias + divineDefenseBias - injuryPenalty,
    sense: 5 + Math.floor(state.cultivationAttainment / 5) + battleArtSenseBias + divineSenseBias,
    speed: 5 + subStageOrder + battleArtSpeedBias + divineSpeedBias - injuryPenalty
  };

  return {
    side: 'player',
    realmId: state.realmId,
    realmSubStageId: state.realmSubStageId,
    currentPower: state.currentPower,
    dimensions,
    vitality: COMBAT_BALANCE.vitalityBase + dimensions.defense * COMBAT_BALANCE.vitalityDefenseWeight,
    stability: 10 + Math.floor(state.cultivationAttainment / 3) + divineStabilityBias,
    battleArtIds,
    divinePowerIds: loadout.divinePowerIds,
    injuryLevel: state.injuryState.level,
    tags: [state.mainDaoTrack]
  };
}
