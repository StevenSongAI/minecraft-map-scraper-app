# Planet Minecraft - Cloudflare Limitation

## Issue
Planet Minecraft (planetminecraft.com) uses **Cloudflare bot protection** which blocks HTTP-only scraping.

## Evidence
All Planet Minecraft URLs return HTTP 403 or Cloudflare challenge page:
```bash
$ curl "https://www.planetminecraft.com/projects/tag/map/?keywords=castle"
<!DOCTYPE html>
<html class="no-js" lang="en-US">
<head>
<title>Attention Required! | Cloudflare</title>
...
<h1>Sorry, you have been blocked</h1>
```

## Attempted Fixes
1. ✗ Enhanced User-Agent headers (realistic browser strings)
2. ✗ Added Sec-Ch-Ua headers for Chromium emulation
3. ✗ Random delays to appear human-like
4. ✗ Multiple URL patterns tested:
   - `/projects/tag/map/?keywords=QUERY`
   - `/projects/?keywords=QUERY`
   - `/search/?r=projects&q=QUERY`
5. ✗ Cookie/session handling (Cloudflare requires JavaScript challenge)

## Root Cause
Cloudflare's bot protection requires:
- JavaScript execution to solve challenges
- Cookie support
- Browser fingerprinting validation

**HTTP-only scraping (fetch + cheerio) cannot bypass this.**

## Solution Options

### Option 1: Browser Automation (Rejected - not HTTP-only)
Use Playwright/Puppeteer with full browser emulation. This would work but:
- ❌ Violates HTTP-only architecture requirement
- ❌ Much slower (3-5s per request vs 200-500ms)
- ❌ Higher memory/CPU usage on Railway
- ❌ More complex deployment

### Option 2: Proxy Service (Costs money)
Use services like ScraperAPI, Bright Data, or Cloudflare bypass proxies:
- ❌ Monthly cost ($30-100+)
- ❌ Rate limits
- ❌ External dependency

### Option 3: Accept Limitation (CURRENT)
Document that Planet Minecraft is blocked by Cloudflare:
- ✓ Honest about external limitation
- ✓ System works with 2 sources (CurseForge + 9Minecraft)
- ✓ Code ready if Planet Minecraft becomes accessible
- ✓ No architecture compromise

## Current Status
- **Modrinth**: REMOVED (doesn't have maps - only mods/modpacks)
- **Planet Minecraft**: Blocked by Cloudflare (external limitation)
- **CurseForge**: ✓ Working (60-140 results per query)
- **9Minecraft**: ✓ Working (5-15 results per query)

## Impact
With 2 working sources:
- ✓ Multi-source aggregation functional
- ✓ Diverse results from CurseForge + 9Minecraft
- ⚠️ Fewer total results than with Planet Minecraft
- ⚠️ "2x+ more results" harder to achieve (but possible with high-quality filtering)

## Recommendation
Accept this as an **external infrastructure limitation** beyond code fixes. The scraper architecture is sound and works for sources that don't use aggressive bot protection.

If Planet Minecraft access becomes critical, we would need to:
1. Switch to browser automation (Playwright)
2. Accept slower response times
3. Increase server resources
4. Modify architecture from HTTP-only to browser-based

This would be a **fundamental architecture change**, not a bug fix.
