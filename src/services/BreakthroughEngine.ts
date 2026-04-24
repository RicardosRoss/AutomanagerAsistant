import {
  getBreakthroughMethodById,
  getBreakthroughRequirement,
  getBreakthroughTransitionByRealm,
  getDefaultBreakthroughMethodId,
  getDivinePowerBreakthroughRequirement,
  getDivinePowerRegistryEntry,
  getMainMethodById,
  isUniversalDaoTrack,
  normalizeMainDaoTrack,
  resolveFirstDivinePowerFromFoundation,
  resolveZhujiOutcomeFromMainMethod
} from '../config/xuanjianCanonical.js';
import type {
  BreakthroughAttemptKind,
  BreakthroughGateResolution,
  InventoryInstance,
  RealmId,
  SpecializedLineageId
} from '../types/cultivationCanonical.js';

export interface BreakthroughReadinessResult {
  ready: boolean;
  missing: string[];
  targetRealmId: RealmId;
  reason: 'ready' | 'not_ready' | 'max_realm' | 'missing_requirement';
}

export interface EvaluateBreakthroughReadinessInput {
  currentRealmId: RealmId;
  realmSubStageId?: string | null;
  currentPower: number;
  cultivationAttainment: number;
  mainMethodId: string;
  mainDaoTrack?: string | null;
  foundationId?: string | null;
  selectedBreakthroughMethodId?: string | null;
  inventory: InventoryInstance[];
  knownDivinePowerIds?: string[];
  hardConditionFlags?: Record<string, boolean>;
  attemptKind?: BreakthroughAttemptKind;
  branchChoice?: string | null;
  branchProofs?: Record<string, boolean>;
}

export interface ResolveBreakthroughAttemptInput {
  currentRealmId: RealmId;
  realmSubStageId?: string | null;
  currentPower: number;
  cultivationAttainment: number;
  mainMethodId: string;
  mainDaoTrack?: string | null;
  foundationId?: string | null;
  selectedBreakthroughMethodId?: string | null;
  inventory: InventoryInstance[];
  knownDivinePowerIds: string[];
  hardConditionFlags?: Record<string, boolean>;
  attemptKind?: BreakthroughAttemptKind;
  branchChoice?: string | null;
  branchProofs?: Record<string, boolean>;
}

export interface BreakthroughResolutionSummary {
  attemptKind: BreakthroughAttemptKind;
  methodId: string | null;
  targetDivinePowerId: string | null;
  gates: BreakthroughGateResolution[];
  failedGateId: BreakthroughGateResolution['id'] | null;
  powerLossApplied: number;
  attainmentLossApplied: number;
  successRateApplied: number;
  consumedDefinitionIds: string[];
  sideEffectsApplied: string[];
  bonusOutcomeIds: string[];
}

export interface BreakthroughAttemptSuccessResult {
  success: true;
  targetRealmId: RealmId;
  nextRealmId: RealmId;
  missing: [];
  reason: 'ready';
  consumedDefinitionIds: string[];
  updatedInventory: InventoryInstance[];
  updatedKnownDivinePowerIds: string[];
  resetBreakthroughState: true;
  nextBreakthroughState: null;
  nextMainDaoTrack: string | null;
  nextFoundationId: string | null;
  nextMainMethodId: string | null;
  powerLossApplied: 0;
  attainmentLossApplied: 0;
  failedGateId: null;
  breakthroughResolution: BreakthroughResolutionSummary;
}

export interface BreakthroughAttemptFailureResult {
  success: false;
  targetRealmId: RealmId;
  nextRealmId: RealmId;
  missing: string[];
  reason: 'not_ready' | 'max_realm' | 'missing_requirement' | 'attempt_failed';
  consumedDefinitionIds: string[];
  updatedInventory: InventoryInstance[];
  updatedKnownDivinePowerIds: string[];
  resetBreakthroughState: false;
  powerLossApplied: number;
  attainmentLossApplied: number;
  failedGateId: BreakthroughGateResolution['id'] | null;
  breakthroughResolution?: BreakthroughResolutionSummary;
  nextMainMethodId?: null;
}

export type BreakthroughAttemptResult = BreakthroughAttemptSuccessResult | BreakthroughAttemptFailureResult;

function resolveBreakthroughMethodId(currentRealmId: RealmId, selectedBreakthroughMethodId?: string | null) {
  return selectedBreakthroughMethodId ?? getDefaultBreakthroughMethodId(currentRealmId);
}

function resolveAttemptKind(input: ResolveBreakthroughAttemptInput | EvaluateBreakthroughReadinessInput): BreakthroughAttemptKind {
  if (input.attemptKind) {
    return input.attemptKind;
  }
  return input.currentRealmId === 'realm.zifu' ? 'zifu_divine_power' : 'realm_zhuji_to_zifu';
}

function resolveZhujiLockIn(mainMethodId: string, targetRealmId: RealmId) {
  if (targetRealmId !== 'realm.zhuji') {
    return {
      nextMainDaoTrack: null,
      nextFoundationId: null,
      nextMainMethodId: null
    };
  }

  const outcome = resolveZhujiOutcomeFromMainMethod(mainMethodId);
  const nextMainDaoTrack = outcome?.mainDaoTrack ?? null;
  const nextFoundationId = outcome?.foundationId ?? null;
  const nextMainMethodId = outcome?.continuationMethodId ?? null;

  return {
    nextMainDaoTrack,
    nextFoundationId,
    nextMainMethodId
  };
}

function buildSuccessfulGates(ids: BreakthroughGateResolution['id'][]): BreakthroughGateResolution[] {
  return ids.map((id) => ({ id, passed: true }));
}

function buildFailedGateSequence(
  ids: BreakthroughGateResolution['id'][],
  failedGateId: BreakthroughGateResolution['id']
): BreakthroughGateResolution[] {
  const failedIndex = ids.indexOf(failedGateId);
  return ids.map((id, index) => ({ id, passed: index >= 0 && index < failedIndex }));
}

function countAvailableItems(
  inventory: InventoryInstance[],
  definitionId: string
) {
  return inventory
    .filter((item) => item.definitionId === definitionId && !item.used)
    .reduce((sum, item) => sum + item.stackCount, 0);
}

function resolveTargetPowerOrdinal(knownDivinePowerIds: string[]) {
  const ordinal = knownDivinePowerIds.length + 1;
  return ordinal >= 2 && ordinal <= 5 ? ordinal as 2 | 3 | 4 | 5 : null;
}

function evaluateZifuDivinePowerReadiness(input: EvaluateBreakthroughReadinessInput): BreakthroughReadinessResult {
  const missing: string[] = [];
  const knownDivinePowerIds = input.knownDivinePowerIds ?? [];
  const targetPowerOrdinal = resolveTargetPowerOrdinal(knownDivinePowerIds);
  const divinePowerRequirement = targetPowerOrdinal
    ? getDivinePowerBreakthroughRequirement(targetPowerOrdinal)
    : null;
  const targetPowerId = input.branchChoice ?? null;
  const targetPowerEntry = targetPowerId ? getDivinePowerRegistryEntry(targetPowerId) : null;
  const mainMethod = getMainMethodById(input.mainMethodId);
  const breakthroughMethodId = resolveBreakthroughMethodId(input.currentRealmId, input.selectedBreakthroughMethodId);
  const breakthroughMethod = breakthroughMethodId ? getBreakthroughMethodById(breakthroughMethodId) : null;

  if (input.currentRealmId !== 'realm.zifu') missing.push('realm.zifu');
  if (!input.mainMethodId) missing.push('mainMethodId');
  if (!targetPowerOrdinal) missing.push('targetPowerOrdinal');
  if (!divinePowerRequirement) missing.push('divinePowerBreakthroughRequirement');
  if (!targetPowerId) missing.push('branchChoice');
  if (!targetPowerEntry) missing.push('branchChoice');
  if (
    targetPowerId
    && !mainMethod.zifuPowerCoverage?.candidatePowerIds.includes(targetPowerId)
  ) {
    missing.push('branchChoice');
  }
  if (
    targetPowerEntry?.zifuAcquisition
    && knownDivinePowerIds.length < targetPowerEntry.zifuAcquisition.minExistingPowerCount
  ) {
    missing.push('minExistingPowerCount');
  }

  if (divinePowerRequirement) {
    if (input.currentPower < divinePowerRequirement.requiredPower) missing.push('requiredPower');
    if (input.cultivationAttainment < divinePowerRequirement.requiredAttainment) {
      missing.push('cultivationAttainment');
    }
    for (const requiredItem of divinePowerRequirement.requiredItems) {
      if (countAvailableItems(input.inventory, requiredItem.definitionId) < requiredItem.count) {
        missing.push(requiredItem.definitionId);
      }
    }
  }

  if (!breakthroughMethod || breakthroughMethod.applicableTransition !== 'zifu_divine_power') {
    missing.push('selectedBreakthroughMethodId');
  } else {
    for (const requiredItem of breakthroughMethod.requiredItems) {
      if (countAvailableItems(input.inventory, requiredItem.definitionId) < requiredItem.count) {
        missing.push(requiredItem.definitionId);
      }
    }
    for (const requiredEnvironment of breakthroughMethod.requiredEnvironment ?? []) {
      if (input.hardConditionFlags?.[requiredEnvironment] !== true) {
        missing.push(requiredEnvironment);
      }
    }
  }

  for (const proofId of targetPowerEntry?.zifuAcquisition?.proofRequirementIds ?? []) {
    if (input.branchProofs?.[proofId] !== true) {
      missing.push(proofId);
    }
  }

  return {
    ready: missing.length === 0,
    missing: [...new Set(missing)],
    targetRealmId: 'realm.zifu',
    reason: missing.length === 0 ? 'ready' : 'not_ready'
  };
}

export function evaluateBreakthroughReadiness(input: EvaluateBreakthroughReadinessInput): BreakthroughReadinessResult {
  const attemptKind = resolveAttemptKind(input);
  if (attemptKind === 'zifu_divine_power') {
    return evaluateZifuDivinePowerReadiness(input);
  }

  const requirement = getBreakthroughRequirement(input.currentRealmId);
  if (!requirement) {
    const reason = input.currentRealmId === 'realm.yuanying' ? 'max_realm' : 'missing_requirement';
    return {
      ready: false,
      missing: ['breakthroughRequirement'],
      targetRealmId: input.currentRealmId,
      reason
    };
  }

  const missing: string[] = [];
  if (input.currentPower < requirement.requiredPower) missing.push('requiredPower');
  if (!input.mainMethodId) missing.push('mainMethodId');
  if (input.cultivationAttainment < requirement.requiredAttainment) missing.push('cultivationAttainment');

  if (requirement.targetRealmId === 'realm.zhuji' && !resolveZhujiOutcomeFromMainMethod(input.mainMethodId)) {
    missing.push('mainMethodBreakthroughOutcome');
  }

  if (requirement.targetRealmId === 'realm.zifu') {
    if (!input.foundationId || input.foundationId === 'foundation.unshaped') {
      missing.push('foundationId');
    }
    if (isUniversalDaoTrack(input.mainDaoTrack)) {
      missing.push('mainDaoTrack');
    }
  }

  if (attemptKind === 'realm_zifu_to_jindan') {
    if (input.currentRealmId !== 'realm.zifu') {
      missing.push('realm.zifu');
    }
    if (input.realmSubStageId !== 'realmSubStage.zifu.perfect') {
      missing.push('realmSubStage.zifu.perfect');
    }
    if ((input.knownDivinePowerIds ?? []).length < 5) {
      missing.push('knownDivinePowerIds.5');
    }
  }

  for (const requiredItem of requirement.requiredItems) {
    if (countAvailableItems(input.inventory, requiredItem.definitionId) < requiredItem.count) {
      missing.push(requiredItem.definitionId);
    }
  }

  const expectedTransition = getBreakthroughTransitionByRealm(input.currentRealmId);
  const breakthroughMethodId = resolveBreakthroughMethodId(input.currentRealmId, input.selectedBreakthroughMethodId);
  const breakthroughMethod = breakthroughMethodId ? getBreakthroughMethodById(breakthroughMethodId) : null;
  const incompatibleMethod =
    !breakthroughMethod
    || !expectedTransition
    || breakthroughMethod.applicableTransition !== expectedTransition;
  if (incompatibleMethod) {
    missing.push('selectedBreakthroughMethodId');
  } else {
    const compatibility = breakthroughMethod.compatibility;
    const normalizedMainDaoTrack = normalizeMainDaoTrack(input.mainDaoTrack);
    const specializedMainDaoTrack: SpecializedLineageId | null = isUniversalDaoTrack(normalizedMainDaoTrack)
      ? null
      : normalizedMainDaoTrack as SpecializedLineageId;
    const mainMethod = getMainMethodById(input.mainMethodId);

    if (compatibility?.requiresFoundation && (!input.foundationId || input.foundationId === 'foundation.unshaped')) {
      missing.push('foundationId');
    }
    if (
      compatibility?.allowedLineages
      && (!specializedMainDaoTrack || !compatibility.allowedLineages.includes(specializedMainDaoTrack))
    ) {
      missing.push('mainDaoTrack');
    }
    if (
      compatibility?.excludedLineages
      && specializedMainDaoTrack
      && compatibility.excludedLineages.includes(specializedMainDaoTrack)
    ) {
      missing.push('mainDaoTrack');
    }
    if (
      compatibility?.minMethodGrade
      && mainMethod.grade < compatibility.minMethodGrade
    ) {
      missing.push('mainMethodGrade');
    }
    for (const requiredPowerId of compatibility?.requiredKnownPowerIds ?? []) {
      if (!(input.knownDivinePowerIds ?? []).includes(requiredPowerId)) {
        missing.push(requiredPowerId);
      }
    }
    for (const requiredPowerId of breakthroughMethod.jindanRoute?.requiredPowerPattern?.requiredPowerIds ?? []) {
      if (!(input.knownDivinePowerIds ?? []).includes(requiredPowerId)) {
        missing.push(requiredPowerId);
      }
    }
    for (const requiredItem of breakthroughMethod.requiredItems) {
      if (countAvailableItems(input.inventory, requiredItem.definitionId) < requiredItem.count) {
        missing.push(requiredItem.definitionId);
      }
    }
    for (const requiredEnvironment of breakthroughMethod.requiredEnvironment ?? []) {
      if (input.hardConditionFlags?.[requiredEnvironment] !== true) {
        missing.push(requiredEnvironment);
      }
    }
  }

  return {
    ready: missing.length === 0,
    missing: [...new Set(missing)],
    targetRealmId: requirement.targetRealmId,
    reason: missing.length === 0 ? 'ready' : 'not_ready'
  };
}

function consumeRequiredItems(
  inventory: InventoryInstance[],
  requiredItems: ReadonlyArray<{ definitionId: string; count: number }>
) {
  const updatedInventory = inventory.map((item) => ({ ...item }));
  const consumedDefinitionIds: string[] = [];

  for (const requiredItem of requiredItems) {
    let remaining = requiredItem.count;
    if (remaining <= 0) continue;

    for (let index = 0; index < updatedInventory.length && remaining > 0; index += 1) {
      const item = updatedInventory[index];
      if (!item || item.definitionId !== requiredItem.definitionId || item.used || item.stackCount <= 0) {
        continue;
      }

      const consumed = Math.min(item.stackCount, remaining);
      item.stackCount -= consumed;
      if (item.stackCount === 0) {
        item.used = true;
      }
      remaining -= consumed;
    }

    const consumedCount = requiredItem.count - remaining;
    for (let i = 0; i < consumedCount; i += 1) {
      consumedDefinitionIds.push(requiredItem.definitionId);
    }
  }

  return {
    updatedInventory,
    consumedDefinitionIds
  };
}

export function resolveBreakthroughAttempt(input: ResolveBreakthroughAttemptInput): BreakthroughAttemptResult {
  const attemptKind = resolveAttemptKind(input);
  const readiness = evaluateBreakthroughReadiness({
    currentRealmId: input.currentRealmId,
    currentPower: input.currentPower,
    cultivationAttainment: input.cultivationAttainment,
    mainMethodId: input.mainMethodId,
    mainDaoTrack: input.mainDaoTrack,
    foundationId: input.foundationId,
    selectedBreakthroughMethodId: input.selectedBreakthroughMethodId,
    inventory: input.inventory,
    knownDivinePowerIds: input.knownDivinePowerIds,
    realmSubStageId: input.realmSubStageId,
    hardConditionFlags: input.hardConditionFlags,
    attemptKind,
    branchChoice: input.branchChoice,
    branchProofs: input.branchProofs
  });

  if (!readiness.ready) {
    const reason = readiness.reason === 'ready' ? 'not_ready' : readiness.reason;
    return {
      success: false,
      targetRealmId: readiness.targetRealmId,
      nextRealmId: input.currentRealmId,
      missing: readiness.missing,
      reason,
      consumedDefinitionIds: [],
      updatedInventory: input.inventory.map((item) => ({ ...item })),
      updatedKnownDivinePowerIds: [...input.knownDivinePowerIds],
      resetBreakthroughState: false,
      powerLossApplied: 0,
      attainmentLossApplied: 0,
      failedGateId: null,
      nextMainMethodId: null
    };
  }

  if (attemptKind === 'zifu_divine_power') {
    const targetPowerOrdinal = resolveTargetPowerOrdinal(input.knownDivinePowerIds);
    const divinePowerRequirement = targetPowerOrdinal
      ? getDivinePowerBreakthroughRequirement(targetPowerOrdinal)
      : null;
    const targetDivinePowerId = input.branchChoice ?? null;
    const breakthroughMethodId = resolveBreakthroughMethodId(input.currentRealmId, input.selectedBreakthroughMethodId);
    const breakthroughMethod = breakthroughMethodId ? getBreakthroughMethodById(breakthroughMethodId) : null;

    if (!divinePowerRequirement || !targetDivinePowerId || !breakthroughMethod) {
      return {
        success: false,
        targetRealmId: 'realm.zifu',
        nextRealmId: input.currentRealmId,
        missing: ['divinePowerBreakthroughRequirement'],
        reason: 'missing_requirement',
        consumedDefinitionIds: [],
        updatedInventory: input.inventory.map((item) => ({ ...item })),
        updatedKnownDivinePowerIds: [...input.knownDivinePowerIds],
        resetBreakthroughState: false,
        powerLossApplied: 0,
        attainmentLossApplied: 0,
        failedGateId: null,
        nextMainMethodId: null
      };
    }

    const { updatedInventory, consumedDefinitionIds } = consumeRequiredItems(
      input.inventory,
      [...divinePowerRequirement.requiredItems, ...breakthroughMethod.requiredItems]
    );
    const updatedKnownDivinePowerIds = [...input.knownDivinePowerIds];
    if (!updatedKnownDivinePowerIds.includes(targetDivinePowerId)) {
      updatedKnownDivinePowerIds.push(targetDivinePowerId);
    }
    const zifuDivinePowerGateIds: BreakthroughGateResolution['id'][] = [
      'shape_aux_foundation',
      'cross_illusion',
      'gestate_target_power',
      'enter_taixu'
    ];

    return {
      success: true,
      targetRealmId: 'realm.zifu',
      nextRealmId: 'realm.zifu',
      missing: [],
      reason: 'ready',
      consumedDefinitionIds,
      updatedInventory,
      updatedKnownDivinePowerIds,
      resetBreakthroughState: true,
      nextBreakthroughState: null,
      nextMainDaoTrack: null,
      nextFoundationId: null,
      nextMainMethodId: null,
      powerLossApplied: 0,
      attainmentLossApplied: 0,
      failedGateId: null,
      breakthroughResolution: {
        attemptKind,
        methodId: breakthroughMethodId ?? null,
        targetDivinePowerId,
        gates: buildSuccessfulGates(zifuDivinePowerGateIds),
        failedGateId: null,
        powerLossApplied: 0,
        attainmentLossApplied: 0,
        successRateApplied: 1 + (breakthroughMethod.successRateBonus ?? 0),
        consumedDefinitionIds,
        sideEffectsApplied: [...(breakthroughMethod.sideEffects ?? [])],
        bonusOutcomeIds: [...(breakthroughMethod.bonusOutcomeIds ?? [])]
      }
    };
  }

  const requirement = getBreakthroughRequirement(input.currentRealmId);
  if (!requirement) {
    return {
      success: false,
      targetRealmId: readiness.targetRealmId,
      nextRealmId: input.currentRealmId,
      missing: ['breakthroughRequirement'],
      reason: input.currentRealmId === 'realm.yuanying' ? 'max_realm' : 'missing_requirement',
      consumedDefinitionIds: [],
      updatedInventory: input.inventory.map((item) => ({ ...item })),
      updatedKnownDivinePowerIds: [...input.knownDivinePowerIds],
      resetBreakthroughState: false,
      powerLossApplied: 0,
      attainmentLossApplied: 0,
      failedGateId: null,
      nextMainMethodId: null
    };
  }

  const breakthroughMethodId = resolveBreakthroughMethodId(input.currentRealmId, input.selectedBreakthroughMethodId);
  const breakthroughMethod = breakthroughMethodId ? getBreakthroughMethodById(breakthroughMethodId) : null;
  const targetDivinePowerId = attemptKind === 'realm_zhuji_to_zifu' && input.currentRealmId === 'realm.zhuji'
    ? resolveFirstDivinePowerFromFoundation(input.foundationId ?? '')
    : null;
  if (attemptKind === 'realm_zhuji_to_zifu' && input.currentRealmId === 'realm.zhuji' && !targetDivinePowerId) {
    return {
      success: false,
      targetRealmId: input.currentRealmId,
      nextRealmId: input.currentRealmId,
      missing: ['firstDivinePowerId'],
      reason: 'missing_requirement',
      consumedDefinitionIds: [],
      updatedInventory: input.inventory.map((item) => ({ ...item })),
      updatedKnownDivinePowerIds: [...input.knownDivinePowerIds],
      resetBreakthroughState: false,
      powerLossApplied: 0,
      attainmentLossApplied: 0,
      failedGateId: null,
      nextMainMethodId: null
    };
  }
  const methodRequiredItems = breakthroughMethod?.requiredItems ?? [];
  const { updatedInventory, consumedDefinitionIds } = consumeRequiredItems(
    input.inventory,
    [...requirement.requiredItems, ...methodRequiredItems]
  );
  const updatedKnownDivinePowerIds = [...input.knownDivinePowerIds];
  const sideEffectsApplied = [...(breakthroughMethod?.sideEffects ?? [])];
  const bonusOutcomeIds = [...(breakthroughMethod?.bonusOutcomeIds ?? [])];

  const zhujiToZifuGateIds: BreakthroughGateResolution['id'][] = [
    'lift_foundation',
    'cross_illusion',
    'gestate_power',
    'enter_taixu'
  ];
  const forcedCrossIllusionFailure =
    attemptKind === 'realm_zhuji_to_zifu'
    && input.currentRealmId === 'realm.zhuji'
    && input.hardConditionFlags?.['gate.cross_illusion.force_fail'] === true;

  if (forcedCrossIllusionFailure) {
    const failedGateId: BreakthroughGateResolution['id'] = 'cross_illusion';
    const powerLossApplied = 80;
    const attainmentLossApplied = 3;
    return {
      success: false,
      targetRealmId: 'realm.zhuji',
      nextRealmId: 'realm.zhuji',
      missing: [],
      reason: 'attempt_failed',
      consumedDefinitionIds,
      updatedInventory,
      updatedKnownDivinePowerIds,
      resetBreakthroughState: false,
      powerLossApplied,
      attainmentLossApplied,
      failedGateId,
      breakthroughResolution: {
        attemptKind,
        methodId: breakthroughMethodId ?? null,
        targetDivinePowerId,
        gates: buildFailedGateSequence(zhujiToZifuGateIds, failedGateId),
        failedGateId,
        powerLossApplied,
        attainmentLossApplied,
        successRateApplied: 1 + (breakthroughMethod?.successRateBonus ?? 0),
        consumedDefinitionIds,
        sideEffectsApplied,
        bonusOutcomeIds
      },
      nextMainMethodId: null
    };
  }

  if (attemptKind === 'realm_zhuji_to_zifu' && input.currentRealmId === 'realm.zhuji') {
    if (targetDivinePowerId && !updatedKnownDivinePowerIds.includes(targetDivinePowerId)) {
      updatedKnownDivinePowerIds.push(targetDivinePowerId);
    }
  } else {
    for (const outcomeId of bonusOutcomeIds) {
      if (outcomeId.startsWith('power.') && !updatedKnownDivinePowerIds.includes(outcomeId)) {
        updatedKnownDivinePowerIds.push(outcomeId);
      }
    }
  }

  const { nextMainDaoTrack, nextFoundationId, nextMainMethodId } = resolveZhujiLockIn(
    input.mainMethodId,
    requirement.targetRealmId
  );

  return {
    success: true,
    targetRealmId: requirement.targetRealmId,
    nextRealmId: requirement.targetRealmId,
    missing: [],
    reason: 'ready',
    consumedDefinitionIds,
    updatedInventory,
    updatedKnownDivinePowerIds,
    resetBreakthroughState: true,
    nextBreakthroughState: null,
    nextMainDaoTrack,
    nextFoundationId,
    nextMainMethodId,
    powerLossApplied: 0,
    attainmentLossApplied: 0,
    failedGateId: null,
    breakthroughResolution: {
      attemptKind,
      methodId: breakthroughMethodId ?? null,
      targetDivinePowerId,
      gates: attemptKind === 'realm_zhuji_to_zifu' && input.currentRealmId === 'realm.zhuji'
        ? buildSuccessfulGates(zhujiToZifuGateIds)
        : [],
      failedGateId: null,
      powerLossApplied: 0,
      attainmentLossApplied: 0,
      successRateApplied: 1 + (breakthroughMethod?.successRateBonus ?? 0),
      consumedDefinitionIds,
      sideEffectsApplied,
      bonusOutcomeIds
    }
  };
}
