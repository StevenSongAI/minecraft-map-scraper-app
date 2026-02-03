# RED TEAM DEFECT REPORT - Minecraft Map Scraper
**Date:** 2026-02-03  
**Live URL:** https://web-production-631b7.up.railway.app  
**Status:** DEFECTS_FOUND

---

## CRITICAL DEFECTS

### DEFECT 1: Planet Minecraft Scraper COMPLETELY BROKEN (Playwright Launch Failure)
**Severity:** CRITICAL  
**Evidence Timestamp:** 2026-02-03T16:42:08.585Z

**Expected:** Planet Minecraft scraper should be accessible and returning results from planetminecraft.com

**Actual:** Planet Minecraft scraper is failing with browser launch error:
```
"error": "browserType.launch: Failed to launch: Error: spawn 
/root/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell ENOENT"
```

**Health Check Response:**
```json
{
  "name": "planetminecraft",
  "enabled": true,
  "source": "Planet Minecraft",
  "accessible": false,
  "error": "browserType.launch: Failed to launch..."
}
```

**Impact:** ZERO results from Planet Minecraft, one of the largest Minecraft map repositories. Completely fails the "Multi-Source Web Scraping" requirement.

---

### DEFECT 2: MinecraftMaps Scraper BLOCKED (403 Forbidden)
**Severity:** CRITICAL  
**Evidence Timestamp:** 2026-02-03T16:42:08.585Z

**Expected:** MinecraftMaps scraper should return results from minecraftmaps.com

**Actual:** Receiving HTTP 403 Forbidden - blocked by Cloudflare/anti-bot protection

**Health Check Response:**
```json
{
  "name": "minecraftmaps",
  "enabled": true,
  "source": "MinecraftMaps",
  "accessible": false,
  "statusCode": 403
}
```

**Impact:** Zero results from MinecraftMaps. Combined with Planet Minecraft failure, multi-source aggregation is 66% non-functional.

---

### DEFECT 3: Multi-Source Aggregation COMPLETELY NON-FUNCTIONAL
**Severity:** CRITICAL  
**Evidence Timestamp:** 2026-02-03T16:47:59.530Z

**Requirement:** "Results from ALL sources must appear seamlessly unified with CurseForge API results"

**Actual Behavior:**
- Searched: "futuristic city with railways" → 20 results, ALL from "source": "CurseForge"
- Searched: "medieval castle" → 19 results, ALL from "source": "CurseForge"  
- Searched: "planet minecraft exclusive" → 8 results, ALL from "source": "CurseForge"
- Searched: "horror jumpscares" → 20 results, ALL from "source": "CurseForge"

**Evidence:**
```json
{
  "query": "futuristic city with railways",
  "count": 20,
  "maps": [
    {"id": 1272043, "source": "CurseForge"},
    {"id": 558131, "source": "CurseForge"},
    ... ALL 20 results show "source": "CurseForge"
  ]
}
```

**Impact:** Despite health check claiming "multiSourceEnabled": true, the app is effectively a single-source (CurseForge) application. Fails the core multi-source aggregation requirement.

---

## MAJOR DEFECTS

### DEFECT 4: Search Accuracy - "Underwater City" Returns Generic City Results
**Severity:** MAJOR  
**Evidence Timestamp:** 2026-02-03T16:48:08.107Z

**Requirement:** "Underwater city must return maps that are actually underwater-themed"

**Search Query:** "underwater city"

**Expected Results:** Maps with actual underwater themes, coral reefs, submarine bases, Atlantis-style builds

**Actual Results (Top 5):**
1. "Water City" - Generic city map (NOT underwater)
2. "Radiant City Official" - Generic city with METRO 
3. "Los Perrito City" - Generic country/city map
4. "Horizon City" - Zombie survival city
5. "New Port City" - Basic city map

**Only water-related result:** "Tideworn - 8 sqkm Forgotten Flooded City" (#12 in results)

**Accuracy Rating:** ~5% - Nearly all results are false positives for "underwater"

---

### DEFECT 5: Missing API Endpoints
**Severity:** MAJOR  
**Evidence Timestamp:** 2026-02-03T16:48:50.499Z

**Issue:** `/api/scrapers/status` returns 404 Not Found

**Expected:** Consistent API endpoints for monitoring scraper health

**Actual:**  
- `/api/health` works and includes scraper status  
- `/api/scrapers/status` returns 404

This inconsistency indicates incomplete API implementation.

---

## MINOR DEFECTS

### DEFECT 6: Search Results Lack Diverse Keywords (False Semantic Match)
**Severity:** MINOR  
**Evidence Timestamp:** 2026-02-03T16:48:00.436Z

**Issue:** Search "medieval castle" correctly finds castle maps, but many high-ranking results have weak semantic relevance:

- "Greek City" (relevance: 106.15) - not a castle
- "Japanese City [Castle Edo]" (relevance: 20.99) - castle mentioned but ranked low
- "Castle Rushers" (relevance: 198.36) - game map, not a build

The relevance scoring algorithm appears inconsistent.

---

## SUMMARY

| Defect | Severity | Status |
|--------|----------|--------|
| Planet Minecraft scraper broken | CRITICAL | FAIL |
| MinecraftMaps scraper blocked | CRITICAL | FAIL |
| Multi-source aggregation non-functional | CRITICAL | FAIL |
| "Underwater city" search inaccurate | MAJOR | FAIL |
| Missing API endpoints | MAJOR | FAIL |
| Relevance scoring inconsistent | MINOR | FAIL |

## VERDICT

**DEFECTS_FOUND: 6 defects identified (3 Critical, 2 Major, 1 Minor)**

The application:
- ❌ FAILS multi-source aggregation requirements (only 1 of 3 sources working)
- ❌ FAILS search accuracy for semantic queries
- ✅ PASSES basic CurseForge API integration
- ✅ PASSES download functionality (ZIP files work)
- ✅ PASSES thumbnail loading
- ✅ PASSES response time (< 10 seconds)

**Recommendation:** Fix Playwright browser installation on Railway deployment and resolve MinecraftMaps 403 blocking before claiming multi-source support.
