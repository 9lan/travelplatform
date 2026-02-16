#!/usr/bin/env node
/**
 * Provider Sync CLI
 *
 * Usage:
 *   pnpm sync                    # Sync all (cities + outlets) from all providers
 *   pnpm sync --cities           # Sync only cities
 *   pnpm sync --outlets          # Sync only outlets
 *   pnpm sync --provider TIKETUX # Sync from specific provider
 *   pnpm sync --clean            # Delete existing data before syncing (fresh sync)
 */

import { initializeProviders } from '../providers/index.js';
import { ProviderCode } from '../providers/types.js';
import { runSyncNow, startSyncWorker, type SyncJobData } from '../jobs/sync-providers.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const cleanBeforeSync = args.includes('--clean') || args.includes('--fresh');
  const hasCitiesFlag = args.includes('--cities') || args.includes('-c');
  const hasOutletsFlag = args.includes('--outlets') || args.includes('-o');

  // If no specific flags, sync both cities and outlets
  const syncCities = args.length === 0 || hasCitiesFlag || (!hasCitiesFlag && !hasOutletsFlag);
  const syncOutlets = args.length === 0 || hasOutletsFlag || (!hasCitiesFlag && !hasOutletsFlag);

  let providerCode: ProviderCode | undefined;
  const providerIndex = args.findIndex((a) => a === '--provider' || a === '-p');
  if (providerIndex !== -1 && args[providerIndex + 1]) {
    const code = args[providerIndex + 1]?.toUpperCase();
    if (code === 'TIKETUX' || code === 'TRAVELOKA' || code === 'REDBUS') {
      providerCode = code as ProviderCode;
    } else {
      console.error(`Invalid provider: ${code}. Must be TIKETUX, TRAVELOKA, or REDBUS`);
      process.exit(1);
    }
  }

  console.log('╔════════════════════════════════════════╗');
  console.log('║       Provider Sync CLI                ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  // Initialize providers
  console.log('🔄 Initializing providers...');
  await initializeProviders();

  // Start worker (required for job processing)
  startSyncWorker();

  // Build job data
  const jobData: SyncJobData = {
    syncCities,
    syncOutlets,
    cleanBeforeSync,
  };

  if (providerCode) {
    jobData.providerCode = providerCode;
  }

  console.log();
  console.log('📋 Sync Configuration:');
  console.log(`   Provider: ${providerCode ?? 'ALL'}`);
  console.log(`   Sync Cities: ${syncCities}`);
  console.log(`   Sync Outlets: ${syncOutlets}`);
  console.log(`   Clean Before Sync: ${cleanBeforeSync}`);
  console.log();

  try {
    console.log('🚀 Starting sync...');
    console.log();

    const result = await runSyncNow(jobData);

    console.log();
    console.log('╔════════════════════════════════════════╗');
    console.log('║           Sync Complete                ║');
    console.log('╚════════════════════════════════════════╝');
    console.log();
    if (result.citiesDeleted > 0 || result.outletsDeleted > 0) {
      console.log(`   Cities deleted:  ${result.citiesDeleted}`);
      console.log(`   Outlets deleted: ${result.outletsDeleted}`);
      console.log();
    }
    console.log(`   Cities synced:  ${result.citiesSynced}`);
    console.log(`   Outlets synced: ${result.outletsSynced}`);
    console.log(`   Errors:         ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log();
      console.log('⚠️  Errors encountered:');
      result.errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
    }

    console.log();
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error();
    console.error('❌ Sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
