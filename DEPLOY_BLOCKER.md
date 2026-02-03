# ⚠️ DEPLOYMENT BLOCKER - MUST READ FIRST

## Current Status
**CODE READY BUT NOT DEPLOYED**

The following files have been modified locally but NOT committed to git:
```
M scraper/scrapers/aggregator.js
M scraper/scrapers/modrinth.js
M scraper/scrapers/nineminecraft.js
```

**This means:** The live Railway deployment does NOT have any of the Round 10 fixes.

## Required Actions (In Order)

### 1. Commit Changes
```bash
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
git add scraper/scrapers/aggregator.js scraper/scrapers/modrinth.js scraper/scrapers/nineminecraft.js
git commit -m "Round 10: Fix Modrinth timeouts, content filtering, multi-word queries"
```

### 2. Push to Deploy
```bash
git push origin main
# Railway will auto-deploy in ~2 minutes via GitHub integration
```

### 3. Verify Deployment
```bash
# Wait 2 minutes, then test:
curl "https://web-production-631b7.up.railway.app/api/health"
# Check deployTimestamp - should be recent (within last few minutes)
```

## Railway Token (If Needed)
If git push fails or you need Railway CLI:
- Token: `b338858f-9662-4566-ad83-786802091763`
- Stored in: `/Users/stevenai/clawd/projects/minecraft-map-scraper/.railway-token`
- Usage: `export RAILWAY_TOKEN=$(cat .railway-token) && railway up --detach`

## Why This Matters
**Red Team tests the LIVE deployment only.** If the code isn't deployed, Red Team will find the same defects again, creating an infinite loop.

**DO NOT WRITE SUCCESS UNTIL:**
1. Code is committed ✓
2. Code is pushed to GitHub ✓
3. Railway deployment completes ✓
4. Live API reflects your changes ✓
