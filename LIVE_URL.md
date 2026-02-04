# 🚀 LIVE DEPLOYMENT

**Production URL:** https://web-production-9af19.up.railway.app/

## Quick Links

- **Search API:** https://web-production-9af19.up.railway.app/api/search?q=castle
- **Health Check:** https://web-production-9af19.up.railway.app/api/health
- **Home:** https://web-production-9af19.up.railway.app/

## ⚠️ TESTING REQUIREMENTS

**ALL RED TEAM AND QA TESTING MUST USE THE LIVE URL ABOVE**

- ❌ NO localhost testing
- ❌ NO "works on my machine"
- ✅ ALL tests must show timestamped evidence from live URL

## API Key Status

Check if CurseForge API key is configured:
```bash
curl https://web-production-9af19.up.railway.app/api/health
```

Look for `"apiConfigured": true` in the response.

If `false`, see SETUP.md for configuration instructions.

---

**Last Updated:** 2026-02-04
**Deployment:** Railway (web-production-9af19)
