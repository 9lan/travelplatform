import type { ApolloServerPlugin } from '@apollo/server';
import Redis from 'ioredis';

import type { GatewayContext } from '../index.js';

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');

const RATE_LIMITS = {
  anonymous: { requests: 100, window: 60 },
  authenticated: { requests: 500, window: 60 },
};

export const rateLimiterPlugin: ApolloServerPlugin<GatewayContext> = {
  async requestDidStart({ contextValue }) {
    const { user, requestId } = contextValue;
    const key = user ? `rate:user:${user.id}` : `rate:anon:${requestId}`;
    const limit = user ? RATE_LIMITS.authenticated : RATE_LIMITS.anonymous;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, limit.window);
    }

    if (current > limit.requests) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    return Promise.resolve();
  },
};
