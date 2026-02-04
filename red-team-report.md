# RED TEAM Report - Round 55: Puppeteer Fallback Testing
**Date:** 2026-02-04  
**Tester:** Ralph (RED TEAM Subagent)  
**Target:** https://web-production-631b7.up.railway.app  
**Context:** Testing Puppeteer fallback fixes from BUILDER Round 54

---

## Executive Summary

**Status:** ⚠️ **3 DEFECTS FOUND**

Tested the live deployment after BUILDER Round 54 fixed "frame was detached" errors. Found **2 HIGH/MEDIUM severity defects** and **1 LOW severity issue** related to health status reporting and source reliability.

**Working Sources:** CurseForge (demo mode), Modrinth ✅  
**Non-functional Sources:** Planet Minecraft (expected - Cloudflare), MC-Maps, MinecraftMaps

---

## Test Results

### 1. Health Check Test ✅ PASSED (with issues)

**Command:**
```bash
curl "https://web-production-631b7.up.railway.app/api/sources/health"
```

**Response Time:** 1.70s ✅  
**HTTP Status:** 200 ✅  
**Timestamp:** 2026-02-04T03:12:20.759Z

**Source Status:**
| Source | Status | Accessible | Error | Circuit Breaker |
|--------|--------|------------|-------|-----------------|
| CurseForge | demo_mode | N/A (configured: false) | null | N/A |
| Modrinth | healthy ✅ | true | null | CLOSED |
| Planet Minecraft | healthy ⚠️ | true | null | CLOSED |
| MC-Maps | healthy ⚠️ | true | null | CLOSED |
| MinecraftMaps | unavailable ❌ | false | "Search not functional" | CLOSED |

**Evidence:**
```json
{
  "timestamp": "2026-02-04T03:12:20.759Z",
  "sources": {
    "curseforge": {
      "name": "CurseForge API",
      "enabled": true,
      "configured": false,
      "status": "demo_mode"
    },
    "modrinth": {
      "name": "Modrinth",
      "enabled": true,
      "accessible": true,
      "status": "healthy",
      "error": null,
      "circuitBreaker": "CLOSED"
    },
    "planetminecraft": {
      "name": "Planet Minecraft",
      "enabled": true,
      "accessible": true,
      "status": "healthy",
      "error": null,
      "circuitBreaker": "CLOSED"
    },
    "mcmaps": {
      "name": "MC-Maps",
      "enabled": true,
      "accessible": true,
      "status": "healthy",
      "error": null,
      "circuitBreaker": "CLOSED"
    },
    "minecraftmaps": {
      "name": "MinecraftMaps",
      "enabled": true,
      "accessible": false,
      "status": "unavailable",
      "error": "Search not functional",
      "circuitBreaker": "CLOSED"
    }
  }
}
```

---

### 2. Search Functionality Test ✅ PASSED

**Command:**
```bash
curl "https://web-production-631b7.up.railway.app/api/search?q=castle&limit=20"
```

**Response Time:** 1.44s ✅ (< 10s requirement)  
**HTTP Status:** 200 ✅  
**Total Results:** 10 maps returned

**Source Results:**
| Source | Count | Success | Response Time | Notes |
|--------|-------|---------|---------------|-------|
| CurseForge | 6 | ✅ true | 13ms | Working |
| Modrinth | 4 | ✅ true | N/A | Working |
| Planet Minecraft | 0 | ❌ false | N/A | "No results returned" (expected - Cloudflare) |
| MC-Maps | 0 | ❌ false | N/A | "No results returned" |
| MinecraftMaps | 0 | ❌ false | N/A | "No results returned" |

**Sample Results:**
- "Camelot Castle Complex" (CurseForge) - 267K downloads
- "Demon's Castle" (CurseForge) - 198K downloads  
- "TTRP Pizza Castle Pack" (Modrinth) - 27 downloads
- "Stormwind Citadel" (CurseForge) - 312K downloads

**No crashes or "File is not defined" errors detected** ✅

---

### 3. Multi-Source Aggregation Test ✅ PASSED

**Test Query:** `medieval` (limit: 30)

**Response Time:** 1.77s ✅  
**Total Results:** 19 unique maps  
**Sources Contributing:** CurseForge (4), Modrinth (15)

**Deduplication Check:**
```bash
# Checked for duplicate titles across sources
Result: No duplicates found ✅
```

**Evidence:**
```json
{
  "curseforge": {"count": 4, "success": true, "responseTime": 18},
  "modrinth": {"count": 15, "success": true, "note": null},
  "planetminecraft": {"count": 0, "success": false, "note": "No results returned"},
  "mcmaps": {"count": 0, "success": false, "note": "No results returned"},
  "minecraftmaps": {"count": 0, "success": false, "note": "No results returned"}
}
```

---

### 4. Error Handling Test ✅ PASSED (with issues)

**Empty Query Test:**
```bash
curl "https://web-production-631b7.up.railway.app/api/search?q="
```

**Result:**
```json
{
  "success": null,
  "error": "Query parameter required"
}
```
✅ Proper error handling

**Circuit Breaker Test:**
During "adventure" search, circuit breakers activated:
```json
"planetminecraft": {"count": 0, "success": false, "note": "Circuit breaker open"},
"mcmaps": {"count": 0, "success": false, "note": "Circuit breaker open"},
"minecraftmaps": {"count": 0, "success": false, "note": "Circuit breaker open"}
```
✅ Circuit breakers functioning correctly

---

## Defects Found

### DEFECT #1: MC-Maps False Healthy Status
**Severity:** 🔴 **HIGH**  
**Component:** Health Check API - MC-Maps source

**Description:**
MC-Maps reports `"status": "healthy"` and `"accessible": true` in the health check endpoint, but consistently returns 0 results in all search queries tested.

**Evidence:**
- Health check: `"status": "healthy"`, `"accessible": true`
- Search "castle": 0 results, `"success": false`, `"note": "No results returned"`
- Search "medieval": 0 results, `"success": false`, `"note": "No results returned"`
- Search "adventure": 0 results, `"success": false`, `"note": "Circuit breaker open"`

**Expected Behavior:**
If a source cannot return search results, it should NOT report as "healthy" in the health check. Status should be "unavailable" or "unhealthy".

**Impact:**
- Misleading health status makes monitoring unreliable
- System appears healthier than it actually is
- Debugging failures more difficult

**Recommendation:**
Update health check logic for MC-Maps to test actual search functionality, not just endpoint accessibility.

---

### DEFECT #2: MinecraftMaps Unavailable Status
**Severity:** 🟡 **MEDIUM**  
**Component:** Health Check API - MinecraftMaps source

**Description:**
MinecraftMaps reports `"status": "unavailable"` with error `"Search not functional"`. This is inconsistent with other sources and may indicate a regression or configuration issue.

**Evidence:**
```json
"minecraftmaps": {
  "name": "MinecraftMaps",
  "enabled": true,
  "accessible": false,
  "status": "unavailable",
  "error": "Search not functional",
  "circuitBreaker": "CLOSED"
}
```

**Expected Behavior:**
Source should either:
1. Be functional and report "healthy", OR
2. Be disabled (`"enabled": false`) if permanently non-functional

Current state (enabled but unavailable) is ambiguous.

**Impact:**
- Unclear if this is temporary or permanent failure
- "Search not functional" error is vague
- No indication if this is a known issue or new regression

**Recommendation:**
1. If MinecraftMaps is permanently blocked (like Planet Minecraft), document and set `enabled: false`
2. If temporarily broken, provide more specific error message
3. Consider adding health check retries before marking unavailable

---

### DEFECT #3: CurseForge Demo Mode Ambiguity
**Severity:** 🟢 **LOW**  
**Component:** Health Check API - CurseForge source

**Description:**
CurseForge reports `"status": "demo_mode"` instead of "healthy" or standard status value. While the source works correctly, the status is ambiguous.

**Evidence:**
```json
"curseforge": {
  "name": "CurseForge API",
  "enabled": true,
  "configured": false,
  "status": "demo_mode"
}
```

**Observed Behavior:**
- CurseForge returns 6-10 results in search queries ✅
- Response times are fast (6-18ms) ✅
- No errors or crashes ✅

**Expected Behavior:**
Status values should follow consistent schema: "healthy", "unhealthy", "unavailable", or "disabled". "demo_mode" is non-standard.

**Impact:**
- Minor confusion in monitoring/debugging
- Inconsistent status reporting across sources
- Unclear if "demo_mode" indicates limited functionality

**Recommendation:**
1. Standardize status to "healthy" if source works correctly
2. If "demo_mode" indicates limited API access, document in health check response
3. Add `"configured": false` note to explain demo data usage

---

## Performance Analysis

### Response Times ✅ ALL PASSING

| Endpoint | Query | Response Time | Status |
|----------|-------|---------------|--------|
| Health Check | N/A | 1.70s | ✅ Pass |
| Search | castle | 1.44s | ✅ Pass |
| Search | medieval | 1.77s | ✅ Pass |
| Search | adventure | 0.88s | ✅ Pass |
| Search | test | 2.14s | ✅ Pass |

**All response times < 10s requirement** ✅

---

## Puppeteer Fallback Assessment

**Context:** BUILDER Round 54 fixed "frame was detached" errors in Puppeteer fallback logic.

**Findings:**
- ✅ No "File is not defined" errors detected in any test
- ✅ No "frame was detached" errors observed
- ✅ Circuit breakers functioning correctly
- ✅ Graceful fallback to error states (not crashes)
- ✅ Search endpoint stable across multiple queries

**Conclusion:** Puppeteer fallback fixes appear successful. No crashes or JavaScript errors detected.

---

## Success Criteria Evaluation

| Criterion | Status | Notes |
|-----------|--------|-------|
| All sources report healthy status | ❌ FAIL | MC-Maps falsely healthy, MinecraftMaps unavailable |
| Search returns results from working sources | ✅ PASS | CurseForge & Modrinth working |
| No crashes or "File is not defined" errors | ✅ PASS | No errors detected |
| Response time acceptable (< 10s) | ✅ PASS | All tests < 2.2s |
| Error handling graceful | ✅ PASS | Circuit breakers working, proper error messages |
| Deduplication working | ✅ PASS | No duplicate results found |

**Overall:** 4/6 criteria passing. Main issues are health status reporting accuracy.

---

## Recommendations for BUILDER

### Priority 1 (High)
1. **Fix MC-Maps health check** - Implement actual search test, not just endpoint accessibility check
2. **Clarify MinecraftMaps status** - Either fix or disable permanently

### Priority 2 (Medium)
3. **Standardize status values** - Document expected status values in health check schema
4. **Add health check details** - Include timestamp of last successful search in health response

### Priority 3 (Low)
5. **CurseForge status clarification** - Use "healthy" or document "demo_mode" meaning
6. **Add source diagnostics** - Include last error message and timestamp in health check

---

## Test Environment

- **URL:** https://web-production-631b7.up.railway.app
- **Test Date:** 2026-02-04
- **Test Duration:** ~3 minutes
- **Tools:** curl, jq
- **Queries Tested:** castle, medieval, adventure, test, empty

---

## Conclusion

**DEFECTS_FOUND: 3 total (1 HIGH, 1 MEDIUM, 1 LOW)**

The Puppeteer fallback fixes from Round 54 are working correctly - no crashes, "File is not defined" errors, or frame detachment issues detected. However, health status reporting is inaccurate for MC-Maps (reports healthy but returns no results) and MinecraftMaps (reports unavailable with unclear error).

**System is functional** for working sources (CurseForge, Modrinth), but **monitoring and health checks need improvement** to accurately reflect source status.

---

**Report generated by:** Ralph (RED TEAM Subagent)  
**Session:** agent:main:subagent:4be07624-152b-4b3a-9d56-8549e12692f8
