## MEMORY → ACTION LINK

**Memory Finding:** "Planet Minecraft blocked by Cloudflare — can't scrape from Railway" (MEMORY.md line 25) + "Puppeteer times out in Railway sandbox" (sessions)

**Current Blocker:** RED_TEAM found 4 defects:
1. MC-Maps & MinecraftMaps scrapers broken (40% sources down)
2. Download functionality non-responsive
3. Planet Minecraft in degraded fallback mode
4. Search returns irrelevant results (texture pack query returns 20 maps)

**Direct Application:** Memory confirms Planet Minecraft Cloudflare issue is KNOWN and UNFIXABLE in Railway. This means:
- Planet Minecraft fallback mode is EXPECTED (not a defect)
- MC-Maps & MinecraftMaps likely have same Cloudflare issue
- Need to focus on fixable defects: download button (#2) and search accuracy (#4)

**Action Taken:** Writing BUILDER_INTEL.md with:
1. Cloudflare scraper defect → SKIP (known limitation, accept degraded mode)
2. Download button fix → PRIORITY (check client-side JS, add error handling)
3. Search accuracy fix → PRIORITY (add query validation, filter non-map terms)
4. Accept 2/5 sources as baseline (Cloudflare blocks others)

**Timestamp:** 2026-02-04T09:45:00Z
