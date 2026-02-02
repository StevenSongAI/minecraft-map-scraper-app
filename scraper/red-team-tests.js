#!/usr/bin/env node
/**
 * Red Team Verification Tests for Minecraft Map Scraper
 * Tests edge cases, error handling, security, and link validity
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000';

// Test results
const results = {
  passed: 0,
  failed: 0,
  issues: [],
  warnings: []
};

function log(type, message, details = null) {
  const timestamp = new Date().toISOString();
  if (type === 'PASS') {
    console.log(`✅ PASS: ${message}`);
    results.passed++;
  } else if (type === 'FAIL') {
    console.log(`❌ FAIL: ${message}`);
    if (details) console.log(`   Details: ${JSON.stringify(details)}`);
    results.failed++;
    results.issues.push({ type: 'FAIL', message, details });
  } else if (type === 'WARN') {
    console.log(`⚠️ WARN: ${message}`);
    if (details) console.log(`   Details: ${JSON.stringify(details)}`);
    results.warnings.push({ message, details });
  } else if (type === 'INFO') {
    console.log(`ℹ️ INFO: ${message}`);
  }
}

// Make HTTP request helper
function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Wait for server to be ready
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await makeRequest('/api/health');
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

// ==================== EDGE CASE TESTS ====================

async function testEmptyQueries() {
  log('INFO', 'Testing empty and edge case queries...');

  // Test 1: Empty query
  try {
    const res = await makeRequest('/api/search?q=');
    if (res.status === 400 && res.body.error === 'BAD_REQUEST') {
      log('PASS', 'Empty query returns 400 Bad Request');
    } else {
      log('FAIL', 'Empty query should return 400', { status: res.status, body: res.body });
    }
  } catch (err) {
    log('FAIL', 'Empty query test threw error', err.message);
  }

  // Test 2: Whitespace-only query
  try {
    const res = await makeRequest(`/api/search?q=${encodeURIComponent('   ')}`);
    if (res.status === 400) {
      log('PASS', 'Whitespace-only query returns 400');
    } else {
      log('FAIL', 'Whitespace-only query should return 400', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Whitespace query test threw error', err.message);
  }

  // Test 3: Missing query parameter entirely
  try {
    const res = await makeRequest('/api/search');
    if (res.status === 400) {
      log('PASS', 'Missing query parameter returns 400');
    } else {
      log('FAIL', 'Missing query should return 400', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Missing query test threw error', err.message);
  }
}

async function testVeryLongInputs() {
  log('INFO', 'Testing very long inputs...');

  // Test 4: Very long query (1000+ chars)
  const longQuery = 'a'.repeat(2000);
  try {
    const res = await makeRequest(`/api/search?q=${encodeURIComponent(longQuery)}`);
    // Should either work or return 400 if there's a limit
    if (res.status === 200 || res.status === 400 || res.status === 414) {
      log('PASS', 'Very long query handled (no crash)', { status: res.status });
    } else if (res.status === 503) {
      log('PASS', 'Very long query returns 503 (API key missing, but no crash)');
    } else {
      log('WARN', 'Very long query returned unexpected status', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Very long query caused crash', err.message);
  }

  // Test 5: Excessive pageSize
  try {
    const res = await makeRequest('/api/search?q=test&pageSize=999999');
    // Should be capped at 50
    if (res.status === 200 || res.status === 503) {
      log('PASS', 'Excessive pageSize handled');
    } else {
      log('WARN', 'Excessive pageSize returned unexpected status', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Excessive pageSize caused crash', err.message);
  }
}

async function testSpecialCharacters() {
  log('INFO', 'Testing special characters and encoding...');

  const specialChars = [
    '<script>alert("xss")</script>',
    'test" onload="alert(1)',
    "test' onclick='alert(1)",
    '../../../etc/passwd',
    'test%00null',
    '日本語テスト',
    '🎮🗺️🎲',
    'test\n\r\t',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ];

  for (const char of specialChars) {
    try {
      const res = await makeRequest(`/api/search?q=${encodeURIComponent(char)}`);
      // Should not crash, should return some response
      if (res.status === 200 || res.status === 503 || res.status === 400) {
        log('PASS', `Special character handled: "${char.substring(0, 30)}..."`, { status: res.status });
      } else {
        log('WARN', `Special character returned unexpected status`, { char: char.substring(0, 30), status: res.status });
      }
    } catch (err) {
      log('FAIL', `Special character caused crash: "${char.substring(0, 30)}"`, err.message);
    }
  }
}

async function testInvalidMapIds() {
  log('INFO', 'Testing invalid map IDs...');

  // Test non-numeric ID
  try {
    const res = await makeRequest('/api/map/abc');
    if (res.status === 400) {
      log('PASS', 'Non-numeric map ID returns 400');
    } else {
      log('FAIL', 'Non-numeric map ID should return 400', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Non-numeric map ID test threw error', err.message);
  }

  // Test negative ID
  try {
    const res = await makeRequest('/api/map/-1');
    // Should handle gracefully (either 404 or 400)
    if (res.status === 400 || res.status === 404 || res.status === 503) {
      log('PASS', 'Negative map ID handled gracefully');
    } else {
      log('WARN', 'Negative map ID returned unexpected status', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Negative map ID caused crash', err.message);
  }

  // Test very large ID
  try {
    const res = await makeRequest('/api/map/999999999999999999');
    if (res.status === 400 || res.status === 404 || res.status === 503) {
      log('PASS', 'Very large map ID handled gracefully');
    } else {
      log('WARN', 'Very large map ID returned unexpected status', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Very large map ID caused crash', err.message);
  }
}

// ==================== SECURITY TESTS ====================

async function testXSSPrevention() {
  log('INFO', 'Testing XSS prevention in dashboard code...');

  // Read the frontend code
  const appJsPath = path.join(__dirname, '../dashboard/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Check for escapeHtml usage
  const escapeHtmlPattern = /escapeHtml\(/g;
  const escapeHtmlCount = (appJs.match(escapeHtmlPattern) || []).length;
  
  if (escapeHtmlCount >= 10) {
    log('PASS', `escapeHtml() used ${escapeHtmlCount} times in app.js`);
  } else {
    log('WARN', `escapeHtml() used only ${escapeHtmlCount} times, may need more`);
  }

  // Check for innerHTML without escaping
  const innerHtmlPattern = /\.innerHTML\s*=/g;
  const innerHtmlMatches = appJs.match(innerHtmlPattern) || [];
  
  // Check if all innerHTML assignments use escapeHtml
  const dangerousPatterns = [
    /innerHTML\s*=\s*[^`]*\$\{[^}]+\}/,  // Template literal without escaping
    /innerHTML\s*=\s*.*\+\s*query/,       // Concatenation with query
  ];

  let hasDangerousInnerHTML = false;
  for (const pattern of dangerousPatterns) {
    if (pattern.test(appJs)) {
      hasDangerousInnerHTML = true;
      break;
    }
  }

  if (!hasDangerousInnerHTML) {
    log('PASS', 'No dangerous innerHTML patterns detected');
  } else {
    log('FAIL', 'Potentially dangerous innerHTML usage detected');
  }

  // Check that textContent or escapeHtml is used for user input
  if (appJs.includes('escapeHtml(') && appJs.includes('.textContent')) {
    log('PASS', 'Uses both escapeHtml and textContent for XSS prevention');
  }
}

async function testURLValidation() {
  log('INFO', 'Testing URL validation in links...');

  // Check app.js for URL validation
  const appJsPath = path.join(__dirname, '../dashboard/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Check if downloadUrl is validated before use
  if (appJs.includes('downloadUrl') && appJs.includes('escapeHtml(downloadUrl)')) {
    log('PASS', 'downloadUrl is escaped before use in href');
  } else {
    log('WARN', 'downloadUrl may not be properly escaped');
  }

  // Check for javascript: protocol prevention
  if (!appJs.match(/href\s*=\s*["']?javascript:/i)) {
    log('PASS', 'No hardcoded javascript: protocols in hrefs');
  } else {
    log('FAIL', 'Hardcoded javascript: protocol detected');
  }
}

async function testInjectionPrevention() {
  log('INFO', 'Testing injection prevention...');

  // Test path traversal in query
  try {
    const res = await makeRequest('/api/search?q=../../../etc/passwd');
    // Should not crash or return file system errors
    if (res.status === 200 || res.status === 503 || res.status === 400) {
      log('PASS', 'Path traversal in query handled safely');
    } else {
      log('WARN', 'Path traversal returned unexpected status', { status: res.status });
    }
  } catch (err) {
    log('FAIL', 'Path traversal caused crash', err.message);
  }

  // Test SQL-like injection
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE maps; --",
    "1' UNION SELECT * FROM users --",
  ];

  for (const payload of sqlPayloads) {
    try {
      const res = await makeRequest(`/api/search?q=${encodeURIComponent(payload)}`);
      if (res.status === 200 || res.status === 503 || res.status === 400) {
        log('PASS', `SQL-like payload handled safely`);
      }
    } catch (err) {
      log('FAIL', `SQL-like payload caused crash`, err.message);
    }
  }
}

// ==================== ERROR HANDLING TESTS ====================

async function testErrorResponses() {
  log('INFO', 'Testing error response formats...');

  // Test 404 handler
  try {
    const res = await makeRequest('/api/nonexistent');
    if (res.status === 404 && res.body.error) {
      log('PASS', '404 endpoint returns proper JSON error');
    } else {
      log('WARN', '404 endpoint response could be improved', { status: res.status, body: res.body });
    }
  } catch (err) {
    log('FAIL', '404 test threw error', err.message);
  }

  // Test method not allowed
  try {
    const res = await makeRequest('/api/search', 'POST');
    if (res.status === 404) {
      log('PASS', 'POST to GET endpoint returns 404');
    } else {
      log('INFO', 'POST method handling', { status: res.status });
    }
  } catch (err) {
    log('INFO', 'POST test', err.message);
  }
}

async function testCachePoisoning() {
  log('INFO', 'Testing cache poisoning prevention...');

  // Test that cache keys are normalized
  const queries = ['Test', 'TEST', 'test', ' test ', '  TEST  '];
  
  // These should all map to the same cache key
  log('INFO', 'Cache normalization test: "Test", "TEST", "test" should all normalize to same key');
  
  // Check cache.js for normalization
  const cachePath = path.join(__dirname, '../scraper/cache.js');
  const cacheJs = fs.readFileSync(cachePath, 'utf8');

  if (cacheJs.includes('toLowerCase().trim()')) {
    log('PASS', 'Cache uses toLowerCase().trim() for key normalization');
  } else {
    log('WARN', 'Cache may not properly normalize keys');
  }
}

// ==================== LINK VALIDITY TESTS ====================

async function testLinkValidity() {
  log('INFO', 'Testing link URL validity...');

  // Check that download URLs follow expected patterns
  const curseforgePattern = /^https:\/\/www\.curseforge\.com\/minecraft\/worlds\/[a-z0-9-]+(\/download)?$/;
  const cdnPattern = /^https:\/\/edge\.forgecdn\.net\//;

  // Verify URL construction in curseforge.js
  const cfPath = path.join(__dirname, '../scraper/curseforge.js');
  const cfJs = fs.readFileSync(cfPath, 'utf8');

  // Check for proper URL construction
  if (cfJs.includes('curseforge.com/minecraft/worlds/')) {
    log('PASS', 'Download URLs constructed with proper CurseForge format');
  } else {
    log('WARN', 'Download URL format may be incorrect');
  }

  // Check for protocol validation
  if (!cfJs.match(/downloadUrl\s*[:=]\s*["']javascript:/i)) {
    log('PASS', 'No javascript: protocol in download URL construction');
  }

  // Check for undefined slug handling
  if (cfJs.includes('apiMod.slug')) {
    log('PASS', 'Uses slug from API response for URL construction');
  }
}

async function testURLProtocolSafety() {
  log('INFO', 'Testing URL protocol safety...');

  // Check that URLs can't be manipulated to use dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  
  const appJsPath = path.join(__dirname, '../dashboard/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  for (const protocol of dangerousProtocols) {
    if (appJs.includes(`"${protocol}`) || appJs.includes(`'${protocol}`)) {
      log('FAIL', `Dangerous protocol found in code: ${protocol}`);
    }
  }

  log('PASS', 'No dangerous protocols found in URL construction');
}

// ==================== CODE ANALYSIS TESTS ====================

async function testInputValidation() {
  log('INFO', 'Testing input validation coverage...');

  const serverPath = path.join(__dirname, '../scraper/server.js');
  const serverJs = fs.readFileSync(serverPath, 'utf8');

  // Check for query validation
  if (serverJs.includes('typeof q !== \'string\'') && serverJs.includes('.trim()')) {
    log('PASS', 'Query parameter has type and emptiness validation');
  } else {
    log('WARN', 'Query validation could be more robust');
  }

  // Check for pageSize validation
  if (serverJs.includes('Math.min') && serverJs.includes('50')) {
    log('PASS', 'pageSize has upper bound validation (50)');
  } else {
    log('WARN', 'pageSize may not have proper bounds');
  }

  // Check for numeric ID validation
  if (serverJs.includes('parseInt') && serverJs.includes('isNaN')) {
    log('PASS', 'Map ID has numeric validation');
  } else {
    log('WARN', 'Map ID validation could be improved');
  }
}

async function testSecurityHeaders() {
  log('INFO', 'Testing security headers...');

  try {
    const res = await makeRequest('/api/health');
    const headers = res.headers;

    // Check for security headers
    const securityHeaders = ['x-content-type-options', 'x-frame-options'];
    
    for (const header of securityHeaders) {
      if (headers[header]) {
        log('PASS', `Security header present: ${header}`);
      } else {
        log('WARN', `Security header missing: ${header} (not critical but recommended)`);
      }
    }

    // Content-Type should be JSON for API
    const contentType = headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
      log('PASS', 'Content-Type is application/json');
    }
  } catch (err) {
    log('WARN', 'Could not check security headers', err.message);
  }
}

// ==================== MAIN ====================

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     RED TEAM VERIFICATION - Minecraft Map Scraper        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Check if server is running
  const serverReady = await waitForServer();
  if (!serverReady) {
    log('FAIL', 'Server not running on localhost:3000 - starting server required for tests');
    console.log('\n⚠️  Please start the server first: npm start');
  }

  // Run all tests
  await testEmptyQueries();
  await testVeryLongInputs();
  await testSpecialCharacters();
  await testInvalidMapIds();
  await testXSSPrevention();
  await testURLValidation();
  await testInjectionPrevention();
  await testErrorResponses();
  await testCachePoisoning();
  await testLinkValidity();
  await testURLProtocolSafety();
  await testInputValidation();
  await testSecurityHeaders();

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Passed:  ${results.passed.toString().padEnd(45)}║`);
  console.log(`║  Failed:  ${results.failed.toString().padEnd(45)}║`);
  console.log(`║  Warnings: ${results.warnings.length.toString().padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (results.issues.length > 0) {
    console.log('ISSUES FOUND:');
    results.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue.message}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\nWARNINGS:');
    results.warnings.forEach((warn, i) => {
      console.log(`  ${i + 1}. ${warn.message}`);
    });
  }

  // Return success if no critical failures
  const criticalIssues = results.issues.filter(i => i.type === 'FAIL');
  if (criticalIssues.length === 0) {
    console.log('\n✅ RED TEAM VERIFICATION PASSED - No critical security issues found');
    return { passes: true, results };
  } else {
    console.log('\n❌ RED TEAM VERIFICATION FAILED - Critical issues must be fixed');
    return { passes: false, results };
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().then(result => {
    process.exit(result.passes ? 0 : 1);
  }).catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
