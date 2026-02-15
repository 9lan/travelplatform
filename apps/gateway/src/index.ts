import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import express, { type Request } from 'express';
import { expressjwt } from 'express-jwt';

import { type UserContext } from '@travelplatform/shared-types';

import { complexityPlugin } from './plugins/complexity.js';
import { loggingPlugin } from './plugins/logging.js';
import { rateLimiterPlugin } from './plugins/rateLimiter.js';

interface JWTRequest extends Request {
  auth?: UserContext;
}

export interface GatewayContext {
  user: UserContext | null;
  requestId: string;
}

const SUBGRAPHS = [
  { name: 'shuttle', url: process.env['SHUTTLE_SERVICE_URL'] ?? 'http://localhost:4001/graphql' },
  { name: 'seat', url: process.env['SEAT_SERVICE_URL'] ?? 'http://localhost:4002/graphql' },
  { name: 'pricing', url: process.env['PRICING_SERVICE_URL'] ?? 'http://localhost:4003/graphql' },
  { name: 'booking', url: process.env['BOOKING_SERVICE_URL'] ?? 'http://localhost:4004/graphql' },
  { name: 'payment', url: process.env['PAYMENT_SERVICE_URL'] ?? 'http://localhost:4005/graphql' },
  { name: 'promo', url: process.env['PROMO_SERVICE_URL'] ?? 'http://localhost:4006/graphql' },
  { name: 'notification', url: process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://localhost:4007/graphql' },
];

class AuthenticatedDataSource extends RemoteGraphQLDataSource<GatewayContext> {
  override willSendRequest({ request, context }: { request: { http?: { headers: Map<string, string> } }; context: GatewayContext }) {
    if (context.user) {
      request.http?.headers.set('x-user-id', context.user.id);
      request.http?.headers.set('x-user-role', context.user.role);
      request.http?.headers.set('x-user-email', context.user.email);
    }
    request.http?.headers.set('x-request-id', context.requestId);
  }
}

async function main() {
  const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: SUBGRAPHS,
      pollIntervalInMs: process.env['NODE_ENV'] === 'development' ? 10000 : 30000,
    }),
    buildService({ url }) {
      return new AuthenticatedDataSource({ url });
    },
  });

  const server = new ApolloServer<GatewayContext>({
    gateway,
    plugins: [
      rateLimiterPlugin,
      complexityPlugin,
      loggingPlugin,
    ],
  });

  await server.start();

  const app = express();

  // Health check endpoint
  app.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // JWT middleware (optional auth)
  app.use(
    '/graphql',
    expressjwt({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
      algorithms: ['HS256'],
      credentialsRequired: false,
    })
  );

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }: { req: JWTRequest }): Promise<GatewayContext> => ({
        user: req.auth ?? null,
        requestId: (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      }),
    })
  );

  const port = process.env['PORT'] ?? 4000;

  app.listen(port, () => {
    console.log(`🚀 Gateway ready at http://localhost:${port}/graphql`);
    console.log(`📊 Health check at http://localhost:${port}/health`);
  });
}

main().catch(console.error);
