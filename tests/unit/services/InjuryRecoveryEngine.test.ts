import { describe, expect, test } from 'vitest';
import {
  resolveCombatInjury,
  resolveInjuryRecovery
} from '../../../src/services/InjuryRecoveryEngine.js';

describe('InjuryRecoveryEngine', () => {
  test('returns unchanged power when current state has no injury', () => {
    const result = resolveInjuryRecovery({
      duration: 90,
      rawPowerGain: 2,
      injuryLevel: 'none',
      injuryPoints: 0
    });

    expect(result).toEqual({
      applied: false,
      previousInjuryLevel: 'none',
      previousInjuryPoints: 0,
      nextInjuryLevel: 'none',
      nextInjuryPoints: 0,
      powerCost: 0,
      finalPowerGain: 2,
      summary: null
    });
  });

  test('does not recover injury below effective focus threshold', () => {
    const result = resolveInjuryRecovery({
      duration: 30,
      rawPowerGain: 2,
      injuryLevel: 'light',
      injuryPoints: 1
    });

    expect(result.applied).toBe(false);
    expect(result.nextInjuryLevel).toBe('light');
    expect(result.nextInjuryPoints).toBe(1);
    expect(result.finalPowerGain).toBe(2);
    expect(result.summary).toBeNull();
  });

  test('90 分钟专注可将中伤两点直接恢复到无伤，并吞掉一半原始修为', () => {
    const result = resolveInjuryRecovery({
      duration: 90,
      rawPowerGain: 2,
      injuryLevel: 'medium',
      injuryPoints: 2
    });

    expect(result).toEqual({
      applied: true,
      previousInjuryLevel: 'medium',
      previousInjuryPoints: 2,
      nextInjuryLevel: 'none',
      nextInjuryPoints: 0,
      powerCost: 1,
      finalPowerGain: 1,
      summary: '🩹 伤势恢复：中伤 -> 无伤'
    });
  });

  test('120 分钟以上专注可一次清空三点重伤值', () => {
    const result = resolveInjuryRecovery({
      duration: 180,
      rawPowerGain: 5,
      injuryLevel: 'heavy',
      injuryPoints: 3
    });

    expect(result.applied).toBe(true);
    expect(result.previousInjuryLevel).toBe('heavy');
    expect(result.previousInjuryPoints).toBe(3);
    expect(result.nextInjuryLevel).toBe('none');
    expect(result.nextInjuryPoints).toBe(0);
    expect(result.powerCost).toBe(2);
    expect(result.finalPowerGain).toBe(3);
  });

  test('never produces a negative final power gain', () => {
    const result = resolveInjuryRecovery({
      duration: 60,
      rawPowerGain: 1,
      injuryLevel: 'light',
      injuryPoints: 1
    });

    expect(result.powerCost).toBe(0);
    expect(result.finalPowerGain).toBe(1);
    expect(result.nextInjuryLevel).toBe('none');
    expect(result.nextInjuryPoints).toBe(0);
  });

  test('combat injury stacks on top of post-recovery points and overflows into currentPower loss', () => {
    const result = resolveCombatInjury({
      currentInjuryLevel: 'light',
      currentInjuryPoints: 1,
      incomingInjuryLevel: 'heavy',
      currentPower: 100,
      realmMinPower: 0
    });

    expect(result).toEqual({
      nextInjuryLevel: 'heavy',
      nextInjuryPoints: 3,
      incomingInjuryPoints: 3,
      overflowPoints: 1,
      powerLoss: 5,
      nextCurrentPower: 95
    });
  });

  test('overflow loss never reduces currentPower below current realm floor', () => {
    const result = resolveCombatInjury({
      currentInjuryLevel: 'heavy',
      currentInjuryPoints: 3,
      incomingInjuryLevel: 'heavy',
      currentPower: 122,
      realmMinPower: 120
    });

    expect(result.nextInjuryLevel).toBe('heavy');
    expect(result.nextInjuryPoints).toBe(3);
    expect(result.overflowPoints).toBe(3);
    expect(result.powerLoss).toBe(2);
    expect(result.nextCurrentPower).toBe(120);
  });
});
