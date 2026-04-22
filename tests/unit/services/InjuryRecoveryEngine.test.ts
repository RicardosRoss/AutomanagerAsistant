import { describe, expect, test } from 'vitest';
import { resolveInjuryRecovery } from '../../../src/services/InjuryRecoveryEngine.js';

describe('InjuryRecoveryEngine', () => {
  test('returns unchanged power when current state has no injury', () => {
    const result = resolveInjuryRecovery({
      duration: 90,
      rawPowerGain: 2,
      injuryLevel: 'none'
    });

    expect(result).toEqual({
      applied: false,
      previousInjuryLevel: 'none',
      nextInjuryLevel: 'none',
      powerCost: 0,
      finalPowerGain: 2,
      summary: null
    });
  });

  test('does not recover injury below effective focus threshold', () => {
    const result = resolveInjuryRecovery({
      duration: 30,
      rawPowerGain: 2,
      injuryLevel: 'light'
    });

    expect(result.applied).toBe(false);
    expect(result.nextInjuryLevel).toBe('light');
    expect(result.finalPowerGain).toBe(2);
    expect(result.summary).toBeNull();
  });

  test('downgrades medium injury by one tier and consumes half of raw power gain', () => {
    const result = resolveInjuryRecovery({
      duration: 90,
      rawPowerGain: 2,
      injuryLevel: 'medium'
    });

    expect(result).toEqual({
      applied: true,
      previousInjuryLevel: 'medium',
      nextInjuryLevel: 'light',
      powerCost: 1,
      finalPowerGain: 1,
      summary: '🩹 伤势恢复：中伤 -> 轻伤'
    });
  });

  test('only recovers one tier from heavy injury', () => {
    const result = resolveInjuryRecovery({
      duration: 180,
      rawPowerGain: 5,
      injuryLevel: 'heavy'
    });

    expect(result.applied).toBe(true);
    expect(result.previousInjuryLevel).toBe('heavy');
    expect(result.nextInjuryLevel).toBe('medium');
    expect(result.powerCost).toBe(2);
    expect(result.finalPowerGain).toBe(3);
  });

  test('never produces a negative final power gain', () => {
    const result = resolveInjuryRecovery({
      duration: 60,
      rawPowerGain: 1,
      injuryLevel: 'light'
    });

    expect(result.powerCost).toBe(0);
    expect(result.finalPowerGain).toBe(1);
    expect(result.nextInjuryLevel).toBe('none');
  });
});
