import { describe, expect, test } from 'vitest';
import {
  REALM_STAGES,
  calculateCultivationBonus,
  canAttemptBreakthrough,
  CULTIVATION_REALMS,
  getCurrentRealm,
  getNextRealm,
  getRealmStage
} from '../../../src/config/cultivation.js';

describe('Cultivation Config', () => {
  test('应该根据灵力返回正确境界', () => {
    expect(getCurrentRealm(0).name).toBe('炼气期');
    expect(getCurrentRealm(1000).name).toBe('筑基期');
    expect(getCurrentRealm(33000).name).toBe('大乘期');
  });

  test('应该返回下一个境界或 null', () => {
    expect(getNextRealm(1)?.name).toBe('筑基期');
    expect(getNextRealm(9)).toBeNull();
  });

  test('应该按进度返回正确阶段', () => {
    const qiRefiningRealm = CULTIVATION_REALMS[0]!;

    expect(getRealmStage(0, qiRefiningRealm).name).toBe(REALM_STAGES.early.name);
    expect(getRealmStage(340, qiRefiningRealm).name).toBe(REALM_STAGES.middle.name);
    expect(getRealmStage(670, qiRefiningRealm).name).toBe(REALM_STAGES.late.name);
  });

  test('应该正确判断突破条件和修炼加成', () => {
    const qiRefiningRealm = CULTIVATION_REALMS[0]!;

    expect(canAttemptBreakthrough(998, qiRefiningRealm)).toBe(false);
    expect(canAttemptBreakthrough(999, qiRefiningRealm)).toBe(true);
    expect(calculateCultivationBonus(qiRefiningRealm, REALM_STAGES.middle)).toBe(1.1);
  });
});
