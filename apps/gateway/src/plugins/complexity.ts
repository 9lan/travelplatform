import type { ApolloServerPlugin } from '@apollo/server';
import { getComplexity, simpleEstimator } from 'graphql-query-complexity';

import type { GatewayContext } from '../index.js';

const MAX_COMPLEXITY = 1000;

export const complexityPlugin: ApolloServerPlugin<GatewayContext> = {
  async requestDidStart() {
    return {
      async didResolveOperation({ request, document, schema }) {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName ?? undefined,
          query: document,
          variables: request.variables ?? {},
          estimators: [simpleEstimator({ defaultComplexity: 1 })],
        });

        if (complexity > MAX_COMPLEXITY) {
          throw new Error(
            `Query complexity ${complexity} exceeds maximum allowed ${MAX_COMPLEXITY}`
          );
        }
      },
    };
  },
};
