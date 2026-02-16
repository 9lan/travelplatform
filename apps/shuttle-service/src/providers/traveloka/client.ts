/**
 * Traveloka API Client
 *
 * Low-level HTTP client for Traveloka Bus/Shuttle PAPI
 */

import { AppError } from '@travelplatform/shared-utils';

import type { TravelokaOAuthResponse } from './types.js';

export interface TravelokaConfig {
  authUrl: string;
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  timeout?: number;
}

export class TravelokaClient {
  private config: TravelokaConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: TravelokaConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  async authenticate(): Promise<void> {
    const url = `${this.config.authUrl}/oauth/accesstoken`;

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '*/*',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      throw new AppError(
        `Traveloka authentication failed: ${response.status}`,
        'TRAVELOKA_AUTH_ERROR',
        401
      );
    }

    const data = (await response.json()) as TravelokaOAuthResponse;

    // Debug logging
    if (process.env['DEBUG']) {
      console.log('[Traveloka] Auth response:', JSON.stringify(data, null, 2));
    }

    if (!data.access_token) {
      throw new AppError(
        'Traveloka authentication failed: No access token received',
        'TRAVELOKA_AUTH_ERROR',
        401
      );
    }

    // Store raw token (Traveloka API doesn't use Bearer prefix)
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    if (process.env['DEBUG']) {
      console.log(`[Traveloka] Token stored: ${this.accessToken.substring(0, 30)}...`);
    }
  }

  isAuthenticated(): boolean {
    if (!this.accessToken || !this.tokenExpiresAt) {
      return false;
    }
    // Consider token expired 5 minutes before actual expiry
    return this.tokenExpiresAt.getTime() - 5 * 60 * 1000 > Date.now();
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated()) {
      await this.authenticate();
    }
  }

  async post<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    await this.ensureAuthenticated();

    const url = `${this.config.apiUrl}/bus/${endpoint}`;

    // Debug logging
    if (process.env['DEBUG']) {
      console.log(`[Traveloka] POST ${url}`);
      console.log(`[Traveloka] Authorization: ${this.accessToken?.substring(0, 30)}...`);
    }

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.accessToken!,
      },
      signal: AbortSignal.timeout(this.config.timeout!),
    };

    if (data) {
      fetchOptions.body = JSON.stringify(data);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      // Try to get error details
      let errorBody = '';
      try {
        errorBody = await response.text();
        if (process.env['DEBUG']) {
          console.log(`[Traveloka] Error response: ${errorBody}`);
        }
      } catch {
        // Ignore
      }

      throw new AppError(
        `Traveloka API error: ${response.status} - ${errorBody.substring(0, 200)}`,
        'TRAVELOKA_API_ERROR',
        response.status
      );
    }

    const result = (await response.json()) as T;

    // Check for API-level errors
    const apiResult = result as { responseStatus?: string; responseMessage?: string };
    if (apiResult.responseStatus === 'FAILED') {
      throw new AppError(
        apiResult.responseMessage ?? 'Unknown Traveloka error',
        'TRAVELOKA_API_ERROR',
        400
      );
    }

    return result;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      return true;
    } catch {
      return false;
    }
  }
}
