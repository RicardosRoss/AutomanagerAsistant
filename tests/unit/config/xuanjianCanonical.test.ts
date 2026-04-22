import { describe, expect, test } from 'vitest';
import {
  UNIVERSAL_DAO_TRACK,
  findCanonicalRealmById,
  findMainMethodById,
  formatCanonicalRealmDisplay,
  formatCanonicalStage,
  getBreakthroughRequirement,
  getCanonicalRealmByPower,
  getCanonicalRealmStage,
  getCanonicalRealmStageInRealm,
  getDurationBaseValue,
  getGeneralAttainmentMultiplier,
  getMainDaoTrackDisplayName,
  getMainLineageMultiplier,
  getMainMethodById,
  isUniversalDaoTrack,
  normalizeMainDaoTrack,
  getRealmById,
  getRealmTemplateCoefficient
} from '../../../src/config/xuanjianCanonical.js';

describe('xuanjian canonical config', () => {
  test('maps power into the six xuanjian realms', () => {
    expect(getCanonicalRealmByPower(0).id).toBe('realm.taixi');
    expect(getCanonicalRealmByPower(120).id).toBe('realm.lianqi');
    expect(getCanonicalRealmByPower(1120).id).toBe('realm.zifu');
    expect(getCanonicalRealmByPower(5620).id).toBe('realm.yuanying');
  });

  test('uses the approved focus duration template', () => {
    expect(getDurationBaseValue(59)).toBe(0);
    expect(getDurationBaseValue(60)).toBe(1);
    expect(getDurationBaseValue(90)).toBe(2);
    expect(getDurationBaseValue(150)).toBe(4);
  });

  test('uses approved realm coefficients and attainment multipliers', () => {
    expect(getRealmTemplateCoefficient('realm.taixi')).toBe(1);
    expect(getRealmTemplateCoefficient('realm.jindan')).toBe(1.15);
    expect(getGeneralAttainmentMultiplier(10)).toBeCloseTo(1.2);
    expect(getGeneralAttainmentMultiplier(30)).toBeCloseTo(1.4);
  });

  test('normalizes legacy neutral dao track into universal', () => {
    expect(normalizeMainDaoTrack('neutral')).toBe(UNIVERSAL_DAO_TRACK);
    expect(normalizeMainDaoTrack('')).toBe(UNIVERSAL_DAO_TRACK);
    expect(normalizeMainDaoTrack('mingyang')).toBe('mingyang');
  });

  test('treats universal track as non-specialized', () => {
    expect(isUniversalDaoTrack('universal')).toBe(true);
    expect(isUniversalDaoTrack('neutral')).toBe(true);
    expect(isUniversalDaoTrack('mingyang')).toBe(false);
  });

  test('returns conservative lineage multiplier bands', () => {
    expect(getMainLineageMultiplier(0)).toBe(1);
    expect(getMainLineageMultiplier(10)).toBe(1.02);
    expect(getMainLineageMultiplier(30)).toBe(1.05);
    expect(getMainLineageMultiplier(60)).toBe(1.08);
  });

  test('exposes seeded lineage methods and display names', () => {
    expect(getMainMethodById('method.zhuji_mingyang_script').lineageTag).toBe('mingyang');
    expect(getMainMethodById('method.zhuji_duijin_script').lineageTag).toBe('duijin');
    expect(getMainDaoTrackDisplayName('universal')).toBe('通用');
    expect(getMainDaoTrackDisplayName('lihuo')).toBe('离火');
  });

  test('provides canonical lookup helpers and stage formatting', () => {
    expect(getRealmById('realm.zhuji').name).toBe('筑基');
    expect(getMainMethodById('method.starter_tuna').name).toBe('玄门吐纳法');
    expect(getMainMethodById('method.missing').id).toBe('method.starter_tuna');
    expect(findCanonicalRealmById('realm.unknown')).toBeNull();
    expect(findMainMethodById('method.missing')).toBeNull();
    expect(getCanonicalRealmStage(16).name).toBe('玄景');
    expect(getCanonicalRealmStage(100).name).toBe('灵初');
    expect(formatCanonicalStage(40)).toBe('周行');
    expect(getCanonicalRealmStageInRealm(1120, 'realm.zifu').name).toBe('初期');
    expect(getCanonicalRealmStageInRealm(2619, 'realm.zifu').name).toBe('圆满');

    expect(
      formatCanonicalRealmDisplay({
        realmId: 'realm.taixi',
        currentPower: 59
      })
    ).toEqual({
      realm: {
        id: 'realm.taixi',
        name: '胎息',
        minPower: 0,
        maxPower: 119
      },
      stage: {
        name: '周行'
      },
      fullName: '胎息·周行',
      title: '胎息'
    });

    expect(
      formatCanonicalRealmDisplay({
        realmId: 'realm.zifu',
        currentPower: 1120
      }).stage.name
    ).toBe('初期');
  });

  test('contains approved breakthrough requirements', () => {
    const taixi = getBreakthroughRequirement('realm.taixi');
    const lianqi = getBreakthroughRequirement('realm.lianqi');
    const jindan = getBreakthroughRequirement('realm.jindan');

    expect(taixi).toEqual({
      targetRealmId: 'realm.lianqi',
      requiredPower: 120,
      requiredAttainment: 0,
      requiredItems: []
    });

    expect(lianqi).toEqual({
      targetRealmId: 'realm.zhuji',
      requiredPower: 420,
      requiredAttainment: 10,
      requiredItems: [{ definitionId: 'material.yellow_breakthrough_token', count: 1 }]
    });

    expect(jindan).toBeNull();
  });
});
