# BUILDER INTEL - Round 13 Fixes

**Status:** DEFECTS_FOUND (5 defects from Red Team Round 14)  
**Timestamp:** 2026-02-03 14:26 EST  
**Live URL:** https://web-production-631b7.up.railway.app

## Critical Defects to Fix

### DEFECT 1: MODS RETURNED AS MAPS (CRITICAL)
**Problem:** Modrinth returns mods like "Dungeon Now Loading" (adds dungeons) when searching for dungeon maps

**Fix Location:** `scraper/scrapers/modrinth.js`

**Solution:** Filter by project type. Modrinth API supports:
- `project_type=mod` - exclude these
- `project_type=resourcepack` - exclude these  
- `project_type=datapack` - check if it's actually a map datapack
- `project_type=modpack` - exclude these

**Code Change:**
```javascript
// In searchMaps() function, add to API query:
const params = new URLSearchParams({
  query: query,
  facets: JSON.stringify([
    ["project_type:resourcepack"],  // Only return resourcepacks (maps are often resourcepacks on Modrinth)
  ]),
  limit: limit
});
```

**Alternative:** Check the `project_type` field in results and filter out `mod` and `modpack` types.

---

### DEFECT 2: MODPACKS RETURNED AS MAPS (CRITICAL)
**Problem:** Modpacks like "Hell To Earth" returned as map results

**Fix:** Same as Defect 1 - filter out `project_type:modpack`

---

### DEFECT 3: PLANET MINECRAFT BROKEN (HIGH)
**Problem:** Cloudflare 403 blocking Planet Minecraft scraper

**Analysis:** This is a known limitation. Planet Minecraft uses Cloudflare bot protection.

**Options:**
1. **Try with browser automation** (puppeteer/playwright) - complex
2. **Use alternative sources** - Add more scrapers (MinecraftMaps.com, MC-Maps.com)
3. **Accept limitation** - Document that Planet Minecraft is blocked by Cloudflare

**Recommended:** Focus on fixing Modrinth filtering first (Defects 1-2). Planet Minecraft being blocked is a known infrastructure limitation, not a code bug.

---

### DEFECT 4: 9MINECRAFT NO DIRECT DOWNLOADS (MEDIUM)
**Problem:** 9Minecraft results require visiting their page (downloadType: "page")

**Analysis:** 9Minecraft's site structure doesn't expose direct download URLs via scraping. This is by design on their end.

**Options:**
1. **Keep as-is** - Document that 9Minecraft requires manual navigation
2. **Remove 9Minecraft** - If it can't provide direct downloads, consider deprecating
3. **Implement page scraping** - Parse the 9Minecraft page HTML for actual download links

**Recommended:** Option 1 for now. The site works, just requires an extra click.

---

### DEFECT 5: INCORRECT CATEGORIES (MEDIUM)
**Problem:** Mods showing in wrong categories

**Fix:** Same root cause as Defect 1. Once you filter by project_type, categories will be correct.

---

## Priority Order
1. **CRITICAL:** Fix Defect 1 (Modrinth project_type filtering) - this also fixes Defect 2 and 5
2. **HIGH:** Evaluate Planet Minecraft alternatives
3. **MEDIUM:** Document 9Minecraft limitation or remove source

## Verification Commands
```bash
# Test dungeon search (should NOT return mods)
curl "https://web-production-631b7.up.railway.app/api/search?q=dungeon&limit=10"

# Test horror search (should NOT return modpacks)
curl "https://web-production-631b7.up.railway.app/api/search?q=horror&limit=10"

# Check sources health
curl "https://web-production-631b7.up.railway.app/api/sources/health"
```

## Key Insight
The core issue is Modrinth's project_type filtering. Once fixed, 3 of 5 defects resolve automatically.
