# BUILDER INTEL - Round 58

**Memory Finding:** Planet Minecraft blocked by Cloudflare from Railway deployments

**Current Task:** Add Chromium to Dockerfile for Puppeteer browser scraping

**Direct Application:** 

**Dockerfile Change (CORRECT APPROACH):**
```dockerfile
# Use node:18-slim (NOT alpine - apt-get needed)
FROM node:18-slim

# Install Chromium + dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    [... all dependencies ...]

# Point Puppeteer to system Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

**File Path:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/Dockerfile`

**Testing After Deploy:**
```bash
# Test Planet Minecraft with Puppeteer
curl "https://web-production-631b7.up.railway.app/api/search?query=parkour&source=planetminecraft"

# Check scraper health
curl "https://web-production-631b7.up.railway.app/api/sources/health" | jq '.sources.planetminecraft'
```

**Expected Result:**
- Planet Minecraft status changes from "unavailable" to "healthy"
- Search returns real results (not 0)
- Puppeteer launches successfully in Railway container

**Next Steps After Dockerfile:**
1. Test locally with `docker build -t test .`
2. Git commit + push to trigger Railway deploy
3. Wait 2-3 minutes for deployment
4. Test live endpoint
5. Check if Cloudflare is bypassed with proper browser headers

**Timestamp:** 2026-02-03T23:02:30-05:00

---

## TESTING PHASE UPDATE - 2026-02-03T23:33:30-05:00

**Current Activity:** BUILDER is testing deployed Railway app

**Key Testing Commands:**
```bash
# 1. Check search results count
curl -s 'https://web-production-9af19.up.railway.app/api/search?q=puzzle&limit=20' | jq '.count'

# 2. Check which sources returned results
curl -s 'https://web-production-9af19.up.railway.app/api/search?q=puzzle&limit=20' | jq '.sources'

# 3. Verify health status
curl -s 'https://web-production-9af19.up.railway.app/api/sources/health' | jq
```

**Success Criteria:**
- Search returns 5+ results total
- At least 2 sources working (CurseForge + one other)
- Response time < 10 seconds
- Download links present in results

**Common Issues:**
- If count is 0: Check if sources are actually being queried
- If timeout: Railway container may be cold-starting (retry)
- If Puppeteer fails: Check Chromium installation in container logs

**Railway App URL:** https://web-production-9af19.up.railway.app (note: different from previous 631b7 URL)

**Next:** After verifying tests pass, write SUCCESS to ralph-status.txt
