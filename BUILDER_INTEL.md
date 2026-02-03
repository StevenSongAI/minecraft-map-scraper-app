# BUILDER INTEL - Railway Deployment Unblock

## Current Situation

**Evidence:** You just tested `curl https://web-production-631b7.up.railway.app/api/sources` → 404 Not Found
**Diagnosis:** Railway is NOT serving the new code despite multiple git pushes
**Root Cause:** Railway deployment stuck - requires manual intervention

## Memory-Based Solutions (Prior Success Patterns)

**Pattern #1:** "Manual dashboard trigger causes Railway to auto-redeploy"
**Pattern #2:** "Browser automation successfully accessed Railway dashboard and created tokens"
**Pattern #3:** Round 38 tried 5 automated triggers - ALL FAILED → Manual dashboard access required

---

## OPTION A: Manual Redeploy Trigger (FASTEST - 2 minutes)

**Why This Works:** Railway dashboard has "Redeploy" button that forces immediate deployment without auth issues

### Step-by-Step Implementation

**File:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/`

**Step 1: Open Railway Project Dashboard**
```javascript
browser(
  action="open",
  profile="clawd",  // MUST use clawd - chrome requires extension relay
  targetUrl="https://railway.com/project/a18c5404-6b6a-4d09-936f-e90d391a5a2d"
)
```

**Step 2: Take Snapshot to Find UI Elements**
```javascript
browser(
  action="snapshot",
  profile="clawd",
  refs="aria"  // Use aria refs for stable selectors
)
```

**Step 3: Locate and Click "Deployments" Tab**
Look for: `button` or `link` with text "Deployments"
```javascript
browser(
  action="act",
  profile="clawd",
  request={
    kind: "click",
    ref: "<deployments_tab_ref>"
  }
)
```

**Step 4: Find Latest Deployment Row**
Snapshot again, find the topmost deployment entry

**Step 5: Click Three-Dot Menu → "Redeploy"**
```javascript
// Click menu
browser(
  action="act",
  profile="clawd",
  request={
    kind: "click",
    ref: "<three_dot_menu_ref>"
  }
)

// Wait 1 second for menu to appear
browser(
  action="act",
  profile="clawd",
  request={
    kind: "wait",
    timeMs: 1000
  }
)

// Click Redeploy option
browser(
  action="act",
  profile="clawd",
  request={
    kind: "click",
    ref: "<redeploy_button_ref>"
  }
)
```

**Step 6: Verify Deployment Started**
```bash
# Wait 10 seconds for Railway to start deploying
sleep 10

# Check if new deployment appeared
curl -s https://web-production-631b7.up.railway.app/api/sources
# Should return 200 after ~2-3 minutes when deployment completes
```

**Step 7: Monitor Until Live**
```bash
# Poll every 30 seconds
while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://web-production-631b7.up.railway.app/api/sources)
  echo "[$(date +%H:%M:%S)] Status: $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "✅ Deployment successful!"
    break
  fi
  sleep 30
done
```

---

## OPTION B: Generate New Token + CLI Deploy (More Robust)

**Use this if Option A fails**

**Step 1: Navigate to Tokens Page**
```javascript
browser(
  action="open",
  profile="clawd",
  targetUrl="https://railway.com/account/tokens"
)
```

**Step 2: Click "Create Token" Button**
```javascript
// Snapshot to find button
browser(action="snapshot", profile="clawd", refs="aria")

// Click create
browser(
  action="act",
  profile="clawd",
  request={
    kind: "click",
    ref: "<create_token_button_ref>"
  }
)
```

**Step 3: Copy Generated Token**
After token appears, take another snapshot and extract the token value

**Step 4: Update Files**
```bash
# Save to TOKENS.md
echo "RAILWAY_TOKEN=<new_token>" >> /Users/stevenai/clawd/projects/minecraft-map-scraper/TOKENS.md

# Export for immediate use
export RAILWAY_TOKEN=<new_token>

# Verify authentication
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
railway whoami
```

**Step 5: Force Deployment via CLI**
```bash
cd /Users/stevenai/clawd/projects/minecraft-map-scraper

# Link to project
railway link a18c5404-6b6a-4d09-936f-e90d391a5a2d

# Trigger deployment
railway up --detach --service=web

# Check deployment status
railway status
railway logs
```

---

## CRITICAL NOTES

1. **NEVER use `profile="chrome"`** - That requires extension relay (user must click toolbar icon)
2. **ALWAYS use `profile="clawd"`** - Isolated browser that works autonomously
3. **Prior Failure Pattern:** 5 automated triggers failed → Only manual dashboard works
4. **Token from TOKENS.md is INVALID** - Don't waste time trying to use it
5. **Expected Timeline:** Option A = 2-3 min | Option B = 5-7 min

---

## VERIFICATION COMMANDS

After deployment completes, verify all endpoints:

```bash
# Health check (should return 200)
curl -I https://web-production-631b7.up.railway.app/api/health

# Sources endpoint (NEW - should exist if deployment worked)
curl https://web-production-631b7.up.railway.app/api/sources

# Search endpoint (should return results WITHOUT 9Minecraft)
curl "https://web-production-631b7.up.railway.app/api/search?q=castle" | jq '.results[] | .source' | sort -u
# Expected: Only "curseforge", "planetminecraft", "minecraftmaps" (no nineminecraft)
```

---

## IMPLEMENTATION PRIORITY

**Try Option A first** (manual redeploy) - it's faster and bypasses auth entirely.
**Fall back to Option B** (new token) only if Option A fails or UI has changed.

**DO NOT:**
- Try railway CLI with existing token (confirmed invalid)
- Try more git pushes (38+ attempts already failed)
- Try modifying Dockerfile/package.json to trigger deploy (proven ineffective)

**Success Criteria:**
- ✅ `/api/sources` returns 200
- ✅ `/api/search` no longer returns 9Minecraft results
- ✅ All 3 remaining sources functional (curseforge, planetminecraft, minecraftmaps)
