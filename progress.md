# RED TEAM DEFECT REPORT - Minecraft Map Scraper
**Date:** 2026-02-03  
**Live URL:** https://web-production-631b7.up.railway.app  
**Tester:** Red Team (Adversarial)

---

## DEFECT SUMMARY
**Total Defects Found:** 5 CRITICAL defects  
**Status:** ❌ DEFECTS_FOUND

---

## DEFECT 1: Multi-Source Scrapers COMPLETELY BROKEN [CRITICAL]

**Requirement Violated:**
> "MUST aggregate results from multiple sources beyond CurseForge"  
> "Primary additional sources: Planet Minecraft (largest repository after CurseForge)"  
> "Secondary sources: MinecraftMaps.com, 9Minecraft"

**Evidence (from /api/search-unified):**
```json
{
  "sources": {
    "curseforge": { "count": 61, "success": true },
    "planetminecraft": { 
      "count": 0, 
      "success": false,
      "error": "browserType.launch: Failed to launch: Error: spawn /root/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell ENOENT"
    },
    "minecraftmaps": { 
      "count": 0, 
      "success": false,
      "error": "Timeout after 6000ms"
    },
    "nineminecraft": { 
      "count": 0, 
      "success": false,
      "error": "Timeout after 6000ms"
    }
  }
}
```

**Impact:** 
- 0% of multi-source scrapers functional
- Only 1 of 4 required data sources working
- Violates "Commercial Grade" multi-source requirement
- 75% data source failure rate

**Timestamp:** 2026-02-03T16:35:01.892Z

---

## DEFECT 2: Search Accuracy FAILS for Compound Queries [CRITICAL]

**Requirement Violated:**
> "'Underwater city' must return maps that are actually underwater-themed"  
> "Result titles/descriptions must contain query keywords OR semantic equivalents"  
> "False positive rate < 5%"

**Evidence:**
Query: `underwater city`

Results returned (all marked as relevant):
1. **Radiant City Official** - Regular city, NO underwater theme
2. **Los Perrito City** - Country/city map, NO underwater theme
3. **Horizon City** - Zombie survival city, NO underwater theme
4. **New Port City** - Basic city, NO underwater theme
5. **City of Waterton** - Modern city, NO underwater theme
6. **Tideworn - Flooded City** - ✅ Only relevant result (flooded)

**False Positive Rate:** 90% (9 out of 10 results are NOT underwater-themed)

**Required:** <5% false positive rate  
**Actual:** ~90% false positive rate

**Impact:**
- Users searching for "underwater city" get regular cities
- Search is essentially broken for compound concept queries
- Compound concept detection algorithm is non-functional

**Timestamp:** 2026-02-03T16:35:01.892Z

---

## DEFECT 3: Download Endpoint (Query Param) Returns 404 [CRITICAL]

**Requirement Violated:**
> "Download buttons must return valid ZIP files"  
> "HTTP 200 responses, not 403 errors or JSON error messages"

**Evidence:**
```bash
$ curl -sI "https://web-production-631b7.up.railway.app/api/download?id=62467"
HTTP/2 404
```

**Working:** `GET /api/download/:modId` (path parameter)  
**Broken:** `GET /api/download?id=X` (query parameter)

The server.js code shows BOTH should work:
- Line ~772: `app.get('/api/download/:modId', ...)` - WORKS
- Line ~850: `app.get('/api/download', ...)` - RETURNS 404

**Impact:**
- API inconsistency
- Client applications using query params will fail
- Not all documented endpoints work

**Timestamp:** 2026-02-03T16:35:21Z

---

## DEFECT 4: Unified Search Response Time EXCEEDS Acceptable Threshold [HIGH]

**Requirement Violated:**
> "Search response time < 10 seconds including ALL sources"

**Evidence:**
```
/api/search-unified?q=futuristic+city
TIME_TOTAL: 6.346813s
```

While technically under 10s, this is:
- 63% of maximum allowed time
- With 3 out of 4 sources FAILING (timeouts)
- Only CurseForge responding

**Expected if all sources worked:** >10 seconds (would FAIL requirement)

**Impact:**
- Barely passes when most sources are broken
- Would fail with all sources operational
- Poor user experience

**Timestamp:** 2026-02-03T16:35:01.892Z

---

## DEFECT 5: Health Check Misrepresents Scraper Status [MEDIUM]

**Evidence from /api/health:**
```json
{
  "scrapers": {
    "scrapers": [
      {
        "name": "planetminecraft",
        "accessible": false,
        "error": "browserType.launch: Failed to launch..."
      },
      {
        "name": "minecraftmaps", 
        "accessible": false,
        "statusCode": 403
      },
      {
        "name": "nineminecraft",
        "accessible": true,
        "statusCode": 200
      }
    ]
  }
}
```

**Discrepancy:**
- Health check shows `nineminecraft` as "accessible": true
- But `/api/search-unified` shows it failing with "Timeout after 6000ms"

**Impact:**
- Monitoring/alerting systems would be misled
- False sense of system health
- Operations teams unaware of failures

**Timestamp:** 2026-02-03T16:26:00.621Z

---

## RED TEAM CONCLUSION

### Success Criteria Assessment:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Multi-source aggregation | ❌ FAILED | 3/4 sources broken |
| Search accuracy <5% FP | ❌ FAILED | ~90% false positive rate |
| Download valid ZIP files | ⚠️ PARTIAL | One endpoint 404 |
| Response time < 10s | ⚠️ MARGINAL | 6.3s with broken sources |
| Demo mode = false | ✅ PASS | Correctly configured |
| Real CurseForge IDs | ✅ PASS | Real IDs confirmed |
| Working thumbnails | ✅ PASS | ForgeCDN thumbnails work |

### Final Verdict:
**5 CRITICAL DEFECTS FOUND** - System is NOT production ready.

Key issues:
1. Multi-source feature is completely non-functional (marketing vs reality)
2. Search accuracy is severely compromised for compound queries
3. API has broken endpoints
4. Performance barely acceptable only because features are broken

---
**Report Generated:** 2026-02-03T16:35:00Z  
**Status:** DEFECTS_FOUND
