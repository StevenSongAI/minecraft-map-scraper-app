# Multi-Source Web Scraping Implementation Task

## Objective
Extend the Minecraft Map Scraper to aggregate results from multiple sources (Planet Minecraft, MinecraftMaps.com, 9Minecraft) alongside CurseForge API results.

## Requirements (from REQUIREMENTS.txt)

### Source Coverage
- Primary: Planet Minecraft (largest after CurseForge)
- Secondary: MinecraftMaps.com, 9Minecraft
- Results unified seamlessly with CurseForge API format

### Commercial Grade Standards
- Rate limiting: 1 req/sec per source
- Handle Cloudflare protection with browser automation
- Normalize scraped data to match CurseForge format
- Source attribution required
- Deduplication across sources
- Parallel fetching with resilience (circuit breaker)
- < 10 second response time
- 95%+ valid download links

## Implementation Plan

### Phase 1: Planet Minecraft Scraper
1. Create `scrapers/planetminecraft.js` adapter
2. Use Playwright browser automation to bypass Cloudflare
3. Scrape search results page structure
4. Extract: title, author, description, download URL, thumbnail
5. Normalize to CurseForge format

### Phase 2: Additional Sources
1. Create `scrapers/minecraftmaps.js`
2. Create `scrapers/nineminecraft.js`  
3. Implement fallback handling for each

### Phase 3: Integration
1. Modify `/api/search` endpoint to aggregate all sources
2. Implement parallel fetching with rate limiting
3. Add deduplication logic
4. Add circuit breaker for failed sources
5. Add caching layer (1 hour TTL)

### Phase 4: Testing
1. Test each scraper independently
2. Test unified search endpoint
3. Verify download links work
4. Performance test < 10s response
5. Log and monitor source health

## Files to Modify
- `server.js` or search endpoint handler
- Create `scrapers/` directory with adapters
- Update `package.json` if new dependencies needed

## Deliverables
1. Working multi-source scraper
2. Unified search results
3. Source health monitoring
4. Updated progress.md with test results

DO NOT STOP until:
- Planet Minecraft scraper working
- Results unified with CurseForge
- Download links verified working
- Performance < 10 seconds
