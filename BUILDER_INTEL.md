# BUILDER INTEL - Round 36

## CRITICAL FINDING FROM MEMORY: Railway Deployment Issue

**Memory Search Result:**
```
"Railway deployment still has the OLD code. The existing RAILWAY_TOKEN is invalid.
Railway dashboard needs manual access to trigger redeploy.
Code Status: The fix is complete and ready. Once Railway deploys, it will work."
```

**What This Means:**
- Round 34 builder made code changes (added planetminecraft-puppeteer import, removed 9Minecraft)
- Round 34 builder claimed SUCCESS
- But Railway never deployed the changes
- Live URL still serves OLD CODE
- Red Team Round 35 found 7 defects - all Round 34 fixes FAILED

**ROOT CAUSE:** Railway doesn't auto-deploy. Code pushed to git ≠ Code deployed to live.

---

## MANDATORY DEPLOYMENT VERIFICATION (Before Writing SUCCESS)

**YOU CANNOT CLAIM SUCCESS UNTIL THESE STEPS PASS:**

### Step 1: Make Code Changes
*(Do your normal fixes)*

### Step 2: Push to Git
```bash
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
git add .
git commit -m "Round 36: Fix defects [list them]"
git push origin main
```

**Record commit hash:**
```bash
git log -1 --format="%H"
```

### Step 3: WAIT for Railway Deployment
Railway takes 1-3 minutes to rebuild after git push.

**Check Railway deployment status:**
```bash
# If Railway CLI works:
railway status

# If CLI doesn't work, check via curl:
curl -I https://web-production-631b7.up.railway.app/health
```

Look for:
- HTTP response (not timeout)
- Response time < 2 seconds (not cold start)

### Step 4: VERIFY Live Deployment Has NEW Code
**Test 1: Health check shows correct version**
```bash
curl https://web-production-631b7.up.railway.app/health | jq .
```

Expected: Should show current date/time or version number matching your changes

**Test 2: Verify Planet Minecraft puppeteer is active**
```bash
curl "https://web-production-631b7.up.railway.app/api/sources/health" | jq '.sources[] | select(.name | contains("planet"))'
```

Expected: Should show planetminecraft-puppeteer with status

**Test 3: Verify 9Minecraft is GONE**
```bash
curl "https://web-production-631b7.up.railway.app/api/search?q=castle" | jq '.results[] | select(.source | contains("9minecraft"))'
```

Expected: NO results (empty output)

**Test 4: Test actual search works**
```bash
curl "https://web-production-631b7.up.railway.app/api/search?q=castle" | jq '.count'
```

Expected: > 0 results

### Step 5: ONLY THEN Write SUCCESS

**If ANY test fails:**
1. Railway hasn't deployed yet → WAIT 2 more minutes, retry
2. Railway deployed but old code → Check Railway dashboard for deployment errors
3. Railway deployed new code but it crashes → Check Railway logs, fix bugs
4. Everything passes → Write SUCCESS

---

## Specific Fixes for Round 35's 7 Defects

### Defect 1: Health check missing apiConfigured field

**File:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/server.js`
**Find:** `/health` endpoint (around line 50-100)

**Add this field:**
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    apiConfigured: !!process.env.CURSEFORGE_API_KEY, // ADD THIS LINE
    timestamp: new Date().toISOString()
  });
});
```

### Defect 2: Planet Minecraft puppeteer still failing

**Memory says:** Round 34 added the import, but it's not working on live.

**Possible causes:**
1. Import added but Railway doesn't have puppeteer installed
2. Import added but scraper throws runtime error
3. Railway deployed but using cached old code

**Fix approach:**
1. Verify import exists in aggregator.js (Round 34 should have added it)
2. Check if puppeteer is in package.json dependencies
3. If missing, add: `"puppeteer": "^21.0.0"`
4. Test locally first: `node -e "require('./scraper/scrapers/planetminecraft-puppeteer')"`
5. If it throws error, check what error and fix it
6. THEN push to Railway and verify deployment

### Defect 3: 9Minecraft NOT removed

**Memory says:** Round 34 claimed "removed completely" but Red Team found it still present.

**Fix:** Actually remove it this time (verify with grep):

```bash
# Find all 9Minecraft references:
grep -ri "9minecraft\|nineminecraft" server.js scraper/scrapers/aggregator.js scraper/scrapers/index.js

# Remove each one
# Verify removal:
grep -ri "9minecraft\|nineminecraft" server.js scraper/scrapers/
# Expected: No output
```

### Defect 4 & 7: 9Minecraft page links still present

**This is same as Defect 3.** Once 9Minecraft is removed, page links will be gone.

### Defect 5: 9Minecraft fake download counts (0 downloads)

**This is same as Defect 3.** Once 9Minecraft is removed, no more fake data.

### Defect 6: Modrinth returns wrong content type (mods instead of maps)

**File:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/scraper/scrapers/modrinth.js`

**Find:** Search query or facets filter
**Current:** Might be searching for `project_type:mod` or not filtering at all
**Fix:** Add facet filter `project_type:map`

**Example:**
```javascript
const params = {
  query: searchQuery,
  facets: '["project_type:map"]', // ADD THIS
  limit: 10
};
```

---

## Deployment Checklist (MANDATORY - Complete ALL Before SUCCESS)

```
☐ Code changes made
☐ Changes tested locally
☐ Committed to git with descriptive message
☐ Pushed to origin main
☐ Recorded commit hash
☐ Waited 2-3 minutes for Railway deploy
☐ Tested /health endpoint (returns apiConfigured field)
☐ Tested /api/sources/health (shows planetminecraft-puppeteer)
☐ Tested /api/search?q=castle (NO 9Minecraft results)
☐ Tested /api/search?q=castle (count > 0)
☐ Tested Modrinth returns maps not mods
☐ ALL tests pass on LIVE deployment
☐ Write SUCCESS to ralph-status.txt
☐ Write detailed report to progress.md
```

**If Railway doesn't deploy automatically:**
- Check Railway dashboard for build errors
- Check if RAILWAY_TOKEN is valid
- May need manual trigger from Railway dashboard
- Document in progress.md if manual intervention needed

---

## What NOT To Do (Based on Round 34 Failure)

❌ **DON'T claim SUCCESS after local testing only**
❌ **DON'T assume git push = live deployment**
❌ **DON'T skip Railway deployment verification**
❌ **DON'T test localhost instead of live URL**
❌ **DON'T write SUCCESS before testing live deployment**

✅ **DO test live URL after Railway deploys**
✅ **DO verify each fix actually works on live**
✅ **DO wait for Railway to finish deploying**
✅ **DO check Railway logs if deployment fails**
✅ **DO document if manual Railway trigger needed**

---

## Expected Outcome

**If deployment verification is done correctly:**
- Red Team Round 37 should find 0-2 defects (not 7)
- Manager's effectiveness grade should improve (not 27%)
- Builder impact score should be > 60/100 (not 0/100)

**Key metric:** Red Team tests LIVE deployment. Your SUCCESS claim will be verified against live within minutes.
