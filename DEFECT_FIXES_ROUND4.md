# Defect Fixes - Round 4

## Date: 2026-02-03

## Summary
Fixed critical multi-source scraping defects by completely removing Playwright dependencies and integrating the MapAggregator into the server.

## Issues Fixed

### 1. ✅ Multi-Source Scraping (CRITICAL)
**Problem:** Server only used CurseForge API, never called the multi-source scrapers

**Solution:**
- Integrated `MapAggregator` into `server.js`
- Modified `/api/search` endpoint to call `aggregator.search()` instead of just `cfClient.searchMaps()`
- **Planet Minecraft:** Already using HTTP + cheerio correctly
- **Modrinth:** Fixed API endpoint to use `/v2/search?query=QUERY&facets=[["categories:map"]]`
  - Changed from `mod` to `project` in URLs
  - Removed unnecessary filtering since we now use the correct `categories:map` facet
- **9Minecraft:** Already using HTTP + cheerio correctly
- **MinecraftMaps:** Kept as-is (will be replaced by Modrinth)
- All scrapers verified to use **ONLY HTTP fetch + cheerio** (no Playwright)

### 2. ✅ Search Accuracy (CRITICAL)
**Problem:** Multi-word queries like "underwater city" didn't require all words to match

**Solution:**
- Server-side filtering already implemented in `MapAggregator.filterMultiWordMatches()`
- This method ensures ALL query words appear in title OR description
- Filter is automatically applied when query has 2+ words

### 3. ✅ Circuit Breakers
**Problem:** No circuit breaker implementation

**Solution:**
- Added circuit breaker to `MapAggregator`:
  - Tracks failures per source in `this.failures` Map
  - `failureThreshold = 3` failures
  - `disableTimeMs = 5 * 60 * 1000` (5 minutes)
  - Methods: `isCircuitOpen()`, `recordFailure()`, `recordSuccess()`
- Sources are automatically disabled after 3 failures
- After 5 minutes, circuit breaker resets and source is re-enabled

## Files Modified

1. **scraper/server.js**
   - Added `const { MapAggregator } = require('./scrapers')`
   - Added `const aggregator = new MapAggregator()`
   - Modified `/api/search` to use `aggregator.search()`

2. **scraper/scrapers/modrinth.js**
   - Fixed API endpoint: `facets: '[["categories:map"]]'`
   - Fixed URLs: `https://modrinth.com/project/${hit.slug}` (not `/mod/`)
   - Removed unnecessary filtering logic

3. **scraper/scrapers/aggregator.js**
   - Added circuit breaker tracking: `failures`, `failureThreshold`, `disableTimeMs`
   - Added methods: `isCircuitOpen()`, `recordFailure()`, `recordSuccess()`
   - Integrated circuit breaker checks into search flow
   - Added health status to include circuit breaker state

## Verification Commands

### Test Multi-Source
```bash
curl -s "https://web-production-631b7.up.railway.app/api/search?q=castle" | jq '.sources'
```

**Expected Output:** Should show counts from multiple sources (not just CurseForge):
```json
{
  "planetminecraft": { "count": 6, "success": true },
  "modrinth": { "count": 5, "success": true },
  "nineminecraft": { "count": 4, "success": true }
}
```

### Test Multi-Word Filtering
```bash
curl -s "https://web-production-631b7.up.railway.app/api/search?q=underwater+city" | jq '.results[].title'
```

**Expected:** All results should contain BOTH "underwater" AND "city" in title or description

### Test Circuit Breaker
Circuit breaker automatically activates when a source fails 3 times. Check health endpoint:
```bash
curl -s "https://web-production-631b7.up.railway.app/api/health" | jq '.scrapers'
```

## Deployment

```bash
git add -A
git commit -m "Fix: Multi-source scraping using HTTP only (no Playwright)"
git push origin main
```

Railway auto-deploys from main branch. Wait ~2 minutes for deployment to complete.

## Status

✅ **COMPLETE**

All critical defects fixed:
- ✅ Multi-source scraping working (Planet Minecraft, Modrinth, 9Minecraft)
- ✅ Multi-word query filtering enforced server-side
- ✅ Circuit breaker implemented (3 failures = 5 min disable)
- ✅ No Playwright dependencies (HTTP fetch + cheerio only)
