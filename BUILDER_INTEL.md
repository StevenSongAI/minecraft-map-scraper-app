# BUILDER INTEL - Round 11 Defect Fixes

## Defects to Fix (from Red Team Round 10)

### 1. Planet Minecraft - Cloudflare Blocked ⚠️ ACCEPTABLE
**Status:** Cannot fix without browser automation (Playwright)
**Action:** Document as known limitation in REQUIREMENTS

### 2. 9Minecraft Downloads - Indirect Links
**Issue:** `downloadType: "page"` instead of `"direct"`
**Fix:** Implement direct download URL extraction from 9Minecraft HTML
- Parse the download page HTML
- Extract actual ZIP file URL from download button/link

### 3. MODS vs MAPS - Content Filtering (CRITICAL)
**Issue:** 62.5% false positive rate - returning .jar mods and .mrpack files
**Fix:** Aggressive filtering in aggregator.js
```javascript
// EXCLUDE if file extension is:
// .jar (mods)
// .mrpack (modpacks)
// .zip but contains mod-related keywords

// EXCLUDE if title/description contains:
// "mod", "modpack", "plugin", "addon", "forge", "fabric"
// AND does NOT contain map keywords
```

### 4. Modrinth HTTP 400 Downloads
**Issue:** Download endpoint fails
**Fix:** Check Modrinth API endpoint format
- Current: May be using wrong URL pattern
- Correct: `https://api.modrinth.com/v2/version/{version_id}`
- Extract `files[0].url` from version response

### 5. Empty Thumbnails
**Issue:** 9Minecraft results have `"thumbnail":""`
**Fix:** Check if 9Minecraft scraper extracts thumbnail URL from:
- `<img class="attachment-post-thumbnail">`
- First image in post content

## Deployment Checklist
- [ ] Commit changes
- [ ] Push to GitHub main
- [ ] Verify Railway deploys
- [ ] Test live URL before writing SUCCESS

## Railway Token (Active)
`b338858f-9662-4566-ad83-786802091763`
Stored in: `.railway-token`
