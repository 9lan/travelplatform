/**
 * Provider Sync Job
 *
 * Syncs cities and outlets from external providers (Tiketux, Traveloka, RedBus)
 * to the local database for caching and faster queries.
 */

import { Queue, QueueEvents, Worker, type Job } from 'bullmq';

import { prisma } from '../prisma.js';
import { getProviderRegistry } from '../providers/index.js';
import { type ProviderCity, type ProviderOutlet, ProviderCode } from '../providers/types.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SyncJobData {
  providerCode?: ProviderCode | undefined; // If specified, sync only this provider
  syncCities?: boolean | undefined;
  syncOutlets?: boolean | undefined;
}

export interface SyncJobResult {
  citiesSynced: number;
  outletsSynced: number;
  errors: string[];
}

// ─────────────────────────────────────────────
// Queue Configuration
// ─────────────────────────────────────────────

const QUEUE_NAME = 'provider-sync';

const redisConnection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
};

export const syncQueue = new Queue<SyncJobData, SyncJobResult>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const syncQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisConnection,
});

// ─────────────────────────────────────────────
// Sync Functions
// ─────────────────────────────────────────────

async function syncCitiesFromProvider(providerCode: ProviderCode): Promise<{ synced: number; errors: string[] }> {
  const registry = getProviderRegistry();
  const provider = registry.getProvider(providerCode);

  if (!provider) {
    return { synced: 0, errors: [`Provider ${providerCode} not enabled`] };
  }

  const errors: string[] = [];
  let synced = 0;

  try {
    console.log(`📍 Fetching cities from ${provider.name}...`);
    const cities = await provider.getCities();
    console.log(`   Found ${cities.length} cities`);

    for (const city of cities) {
      try {
        await upsertCity(city);
        synced++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to sync city ${city.name}: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to fetch cities from ${provider.name}: ${message}`);
  }

  return { synced, errors };
}

async function syncOutletsFromProvider(providerCode: ProviderCode): Promise<{ synced: number; errors: string[] }> {
  const registry = getProviderRegistry();
  const provider = registry.getProvider(providerCode);

  if (!provider) {
    return { synced: 0, errors: [`Provider ${providerCode} not enabled`] };
  }

  const errors: string[] = [];
  let synced = 0;

  try {
    console.log(`🏢 Fetching outlets from ${provider.name}...`);
    const outlets = await provider.getOriginOutlets();
    console.log(`   Found ${outlets.length} outlets`);

    for (const outlet of outlets) {
      try {
        await upsertOutlet(outlet);
        synced++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to sync outlet ${outlet.name}: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to fetch outlets from ${provider.name}: ${message}`);
  }

  return { synced, errors };
}

async function upsertCity(city: ProviderCity): Promise<void> {
  // Extract provider ID from composite ID (e.g., "tiketux_city_123" -> "123")
  const providerId = city.providerCityId ?? city.id.replace(/^(tiketux|traveloka|redbus)_city_/, '');

  await prisma.city.upsert({
    where: {
      providerCode_providerId: {
        providerCode: city.providerCode,
        providerId,
      },
    },
    create: {
      name: city.name,
      province: city.province ?? 'Unknown',
      providerCode: city.providerCode,
      providerId,
    },
    update: {
      name: city.name,
      province: city.province ?? 'Unknown',
    },
  });
}

async function upsertOutlet(outlet: ProviderOutlet): Promise<void> {
  // Extract provider IDs - handle both formats: TIKETUX_123 and tiketux_outlet_123
  const providerId = outlet.providerOutletId ?? outlet.id.replace(/^(TIKETUX|TRAVELOKA|REDBUS|tiketux|traveloka|redbus)_?(outlet_)?/i, '');
  const providerCityId = outlet.cityId.replace(/^(TIKETUX|TRAVELOKA|REDBUS|tiketux|traveloka|redbus)_?(city_)?/i, '');

  // Find or create the city first
  let city = await prisma.city.findFirst({
    where: {
      providerCode: outlet.providerCode,
      providerId: providerCityId,
    },
  });

  if (!city) {
    // Create the city if it doesn't exist
    city = await prisma.city.create({
      data: {
        name: outlet.cityName || providerCityId || 'Unknown',
        province: 'Unknown',
        providerCode: outlet.providerCode,
        providerId: providerCityId,
      },
    });
  }

  await prisma.counter.upsert({
    where: {
      providerCode_providerId: {
        providerCode: outlet.providerCode,
        providerId,
      },
    },
    create: {
      code: `${outlet.providerCode}_${outlet.code}`,
      name: outlet.name,
      cityId: city.id,
      address: outlet.address,
      latitude: outlet.latitude ?? 0,
      longitude: outlet.longitude ?? 0,
      phone: outlet.phone ?? null,
      providerCode: outlet.providerCode,
      providerId,
    },
    update: {
      name: outlet.name,
      address: outlet.address,
      latitude: outlet.latitude ?? 0,
      longitude: outlet.longitude ?? 0,
      phone: outlet.phone ?? null,
    },
  });
}

// ─────────────────────────────────────────────
// Job Processor
// ─────────────────────────────────────────────

async function processSyncJob(job: Job<SyncJobData, SyncJobResult>): Promise<SyncJobResult> {
  const { providerCode, syncCities = true, syncOutlets = true } = job.data;

  console.log(`\n🔄 Starting provider sync job ${job.id}`);
  console.log(`   Provider: ${providerCode ?? 'ALL'}`);
  console.log(`   Sync cities: ${syncCities}, Sync outlets: ${syncOutlets}`);

  const result: SyncJobResult = {
    citiesSynced: 0,
    outletsSynced: 0,
    errors: [],
  };

  const registry = getProviderRegistry();
  const providerCodes = providerCode
    ? [providerCode]
    : registry.getEnabledProviderCodes();

  for (const code of providerCodes) {
    // Sync cities
    if (syncCities) {
      const cityResult = await syncCitiesFromProvider(code);
      result.citiesSynced += cityResult.synced;
      result.errors.push(...cityResult.errors);
      await job.updateProgress(30);
    }

    // Sync outlets
    if (syncOutlets) {
      const outletResult = await syncOutletsFromProvider(code);
      result.outletsSynced += outletResult.synced;
      result.errors.push(...outletResult.errors);
      await job.updateProgress(60);
    }
  }

  await job.updateProgress(100);

  console.log(`\n✅ Sync job ${job.id} completed`);
  console.log(`   Cities synced: ${result.citiesSynced}`);
  console.log(`   Outlets synced: ${result.outletsSynced}`);
  console.log(`   Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('   Error details:');
    result.errors.forEach((e) => console.log(`     - ${e}`));
  }

  return result;
}

// ─────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────

let worker: Worker<SyncJobData, SyncJobResult> | null = null;

export function startSyncWorker(): Worker<SyncJobData, SyncJobResult> {
  if (worker) {
    return worker;
  }

  worker = new Worker<SyncJobData, SyncJobResult>(QUEUE_NAME, processSyncJob, {
    connection: redisConnection,
    concurrency: 1, // Process one sync job at a time
  });

  worker.on('completed', (job, result) => {
    console.log(`✅ Sync job ${job.id} completed: ${result.citiesSynced} cities, ${result.outletsSynced} outlets`);
  });

  worker.on('failed', (job, error) => {
    console.error(`❌ Sync job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('Sync worker error:', error);
  });

  console.log('🔧 Provider sync worker started');

  return worker;
}

export async function stopSyncWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('🔧 Provider sync worker stopped');
  }
}

// ─────────────────────────────────────────────
// Job Scheduling
// ─────────────────────────────────────────────

export async function scheduleSyncJob(data: SyncJobData = {}): Promise<Job<SyncJobData, SyncJobResult>> {
  return syncQueue.add('sync', data, {
    jobId: `sync-${Date.now()}`,
  });
}

export async function scheduleRecurringSyncJob(): Promise<void> {
  // Remove existing repeatable jobs
  const repeatableJobs = await syncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await syncQueue.removeRepeatableByKey(job.key);
  }

  // Schedule new recurring job - every 6 hours
  await syncQueue.add(
    'sync-recurring',
    { syncCities: true, syncOutlets: true },
    {
      repeat: {
        pattern: '0 */6 * * *', // Every 6 hours
      },
      jobId: 'sync-recurring',
    }
  );

  console.log('📅 Scheduled recurring sync job (every 6 hours)');
}

// ─────────────────────────────────────────────
// Manual Sync (for CLI/testing)
// ─────────────────────────────────────────────

export async function runSyncNow(data: SyncJobData = {}): Promise<SyncJobResult> {
  const job = await scheduleSyncJob(data);
  const result = await job.waitUntilFinished(syncQueueEvents, 300000); // 5 min timeout
  return result;
}
