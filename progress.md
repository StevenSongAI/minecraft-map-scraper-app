# Progress - Minecraft Map Scraper QA

## Alternative Deployment Investigation - 2026-02-03

### Platforms Tested

#### 1. Fly.io
**Status:** BLOCKED - Requires authentication
**Command tried:** `flyctl launch --name minecraft-map-scraper --region yyz --no-deploy --yes`
**Error:** `No access token available. Please login with 'flyctl auth login'`
**Blocker:** CLI requires interactive login. No FLY_API_TOKEN available in environment.
**Resolution path:** User needs to run `flyctl auth login` or set FLY_API_TOKEN env var.

#### 2. Vercel
**Status:** BLOCKED - Requires authentication
**CLI version:** 50.9.6
**Error:** `No existing credentials found. Please run 'vercel login' or pass '--token'`
**Blocker:** CLI requires login or VERCEL_TOKEN env var. Neither available.
**Config created:** vercel.json (ready for deployment if auth available)
**Resolution path:** User needs to run `vercel login` or provide VERCEL_TOKEN.

#### 3. Railway CLI
**Status:** BLOCKED - Token unauthorized
**Error:** `Unauthorized. Please login with 'railway login'`
**Blocker:** RAILWAY_TOKEN expired/invalid in GitHub Actions secrets.
**GitHub App status:** Railway GitHub App IS connected to repo - deployment status shows in commits
**Recent deployment:** Failed (commit 9eb4e25) - see https://railway.com/project/a18c5404-6b6a-4d09-936f-e90d391a5a2d

#### 4. Render.com
**Status:** NOT AVAILABLE - CLI not installed
**Blocker:** `render` command not found in environment.

### Railway GitHub App - Detailed Investigation

**Positive findings:**
- Railway GitHub App (railway-app[bot]) IS installed on the repository
- App has created deployments: https://api.github.com/repos/StevenSongAI/minecraft-map-scraper-app/deployments
- Deployment shows in commit status with link to Railway dashboard
- Project ID: a18c5404-6b6a-4d09-936f-e90d391a5a2d

**Negative findings:**
- Latest deployment (commit 9eb4e25) status: **FAILURE**
- Health endpoint returns: `{"status":"error","code":404,"message":"Application not found"}`
- Service not currently running on Railway
- GitHub Actions workflow also fails due to RAILWAY_TOKEN

### Attempting Git Push Trigger

Creating commit with deployment configs (fly.toml, vercel.json) to test if Railway GitHub App auto-deploys on push without requiring the workflow.

### If This Fails

Next options:
1. **GitHub Pages + Separate API**: Deploy static frontend to GitHub Pages, use CurseForge API directly from browser (limited by CORS)
2. **Docker + Self-host**: Build Docker image, run locally with ngrok
3. **Request user intervention**: Railway dashboard access needed to regenerate token or trigger manual deploy
4. **Try Netlify**: Similar to Vercel, may require auth

### Configuration Files Added

- `fly.toml` - Fly.io deployment config (Node.js app, port 3000)
- `vercel.json` - Vercel deployment config (Node.js serverless)
