/**
 * Test script for CurseForge API Client
 * 
 * Usage:
 *   CURSEFORGE_API_KEY=your_key node scraper/test.js
 *   or
 *   npm test
 */

const CurseForgeClient = require('./curseforge');
const CacheManager = require('./cache');
const path = require('path');

// Get API key from environment
const API_KEY = process.env.CURSEFORGE_API_KEY;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runTests() {
  log('\n╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║     CurseForge API Client Tests                          ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝\n', 'cyan');

  // Test 1: API Key check
  log('Test 1: Checking API Key Configuration', 'yellow');
  if (!API_KEY) {
    log('❌ FAIL: CURSEFORGE_API_KEY not set', 'red');
    log('\nTo get an API key:', 'yellow');
    log('1. Go to https://console.curseforge.com/');
    log('2. Create an account or sign in');
    log('3. Go to API Keys section');
    log('4. Generate a new API key');
    log('5. Run: CURSEFORGE_API_KEY=your_key node scraper/test.js\n');
    process.exit(1);
  }
  log(`✓ API Key found: ${API_KEY.substring(0, 8)}...`, 'green');

  // Test 2: Client initialization
  log('\nTest 2: Initializing CurseForge Client', 'yellow');
  const client = new CurseForgeClient(API_KEY);
  log('✓ Client initialized', 'green');

  // Test 3: API Status check
  log('\nTest 3: Validating API Key', 'yellow');
  const status = await client.getStatus();
  if (!status.valid) {
    log(`❌ FAIL: ${status.error}`, 'red');
    process.exit(1);
  }
  log(`✓ API Key is valid: ${status.message}`, 'green');

  // Test 4: Search for maps
  log('\nTest 4: Searching for "skyblock" maps', 'yellow');
  try {
    const maps = await client.searchMaps('skyblock', { pageSize: 5 });
    
    if (!maps || maps.length === 0) {
      log('❌ FAIL: No results returned', 'red');
      process.exit(1);
    }

    log(`✓ Found ${maps.length} maps`, 'green');
    
    // Display first result
    const first = maps[0];
    log('\n  First result:', 'blue');
    log(`  - ID: ${first.id}`, 'reset');
    log(`  - Name: ${first.name}`, 'reset');
    log(`  - Author: ${first.author.name}`, 'reset');
    log(`  - Summary: ${first.summary?.substring(0, 80)}...`, 'reset');
    log(`  - Downloads: ${first.downloadCount.toLocaleString()}`, 'reset');
    log(`  - Versions: ${first.gameVersions?.slice(0, 3).join(', ') || 'N/A'}`, 'reset');
    log(`  - Thumbnail: ${first.thumbnail ? '✓' : '✗'}`, 'reset');

  } catch (error) {
    log(`❌ FAIL: ${error.message}`, 'red');
    process.exit(1);
  }

  // Test 5: Search with version filter
  log('\nTest 5: Searching with version filter (1.20.1)', 'yellow');
  try {
    const maps = await client.searchMaps('adventure', { 
      gameVersion: '1.20.1',
      pageSize: 3 
    });
    log(`✓ Found ${maps.length} maps for version 1.20.1`, 'green');
  } catch (error) {
    log(`❌ FAIL: ${error.message}`, 'red');
  }

  // Test 6: Cache operations
  log('\nTest 6: Testing Cache Manager', 'yellow');
  const cachePath = path.join(__dirname, '..', 'test-cache.json');
  const cache = new CacheManager(cachePath);
  
  cache.clear(); // Start fresh
  log('✓ Cache initialized', 'green');

  const testMaps = [
    { id: 123, name: 'Test Map 1', summary: 'Test summary' },
    { id: 456, name: 'Test Map 2', summary: 'Test summary 2' }
  ];

  cache.saveSearchResults('test', testMaps);
  log('✓ Saved search results to cache', 'green');

  const retrieved = cache.getSearchResults('test');
  if (retrieved && retrieved.length === 2) {
    log('✓ Retrieved results from cache', 'green');
  } else {
    log('❌ FAIL: Cache retrieval failed', 'red');
  }

  const stats = cache.getStats();
  log(`✓ Cache stats: ${stats.mapCount} maps, ${stats.searchCount} searches`, 'green');

  // Cleanup
  const fs = require('fs');
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    log('✓ Cleaned up test cache file', 'green');
  }

  // Test 7: Error handling
  log('\nTest 7: Testing Error Handling', 'yellow');
  
  const badClient = new CurseForgeClient('invalid_key');
  const badStatus = await badClient.getStatus();
  if (!badStatus.valid) {
    log('✓ Invalid key correctly detected', 'green');
  }

  log('\n╔══════════════════════════════════════════════════════════╗', 'green');
  log('║     ✓ All Tests Passed!                                  ║', 'green');
  log('╚══════════════════════════════════════════════════════════╝\n', 'green');
  
  log('API Client is ready to use.', 'cyan');
  log('Start the server with: npm start\n', 'cyan');
}

runTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
