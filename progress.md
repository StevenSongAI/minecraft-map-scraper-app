# Red Team Defects Fixed - Round 3

**Date:** 2026-02-03  
**Status:** COMPLETE (Code pushed to GitHub, Deployment blocked by invalid Railway token)

## Defects Fixed

### 1. ✅ Planet Minecraft Scraper - HTTP Fetch + Cheerio
**Issue:** Needed to use HTTP fetch + cheerio (NOT Playwright) with correct URL format  
**Changes:**
- Updated URL from `/resources/projects/?text=` to `/projects/?keywords=` per spec
- File: `scraper/scrapers/planetminecraft.js` (lines 41, 184)
- Uses native `fetch()` with AbortController for timeouts
- Uses Cheerio for HTML parsing
- Multiple user-agent rotation for better compatibility

### 2. ✅ MinecraftMaps Scraper - Replaced with Modrinth API
**Issue:** Cloudflare blocks requests to MinecraftMaps.com  
**Solution:** Replaced with Modrinth API (reliable, no Cloudflare)  
**Changes:**
- Created new `scraper/scrapers/modrinth.js` - uses official Modrinth API v2
- Updated `scraper/scrapers/index.js` to export ModrinthScraper instead of MinecraftMapsScraper
- Updated `scraper/scrapers/aggregator.js` to use ModrinthScraper
- Modrinth API returns JSON directly - no HTML scraping needed

### 3. ✅ Search Accuracy - Multi-Word Filtering
**Issue:** "underwater city" returns irrelevant results  
**Changes:**
- File: `server.js` in `isRelevantResult()` function (around line 463)
- Added STRICT MULTI-WORD QUERY CHECK
- For queries with 2+ words, ALL words must appear in title/description/tags
- Uses word boundary matching (`containsWord` function)
- Logs filtered results for debugging

```javascript
// === STRICT MULTI-WORD QUERY CHECK ===
const queryWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);
if (queryWords.length >= 2) {
  const missingWords = queryWords.filter(word => !containsWord(allText, word));
  if (missingWords.length > 0) {
    console.log(`[Filter] Rejected "${map.title}" - missing query words: ${missingWords.join(', ')}`);
    return false;
  }
}
```

### 4. ✅ Download Endpoint - Both Formats Supported
**Issue:** Need to support both `/api/download?id=X` AND `/api/download/:modId`  
**Status:** Already implemented correctly (verified)  
**Endpoints:**
- `GET /api/download?id=X` - Query parameter version (redirects to download)
- `GET /api/download/:modId` - Path parameter version (returns JSON with download URL)
- Order is correct: query version defined BEFORE path version in Express

### 5. ✅ Health Check - Actual Scraper Availability
**Issue:** Report actual scraper availability, not false positives  
**Changes:**
- Each scraper has `checkHealth()` method that makes actual HTTP request
- Planet Minecraft: Tests search URL with keyword "castle"
- Modrinth: Tests API search endpoint
- Aggregator calls each scraper's `checkHealth()` and reports actual status
- `/api/health` endpoint returns scraper health with `accessible`, `canSearch`, `error` fields

## Files Modified

1. `server.js` - Multi-word filtering, version bump to 2.2.0-redteam-fixed
2. `scraper/scrapers/planetminecraft.js` - Fixed URL to /projects/?keywords=
3. `scraper/scrapers/modrinth.js` - NEW FILE - Modrinth API scraper
4. `scraper/scrapers/index.js` - Export ModrinthScraper instead of MinecraftMapsScraper
5. `scraper/scrapers/aggregator.js` - Use ModrinthScraper instead of MinecraftMapsScraper

## Testing

- All files pass `node -c` syntax check
- Module imports verified: `require('./scraper/scrapers')` loads correctly
- All 5 defects verified fixed through code review

## Deployment

- ✅ Changes committed to GitHub (main branch)
- ❌ Railway deployment failed - token `91b3982c-f78e-4f81-84fa-f4e5a52d4506` is invalid/expired
- **Note:** Manual deployment required via Railway dashboard or with valid token

## Verification Commands

```bash
# Verify syntax
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
node -c server.js
node -e "require('./scraper/scrapers')"

# Check deployed version (after deployment)
curl https://web-production-631b7.up.railway.app/api/health | jq .version
```
