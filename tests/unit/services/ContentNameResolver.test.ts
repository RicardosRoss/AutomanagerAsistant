import { describe, expect, test } from 'vitest';
import { ContentDefinition } from '../../../src/models/index.js';
import ContentNameResolver from '../../../src/services/ContentNameResolver.js';

class FakeRedisContentCache {
  isConnected = true;

  values = new Map<string, string>();

  getClient() {
    return {
      hSet: async (_key: string, values: Record<string, string>) => {
        for (const [id, name] of Object.entries(values)) {
          this.values.set(id, name);
        }
      },
      hGet: async (_key: string, id: string) => this.values.get(id) ?? null,
      hGetAll: async (_key: string) => Object.fromEntries(this.values)
    };
  }
}

describe('ContentNameResolver', () => {
  test('warms runtime-ready content names into Redis and local memory', async () => {
    await ContentDefinition.create({
      definitionId: 'goldNature.test_runtime_ready',
      category: 'gold_nature',
      name: '试作金性',
      version: 1,
      status: 'runtime_ready',
      source: 'manual',
      tags: ['test'],
      realmFloor: 'realm.jindan',
      payload: {
        displayOnly: true
      }
    });

    const redis = new FakeRedisContentCache();
    const resolver = new ContentNameResolver({ redis });

    await resolver.warmup();

    expect(resolver.resolve('goldNature.test_runtime_ready')).toBe('试作金性');
    expect(redis.values.get('goldNature.test_runtime_ready')).toBe('试作金性');
    expect(resolver.resolve('goldNature.direct_mingyang')).toBe('明阳金性');
  });

  test('can lazily hydrate a missing local name from Redis before falling back to id', async () => {
    const redis = new FakeRedisContentCache();
    redis.values.set('jindan_path.redis_only', 'Redis 路线');
    const resolver = new ContentNameResolver({ redis });

    await expect(resolver.resolveAsync('jindan_path.redis_only')).resolves.toBe('Redis 路线');
    expect(resolver.resolve('jindan_path.redis_only')).toBe('Redis 路线');
    await expect(resolver.resolveAsync('unknown.content_id')).resolves.toBe('unknown.content_id');
  });
});
