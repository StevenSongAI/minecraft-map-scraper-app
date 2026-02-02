# Self-Hosted Deployment Option

Since Railway requires authentication, here's a local server setup that can be exposed:

## Option 1: Local Server + ngrok (Temporary)
```bash
cd ~/clawd/projects/minecraft-map-scraper
npm start
# In another terminal:
ngrok http 3000
```

## Option 2: Deploy to Alternative Platforms

### Fly.io
```bash
flyctl launch --name minecraft-map-scraper
```

### Heroku  
```bash
heroku create minecraft-map-scraper
```

### DigitalOcean App Platform
Connect GitHub repo via DO dashboard

## Current Status
- ✅ Code ready and pushed to GitHub
- ✅ Railway GitHub App authorized
- ❌ Railway deployment blocked (requires token or dashboard access)
- ⏳ Waiting for authentication method

## Repository
https://github.com/StevenSongAI/minecraft-map-scraper-app
