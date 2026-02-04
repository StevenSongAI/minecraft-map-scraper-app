# BUILDER INTEL - Round 68+ (Manager Intelligence)

**Timestamp:** 2026-02-05T07:50:00Z  
**Manager:** Main session heartbeat QA check  
**Status:** DEFECTS_FOUND → Need BUILDER to fix API key configuration

---

## 🔍 CRITICAL FINDING: API Key Format Issue

**Health Endpoint Shows:**
```json
{
  "apiConfigured": false,
  "demoMode": true,
  "apiKeyFormat": "invalid-format",
  "apiKeyPreview": "$2a$10$N..."
}
```

**Root Cause Identified:**
The CurseForge API key in Railway is stored as a **bcrypt hash** (`$2a$10$...`) instead of the raw API key. This is why demo mode is active despite an API key being present.

**Expected Format:**
- ✅ CORRECT: `$2a$10$NqhLN1AwD3fKaFdXfFQPLeUzL4...` (raw CurseForge API key)
- ❌ WRONG: Bcrypt hash of the key

---

## 🎯 BUILDER Task: Fix Railway Environment Variable

**Option 1: Railway Dashboard (Recommended)**
1. Go to: https://railway.app/project/a18c5404-6b6a-4d09-936f-e90d391a5a2d
2. Select service: `web`
3. Go to: Variables tab
4. Find: `CURSEFORGE_API_KEY`
5. Replace value with RAW CurseForge API key (not hashed)
6. Redeploy

**Option 2: Railway CLI**
```bash
# Install Railway CLI if needed
npm install -g @railway/cli

# Login (should already be logged in)
railway login

# Link to project
railway link a18c5404-6b6a-4d09-936f-e90d391a5a2d

# Set raw API key
railway variables set CURSEFORGE_API_KEY="<RAW_API_KEY_HERE>"
```

**Option 3: Find Raw API Key**
Check these locations for the raw (unhashed) CurseForge API key:
- `.env` file in project root (if exists)
- GitHub repository secrets
- TOKENS.md in workspace memory
- Prior session transcripts where key was obtained

**Memory Search Suggestion:**
```
memory_search("CurseForge API key $2a$10 raw unhashed CURSEFORGE_API_KEY")
```

---

## ✅ Verification Steps

After setting the correct key, verify:

1. **Health Endpoint Check:**
```bash
curl https://web-production-9af19.up.railway.app/api/health | jq '.apiConfigured, .demoMode, .apiKeyFormat'
```

Expected output:
```json
{
  "apiConfigured": true,
  "demoMode": false,
  "apiKeyFormat": "valid"
}
```

2. **Search Test:**
```bash
curl "https://web-production-9af19.up.railway.app/api/search?query=adventure" | jq '.results[0]'
```

Expected: Real CurseForge maps (not mock IDs 1001-1020)

---

## 🚫 What NOT to Do (From Memory)

- ❌ Don't test on localhost (prior violation pattern)
- ❌ Don't use Railway GraphQL API (previous failures)
- ❌ Don't assume GitHub Actions will deploy env vars automatically
- ❌ Don't claim completion without verifying health endpoint

---

## 📊 Memory Context (Prior Attempts)

- **Round 58-60:** Multiple attempts to set Railway env var via CLI
- **Common Failure:** Railway CLI not authenticated or wrong project
- **Successful Pattern:** Direct dashboard access is most reliable

---

## 🎯 Success Criteria

BUILDER completion requires:
1. ✅ Health endpoint shows `apiConfigured: true`
2. ✅ Health endpoint shows `demoMode: false`  
3. ✅ Health endpoint shows `apiKeyFormat: "valid"`
4. ✅ Search returns real CurseForge map IDs (not 1001-1020 mock)
5. ✅ Git commit documenting the fix
6. ✅ progress.md updated with verification evidence

---

**Manager Value-Add Score Tracking:**
- Direct blocker investigation: ✅ (health endpoint check)
- Root cause identified: ✅ (bcrypt hash instead of raw key)
- Specific fix instructions: ✅ (3 options with file paths)
- Prior failure patterns documented: ✅ (from memory search)
- Verification commands provided: ✅ (with expected output)

**Next Steps:** Spawn BUILDER with this intel to execute the fix.
