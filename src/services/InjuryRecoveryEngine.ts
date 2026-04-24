import { getDurationBaseValue } from '../config/xuanjianCanonical.js';
import type { PlayerCultivationState } from '../types/cultivationCanonical.js';
import {
  getInjuryLevelByPoints,
  getInjuryOverflowPowerLoss,
  getInjuryPointsForLevel,
  getInjuryRecoveryPoints,
  normalizeInjuryPoints
} from '../types/cultivationCombat.js';

type InjuryLevel = PlayerCultivationState['injuryState']['level'];

function formatInjuryTransition(previous: InjuryLevel, next: InjuryLevel) {
  const labelMap: Record<InjuryLevel, string> = {
    none: '无伤',
    light: '轻伤',
    medium: '中伤',
    heavy: '重伤'
  };

  return `🩹 伤势恢复：${labelMap[previous]} -> ${labelMap[next]}`;
}

export interface InjuryRecoveryResult {
  applied: boolean;
  previousInjuryLevel: InjuryLevel;
  previousInjuryPoints: number;
  nextInjuryLevel: InjuryLevel;
  nextInjuryPoints: number;
  powerCost: number;
  finalPowerGain: number;
  summary: string | null;
}

export function resolveInjuryRecovery(input: {
  duration: number;
  rawPowerGain: number;
  injuryLevel: InjuryLevel;
  injuryPoints?: number;
}): InjuryRecoveryResult {
  const previousInjuryLevel = input.injuryLevel;
  const previousInjuryPoints = normalizeInjuryPoints(input.injuryPoints, input.injuryLevel);
  const isEffectiveFocus = getDurationBaseValue(input.duration) > 0;

  if (!isEffectiveFocus || previousInjuryPoints === 0) {
    return {
      applied: false,
      previousInjuryLevel,
      previousInjuryPoints,
      nextInjuryLevel: getInjuryLevelByPoints(previousInjuryPoints),
      nextInjuryPoints: previousInjuryPoints,
      powerCost: 0,
      finalPowerGain: input.rawPowerGain,
      summary: null
    };
  }

  const nextInjuryPoints = Math.max(0, previousInjuryPoints - getInjuryRecoveryPoints(input.duration));
  const nextInjuryLevel = getInjuryLevelByPoints(nextInjuryPoints);
  const powerCost = Math.min(input.rawPowerGain, Math.floor(input.rawPowerGain * 0.5));
  const finalPowerGain = Math.max(0, input.rawPowerGain - powerCost);

  return {
    applied: true,
    previousInjuryLevel,
    previousInjuryPoints,
    nextInjuryLevel,
    nextInjuryPoints,
    powerCost,
    finalPowerGain,
    summary: formatInjuryTransition(previousInjuryLevel, nextInjuryLevel)
  };
}

export interface CombatInjuryResolutionResult {
  nextInjuryLevel: InjuryLevel;
  nextInjuryPoints: number;
  incomingInjuryPoints: number;
  overflowPoints: number;
  powerLoss: number;
  nextCurrentPower: number;
}

export function resolveCombatInjury(input: {
  currentInjuryLevel: InjuryLevel;
  currentInjuryPoints?: number;
  incomingInjuryLevel: InjuryLevel;
  currentPower: number;
  realmMinPower: number;
}): CombatInjuryResolutionResult {
  const currentInjuryPoints = normalizeInjuryPoints(input.currentInjuryPoints, input.currentInjuryLevel);
  const incomingInjuryPoints = getInjuryPointsForLevel(input.incomingInjuryLevel);
  const mergedPoints = currentInjuryPoints + incomingInjuryPoints;
  const overflowPoints = Math.max(0, mergedPoints - 3);
  const cappedPoints = Math.min(3, mergedPoints);
  const maxAllowedLoss = Math.max(0, input.currentPower - input.realmMinPower);
  const powerLoss = Math.min(
    maxAllowedLoss,
    getInjuryOverflowPowerLoss(input.currentPower, overflowPoints)
  );

  return {
    nextInjuryLevel: getInjuryLevelByPoints(cappedPoints),
    nextInjuryPoints: cappedPoints,
    incomingInjuryPoints,
    overflowPoints,
    powerLoss,
    nextCurrentPower: input.currentPower - powerLoss
  };
}
