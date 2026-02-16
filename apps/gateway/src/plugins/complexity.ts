import type { ApolloServerPlugin } from '@apollo/server';
import { getComplexity, simpleEstimator } from 'graphql-query-complexity';

import type { GatewayContext } from '../index.js';

const MAX_COMPLEXITY = 1000;

export const complexityPlugin: ApolloServerPlugin<GatewayContext> = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async requestDidStart() {
    return {
      // eslint-disable-next-line @typescript-eslint/require-await
      async didResolveOperation({ request, document, schema }) {
        const complexityOptions: Parameters<typeof getComplexity>[0] = {
          schema,
          query: document,
          estimators: [simpleEstimator({ defaultComplexity: 1 })],
        };
        if (request.operationName) {
          complexityOptions.operationName = request.operationName;
        }
        if (request.variables) {
          complexityOptions.variables = request.variables;
        }
        const complexity = getComplexity(complexityOptions);

        if (complexity > MAX_COMPLEXITY) {
          throw new Error(
            `Query complexity ${complexity} exceeds maximum allowed ${MAX_COMPLEXITY}`
          );
        }
      },
    };
  },
};
