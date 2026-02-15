import type { ApolloServerPlugin } from '@apollo/server';

import type { GatewayContext } from '../index.js';

export const loggingPlugin: ApolloServerPlugin<GatewayContext> = {
  async requestDidStart({ contextValue }) {
    const startTime = Date.now();
    const { requestId, user } = contextValue;

    return {
      async willSendResponse({ response }) {
        const duration = Date.now() - startTime;
        const hasErrors = response.body.kind === 'single' && response.body.singleResult.errors;

        console.log(
          JSON.stringify({
            requestId,
            userId: user?.id ?? 'anonymous',
            duration,
            hasErrors: !!hasErrors,
            timestamp: new Date().toISOString(),
          })
        );
      },
    };
  },
};
