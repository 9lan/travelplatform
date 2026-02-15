import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import cors from 'cors';
import express from 'express';

import { type UserContext } from '@travelplatform/shared-types';

import { prisma } from './prisma.js';
import { getProviderRegistry, initializeProviders } from './providers/index.js';
import { resolvers } from './schema/resolvers.js';
import { typeDefs } from './schema/typeDefs.js';

export interface ServiceContext {
  user: UserContext | null;
  requestId: string;
}

async function main() {
  // Initialize shuttle providers (Tiketux, Traveloka, RedBus, etc.)
  console.log('🔄 Initializing shuttle providers...');
  await initializeProviders();
  const registry = getProviderRegistry();
  const enabledProviders = registry.getEnabledProviderCodes();
  console.log(`✅ Enabled providers: ${enabledProviders.join(', ') || 'none'}`);

  const schema = buildSubgraphSchema({ typeDefs, resolvers });

  const server = new ApolloServer<ServiceContext>({
    schema,
  });

  await server.start();

  const app = express();

  // Health check
  app.get('/health', async (_, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', service: 'shuttle-service', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: 'error', service: 'shuttle-service', error: 'Database connection failed' });
    }
  });

  // Provider health check
  app.get('/health/providers', async (_, res) => {
    try {
      const healthResults = await registry.healthCheckAll();
      const providers: Record<string, boolean> = {};
      healthResults.forEach((isHealthy, code) => {
        providers[code] = isHealthy;
      });
      res.json({
        status: 'ok',
        service: 'shuttle-service',
        providers,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({ status: 'error', error: 'Provider health check failed' });
    }
  });

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }): Promise<ServiceContext> => ({
        user: req.headers['x-user-id']
          ? {
              id: req.headers['x-user-id'] as string,
              email: req.headers['x-user-email'] as string,
              role: req.headers['x-user-role'] as string,
            }
          : null,
        requestId: (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      }),
    })
  );

  const port = process.env['PORT'] ?? 4001;

  app.listen(port, () => {
    console.log(`🚌 Shuttle Service ready at http://localhost:${port}/graphql`);
    console.log(`📊 Health check at http://localhost:${port}/health`);
    console.log(`🔌 Provider health at http://localhost:${port}/health/providers`);
  });
}

main().catch(console.error);
