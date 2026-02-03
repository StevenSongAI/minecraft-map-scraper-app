# QA Protocol - Minecraft Map Scraper
## Start Time: 2026-02-03 08:46 EST

### Phase 1: Health Check
- [ ] Test Railway deployment is live
- [ ] Verify CURSEFORGE_API_KEY is configured
- [ ] Check health endpoint returns apiConfigured: true

### Phase 2: Search Functionality (1000+ keywords)
Categories to test:
- [ ] Environment: underwater, ocean, sea, atlantis, nether, hell, sky, cave
- [ ] Theme: medieval, fantasy, modern, futuristic, steampunk, horror
- [ ] Structure: castle, city, village, dungeon, temple, fortress
- [ ] Game Mode: survival, creative, pvp, parkour, puzzle
- [ ] Word boundaries: stray/stranded, cat/category, net/nether

### Phase 3: Download Verification
- [ ] Download 10 random maps
- [ ] Verify ZIP files contain level.dat
- [ ] Verify file size > 1KB
- [ ] Verify HTTP 200 responses

### Phase 4: Accuracy Metrics
- [ ] False positive rate calculation
- [ ] Semantic matching verification
- [ ] Thumbnail loading check

### Success Criteria (from REQUIREMENTS.txt)
- All searches return live API data (not mock IDs)
- False positive rate < 5%
- All downloads return valid ZIP files
- Response time < 10 seconds
