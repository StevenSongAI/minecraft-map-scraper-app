# BUILDER Round 68 - API Key Configuration Investigation

**Timestamp:** 2026-02-04T09:10:00Z  
**Status:** ⚠️ BLOCKED - Manual Intervention Required  
**Builder:** Subagent (ralph-loops BUILDER)

---

## 🔍 Investigation Summary

### Problem Confirmed
Railway deployment has a **bcrypt hash** instead of raw CurseForge API key:
```json
{
  "apiConfigured": false,
  "demoMode": true,
  "apiKeyFormat": "invalid-format",
  "apiKeyPreview": "$2a$10$N..."
}
```

### Root Cause Analysis

**The Issue:**
- CurseForge API keys are UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Railway has a bcrypt hash: `$2a$10$Nq62KqieW9UZE94ViLrroOCiMA6jLberrv.6X1pz4iBGOjMM91L5y`
- Bcrypt hashes are one-way encryptions - the original key cannot be retrieved

**What I Searched:**
1. ✅ `.env` file - Only has placeholder text, no actual key
2. ✅ `TOKENS.md` - Contains the SAME bcrypt hash (not the raw key)
3. ✅ GitHub secrets - `CURSEFORGE_API_KEY` exists but is encrypted (write-only, can't retrieve)
4. ✅ Git history - No commits with raw API key visible
5. ✅ Memory files - No raw key found in recent session logs

**What I Attempted:**
1. ❌ Railway CLI - Token authentication failed ("Unauthorized")
2. ❌ GitHub Actions workflow - Failed due to invalid Railway token
3. ❌ Browser automation (CurseForge) - Hit Google auth password prompt
4. ❌ Browser automation (Railway) - Hit ToS dialog + 404 error

---

## 🚫 Why I'm Blocked

**Cannot retrieve the raw CurseForge API key:**
- GitHub secrets are encrypted and write-only (security feature)
- All stored locations only have the bcrypt hash
- Cannot complete Google authentication flow for CurseForge console
- Railway CLI authentication is broken

**This requires human intervention because:**
1. Password-protected accounts (Google/CurseForge/Railway)
2. API key retrieval needs interactive authentication
3. Railway token in GitHub secrets may need refreshing

---

## ✅ SOLUTION - Manual Steps for Steven

### Option A: Use Existing API Key (if you have it)

If you have the raw CurseForge API key saved somewhere:

1. **Set on Railway Dashboard:**
   ```
   1. Go to: https://railway.app/project/a18c5404-6b6a-4d09-936f-e90d391a5a2d
   2. Click on the "web" service
   3. Go to: Variables tab
   4. Find: CURSEFORGE_API_KEY
   5. Replace with your raw API key (UUID format)
   6. Click "Deploy" or wait for auto-redeploy
   ```

2. **Verify:**
   ```bash
   curl https://web-production-9af19.up.railway.app/api/health | jq '.apiConfigured, .demoMode, .apiKeyFormat'
   ```
   Expected: `true`, `false`, `"valid"`

### Option B: Generate New API Key

If you don't have the raw key:

1. **Generate new key from CurseForge:**
   ```
   1. Go to: https://console.curseforge.com/
   2. Sign in with Google (stevenyjsongai@gmail.com)
   3. Navigate to: API Keys section
   4. Generate new API key
   5. Copy the key (UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
   ```

2. **Set on Railway:**
   - Follow Option A steps above

3. **Update GitHub Secret (optional):**
   ```bash
   cd /Users/stevenai/clawd/projects/minecraft-map-scraper
   gh secret set CURSEFORGE_API_KEY
   # Paste the new API key when prompted
   ```

### Option C: Use Railway CLI (if token is fixed)

If you can fix the Railway token:

```bash
export RAILWAY_TOKEN="your-valid-token-here"
railway link a18c5404-6b6a-4d09-936f-e90d391a5a2d
railway variables set CURSEFORGE_API_KEY="your-api-key-here"
```

---

## 📋 Verification Checklist

After setting the API key, verify these:

### 1. Health Endpoint
```bash
curl https://web-production-9af19.up.railway.app/api/health | jq '.'
```

Expected output:
```json
{
  "status": "ok",
  "apiConfigured": true,
  "demoMode": false,
  "apiKeyFormat": "valid",
  "apiKeyPreview": "xxxxxxxx-..."
}
```

### 2. Search Returns Real Maps
```bash
curl "https://web-production-9af19.up.railway.app/api/search?query=castle" | jq '.results[0:3]'
```

Expected:
- Result IDs should NOT be 1001-1020 (mock IDs)
- Should have real CurseForge map data
- Thumbnails should be actual URLs

### 3. Git Commit
```bash
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
git add .
git commit -m "Round 68: Configure CurseForge API key on Railway"
git push origin main
```

---

## 🎯 What's Needed From Steven

**Immediate Action Required:**
1. Access Railway dashboard: https://railway.app/project/a18c5404-6b6a-4d09-936f-e90d391a5a2d
2. Either:
   - Use existing raw CurseForge API key (if you have it saved)
   - OR generate new key from https://console.curseforge.com/
3. Set `CURSEFORGE_API_KEY` environment variable on Railway with RAW key
4. Verify health endpoint shows `apiConfigured: true`
5. Let me know when done so I can complete verification and git commit

**I can complete the task once you:**
- Provide the raw API key value, OR
- Set it on Railway yourself and confirm it's done

---

## 📊 Time Spent

- File investigation: 5 minutes
- GitHub secrets/workflow attempts: 10 minutes  
- Browser automation attempts: 10 minutes
- Documentation: 5 minutes
- **Total: ~30 minutes**

---

## 🔄 Next Steps

**When Steven provides the API key or confirms it's set:**
1. I will verify health endpoint
2. Test search functionality
3. Create git commit documenting the fix
4. Update progress.md with evidence
5. Mark task as COMPLETE

**Builder Status:** WAITING_FOR_HUMAN_INPUT

---

## 📝 Key Learnings

1. **Bcrypt hashes are one-way** - Cannot retrieve original API key from hash
2. **GitHub secrets are encrypted** - Security feature prevents retrieval
3. **Railway CLI authentication issues** - Dashboard is more reliable
4. **Browser automation limitations** - Password-protected flows need human
5. **API keys should be stored securely** - Consider password manager for raw keys

---

**End of Report**
