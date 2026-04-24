import { describe, expect, test } from 'vitest';
import {
  formatRealmSubStageDisplay,
  resolveRealmSubStageId
} from '../../../src/config/xuanjianV2Registry.js';

describe('xuanjian realm sub-stage resolver', () => {
  test('maps taixi power bands to the six named sub-stages', () => {
    expect(resolveRealmSubStageId('realm.taixi', 0)).toBe('realmSubStage.taixi.xuanjing');
    expect(resolveRealmSubStageId('realm.taixi', 20)).toBe('realmSubStage.taixi.chengming');
    expect(resolveRealmSubStageId('realm.taixi', 40)).toBe('realmSubStage.taixi.zhouxing');
    expect(resolveRealmSubStageId('realm.taixi', 60)).toBe('realmSubStage.taixi.qingyuan');
    expect(resolveRealmSubStageId('realm.taixi', 80)).toBe('realmSubStage.taixi.yujing');
    expect(resolveRealmSubStageId('realm.taixi', 119)).toBe('realmSubStage.taixi.lingchu');
  });

  test('maps lianqi and zhuji by equalized realm bands', () => {
    expect(resolveRealmSubStageId('realm.lianqi', 120)).toBe('realmSubStage.lianqi.1');
    expect(resolveRealmSubStageId('realm.lianqi', 153)).toBe('realmSubStage.lianqi.2');
    expect(resolveRealmSubStageId('realm.lianqi', 419)).toBe('realmSubStage.lianqi.9');
    expect(resolveRealmSubStageId('realm.zhuji', 420)).toBe('realmSubStage.zhuji.early');
    expect(resolveRealmSubStageId('realm.zhuji', 654)).toBe('realmSubStage.zhuji.middle');
    expect(resolveRealmSubStageId('realm.zhuji', 1119)).toBe('realmSubStage.zhuji.late');
  });

  test('maps zifu power bands to the four product sub-stages', () => {
    expect(resolveRealmSubStageId('realm.zifu', 1120)).toBe('realmSubStage.zifu.early');
    expect(resolveRealmSubStageId('realm.zifu', 1495)).toBe('realmSubStage.zifu.middle');
    expect(resolveRealmSubStageId('realm.zifu', 1870)).toBe('realmSubStage.zifu.late');
    expect(resolveRealmSubStageId('realm.zifu', 2245)).toBe('realmSubStage.zifu.perfect');
  });

  test('formats zifu with explicit four-stage display', () => {
    expect(
      formatRealmSubStageDisplay({
        realmId: 'realm.zifu',
        currentPower: 2245,
        realmSubStageId: 'realmSubStage.zifu.perfect'
      })
    ).toEqual({
      fullName: '紫府·圆满',
      realmName: '紫府',
      subStageName: '圆满'
    });
  });
});
