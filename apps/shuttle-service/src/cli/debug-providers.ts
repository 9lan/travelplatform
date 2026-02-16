#!/usr/bin/env node
/**
 * Debug Providers
 *
 * Quick script to test provider connectivity and see detailed errors
 */

import { initializeProviders, getProviderRegistry } from '../providers/index.js';

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║       Provider Debug Tool              ║');
  console.log('╚════════════════════════════════════════╝');
  console.log();

  // Initialize providers
  console.log('🔄 Initializing providers...\n');

  try {
    await initializeProviders();
  } catch (error) {
    console.error('❌ Failed to initialize providers:', error);
    process.exit(1);
  }

  const registry = getProviderRegistry();
  const providers = registry.getAllProviders();

  if (providers.length === 0) {
    console.log('⚠️  No providers enabled. Check your .env file.');
    process.exit(1);
  }

  console.log(`✅ Enabled providers: ${providers.map((p) => p.name).join(', ')}\n`);

  // Test each provider
  for (const provider of providers) {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Testing ${provider.name}...`);
    console.log('═'.repeat(50));

    // Test authentication
    console.log('\n1️⃣  Testing authentication...');
    try {
      await provider.authenticate();
      console.log('   ✅ Authentication successful');
    } catch (error) {
      console.error('   ❌ Authentication failed:');
      console.error('   ', error instanceof Error ? error.message : error);
      if (error instanceof Error && error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(1, 3).join('\n   '));
      }
      continue; // Skip other tests if auth fails
    }

    // Test getCities
    console.log('\n2️⃣  Testing getCities...');
    try {
      const cities = await provider.getCities();
      console.log(`   ✅ Got ${cities.length} cities`);
      if (cities.length > 0) {
        console.log(`   Sample: ${cities.slice(0, 3).map((c) => c.name).join(', ')}...`);
      }
    } catch (error) {
      console.error('   ❌ getCities failed:');
      console.error('   ', error instanceof Error ? error.message : error);
      if (error instanceof Error && error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(1, 3).join('\n   '));
      }
    }

    // Test getOriginOutlets
    console.log('\n3️⃣  Testing getOriginOutlets...');
    try {
      const outlets = await provider.getOriginOutlets();
      console.log(`   ✅ Got ${outlets.length} outlets`);
      if (outlets.length > 0) {
        console.log(`   Sample: ${outlets.slice(0, 3).map((o) => o.name).join(', ')}...`);
      }
    } catch (error) {
      console.error('   ❌ getOriginOutlets failed:');
      console.error('   ', error instanceof Error ? error.message : error);
      if (error instanceof Error && error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(1, 3).join('\n   '));
      }
    }

    // Health check
    console.log('\n4️⃣  Health check...');
    try {
      const isHealthy = await provider.healthCheck();
      console.log(`   ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    } catch (error) {
      console.error('   ❌ Health check failed:', error);
    }
  }

  console.log('\n\n✅ Debug complete');
}

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
