# Minecraft Map Scraper - Setup & Configuration Guide

## ⚠️ CRITICAL: API Key Configuration Required

This project requires a **CurseForge API Key** to function properly. Without it, the system runs in **demo mode** with mock data only.

### Step 1: Get Your CurseForge API Key

1. Go to: https://console.curseforge.com/
2. Click "Create an Account" or sign in if you already have one
3. Navigate to "API Keys" section (usually in Settings)
4. Click "Create New API Key" or "Generate Key"
5. Fill in the form with:
   - **Name:** "Minecraft Map Scraper" (or any name)
   - **Description:** (optional) "Local map scraper application"
6. Click "Generate"
7. **Copy your API key immediately** - you won't see it again!

### Step 2: Configure for Local Development

For **local development** (running on your machine):

```bash
# Create .env file in the project root
echo "CURSEFORGE_API_KEY=your_api_key_here" > .env

# Replace "your_api_key_here" with your actual API key from Step 1
```

### Step 3: Configure for Railway Deployment

If you're deploying to Railway platform:

1. Go to your Railway project dashboard
2. Click "Settings" → "Environment"
3. Add a new environment variable:
   - **Name:** `CURSEFORGE_API_KEY`
   - **Value:** (paste your API key from Step 1)
4. Click "Save"
5. Deploy the application

### Step 4: Verify Configuration

Test that your API key is configured correctly:

```bash
# For local development
npm start

# Then visit: http://localhost:3000/api/health
# You should see: "apiConfigured": true

# For deployed version
curl https://your-railway-app.up.railway.app/api/health
```

### Step 5: Start Using the API

Once configured, the system will:
- ✅ Use live CurseForge API for map data
- ✅ Return real maps with actual download links
- ✅ Show accurate map thumbnails and descriptions
- ✅ Provide working downloads

---

## Architecture: Multi-Source Map Aggregation

The system attempts to pull maps from **5 sources**, but only some are accessible:

### ✅ Working Sources (2 of 5)

| Source | Status | Notes |
|--------|--------|-------|
| **CurseForge API** | ✅ Working | Requires API key - **PRIMARY SOURCE** |
| **Modrinth** | ✅ Working | Free API, no auth needed, limited map selection |

### ⚠️ Blocked Sources (3 of 5)

| Source | Status | Reason | Solution |
|--------|--------|--------|----------|
| **Planet Minecraft** | ❌ Blocked | Cloudflare protection blocks automated access | Requires $100+/month proxy service |
| **MinecraftMaps.com** | ❌ Blocked | Cloudflare protection | Requires $100+/month proxy service |
| **MC-Maps.com** | ❌ Timeout | Site responds too slowly | Would require accepting >10s response times |

### Why Some Sources Don't Work

**Cloudflare Protection:** Many map sites use Cloudflare to prevent automated scraping. Without paid proxy services, we cannot bypass this protection. This is intentional site security and cannot be fixed without paying $100+/month for proxy services.

---

## Troubleshooting

### Problem: "demoMode: true" in API responses

**Cause:** `CURSEFORGE_API_KEY` environment variable is not set or is invalid.

**Solution:**
1. Check that your `.env` file exists with the correct key
2. Verify the API key from https://console.curseforge.com/
3. Restart the application after setting the key

### Problem: Search returns "demo" results with IDs 1001-1020

**Cause:** Still in demo mode (API key not configured).

**Solution:** Follow Step 1-2 above to get and configure your API key.

### Problem: Search results include mods/texture packs instead of maps

**Cause:** Modrinth is a secondary source that has limited map selection and high false positive rate.

**Solutions:**
- Ensure CurseForge API key is configured (primary source)
- Use more specific search terms (e.g., "medieval castle map" instead of "castle")
- The system will filter out most non-maps, but Modrinth's selection is limited

### Problem: Only 2 sources working, need more results

**Cause:** Cloudflare blocks other sources, Modrinth has limited maps.

**Solutions:**
1. Ensure CurseForge API is working (main source has best coverage)
2. Use specific query terms to improve accuracy
3. Contact support if you want to pay for proxy service to enable Planet Minecraft

---

## Configuration Reference

### Environment Variables

```bash
CURSEFORGE_API_KEY=<your-api-key>   # REQUIRED - Get from https://console.curseforge.com/
PORT=3000                            # Optional - default 3000
HOST=0.0.0.0                         # Optional - default 0.0.0.0
```

### How to Find Your API Key

1. Visit: https://console.curseforge.com/
2. Sign in with your CurseForge account
3. Look for "API" or "API Keys" section
4. Create a new key or view existing keys
5. Copy the key (format is usually a long alphanumeric string)

---

## Source-Specific Details

### CurseForge API (Primary)

- **Status:** ✅ Working
- **Requires:** API key (free to get)
- **Coverage:** 100+ maps per popular query
- **Quality:** Official API, reliable data
- **Cost:** Free with API key

**How to enable:**
1. Follow "Step 1-2" above
2. Set `CURSEFORGE_API_KEY` environment variable
3. Restart application
4. All CurseForge maps will be included in results

### Modrinth API (Secondary)

- **Status:** ✅ Working
- **Requires:** None (free, no auth)
- **Coverage:** 5-15 maps per query (highly filtered)
- **Quality:** Limited - Modrinth is for mods, not maps
- **Cost:** Free

**Note:** Modrinth doesn't have a "map" category. Results are filtered from mod/modpack/resourcepack categories to find map-like projects. Accuracy is lower than CurseForge.

### Planet Minecraft (Blocked)

- **Status:** ❌ Blocked by Cloudflare
- **Would provide:** Largest map repository after CurseForge
- **To enable:** Would require $100+/month proxy service
- **Consider:** Worth the cost if you need maximum coverage

---

## API Endpoints

### GET /api/search

Search for Minecraft maps

**Parameters:**
- `q` (required): Search query (e.g., "castle", "survival world")
- `version` (optional): Game version (e.g., "1.20.1")
- `pageSize` (optional): Results per page (default 20, max 50)
- `nocache` (optional): Set to "1" to skip cache

**Example:**
```bash
curl "http://localhost:3000/api/search?q=medieval+castle"
```

**Response:**
```json
{
  "query": "medieval castle",
  "results": [
    {
      "id": "12345",
      "name": "Medieval Castle",
      "source": "curseforge",
      "downloadUrl": "...",
      "thumbnail": "...",
      ...
    }
  ],
  "count": 15,
  "source": "multi-source",
  "mode": "live"
}
```

### GET /api/health

Check system health and API configuration status

**Response:**
```json
{
  "status": "healthy",
  "apiConfigured": true,
  "mode": "live",
  "demoMode": false
}
```

---

## Need Help?

1. **API Key issues:** Visit https://console.curseforge.com/
2. **Rate limiting:** CurseForge allows ~120 requests/minute
3. **Slow responses:** May indicate Modrinth API slowness (secondary source)
4. **Limited results:** Use CurseForge API key for best coverage

---

**Last Updated:** Round 61 - RED TEAM Defect Fixes
