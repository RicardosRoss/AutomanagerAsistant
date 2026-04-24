import redisConnection from '../config/redis.js';
import { getRuntimeContentName } from '../config/xuanjianCanonical.js';
import type { RedisHealthStatus } from '../config/redis.js';
import ContentDefinitionService from './ContentDefinitionService.js';

const CONTENT_NAME_HASH_KEY = 'xuanjian:content:names';

type RedisLike = {
  isConnected: boolean;
  getClient: () => {
    hSet: (key: string, values: Record<string, string>) => Promise<unknown>;
    hGet: (key: string, field: string) => Promise<string | null | undefined>;
    hGetAll?: (key: string) => Promise<Record<string, string>>;
  };
  healthCheck?: () => Promise<RedisHealthStatus>;
};

interface ContentNameResolverDependencies {
  contentDefinitionService?: Pick<ContentDefinitionService, 'loadRuntimeContentNameMap'>;
  redis?: RedisLike;
}

class ContentNameResolver {
  private readonly contentDefinitionService: Pick<ContentDefinitionService, 'loadRuntimeContentNameMap'>;

  private readonly redis: RedisLike;

  private readonly names = new Map<string, string>();

  constructor(dependencies: ContentNameResolverDependencies = {}) {
    this.contentDefinitionService = dependencies.contentDefinitionService ?? new ContentDefinitionService();
    this.redis = dependencies.redis ?? redisConnection;
  }

  async warmup(): Promise<void> {
    const names = await this.contentDefinitionService.loadRuntimeContentNameMap();
    this.replaceLocalNames(names);

    if (!this.redis.isConnected) {
      return;
    }

    await this.redis.getClient().hSet(CONTENT_NAME_HASH_KEY, names);
  }

  resolve(id: string): string {
    return this.names.get(id) ?? getRuntimeContentName(id);
  }

  async resolveAsync(id: string): Promise<string> {
    const localName = this.names.get(id);
    if (localName) {
      return localName;
    }

    if (this.redis.isConnected) {
      const redisName = await this.redis.getClient().hGet(CONTENT_NAME_HASH_KEY, id);
      if (redisName) {
        this.names.set(id, redisName);
        return redisName;
      }
    }

    const fallbackName = getRuntimeContentName(id);
    if (fallbackName !== id) {
      this.names.set(id, fallbackName);
    }
    return fallbackName;
  }

  private replaceLocalNames(names: Record<string, string>): void {
    this.names.clear();
    for (const [id, name] of Object.entries(names)) {
      this.names.set(id, name);
    }
  }
}

export { CONTENT_NAME_HASH_KEY };
export type { ContentNameResolverDependencies };
export default ContentNameResolver;
