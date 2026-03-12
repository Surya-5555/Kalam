import { RedisService } from './redis.service.js';

const getPrefix = (): string => {
  const env = process.env.NODE_ENV || 'dev';
  return `lc:${env}:`;
};

const prefixKey = (key: string): string => {
  return getPrefix() + key;
};

export const cacheGet = async (redis: RedisService, key: string) => {
  const client = redis.getClient();
  const data = await client.get(prefixKey(key));
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export const cacheSet = async (redis: RedisService, key: string, value: any, ttlSeconds = 600) => {
  const client = redis.getClient();
  await client.set(prefixKey(key), JSON.stringify(value), 'EX', ttlSeconds);
};

export const cacheInvalidate = async (redis: RedisService, pattern: string) => {
  const client = redis.getClient();
  const prefixedPattern = prefixKey(pattern);
  const keysToDelete: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await client.scan(
      cursor,
      'MATCH',
      prefixedPattern,
      'COUNT',
      100
    );
    cursor = nextCursor;
    keysToDelete.push(...keys);
  } while (cursor !== '0');

  if (keysToDelete.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      await client.del(...batch);
    }
  }
};

export const cacheInvalidateUser = async (redis: RedisService, userId: string) => {
  await cacheInvalidate(redis, `sheets:user:${userId}:*`);
  await cacheInvalidate(redis, `problems:user:${userId}:*`);
};
