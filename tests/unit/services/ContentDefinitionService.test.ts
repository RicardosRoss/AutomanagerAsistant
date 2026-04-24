import { describe, expect, test } from 'vitest';
import { ContentDefinition } from '../../../src/models/index.js';
import ContentDefinitionService from '../../../src/services/ContentDefinitionService.js';

describe('ContentDefinitionService', () => {
  test('loads runtime-ready database content and excludes draft content', async () => {
    await ContentDefinition.create([
      {
        definitionId: 'art.test_runtime_ready',
        category: 'battle_art',
        name: '试作明光指',
        version: 1,
        status: 'runtime_ready',
        source: 'manual',
        tags: ['test', 'attack'],
        realmFloor: 'realm.taixi',
        realmCeiling: 'realm.zifu',
        payload: {
          runtimeReady: true,
          category: 'attack',
          requiredRealmId: 'realm.taixi'
        },
        balanceProfile: {
          version: 1,
          attackWeight: 0.7,
          defenseWeight: 0.1,
          senseWeight: 0.1,
          speedWeight: 0.1,
          actionType: 'attack'
        }
      },
      {
        definitionId: 'art.test_draft',
        category: 'battle_art',
        name: '草稿法门',
        version: 1,
        status: 'draft',
        source: 'manual',
        tags: ['test'],
        realmFloor: 'realm.taixi',
        payload: {
          runtimeReady: true,
          category: 'attack',
          requiredRealmId: 'realm.taixi'
        },
        balanceProfile: {
          version: 1,
          attackWeight: 0.7,
          defenseWeight: 0.1,
          senseWeight: 0.1,
          speedWeight: 0.1,
          actionType: 'attack'
        }
      }
    ]);

    const batch = await new ContentDefinitionService().loadRuntimeReadyContentBatch();

    expect(batch.battleArts.some(({ entry }) => entry.id === 'art.basic_guarding_hand')).toBe(true);
    expect(batch.battleArts.some(({ entry }) => entry.id === 'art.test_runtime_ready')).toBe(true);
    expect(batch.battleArts.some(({ entry }) => entry.id === 'art.test_draft')).toBe(false);
  });

  test('rejects runtime-ready content that cannot be projected', async () => {
    await ContentDefinition.create({
      definitionId: 'power.bad_runtime_ready',
      category: 'divine_power',
      name: '坏神通',
      version: 1,
      status: 'runtime_ready',
      source: 'manual',
      tags: ['test'],
      realmFloor: 'realm.zifu',
      payload: {
        runtimeReady: true,
        category: 'burst',
        requiredRealmId: 'realm.zifu'
      },
      balanceProfile: {
        version: 1,
        attackWeight: 0.5
      }
    });

    await expect(new ContentDefinitionService().loadRuntimeReadyContentBatch()).rejects.toThrow(
      /Invalid content definition/
    );
  });
});
