# DEPLOYMENT UNBLOCKER - Round 13

**Issue:** Railway showing old code after git push

**Solution Options:**

### Option 1: Force Railway CLI Deploy (USE THIS)
```bash
export RAILWAY_TOKEN=b338858f-9662-4566-ad83-786802091763
railway up --detach --service=web
```

### Option 2: Check Deployment Status First
```bash
curl -s "https://web-production-631b7.up.railway.app/api/health" | jq '.deployTimestamp'
# If timestamp is OLD (before your commit), deployment failed
```

### Option 3: Manual GitHub Push Retry
```bash
git commit --amend --no-edit  # Update timestamp
git push origin main --force-with-lease  # Force push
```

### Verification After Deploy
```bash
sleep 30
curl -s "https://web-production-631b7.up.railway.app/api/health" | jq '.deployTimestamp'
# Should show recent timestamp (within last 5 minutes)
```

**Token Location:** `/Users/stevenai/clawd/projects/minecraft-map-scraper/.railway-token`

**If CLI fails:** The token may need regeneration. Check with manager.
