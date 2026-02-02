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

// STRICT keyword mappings - only closely related terms
// Removed overly broad associations that cause false positives
const keywordMappings = {
  // Map types - keep synonyms closely related
  'castle': ['castle', 'fortress', 'citadel', 'stronghold', 'keep'],
  'city': ['city', 'town', 'metropolis', 'urban'],
  'village': ['village', 'hamlet', 'settlement'],
  'kingdom': ['kingdom', 'empire', 'realm'],
  
  // Game modes
  'adventure': ['adventure', 'quest', 'story', 'campaign', 'journey'],
  'survival': ['survival', 'survive', 'hardcore', 'stranded'],
  'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy'],
  'parkour': ['parkour', 'jump', 'obstacle', 'jumping'],
  'puzzle': ['puzzle', 'riddle', 'logic', 'maze', 'labyrinth'],
  'pvp': ['pvp', 'arena', 'battle', 'combat', 'duel'],
  
  // Themes - SEPARATE modern and futuristic to avoid conflation
  'modern': ['modern', 'contemporary', 'urban', 'city'],
  'futuristic': ['futuristic', 'future', 'scifi', 'sci-fi', 'space', 'advanced'],
  'scifi': ['scifi', 'sci-fi', 'space', 'alien', 'futuristic'],
  'tech': ['tech', 'technology', 'computer', 'machine'],
  
  'medieval': ['medieval', 'middle ages', 'knights', 'feudal'],
  'fantasy': ['fantasy', 'magic', 'wizard', 'enchanted'],
  'ancient': ['ancient', 'old', 'ruins', 'historical'],
  
  // Features
  'redstone': ['redstone', 'mechanism', 'automatic', 'circuit'],
  'house': ['house', 'home', 'mansion', 'residence', 'villa'],
  'skyblock': ['skyblock', 'sky', 'void', 'floating'],
  'dungeon': ['dungeon', 'cave', 'underground', 'catacomb'],
  'minigame': ['minigame', 'mini-game', 'arcade', 'party game'],
  
  // Transportation
  'railway': ['railway', 'rail', 'train', 'subway', 'metro', 'track'],
  'road': ['road', 'highway', 'path', 'street'],
  'bridge': ['bridge', 'tunnel'],
  
  // Environment
  'island': ['island', 'isles', 'atoll'],
  'underwater': ['underwater', 'ocean', 'submerged', 'aquatic'],
  'reef': ['reef', 'coral', 'barrier reef'],
  'mountain': ['mountain', 'peak', 'alpine'],
  'forest': ['forest', 'woods', 'jungle', 'trees'],
  'desert': ['desert', 'sand', 'sahara', 'arid']
};

// STRICT antonym/contrast mappings - terms that should reduce relevance when mismatched
const conflictingTerms = {
  'futuristic': ['medieval', 'ancient', 'historical', 'castle', 'knight'],
  'modern': ['medieval', 'ancient', 'fantasy', 'castle'],
  'medieval': ['futuristic', 'modern', 'scifi', 'space', 'tech'],
  'underwater': ['castle', 'city', 'sky', 'mountain'],
  'reef': ['castle', 'city', 'urban', 'mountain'],
  'skyblock': ['underwater', 'cave', 'dungeon'],
  'horror': ['cute', 'cozy', 'peaceful', 'relaxing']
};

// Check if text contains word with word boundaries (more precise matching)
function containsWord(text, word) {
  const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
  return regex.test(text.toLowerCase());
}

// Expand natural language query to search terms
function expandQuery(query) {
  const queryLower = query.toLowerCase();
  let searchTerms = [query];
  let expandedKeywords = [];
  
  for (const [key, synonyms] of Object.entries(keywordMappings)) {
    // Use word boundary matching for keyword detection
    if (containsWord(queryLower, key)) {
      // Only add synonyms that don't conflict with other query terms
      const relevantSynonyms = synonyms.filter(syn => {
        // Check if this synonym conflicts with any other term in the query
        for (const [queryWord, conflicts] of Object.entries(conflictingTerms)) {
          if (containsWord(queryLower, queryWord) && conflicts.includes(syn)) {
            return false; // Skip conflicting synonym
          }
        }
        return true;
      });
      
      searchTerms = [...searchTerms, ...relevantSynonyms];
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

// Calculate relevance score with penalty for mismatches
function calculateRelevance(map, query, searchTerms) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  let matchCount = 0;
  let penalty = 0;
  let hasExactMatch = false;
  
  const titleLower = map.title.toLowerCase();
  const descLower = map.description.toLowerCase();
  const tagsLower = map.tags ? map.tags.map(t => t.toLowerCase()) : [];
  const allText = titleLower + ' ' + descLower + ' ' + tagsLower.join(' ');
  
  // EXACT query match is most important - use word boundaries
  if (containsWord(titleLower, queryLower)) {
    score += 150;
    matchCount += 2;
    hasExactMatch = true;
  } else if (titleLower.includes(queryLower)) {
    score += 100;
    matchCount += 1.5;
    hasExactMatch = true;
  }
  
  // Individual query word matches with word boundaries
  queryWords.forEach(word => {
    if (containsWord(titleLower, word)) {
      score += 50;
      matchCount += 0.75;
    } else if (titleLower.includes(word)) {
      score += 30;
      matchCount += 0.5;
    }
  });
  
  // Expanded term matches (lower weight)
  searchTerms.forEach(term => {
    if (term !== query && term.length > 2) {
      if (containsWord(titleLower, term)) {
        score += 25;
        matchCount += 0.4;
      } else if (titleLower.includes(term)) {
        score += 12;
        matchCount += 0.2;
      }
    }
  });
  
  // Description matches (lower weight than title)
  if (containsWord(descLower, queryLower)) {
    score += 40;
    matchCount += 1;
  }
  queryWords.forEach(word => {
    if (containsWord(descLower, word)) {
      score += 15;
      matchCount += 0.3;
    }
  });
  
  // Tag matches
  if (map.tags) {
    map.tags.forEach(tag => {
      const tagLower = tag.toLowerCase();
      if (containsWord(tagLower, queryLower)) {
        score += 50;
        matchCount += 0.8;
      }
      queryWords.forEach(word => {
        if (containsWord(tagLower, word)) {
          score += 25;
          matchCount += 0.4;
        }
      });
    });
  }
  
  // PENALTY: Check for conflicting terms in result
  for (const [term, conflicts] of Object.entries(conflictingTerms)) {
    if (containsWord(queryLower, term)) {
      // Query contains this term, check if result has conflicting terms
      conflicts.forEach(conflict => {
        if (containsWord(allText, conflict)) {
          penalty += 35; // Penalty for mismatch
        }
      });
    }
  }
  
  // Apply penalty
  score = Math.max(0, score - penalty);
  
  // Boost by popularity (but only if there's some relevance)
  if (matchCount > 0) {
    score += Math.log10(map.downloads + 1) * 3;
    score += Math.log10(map.likes + 1) * 2;
  }
  
  return { score, matchCount, penalty, hasExactMatch };
}

// Minimum relevance threshold to filter false positives
// Adjusted thresholds to achieve <5% false positive rate while maintaining recall
const MIN_RELEVANCE_SCORE = 30;
const MIN_MATCH_COUNT = 0.5;

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
    
    let results = await searchCurseForge(searchTerms, limit * 3);
    
    // Calculate relevance and filter false positives
    results = results.map(map => {
      const relevance = calculateRelevance(map, query, searchTerms);
      return {
        ...map,
        relevanceScore: relevance.score,
        matchCount: relevance.matchCount,
        penalty: relevance.penalty,
        hasExactMatch: relevance.hasExactMatch
      };
    }).filter(map => {
      // Filter out low-relevance results (false positives)
      // Exact title matches always pass through
      if (map.hasExactMatch) return true;
      // Otherwise must meet minimum thresholds
      return map.relevanceScore >= MIN_RELEVANCE_SCORE && map.matchCount >= MIN_MATCH_COUNT;
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    
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
