# BUILDER INTEL - Round 44: Fix RED TEAM Defects

## Current Status
- **ralph-status.txt:** DEFECTS_FOUND (5 defects from RED_TEAM)
- **Live URL:** https://web-production-631b7.up.railway.app
- **Deployment Status:** OLD code still live (Round 12), git push deployed commit 388050c but not reflected yet

## Defects to Fix (Priority Order)

### DEFECT 1 (CRITICAL): Planet Minecraft Blocked by Cloudflare
**Issue:** HTTP 403 Forbidden - Cloudflare bot protection
**Location:** `scraper/scrapers/planetminecraft.js`
**Solution:** Already implemented puppeteer-extra with stealth plugin in git, needs deployment
**Verification:** Check if deployed code includes stealth plugin imports

### DEFECT 2-3 (HIGH): No Direct Downloads for 9Minecraft/Modrinth
**Issue:** downloadType:"page" instead of direct ZIP links
**Locations:** 
- `scraper/scrapers/nineminecraft.js`
- `scraper/scrapers/modrinth.js`
**Solution:** Parse download pages to extract direct file URLs
**Note:** CurseForge already works correctly with direct downloads

### DEFECT 4 (MEDIUM): Search Returns MODS not MAPS
**Issue:** Semantic accuracy - "underwater city" returns "Atlantis Mod"
**Location:** Scraper query filters
**Solution:** Add content-type filters or post-filter results to exclude mods

### DEFECT 5 (MEDIUM): Missing Thumbnails
**Issue:** Some scraped results have empty thumbnail URLs
**Location:** Result normalization in scrapers
**Solution:** Add fallback thumbnail or exclude results without images

## Deployment Situation

**User Setup (CONFIRMED):**
- ✅ Railway account created and upgraded to paid
- ✅ GitHub connected to Railway
- ✅ Token provided: a9c5dd4a-b333-400e-bc99-c24f0cc91c3d
- ✅ Token stored in .railway-token
- ✅ GitHub secret RAILWAY_TOKEN updated
- ✅ Git push completed (commit 388050c)

**Observation:** Railway CLI returns "Invalid token" but user says setup is complete. Auto-deploy via GitHub should work.

**Next Steps:**
1. Verify GitHub Actions workflow exists and is configured
2. If workflow missing, create .github/workflows/deploy.yml
3. Check Railway dashboard for deployment logs
4. If auto-deploy isn't working, use Railway dashboard manual redeploy

## File Paths
- Scrapers: `/Users/stevenai/clawd/projects/minecraft-map-scraper/scraper/scrapers/`
- Workflow: `/Users/stevenai/clawd/projects/minecraft-map-scraper/.github/workflows/deploy.yml`
- Config: `/Users/stevenai/clawd/projects/minecraft-map-scraper/railway.json`

## Success Criteria
1. Live deployment shows new code (check /api/health version field)
2. Planet Minecraft returns results (no 403 errors)
3. Direct download links available for all sources
4. Search filters out mods (only returns maps)
5. All results have thumbnail images

## Memory Insights
From MEMORY.md: "When user says 'I already did X', believe them and investigate what I'm doing wrong"
- User confirmed setup is complete
- Focus on deployment mechanism, not token validity
- Git push auto-deploy documented as working method
