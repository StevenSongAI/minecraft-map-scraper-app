# BUILDER INTEL - Round 54

**Updated:** 2026-02-03T22:10:00-05:00

## CRITICAL FINDING (from BUILDER Round 53)

**Problem:** Planet Minecraft scraper using Puppeteer locally, failing with "frame was detached" error. HTTP fallback not triggering.

**Root Cause:** Error handling in planetminecraft-puppeteer.js only triggers fallback on errors containing 'browser', 'Target', 'executable', 'Chrome', or 'Chromium'. "Frame was detached" errors don't match these patterns.

**Location:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/scraper/scrapers/planetminecraft-puppeteer.js` (line ~180-210)

---

## MEMORY-BASED SOLUTION

**Prior Builder Success (from memory):**
- Created `planetminecraft_simple.js` - HTTP-based scraper without Playwright
- Updated aggregator to gracefully handle missing Playwright
- Falls back to simple scraper automatically

**Your Task:**
1. **Check if HTTP-only scraper exists** (might be named `planetminecraft_simple.js` or similar)
2. **If it exists:** Update `planetminecraft.js` to export the HTTP version
3. **If it doesn't exist:** Fix the fallback logic to include "frame" / "detached" errors

---

## FIX OPTION 1: Update Fallback Logic (Fastest)

**File:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/scraper/scrapers/planetminecraft-puppeteer.js`

**Find this code (line ~180-210):**
```javascript
if (
  err.message.includes('browser') ||
  err.message.includes('Target') ||
  err.message.includes('executable') ||
  err.message.includes('Chrome') ||
  err.message.includes('Chromium')
) {
  // Fallback to HTTP mode
```

**Change to:**
```javascript
if (
  err.message.includes('browser') ||
  err.message.includes('Target') ||
  err.message.includes('executable') ||
  err.message.includes('Chrome') ||
  err.message.includes('Chromium') ||
  err.message.includes('frame') ||           // NEW: Catch frame detachment
  err.message.includes('detached') ||        // NEW: Catch frame detachment
  err.message.includes('Navigation failed')  // NEW: Catch navigation failures
) {
  // Fallback to HTTP mode
```

---

## FIX OPTION 2: HTTP-Only Scraper (More Reliable)

**If Option 1 doesn't work, create HTTP-only version:**

1. **Check for existing HTTP scraper:**
   ```bash
   ls scraper/scrapers/planetminecraft*.js
   ```

2. **If found, update planetminecraft.js:**
   ```javascript
   const PlanetMinecraftHTTPScraper = require('./planetminecraft_simple');
   module.exports = PlanetMinecraftHTTPScraper;
   ```

3. **If not found, extract HTTP fallback code from planetminecraft-puppeteer.js**
   - The file already has `searchWithHTTPFallback` method
   - Create standalone HTTP-only scraper that uses this method

---

## Testing Process

**Local test:**
```bash
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
node -e "
const PlanetMinecraft = require('./scraper/scrapers/planetminecraft');
const scraper = new PlanetMinecraft({ requestTimeout: 15000 });
(async () => {
  const results = await scraper.search('castle', { limit: 3 });
  console.log('Results:', results.length);
  if (results.length > 0) console.log('First:', results[0].title);
  await scraper.closeBrowser();
})();
"
```

**Expected:** Returns 3+ results, no "frame was detached" error

**Deploy:**
```bash
git add .
git commit -m "Fix Planet Minecraft Puppeteer fallback logic"
git push origin main
```

**Wait ~2 min for Railway auto-deploy, then test:**
```bash
curl "https://web-production-631b7.up.railway.app/api/search?q=castle&limit=4"
```

**Success criteria:** Returns results from Planet Minecraft (not just CurseForge)

---

## Priority

**Highest:** Fix Option 1 (add fallback error patterns) - fastest, least code change

**If Option 1 fails:** Try Option 2 (HTTP-only scraper)

**Timestamp:** 2026-02-03T22:10:00-05:00
