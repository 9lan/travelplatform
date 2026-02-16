/**
 * Tiketux API Client
 *
 * Low-level HTTP client for Tiketux API
 */

import { AppError } from '@travelplatform/shared-utils';

export interface TiketuxConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeout?: number;
}

export interface TiketuxResponse<T> {
  tiketux: {
    result: T;
    status: 'OK' | 'ERROR';
    pesan: string | null;
    url?: string;
    time?: string;
  };
}

export interface TiketuxToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export class TiketuxClient {
  private config: TiketuxConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: TiketuxConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  async authenticate(): Promise<void> {
    const url = `${this.config.baseUrl}/client_token.php`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      throw new AppError(
        `Tiketux authentication failed: ${response.status}`,
        'TIKETUX_AUTH_ERROR',
        401
      );
    }

    const data = (await response.json()) as TiketuxResponse<TiketuxToken>;

    if (data.tiketux.status !== 'OK') {
      throw new AppError(
        `Tiketux authentication failed: ${data.tiketux.pesan}`,
        'TIKETUX_AUTH_ERROR',
        401
      );
    }

    this.accessToken = data.tiketux.result.access_token;
    this.tokenExpiresAt = new Date(
      Date.now() + data.tiketux.result.expires_in * 1000
    );
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

  async post<T>(
    endpoint: string,
    data?: Record<string, string | number | undefined>,
    contentType: 'form' | 'json' = 'form'
  ): Promise<T> {
    await this.ensureAuthenticated();

    const url = `${this.config.baseUrl}/${endpoint}`;

    let body: string;
    let headers: Record<string, string>;

    if (contentType === 'json') {
      body = JSON.stringify(data);
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      };
    } else {
      const formData = new URLSearchParams();
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            formData.append(key, String(value));
          }
        }
      }
      body = formData.toString();
      headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.accessToken}`,
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      throw new AppError(
        `Tiketux API error: ${response.status}`,
        'TIKETUX_API_ERROR',
        response.status
      );
    }

    const result = (await response.json()) as TiketuxResponse<T>;

    // Debug logging
    if (process.env['DEBUG']) {
      console.log(`[Tiketux] Response for ${endpoint}:`, JSON.stringify(result, null, 2).substring(0, 500));
    }

    if (result.tiketux.status !== 'OK') {
      throw new AppError(
        result.tiketux.pesan ?? 'Unknown Tiketux error',
        'TIKETUX_API_ERROR',
        400
      );
    }

    return result.tiketux.result;
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
