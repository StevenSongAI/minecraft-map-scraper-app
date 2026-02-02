const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CurseForge API Key - use environment variable only (empty = demo mode with mock data)
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '';
const CURSEFORGE_BASE_URL = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;
const WORLDS_CLASS_ID = 17; // Minecraft Worlds/Maps category

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Enhanced natural language keyword mapping for better search
const keywordMappings = {
  // Map types
  'castle': ['castle', 'fortress', 'citadel', 'stronghold', 'palace', 'keep', 'tower'],
  'city': ['city', 'town', 'village', 'metropolis', 'urban', 'settlement', 'kingdom'],
  'adventure': ['adventure', 'quest', 'story', 'rpg', 'campaign', 'journey', 'exploration'],
  'survival': ['survival', 'survive', 'hardcore', 'stranded', 'island', 'wilderness'],
  'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy', 'terror', 'nightmare'],
  'parkour': ['parkour', 'jump', 'challenge', 'obstacle', 'parkor', 'jumping', 'speedrun'],
  'puzzle': ['puzzle', 'mystery', 'riddle', 'logic', 'brain', 'maze', 'labyrinth'],
  'pvp': ['pvp', 'arena', 'battle', 'combat', 'fight', 'war', 'duel'],
  'modern': ['modern', 'contemporary', 'futuristic', 'scifi', 'sci-fi', 'future', 'tech'],
  'medieval': ['medieval', 'fantasy', 'ancient', 'historical', 'middle ages', 'knights'],
  'redstone': ['redstone', 'mechanism', 'automatic', 'contraption', 'circuit', 'wire'],
  'house': ['house', 'home', 'mansion', 'estate', 'building', 'residence', 'villa'],
  'skyblock': ['skyblock', 'sky', 'island', 'void', 'floating', 'void world'],
  'dungeon': ['dungeon', 'cave', 'underground', 'mines', 'cavern', 'tomb', 'catacomb'],
  'minigame': ['minigame', 'mini-game', 'game', 'arcade', 'party game', 'multiplayer'],
  'railway': ['railway', 'rail', 'train', 'subway', 'metro', 'transport', 'track'],
  'highway': ['highway', 'road', 'path', 'bridge', 'tunnel', 'transportation'],
  'futuristic': ['futuristic', 'future', 'scifi', 'sci-fi', 'space', 'advanced', 'tech']
};

// Expand natural language query to search terms
function expandQuery(query) {
  const queryLower = query.toLowerCase();
  let searchTerms = [query];
  let expandedKeywords = [];
  
  for (const [key, synonyms] of Object.entries(keywordMappings)) {
    if (queryLower.includes(key)) {
      searchTerms = [...searchTerms, ...synonyms];
      expandedKeywords.push(key);
    }
  }
  
  // Add individual words from query if no keywords matched
  if (expandedKeywords.length === 0) {
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    searchTerms = [...searchTerms, ...words];
  }
  
  return [...new Set(searchTerms)];
}

// Calculate relevance score for sorting
function calculateRelevance(map, query, searchTerms) {
  const queryLower = query.toLowerCase();
  let score = 0;
  
  // Title match is most important
  const titleLower = map.title.toLowerCase();
  if (titleLower.includes(queryLower)) score += 100;
  searchTerms.forEach(term => {
    if (titleLower.includes(term.toLowerCase())) score += 50;
  });
  
  // Description match
  const descLower = map.description.toLowerCase();
  if (descLower.includes(queryLower)) score += 30;
  searchTerms.forEach(term => {
    if (descLower.includes(term.toLowerCase())) score += 15;
  });
  
  // Tag match
  if (map.tags) {
    map.tags.forEach(tag => {
      const tagLower = tag.toLowerCase();
      if (tagLower.includes(queryLower)) score += 40;
      searchTerms.forEach(term => {
        if (tagLower.includes(term.toLowerCase())) score += 20;
      });
    });
  }
  
  // Boost by popularity
  score += Math.log10(map.downloads + 1) * 5;
  score += Math.log10(map.likes + 1) * 3;
  
  return score;
}

// API endpoint for natural language search
app.get('/api/search', async (req, res) => {
  const query = req.query.q || '';
  const limit = parseInt(req.query.limit) || 20;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  try {
    const searchTerms = expandQuery(query);
    console.log(`Search query: "${query}" | Expanded terms: ${searchTerms.join(', ')}`);
    
    let results = await searchCurseForge(searchTerms, limit * 2);
    
    // Sort by relevance
    results = results.map(map => ({
      ...map,
      relevanceScore: calculateRelevance(map, query, searchTerms)
    })).sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Limit results
    results = results.slice(0, limit);
    
    res.json({
      success: true,
      query: query,
      searchTerms: searchTerms,
      count: results.length,
      maps: results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed', 
      message: error.message 
    });
  }
});

// Search CurseForge API
async function searchCurseForge(searchTerms, limit) {
  const headers = {
    'Accept': 'application/json',
    'x-api-key': CURSEFORGE_API_KEY
  };
  
  const allResults = [];
  const seenIds = new Set();
  
  // Search with primary query first (most specific), then expanded terms
  const priorityTerms = searchTerms.slice(0, 4); // Limit API calls
  
  for (const term of priorityTerms) {
    try {
      const params = new URLSearchParams({
        gameId: MINECRAFT_GAME_ID.toString(),
        classId: WORLDS_CLASS_ID.toString(),
        searchFilter: term,
        pageSize: '50',
        sortField: '2', // Popularity
        sortOrder: 'desc'
      });
      
      const response = await fetch(`${CURSEFORGE_BASE_URL}/mods/search?${params}`, {
        headers,
        timeout: 30000
      });
      
      if (!response.ok) {
        console.warn(`CurseForge API error for term "${term}": ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.data) {
        for (const mod of data.data) {
          if (!seenIds.has(mod.id)) {
            seenIds.add(mod.id);
            const mapData = await transformModToMap(mod);
            if (mapData) {
              allResults.push(mapData);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error searching for term "${term}":`, err.message);
    }
  }
  
  return allResults;
}

// Transform CurseForge mod data to map format
async function transformModToMap(mod) {
  // Get the latest file info
  let latestFile = null;
  let downloadUrl = null;
  let fileName = null;
  let fileSize = 0;
  
  if (mod.latestFiles && mod.latestFiles.length > 0) {
    latestFile = mod.latestFiles[0];
    
    // CurseForge API v1 returns download URLs differently
    // The downloadUrl field may be null for some mods
    // We need to construct or fetch the proper download URL
    if (latestFile.downloadUrl) {
      downloadUrl = latestFile.downloadUrl;
    } else {
      // Construct download URL using the file ID
      // CurseForge CDN pattern
      downloadUrl = `https://www.curseforge.com/api/v1/mods/${mod.id}/files/${latestFile.id}/download`;
    }
    
    fileName = latestFile.fileName;
    fileSize = latestFile.fileLength || 0;
  }
  
  // Get mod page URL
  const modPageUrl = `https://www.curseforge.com/minecraft/worlds/${mod.slug}`;
  
  return {
    id: mod.id,
    title: mod.name,
    author: mod.authors && mod.authors[0] ? mod.authors[0].name : 'Unknown',
    description: mod.summary || 'No description available',
    url: modPageUrl,
    downloadUrl: downloadUrl,
    fileName: fileName,
    fileSize: fileSize,
    thumbnail: mod.logo ? mod.logo.url : 'https://via.placeholder.com/280x160?text=No+Image',
    downloads: mod.downloadCount || 0,
    likes: mod.thumbsUpCount || 0,
    category: mod.classId === WORLDS_CLASS_ID ? 'World' : 'Map',
    version: latestFile ? (latestFile.gameVersions ? latestFile.gameVersions.join(', ') : 'Unknown') : 'Unknown',
    tags: mod.categories ? mod.categories.map(c => c.name) : [],
    source: 'CurseForge',
    createdAt: mod.dateCreated,
    updatedAt: mod.dateModified,
    isAvailable: !!downloadUrl
  };
}

// Get download URL for a specific map
app.get('/api/download/:modId', async (req, res) => {
  const modId = parseInt(req.params.modId);
  
  if (!modId) {
    return res.status(400).json({ error: 'Invalid mod ID' });
  }
  
  try {
    const headers = {
      'Accept': 'application/json',
      'x-api-key': CURSEFORGE_API_KEY
    };
    
    // Get mod details
    const modResponse = await fetch(`${CURSEFORGE_BASE_URL}/mods/${modId}`, {
      headers
    });
    
    if (!modResponse.ok) {
      throw new Error(`API error: ${modResponse.status}`);
    }
    
    const modData = await modResponse.json();
    const mod = modData.data;
    
    // Get files for this mod
    const filesResponse = await fetch(`${CURSEFORGE_BASE_URL}/mods/${modId}/files`, {
      headers
    });
    
    if (!filesResponse.ok) {
      throw new Error(`Files API error: ${filesResponse.status}`);
    }
    
    const filesData = await filesResponse.json();
    
    if (!filesData.data || filesData.data.length === 0) {
      return res.status(404).json({ error: 'No files found for this map' });
    }
    
    // Get the latest file with download URL
    const latestFile = filesData.data[0];
    
    // Try to get direct download URL
    let downloadUrl = latestFile.downloadUrl;
    let downloadMethod = 'direct';
    
    if (!downloadUrl) {
      // Use CurseForge API download endpoint
      downloadUrl = `https://www.curseforge.com/api/v1/mods/${modId}/files/${latestFile.id}/download`;
      downloadMethod = 'api';
    }
    
    res.json({
      success: true,
      modId: modId,
      modName: mod.name,
      downloadUrl: downloadUrl,
      fileName: latestFile.fileName,
      fileSize: latestFile.fileLength,
      fileSizeFormatted: formatFileSize(latestFile.fileLength),
      version: latestFile.gameVersions ? latestFile.gameVersions.join(', ') : 'Unknown',
      downloadMethod: downloadMethod,
      curseforgeUrl: `https://www.curseforge.com/minecraft/worlds/${mod.slug}`,
      uploadedAt: latestFile.fileDate
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to get download URL',
      message: error.message 
    });
  }
});

// Proxy download endpoint for CurseForge files
app.get('/api/download-file/:modId/:fileId', async (req, res) => {
  const modId = parseInt(req.params.modId);
  const fileId = parseInt(req.params.fileId);
  
  if (!modId || !fileId) {
    return res.status(400).json({ error: 'Invalid mod or file ID' });
  }
  
  try {
    // Redirect to CurseForge download
    const downloadUrl = `https://www.curseforge.com/api/v1/mods/${modId}/files/${fileId}/download`;
    res.redirect(downloadUrl);
  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiConfigured: !!CURSEFORGE_API_KEY,
    apiKeyPreview: CURSEFORGE_API_KEY ? CURSEFORGE_API_KEY.substring(0, 10) + '...' : 'Not set'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Minecraft Map Scraper Server running on port ${PORT}`);
  console.log(`API Key configured: ${CURSEFORGE_API_KEY ? 'Yes' : 'No'}`);
});
