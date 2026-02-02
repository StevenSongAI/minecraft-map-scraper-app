const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const CurseForgeClient = require('./curseforge');
const CacheManager = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY;

// Initialize cache manager
const cachePath = path.join(__dirname, '..', 'maps-data.json');
const cache = new CacheManager(cachePath);

// Ensure cache is loaded from disk on startup
try {
  const cacheStats = cache.getStats();
  console.log(`[Cache] Loaded from disk: ${cacheStats.mapCount} maps, ${cacheStats.searchCount} searches`);
} catch (error) {
  console.warn('[Cache] Failed to load cache, starting fresh:', error.message);
}

// Initialize CurseForge client
const cfClient = new CurseForgeClient(CURSEFORGE_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from dashboard folder
const dashboardPath = path.join(__dirname, '..', 'dashboard');
app.use(express.static(dashboardPath));

// Also serve root index.html for backward compatibility
app.use('/legacy', express.static(path.join(__dirname, '..')));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// API Key Check Middleware - Blocks API calls when key is missing
const requireApiKey = (req, res, next) => {
  if (!CURSEFORGE_API_KEY) {
    return res.status(503).json({
      error: 'API_KEY_MISSING',
      message: 'CURSEFORGE_API_KEY is not configured. Please add your API key to the .env file.',
      help: 'Get your API key at: https://console.curseforge.com/'
    });
  }
  next();
};

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  const apiStatus = await cfClient.getStatus();
  const cacheStats = cache.getStats();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    api: apiStatus,
    cache: cacheStats
  });
});

/**
 * Generate mock map data for testing when no API key is available
 * @param {string} query - Search query
 * @param {number} count - Number of results to generate
 * @returns {Array} Mock map data
 */
function generateMockMaps(query, count = 5) {
  const mockMaps = [
    {
      id: 1001,
      name: 'Epic Castle Adventure',
      slug: 'epic-castle-adventure',
      summary: 'Explore a massive medieval castle with hidden secrets and treasure rooms. Perfect for roleplay servers.',
      description: 'A detailed castle map with over 200 rooms, dungeons, and a complete story to explore.',
      author: { name: 'BuilderPro', url: 'https://www.curseforge.com/members/BuilderPro' },
      thumbnail: 'https://via.placeholder.com/300x200/4a90d9/ffffff?text=Castle+Map',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/epic-castle-adventure',
      downloadCount: 45200,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-06-15T00:00:00Z',
      dateModified: '2024-01-20T00:00:00Z',
      source: 'mock'
    },
    {
      id: 1002,
      name: 'Skyblock Challenges',
      slug: 'skyblock-challenges',
      summary: 'Classic skyblock with 100+ custom challenges. Start on a floating island and survive!',
      description: 'The ultimate skyblock experience with custom islands, achievements, and multiplayer support.',
      author: { name: 'SkyMaster', url: 'https://www.curseforge.com/members/SkyMaster' },
      thumbnail: 'https://via.placeholder.com/300x200/5cb85c/ffffff?text=Skyblock',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/skyblock-challenges',
      downloadCount: 128000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2022-03-10T00:00:00Z',
      dateModified: '2024-02-01T00:00:00Z',
      source: 'mock'
    },
    {
      id: 1003,
      name: 'Horror Hospital',
      slug: 'horror-hospital',
      summary: 'A terrifying horror map set in an abandoned hospital. Can you escape?',
      description: 'Psychological horror experience with custom sound effects and jump scares.',
      author: { name: 'ScareCreator', url: 'https://www.curseforge.com/members/ScareCreator' },
      thumbnail: 'https://via.placeholder.com/300x200/d9534f/ffffff?text=Horror',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/horror-hospital',
      downloadCount: 67800,
      gameVersions: ['1.20.1', '1.19.2'],
      category: 'World',
      dateCreated: '2023-10-31T00:00:00Z',
      dateModified: '2023-12-15T00:00:00Z',
      source: 'mock'
    },
    {
      id: 1004,
      name: 'Parkour Paradise',
      slug: 'parkour-paradise',
      summary: '100 levels of parkour madness. From easy jumps to impossible challenges!',
      description: 'The ultimate parkour map with checkpoints, timer system, and multiplayer races.',
      author: { name: 'JumpKing', url: 'https://www.curseforge.com/members/JumpKing' },
      thumbnail: 'https://via.placeholder.com/300x200/f0ad4e/ffffff?text=Parkour',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/parkour-paradise',
      downloadCount: 234000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2021-05-20T00:00:00Z',
      dateModified: '2024-01-15T00:00:00Z',
      source: 'mock'
    },
    {
      id: 1005,
      name: 'Medieval City RPG',
      slug: 'medieval-city-rpg',
      summary: 'A complete medieval city with NPCs, quests, and a living economy system.',
      description: 'RPG experience with custom dialogue, trading, and an open world to explore.',
      author: { name: 'RPGMaster', url: 'https://www.curseforge.com/members/RPGMaster' },
      thumbnail: 'https://via.placeholder.com/300x200/9b59b6/ffffff?text=RPG+City',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/medieval-city-rpg',
      downloadCount: 89100,
      gameVersions: ['1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-01-10T00:00:00Z',
      dateModified: '2024-01-30T00:00:00Z',
      source: 'mock'
    },
    {
      id: 1006,
      name: 'Survival Island',
      slug: 'survival-island',
      summary: 'Stranded on a deserted island. Gather resources, build shelter, and survive!',
      description: 'Hardcore survival map with limited resources and hidden treasures.',
      author: { name: 'IslandBuilder', url: 'https://www.curseforge.com/members/IslandBuilder' },
      thumbnail: 'https://via.placeholder.com/300x200/1abc9c/ffffff?text=Survival',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/survival-island',
      downloadCount: 156000,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-08-15T00:00:00Z',
      dateModified: '2023-11-20T00:00:00Z',
      source: 'mock'
    }
  ];
  
  // Filter based on query (simple matching)
  const lowerQuery = query.toLowerCase();
  const filtered = mockMaps.filter(map => 
    map.name.toLowerCase().includes(lowerQuery) ||
    map.summary.toLowerCase().includes(lowerQuery) ||
    map.category.toLowerCase().includes(lowerQuery)
  );
  
  // If no matches, return first 'count' items
  return filtered.length > 0 ? filtered.slice(0, count) : mockMaps.slice(0, count);
}

/**
 * GET /api/search
 * Search for Minecraft maps
 * Query params:
 *   - q: search query (required)
 *   - version: Minecraft version filter (optional)
 *   - pageSize: number of results (default: 20, max: 50)
 *   - index: pagination offset (default: 0)
 *   - nocache: skip cache if true (optional)
 *   - demo: use mock data even if API key is configured (optional)
 */
app.get('/api/search', async (req, res) => {
  try {
    const { q, version, pageSize = 20, index = 0, nocache } = req.query;

    // Validate query
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Query parameter "q" is required and must be a non-empty string'
      });
    }

    const query = q.trim();
    const useCache = !nocache;
    const pageSizeNum = Math.min(parseInt(pageSize) || 20, 50);
    const indexNum = parseInt(index) || 0;

    // Check cache first (unless nocache is set)
    if (useCache) {
      const cached = cache.getSearchResults(query);
      if (cached) {
        console.log(`[CACHE HIT] Returning cached results for: "${query}"`);
        return res.json({
          query,
          results: cached,
          count: cached.length,
          source: 'cache',
          timestamp: new Date().toISOString()
        });
      }
    }

    // If no API key, return error (demo mode disabled - API key required)
    if (!CURSEFORGE_API_KEY) {
      return res.status(503).json({
        error: 'API_KEY_MISSING',
        message: 'CURSEFORGE_API_KEY is not configured. Please add your API key to the .env file.',
        help: 'Get your API key at: https://console.curseforge.com/'
      });
    }

    console.log(`[API CALL] Searching CurseForge for: "${query}"`);

    // Call CurseForge API
    const options = {
      gameVersion: version,
      pageSize: pageSizeNum,
      index: indexNum
    };

    const maps = await cfClient.searchMaps(query, options);

    // Cache the results
    cache.saveSearchResults(query, maps);

    res.json({
      query,
      results: maps,
      count: maps.length,
      source: 'api',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search error:', error.message);

    // Handle specific error types
    if (error.message.startsWith('RATE_LIMITED')) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: error.message,
        retryAfter: 60
      });
    }

    if (error.message.startsWith('AUTH_ERROR')) {
      return res.status(401).json({
        error: 'AUTH_ERROR',
        message: error.message,
        help: 'Verify your CURSEFORGE_API_KEY at https://console.curseforge.com/'
      });
    }

    if (error.message.startsWith('TIMEOUT')) {
      return res.status(504).json({
        error: 'TIMEOUT',
        message: error.message
      });
    }

    if (error.message.startsWith('NETWORK_ERROR')) {
      return res.status(503).json({
        error: 'NETWORK_ERROR',
        message: error.message
      });
    }

    // Generic error
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/map/:id
 * Get detailed info for a specific map
 */
app.get('/api/map/:id', async (req, res) => {
  try {
    const mapId = parseInt(req.params.id);

    if (isNaN(mapId)) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Invalid map ID'
      });
    }

    // Check cache first
    const cached = cache.getMap(mapId);
    if (cached) {
      return res.json({
        map: cached,
        source: 'cache'
      });
    }

    // Check if API key is configured
    if (!CURSEFORGE_API_KEY) {
      return res.status(503).json({
        error: 'API_KEY_MISSING',
        message: 'CURSEFORGE_API_KEY is not configured. Please add your API key to the .env file.',
        help: 'Get your API key at: https://console.curseforge.com/'
      });
    }

    // Fetch from API
    const map = await cfClient.getMap(mapId);
    cache.saveMap(map);

    res.json({
      map,
      source: 'api'
    });

  } catch (error) {
    console.error('Get map error:', error.message);

    if (error.message.startsWith('RATE_LIMITED')) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: error.message
      });
    }

    if (error.message.startsWith('AUTH_ERROR')) {
      return res.status(401).json({
        error: 'AUTH_ERROR',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
app.get('/api/cache/stats', (req, res) => {
  const stats = cache.getStats();
  res.json(stats);
});

/**
 * POST /api/cache/clear
 * Clear the cache (use with caution)
 */
app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  res.json({
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/categories
 * Get available Minecraft categories
 */
app.get('/api/categories', (req, res) => {
  res.json({
    categories: [
      { id: 17, name: 'World', description: 'Minecraft maps and worlds' },
      { id: 6, name: 'Mod', description: 'Minecraft mods' },
      { id: 12, name: 'Resource Pack', description: 'Texture and resource packs' },
      { id: 4559, name: 'Data Pack', description: 'Data packs' },
      { id: 4471, name: 'Shader', description: 'Shader packs' }
    ]
  });
});

/**
 * GET /api/download
 * Proxy download from CurseForge to allow direct file downloads
 * Query params:
 *   - url: The download URL
 *   - filename: Optional filename override
 */
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;

    if (!url) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Query parameter "url" is required'
      });
    }

    // Validate URL is from CurseForge
    const allowedHosts = ['curseforge.com', 'www.curseforge.com', 'media.forgecdn.net', 'edge.forgecdn.net'];
    const urlObj = new URL(url);
    const isAllowed = allowedHosts.some(host => urlObj.hostname.endsWith(host));

    if (!isAllowed) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Download URL must be from CurseForge'
      });
    }

    console.log(`[Download] Proxying: ${url}`);

    // Fetch the file from CurseForge
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'DOWNLOAD_FAILED',
        message: `Failed to fetch file: ${response.status}`
      });
    }

    // Determine filename from Content-Disposition header or URL
    let downloadFilename = filename;
    if (!downloadFilename) {
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) downloadFilename = match[1].replace(/['"]/g, '');
      }
      if (!downloadFilename) {
        downloadFilename = url.split('/').pop() || 'download.zip';
      }
    }

    // Set headers for file download
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Content-Length', response.headers.get('content-length') || '');

    // Stream the response
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({
      error: 'DOWNLOAD_ERROR',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Endpoint ${req.path} not found`
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Minecraft Map Scraper API Server                     ║
╠══════════════════════════════════════════════════════════╣
║  Server running on http://${HOST}:${PORT}                    ║
║  Local access:    http://localhost:${PORT}                   ║
║  Network access:  http://192.168.40.118:${PORT}              ║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║    GET  /                  - Dashboard UI                ║
║    GET  /api/health        - Health check                ║
║    GET  /api/search?q=...  - Search for maps             ║
║    GET  /api/map/:id       - Get map details             ║
║    GET  /api/download      - Proxy download              ║
║    GET  /api/cache/stats   - Cache statistics            ║
║    POST /api/cache/clear   - Clear cache                 ║
║    GET  /api/categories    - Available categories        ║
╠══════════════════════════════════════════════════════════╣
║  API Key Status: ${CURSEFORGE_API_KEY ? '✓ Configured' : '✗ Required - Not set'}   ║
╚══════════════════════════════════════════════════════════╝
  `);

  if (!CURSEFORGE_API_KEY) {
    console.log('\n❌ ERROR: CURSEFORGE_API_KEY not set!');
    console.log('   API calls will return errors until configured.');
    console.log('   Create a .env file with: CURSEFORGE_API_KEY=your_api_key');
    console.log('   Get your API key at: https://console.curseforge.com/\n');
  }
});

// Graceful shutdown to ensure cache is persisted
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;
