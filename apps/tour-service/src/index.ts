import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import cors from 'cors';
import express from 'express';
import crypto from 'crypto';

import { prisma } from './prisma';
import { typeDefs } from './schema/typeDefs';
import { resolvers } from './schema/resolvers';

interface UserContext {
  id: string;
  email: string;
  role: string;
}

interface ServiceContext {
  user: UserContext | null;
  requestId: string;
}

function extractUserFromHeaders(req: express.Request): UserContext | null {
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userRole = req.headers['x-user-role'] as string;

  if (!userId) return null;

  return {
    id: userId,
    email: userEmail || '',
    role: userRole || 'user',
  };
}

async function main() {
  const app = express();
  const port = process.env['PORT'] ?? 4010;

  // Health check
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'healthy', service: 'tour-service' });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: String(error) });
    }
  });

  // Build schema
  const schema = buildSubgraphSchema({ typeDefs, resolvers });

  // Create Apollo Server
  const server = new ApolloServer<ServiceContext>({
    schema,
  });

  await server.start();

  // GraphQL endpoint
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => ({
        user: extractUserFromHeaders(req),
        requestId: (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      }),
    })
  );

  app.listen(port, () => {
    console.log(`🚀 Tour Service ready at http://localhost:${port}/graphql`);
  });
}

main().catch((error) => {
  console.error('Failed to start Tour Service:', error);
  process.exit(1);
});
