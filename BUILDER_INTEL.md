# BUILDER INTEL - Round 45

**Memory Finding:** "Fix API key configuration" - prior session found same demo mode issue
**Current Task:** Fix 5 critical defects causing demo mode operation
**Direct Application:** Check Railway environment variables and API initialization code

---

## PRIORITY 1: Fix Demo Mode (Defects 1, 2, 3, 5)

**Root Cause:** apiConfigured: false means CurseForge API initialization failed

**Check These:**
1. Railway environment variable: `CURSEFORGE_API_KEY`
   - Run: `railway variables` or check Railway dashboard
   - Verify key is set and not empty
   
2. API initialization code in `src/services/curseforge.js` or similar:
   - Check if environment variable is read correctly
   - Look for `process.env.CURSEFORGE_API_KEY`
   - Verify API client initialization doesn't silently fail
   
3. Health check endpoint code:
   - Find where `apiConfigured` flag is set
   - Verify it actually tests API connectivity (not just env var existence)

**Expected Fix:**
- If key missing: Set it in Railway
- If key present but not loaded: Fix environment variable loading
- If loaded but API fails: Check API key validity with CurseForge

---

## PRIORITY 2: Fix Multi-Source Scraping (Defect 4)

**Evidence:** ALL scrapers return 0 results

**Check These:**
1. Scraper circuit breakers might be open after errors
2. Scraper initialization might be failing silently
3. Network access from Railway might be restricted

**Files to Check:**
- `src/services/aggregator.js` - scraper loading
- Individual scraper files (modrinth.js, planetminecraft.js, etc.)
- Circuit breaker state/reset logic

**Expected Fix:**
- Reset circuit breakers or increase timeout
- Add error logging to see why scrapers fail
- Verify scrapers can make HTTP requests from Railway

---

## VERIFICATION STEPS

After fixes:
1. Deploy to Railway
2. Test health check: `curl https://web-production-9af19.up.railway.app/api/health`
   - MUST show: `"apiConfigured": true`
   - MUST show: `"demoMode": false`
   
3. Test search: `curl "https://web-production-9af19.up.railway.app/api/search?q=castle"`
   - MUST return real CurseForge IDs (6-7 digits, not 1001-1003)
   - MUST show real image URLs (not via.placeholder.com)
   - MUST show results from multiple sources (not just CurseForge)
   
4. Test download: `curl "https://web-production-9af19.up.railway.app/api/download/<real-id>"`
   - MUST return HTTP 200 or redirect
   - MUST NOT return HTTP 500 "API error: 403"

---

## RED_TEAM FOUND THESE EXACT ERRORS

```
apiConfigured: false
demoMode: true
Mock IDs: 1001, 1002, 1003
Placeholder images: via.placeholder.com
All scrapers: 0 results
Download: HTTP 500 "API error: 403"
```

**Your mission:** Make ALL of these indicators green on live deployment.

**Timestamp:** 2026-02-03T19:55:00Z
