import { getDurationBaseValue } from '../config/xuanjianCanonical.js';
import type { PlayerCultivationState } from '../types/cultivationCanonical.js';

type InjuryLevel = PlayerCultivationState['injuryState']['level'];

const NEXT_INJURY_LEVEL: Record<InjuryLevel, InjuryLevel> = {
  none: 'none',
  light: 'none',
  medium: 'light',
  heavy: 'medium'
};

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
  nextInjuryLevel: InjuryLevel;
  powerCost: number;
  finalPowerGain: number;
  summary: string | null;
}

export function resolveInjuryRecovery(input: {
  duration: number;
  rawPowerGain: number;
  injuryLevel: InjuryLevel;
}): InjuryRecoveryResult {
  const previousInjuryLevel = input.injuryLevel;
  const isEffectiveFocus = getDurationBaseValue(input.duration) > 0;

  if (!isEffectiveFocus || previousInjuryLevel === 'none') {
    return {
      applied: false,
      previousInjuryLevel,
      nextInjuryLevel: previousInjuryLevel,
      powerCost: 0,
      finalPowerGain: input.rawPowerGain,
      summary: null
    };
  }

  const nextInjuryLevel = NEXT_INJURY_LEVEL[previousInjuryLevel];
  const powerCost = Math.min(input.rawPowerGain, Math.floor(input.rawPowerGain * 0.5));
  const finalPowerGain = Math.max(0, input.rawPowerGain - powerCost);

  return {
    applied: true,
    previousInjuryLevel,
    nextInjuryLevel,
    powerCost,
    finalPowerGain,
    summary: formatInjuryTransition(previousInjuryLevel, nextInjuryLevel)
  };
}
