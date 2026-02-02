# Minecraft Map Scraper

Chat-style interface to find and download Minecraft maps.

## How to Use

### 1. Open the Dashboard
Open `index.html` from iCloud "Nox Builds" folder in any browser.

### 2. Search for Maps
Type a description like:
- "Castle adventure map"
- "Horror map with jumpscares"
- "Redstone puzzle map"
- "Medieval city for roleplay"

### 3. Run the Scraper
The dashboard will show instructions. Run:
```bash
cd /Users/stevenai/clawd/projects/minecraft-map-scraper
python3 scraper.py "your search query"
```

### 4. View Results
Return to the dashboard — it auto-refreshes every 30 seconds with new results.

### 5. Download Maps
Click "Download Map" on any result. The browser will open the map's page where you can download it to any folder.

## Files

- `scraper.py` — Python scraper (searches Planet Minecraft)
- `index.html` — Chat interface dashboard
- `maps-data.json` — Generated results (auto-created)

## Sharing

The `index.html` dashboard can be shared with your animator via iCloud. They just need to:
1. Open the HTML file
2. Ask you to run searches (or run `scraper.py` themselves if they have Python)
3. Browse and download maps directly
# Railway Deployment Trigger
