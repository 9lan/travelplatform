/**
 * Shuttle Provider Registry
 *
 * Manages multiple shuttle providers and provides unified access
 */

import {
  type IShuttleProvider,
  type ProviderCity,
  type ProviderOutlet,
  type ProviderSchedule,
  type ProviderSeatLayout,
  type ProviderPriceBreakdown,
  type ProviderBooking,
  type ProviderBookingRequest,
  type SearchScheduleParams,
  type CalculatePriceParams,
  ProviderCode,
} from './types.js';
import { TiketuxProvider } from './tiketux/provider.js';
import { TravelokaProvider } from './traveloka/provider.js';

export interface ProviderConfig {
  code: ProviderCode;
  enabled: boolean;
  // Tiketux / RedBus style (single base URL)
  baseUrl?: string;
  // Traveloka style (separate auth and API URLs)
  authUrl?: string;
  apiUrl?: string;
  // Common
  clientId: string;
  clientSecret: string;
  timeout?: number;
}

export class ProviderRegistry {
  private providers: Map<ProviderCode, IShuttleProvider> = new Map();

  constructor(configs: ProviderConfig[]) {
    for (const config of configs) {
      if (config.enabled) {
        const provider = this.createProvider(config);
        if (provider) {
          this.providers.set(config.code, provider);
        }
      }
    }
  }

  private createProvider(config: ProviderConfig): IShuttleProvider | null {
    switch (config.code) {
      case ProviderCode.TIKETUX:
        if (!config.baseUrl) {
          console.warn('Tiketux provider missing baseUrl');
          return null;
        }
        return new TiketuxProvider({
          baseUrl: config.baseUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          ...(config.timeout !== undefined && { timeout: config.timeout }),
        });

      case ProviderCode.TRAVELOKA:
        if (!config.authUrl || !config.apiUrl) {
          console.warn('Traveloka provider missing authUrl or apiUrl');
          return null;
        }
        return new TravelokaProvider({
          authUrl: config.authUrl,
          apiUrl: config.apiUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          ...(config.timeout !== undefined && { timeout: config.timeout }),
        });

      case ProviderCode.REDBUS:
        // TODO: Implement RedbusProvider
        console.warn('RedBus provider not yet implemented');
        return null;

      default:
        console.warn(`Unknown provider: ${String(config.code)}`);
        return null;
    }
  }

  getProvider(code: ProviderCode): IShuttleProvider | undefined {
    return this.providers.get(code);
  }

  getAllProviders(): IShuttleProvider[] {
    return Array.from(this.providers.values());
  }

  getEnabledProviderCodes(): ProviderCode[] {
    return Array.from(this.providers.keys());
  }

  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        await provider.authenticate();
        console.log(`✓ ${provider.name} provider initialized`);
      } catch (error) {
        console.error(`✗ ${provider.name} provider failed to initialize:`, error);
      }
    });

    await Promise.all(initPromises);
  }

  async healthCheckAll(): Promise<Map<ProviderCode, boolean>> {
    const results = new Map<ProviderCode, boolean>();

    for (const [code, provider] of this.providers) {
      const isHealthy = await provider.healthCheck();
      results.set(code, isHealthy);
    }

    return results;
  }

  // ─────────────────────────────────────────────
  // Aggregated Operations (across all providers)
  // ─────────────────────────────────────────────

  async getAllCities(): Promise<ProviderCity[]> {
    const cityPromises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        return await provider.getCities();
      } catch (error) {
        console.error(`Failed to get cities from ${provider.name}:`, error);
        return [];
      }
    });

    const results = await Promise.all(cityPromises);
    return results.flat();
  }

  async searchSchedulesFromAll(params: SearchScheduleParams): Promise<ProviderSchedule[]> {
    const schedulePromises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        return await provider.searchSchedules(params);
      } catch (error) {
        console.error(`Failed to search schedules from ${provider.name}:`, error);
        return [];
      }
    });

    const results = await Promise.all(schedulePromises);
    return results.flat().sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime());
  }

  // ─────────────────────────────────────────────
  // Provider-specific Operations
  // ─────────────────────────────────────────────

  async getOriginOutlets(
    providerCode: ProviderCode,
    cityId?: string
  ): Promise<ProviderOutlet[]> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.getOriginOutlets(cityId);
  }

  async getDestinationOutlets(
    providerCode: ProviderCode,
    originOutletId: string
  ): Promise<ProviderOutlet[]> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.getDestinationOutlets(originOutletId);
  }

  async getSeatLayout(
    providerCode: ProviderCode,
    scheduleId: string,
    departureDate: string,
    originOutletId: string,
    destinationOutletId: string
  ): Promise<ProviderSeatLayout> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.getSeatLayout(scheduleId, departureDate, originOutletId, destinationOutletId);
  }

  async calculatePrice(
    providerCode: ProviderCode,
    params: CalculatePriceParams
  ): Promise<ProviderPriceBreakdown> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.calculatePrice(params);
  }

  async createBooking(
    providerCode: ProviderCode,
    request: ProviderBookingRequest
  ): Promise<ProviderBooking> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.createBooking(request);
  }

  async getBookingDetail(
    providerCode: ProviderCode,
    bookingCode: string
  ): Promise<ProviderBooking> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.getBookingDetail(bookingCode);
  }

  async confirmPayment(
    providerCode: ProviderCode,
    bookingCode: string,
    paidAt: Date
  ): Promise<ProviderBooking> {
    const provider = this.providers.get(providerCode);
    if (!provider) {
      throw new Error(`Provider ${providerCode} not found`);
    }
    return provider.confirmPayment(bookingCode, paidAt);
  }
}

// ─────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────

let registryInstance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    const configs: ProviderConfig[] = [
      {
        code: ProviderCode.TIKETUX,
        enabled: !!process.env['TIKETUX_BASE_URL'],
        baseUrl: process.env['TIKETUX_BASE_URL'] ?? '',
        clientId: process.env['TIKETUX_CLIENT_ID'] ?? '',
        clientSecret: process.env['TIKETUX_CLIENT_SECRET'] ?? '',
        timeout: 30000,
      },
      {
        code: ProviderCode.TRAVELOKA,
        enabled: !!(process.env['TRAVELOKA_AUTH_URL'] && process.env['TRAVELOKA_API_URL']),
        authUrl: process.env['TRAVELOKA_AUTH_URL'] ?? '',
        apiUrl: process.env['TRAVELOKA_API_URL'] ?? '',
        clientId: process.env['TRAVELOKA_CLIENT_ID'] ?? '',
        clientSecret: process.env['TRAVELOKA_CLIENT_SECRET'] ?? '',
        timeout: 60000, // Traveloka API can be slow
      },
      {
        code: ProviderCode.REDBUS,
        enabled: !!process.env['REDBUS_BASE_URL'],
        baseUrl: process.env['REDBUS_BASE_URL'] ?? '',
        clientId: process.env['REDBUS_CLIENT_ID'] ?? '',
        clientSecret: process.env['REDBUS_CLIENT_SECRET'] ?? '',
        timeout: 30000,
      },
    ];

    registryInstance = new ProviderRegistry(configs);
  }

  return registryInstance;
}

export async function initializeProviders(): Promise<ProviderRegistry> {
  const registry = getProviderRegistry();
  await registry.initializeAll();
  return registry;
}
