import {
  UNIVERSAL_DAO_TRACK,
  XUANJIAN_REALMS,
  createDefaultBattleLoadoutState,
  getCanonicalRealmStageInRealm,
  normalizeMainDaoTrack,
  getRealmById,
  getStarterBattleArtIds
} from '../config/xuanjianCanonical.js';
import type { PlayerCultivationState, RealmId } from '../types/cultivationCanonical.js';
import type { UserDocument } from '../types/models.js';
import { normalizeInjuryState } from '../types/cultivationCombat.js';

function isDefaultSeedState(state: PlayerCultivationState) {
  const starterBattleArtIds = getStarterBattleArtIds();
  const defaultBattleLoadout = createDefaultBattleLoadoutState();

  return (
    state.realmId === 'realm.taixi'
    && state.currentPower === 0
    && state.mainMethodId === 'method.starter_tuna'
    && normalizeMainDaoTrack(state.mainDaoTrack) === UNIVERSAL_DAO_TRACK
    && state.cultivationAttainment === 0
    && state.foundationId === 'foundation.unshaped'
    && state.knownBattleArtIds.length === starterBattleArtIds.length
    && starterBattleArtIds.every((id) => state.knownBattleArtIds.includes(id))
    && state.equippedBattleArtIds.length === starterBattleArtIds.length
    && starterBattleArtIds.every((id) => state.equippedBattleArtIds.includes(id))
    && state.knownDivinePowerIds.length === 0
    && state.equippedDivinePowerIds.length === 0
    && state.inventoryItemIds.length === 0
    && state.branchCultivationAttainments
    && Object.keys(state.branchCultivationAttainments).length === 0
    && state.battleLoadout.equippedBattleArtIds.length === defaultBattleLoadout.equippedBattleArtIds.length
    && defaultBattleLoadout.equippedBattleArtIds.every((id) => state.battleLoadout.equippedBattleArtIds.includes(id))
    && state.battleLoadout.equippedDivinePowerIds.length === defaultBattleLoadout.equippedDivinePowerIds.length
    && state.battleLoadout.equippedArtifactIds.length === defaultBattleLoadout.equippedArtifactIds.length
    && state.battleLoadout.activeSupportArtId === defaultBattleLoadout.activeSupportArtId
    && state.injuryState.level === 'none'
    && state.injuryState.points === 0
    && state.injuryState.modifiers.length === 0
    && state.cooldowns
    && Object.keys(state.cooldowns).length === 0
    && state.combatFlags
    && Object.keys(state.combatFlags).length === 0
    && state.combatHistorySummary.length === 0
    && state.focusStreak === 0
    && state.lastCultivationAt === null
  );
}

export function getCanonicalRealmByLegacyPower(legacyPower: number) {
  void legacyPower;
  return getRealmById('realm.taixi');
}

export function getCanonicalPowerFromLegacy(legacyPower: number): number {
  void legacyPower;
  return 0;
}

export function toLegacyCultivationShell(state: PlayerCultivationState, immortalStones: number) {
  const realm = getRealmById(state.realmId);
  const realmIndex = XUANJIAN_REALMS.findIndex((entry) => entry.id === state.realmId);

  return {
    spiritualPower: state.currentPower,
    realm: realm.name,
    realmId: realmIndex >= 0 ? realmIndex + 1 : 1,
    realmStage: getCanonicalRealmStageInRealm(state.currentPower, state.realmId).name,
    immortalStones
  };
}

export function deriveCanonicalSnapshotFromLegacy(user: Pick<UserDocument, 'cultivation' | 'stats'>) {
  const focusStreak = Number.isFinite(user.stats.currentStreak) ? Math.max(user.stats.currentStreak, 0) : 0;
  const starterBattleArtIds = getStarterBattleArtIds();

  return {
    schemaVersion: 1 as const,
    state: {
      realmId: getCanonicalRealmByLegacyPower(0).id as RealmId,
      realmSubStageId: 'realmSubStage.taixi.xuanjing',
      currentPower: getCanonicalPowerFromLegacy(0),
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: UNIVERSAL_DAO_TRACK,
      cultivationAttainment: 0,
      branchCultivationAttainments: {},
      foundationId: 'foundation.unshaped',
      knownBattleArtIds: starterBattleArtIds,
      equippedBattleArtIds: starterBattleArtIds,
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      equipmentLoadout: {},
      battleLoadout: createDefaultBattleLoadoutState(),
      inventoryItemIds: [],
      injuryState: normalizeInjuryState({ level: 'none', points: 0, modifiers: [] }),
      cooldowns: {},
      combatFlags: {},
      combatHistorySummary: [],
      focusStreak,
      lastCultivationAt: null,
      pendingDivinationBuff: null,
      schemaVersion: 1
    },
    breakthrough: null,
    inventory: []
  };
}

export function shouldRefreshCanonicalFromLegacy(user: Pick<UserDocument, 'cultivation' | 'stats'>) {
  const canonical = user.cultivation.canonical;

  if (!canonical?.state) {
    return true;
  }

  if (!isDefaultSeedState(canonical.state)) {
    return false;
  }

  const syncedShell = toLegacyCultivationShell(canonical.state, user.cultivation.immortalStones);
  const focusStreak = Number.isFinite(user.stats.currentStreak) ? Math.max(user.stats.currentStreak, 0) : 0;
  const legacyShellLooksUnsynced =
    syncedShell.spiritualPower !== user.cultivation.spiritualPower
    || syncedShell.realm !== user.cultivation.realm
    || syncedShell.realmId !== user.cultivation.realmId
    || syncedShell.realmStage !== user.cultivation.realmStage;

  return legacyShellLooksUnsynced || canonical.state.focusStreak !== focusStreak;
}
