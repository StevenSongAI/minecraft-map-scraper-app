const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;
const WORLDS_CLASS_ID = 17; // Maps/Worlds category

/**
 * Enhanced semantic keyword mappings for accurate search
 * Maps user query concepts to all related semantic equivalents
 */
const SEMANTIC_KEYWORD_MAP = {
  // Underwater themes
  'underwater': ['underwater', 'ocean', 'sea', 'atlantis', 'submarine', 'aquatic', 'marine', 'deep sea', 'undersea', 'sunken'],
  'ocean': ['ocean', 'sea', 'underwater', 'aquatic', 'marine', 'nautical', 'submarine', 'atlantis'],
  'sea': ['sea', 'ocean', 'underwater', 'aquatic', 'marine', 'nautical'],
  'atlantis': ['atlantis', 'underwater', 'sunken', 'lost city', 'ocean'],
  
  // Hell/Nether themes
  'hell': ['hell', 'nether', 'inferno', 'demon', 'demonic', 'underworld', 'hades', 'lava', 'fire', 'flame', 'brimstone'],
  'nether': ['nether', 'hell', 'inferno', 'demon', 'demonic', 'underworld', 'lava', 'fire', 'flame'],
  'inferno': ['inferno', 'hell', 'nether', 'fire', 'flame', 'lava', 'demon'],
  'demon': ['demon', 'demonic', 'hell', 'nether', 'underworld', 'satan'],
  
  // Fantasy/Medieval themes
  'castle': ['castle', 'fortress', 'citadel', 'stronghold', 'palace', 'keep', 'tower', 'bastion', 'chateau'],
  'medieval': ['medieval', 'fantasy', 'ancient', 'historical', 'middle ages', 'knights', 'kingdom', 'feudal'],
  'fantasy': ['fantasy', 'magic', 'wizard', 'sorcery', 'enchanted', 'mystical', 'medieval'],
  'dragon': ['dragon', 'wyvern', 'drake', 'wyrm', 'fantasy'],
  
  // Modern/Futuristic themes
  'modern': ['modern', 'contemporary', 'urban', 'city', 'skyscraper', 'downtown'],
  'futuristic': ['futuristic', 'future', 'scifi', 'sci-fi', 'space', 'advanced', 'tech', 'cyberpunk', 'neon'],
  'cyberpunk': ['cyberpunk', 'neon', 'futuristic', 'dystopian', 'tech', 'hacker'],
  'space': ['space', 'sci-fi', 'scifi', 'starship', 'planet', 'cosmic', 'galaxy', 'asteroid'],
  
  // City/Urban themes
  'city': ['city', 'town', 'village', 'metropolis', 'urban', 'settlement', 'kingdom', 'municipal'],
  'town': ['town', 'city', 'village', 'settlement', 'hamlet', 'community'],
  
  // Transportation themes
  'railway': ['railway', 'rail', 'train', 'subway', 'metro', 'transport', 'track', 'locomotive', 'station'],
  'train': ['train', 'railway', 'rail', 'locomotive', 'subway', 'metro', 'tram'],
  'highway': ['highway', 'road', 'path', 'bridge', 'tunnel', 'transportation', 'freeway', 'motorway'],
  
  // Building types
  'house': ['house', 'home', 'mansion', 'estate', 'building', 'residence', 'villa', 'cottage', 'dwelling'],
  'mansion': ['mansion', 'estate', 'villa', 'manor', 'house', 'home', 'luxury'],
  
  // Game modes
  'adventure': ['adventure', 'quest', 'story', 'rpg', 'campaign', 'journey', 'exploration', 'dungeon'],
  'survival': ['survival', 'survive', 'hardcore', 'stranded', 'island', 'wilderness', 'challenge'],
  'skyblock': ['skyblock', 'sky', 'island', 'void', 'floating', 'void world', 'floating islands'],
  'parkour': ['parkour', 'jump', 'challenge', 'obstacle', 'parkor', 'jumping', 'speedrun', 'sprint'],
  'puzzle': ['puzzle', 'mystery', 'riddle', 'logic', 'brain', 'maze', 'labyrinth', 'escape room'],
  'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy', 'terror', 'nightmare', 'fear', 'dark'],
  'pvp': ['pvp', 'arena', 'battle', 'combat', 'fight', 'war', 'duel', 'faction'],
  'minigame': ['minigame', 'mini-game', 'game', 'arcade', 'party game', 'multiplayer', 'party'],
  
  // Environment themes
  'dungeon': ['dungeon', 'cave', 'underground', 'mines', 'cavern', 'tomb', 'catacomb', 'prison'],
  'forest': ['forest', 'woods', 'jungle', 'woodland', 'grove', 'taiga'],
  'desert': ['desert', 'sandy', 'oasis', 'pyramid', 'egypt', 'sahara'],
  'winter': ['winter', 'snow', 'ice', 'frozen', 'arctic', 'christmas', 'holiday'],
  'jungle': ['jungle', 'rainforest', 'tropical', 'amazon', 'wilderness'],
  
  // Redstone/Tech
  'redstone': ['redstone', 'mechanism', 'automatic', 'contraption', 'circuit', 'wire', 'computer', 'tech'],
  
  // Biome-specific
  'end': ['end', 'ender', 'enderman', 'void', 'dragon', 'outer islands'],
  'swamp': ['swamp', 'marsh', 'bog', 'wetland', 'bayou'],
  'mountain': ['mountain', 'alpine', 'peak', 'cliff', 'highlands', 'valley'],
  
  // Special themes
  'pixelart': ['pixelart', 'pixel art', 'pixel', '2d', 'image', 'picture'],
  'replica': ['replica', 'realistic', 'real world', 'landmark', 'famous', 'building'],
  'park': ['park', 'amusement', 'theme park', 'zoo', 'garden', 'playground'],
  'school': ['school', 'academy', 'university', 'college', 'campus', 'classroom'],
  'hospital': ['hospital', 'medical', 'clinic', 'asylum', 'sanatorium']
};

/**
 * Score thresholds for result filtering
 */
const RELEVANCE_THRESHOLD = 15; // Minimum score to be included in results

/**
 * CurseForge API Client for Minecraft Maps
 * 
 * Get API key from: https://console.curseforge.com/
 */
class CurseForgeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Extract search keywords from natural language query with semantic expansion
   * @param {string} query - Natural language query
   * @returns {Object} Extracted keywords and expanded search terms
   */
  extractSearchTerms(query) {
    const lowerQuery = query.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    
    // Collect all semantic equivalents for matched keywords
    const expandedKeywords = new Set();
    const matchedCategories = [];
    
    for (const [concept, synonyms] of Object.entries(SEMANTIC_KEYWORD_MAP)) {
      // Check if query contains this concept or any of its synonyms
      const isMatch = synonyms.some(term => 
        lowerQuery.includes(term) || 
        queryWords.some(word => term.includes(word) || word.includes(term))
      );
      
      if (isMatch) {
        matchedCategories.push(concept);
        synonyms.forEach(syn => expandedKeywords.add(syn));
      }
    }
    
    // If no semantic matches, use the query words themselves
    if (expandedKeywords.size === 0) {
      queryWords.forEach(word => expandedKeywords.add(word));
    }
    
    // Always include the original query
    const allSearchTerms = [lowerQuery, ...Array.from(expandedKeywords)];
    
    // Remove duplicates and limit to reasonable number for API
    const uniqueTerms = [...new Set(allSearchTerms)].slice(0, 8);
    
    // Create optimized search query - prioritize important terms
    const primaryTerm = lowerQuery;
    const secondaryTerms = Array.from(expandedKeywords)
      .filter(t => t !== lowerQuery)
      .slice(0, 5)
      .join(' ');
    
    const optimizedQuery = secondaryTerms 
      ? `${primaryTerm} ${secondaryTerms}`
      : primaryTerm;

    return {
      originalQuery: query,
      optimizedQuery: optimizedQuery,
      primaryTerm: primaryTerm,
      expandedTerms: Array.from(expandedKeywords),
      matchedCategories: matchedCategories,
      allSearchTerms: uniqueTerms
    };
  }

  /**
   * Calculate relevance score with semantic matching
   * @param {Object} map - Map object
   * @param {string} query - Original query
   * @param {Object} searchTerms - Extracted search terms
   * @returns {number} Relevance score
   */
  calculateRelevanceScore(map, query, searchTerms) {
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    
    const nameLower = (map.name || '').toLowerCase();
    const summaryLower = (map.summary || '').toLowerCase();
    const descLower = (map.description || '').toLowerCase();
    const searchableText = `${nameLower} ${summaryLower} ${descLower}`;
    
    let score = 0;
    let hasAnyMatch = false;
    
    // === TITLE MATCHES (Highest weight) ===
    
    // Exact title match
    if (nameLower === lowerQuery) {
      score += 200;
      hasAnyMatch = true;
    }
    // Title contains full query
    else if (nameLower.includes(lowerQuery)) {
      score += 100;
      hasAnyMatch = true;
    }
    
    // Title contains query words
    for (const word of queryWords) {
      if (nameLower.includes(word)) {
        score += 30;
        hasAnyMatch = true;
      }
    }
    
    // Title contains expanded semantic terms
    for (const term of searchTerms.expandedTerms) {
      if (nameLower.includes(term.toLowerCase())) {
        score += 25;
        hasAnyMatch = true;
      }
    }
    
    // === DESCRIPTION MATCHES ===
    
    // Full query in description
    if (summaryLower.includes(lowerQuery) || descLower.includes(lowerQuery)) {
      score += 40;
      hasAnyMatch = true;
    }
    
    // Query words in description
    for (const word of queryWords) {
      if (summaryLower.includes(word) || descLower.includes(word)) {
        score += 10;
        hasAnyMatch = true;
      }
    }
    
    // Expanded terms in description
    for (const term of searchTerms.expandedTerms) {
      if (summaryLower.includes(term.toLowerCase()) || descLower.includes(term.toLowerCase())) {
        score += 8;
        hasAnyMatch = true;
      }
    }
    
    // === CATEGORY/CONCEPT MATCHES ===
    
    for (const category of searchTerms.matchedCategories) {
      const categoryTerms = SEMANTIC_KEYWORD_MAP[category] || [category];
      for (const catTerm of categoryTerms) {
        if (searchableText.includes(catTerm.toLowerCase())) {
          score += 15;
          hasAnyMatch = true;
          break; // Only count once per category
        }
      }
    }
    
    // === PENALTY FOR IRRELEVANCE ===
    
    // If no keyword matches at all, heavily penalize
    if (!hasAnyMatch) {
      score -= 100;
    }
    
    // === POPULARITY BONUS (Secondary factor) ===
    
    // Add small bonus for popularity (logarithmic to prevent dominance)
    const popularityBonus = Math.log10((map.downloadCount || 0) + 1) * 2;
    score += popularityBonus;
    
    return Math.max(0, score); // Ensure non-negative
  }

  /**
   * Filter and sort results by relevance
   * @param {Array} maps - Array of map objects
   * @param {string} query - Original search query
   * @param {Object} searchTerms - Extracted search terms
   * @param {number} minScore - Minimum relevance score threshold
   * @returns {Array} Filtered and sorted maps
   */
  filterAndSortByRelevance(maps, query, searchTerms, minScore = RELEVANCE_THRESHOLD) {
    // Calculate scores for all maps
    const scoredMaps = maps.map(map => ({
      ...map,
      _relevanceScore: this.calculateRelevanceScore(map, query, searchTerms)
    }));
    
    // Filter out results below threshold
    const filteredMaps = scoredMaps.filter(map => map._relevanceScore >= minScore);
    
    // Sort by relevance score (descending)
    const sortedMaps = filteredMaps.sort((a, b) => b._relevanceScore - a._relevanceScore);
    
    // Remove internal score field before returning
    return sortedMaps.map(({ _relevanceScore, ...map }) => map);
  }

  /**
   * Search for Minecraft maps on CurseForge with enhanced semantic search
   * @param {string} query - Search query (natural language supported)
   * @param {Object} options - Search options
   * @param {string} options.gameVersion - Filter by Minecraft version
   * @param {number} options.pageSize - Number of results (default: 20, max: 50)
   * @param {number} options.index - Pagination offset
   * @returns {Promise<Array>} Array of map objects
   */
  async searchMaps(query, options = {}) {
    if (!this.apiKey) {
      throw new Error('CURSEFORGE_API_KEY is required. Get one at https://console.curseforge.com/');
    }

    const { gameVersion, pageSize = 20, index = 0, sortBy = 'popularity' } = options;
    
    // Extract and expand search terms
    const searchTerms = this.extractSearchTerms(query);
    console.log(`[CurseForge] Searching for: "${query}"`);
    console.log(`[CurseForge] Expanded terms: ${searchTerms.expandedTerms.join(', ')}`);
    console.log(`[CurseForge] Categories: ${searchTerms.matchedCategories.join(', ') || 'none'}`);

    // Try multiple search strategies
    const allResults = [];
    const seenIds = new Set();
    
    // Strategy 1: Search with primary query
    const searchQueries = [
      searchTerms.primaryTerm,
      ...searchTerms.expandedTerms.slice(0, 3) // Add top expanded terms
    ];
    
    for (const searchQuery of searchQueries) {
      try {
        const url = new URL(`${CURSEFORGE_API_BASE}/mods/search`);
        url.searchParams.append('gameId', MINECRAFT_GAME_ID.toString());
        url.searchParams.append('classId', WORLDS_CLASS_ID.toString());
        url.searchParams.append('searchFilter', searchQuery);
        url.searchParams.append('pageSize', Math.min(pageSize * 2, 50).toString()); // Get more for filtering
        url.searchParams.append('index', index.toString());
        
        // Sort by popularity initially
        if (sortBy === 'popularity') {
          url.searchParams.append('sortField', '6'); // 6 = Popularity
          url.searchParams.append('sortOrder', 'desc');
        }
        
        if (gameVersion) {
          url.searchParams.append('gameVersion', gameVersion);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url.toString(), {
          headers: {
            'x-api-key': this.apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '60';
          throw new Error(`RATE_LIMITED: Rate limit exceeded. Retry after ${retryAfter} seconds.`);
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error(`AUTH_ERROR: Invalid API key. Check your CURSEFORGE_API_KEY. Status: ${response.status}`);
        }

        if (!response.ok) {
          console.warn(`[CurseForge] Search failed for "${searchQuery}": ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.data && Array.isArray(data.data)) {
          for (const mod of data.data) {
            if (!seenIds.has(mod.id)) {
              seenIds.add(mod.id);
              allResults.push(this.transformMapData(mod));
            }
          }
        }
      } catch (error) {
        if (error.message.startsWith('RATE_LIMITED') || 
            error.message.startsWith('AUTH_ERROR')) {
          throw error;
        }
        console.warn(`[CurseForge] Error searching "${searchQuery}":`, error.message);
      }
    }

    console.log(`[CurseForge] Raw results: ${allResults.length}`);
    
    // Filter and sort by semantic relevance
    const filteredResults = this.filterAndSortByRelevance(allResults, query, searchTerms);
    
    console.log(`[CurseForge] Filtered results: ${filteredResults.length} (threshold: ${RELEVANCE_THRESHOLD})`);
    
    // Limit to requested page size
    return filteredResults.slice(0, pageSize);
  }

  /**
   * Get detailed info for a specific map
   * @param {number} modId - The CurseForge mod ID
   * @returns {Promise<Object>} Map object
   */
  async getMap(modId) {
    if (!this.apiKey) {
      throw new Error('CURSEFORGE_API_KEY is required');
    }

    const url = `${CURSEFORGE_API_BASE}/mods/${modId}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60';
        throw new Error(`RATE_LIMITED: Rate limit exceeded. Retry after ${retryAfter} seconds.`);
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(`AUTH_ERROR: Invalid API key. Status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`API_ERROR: CurseForge API returned ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.data) {
        throw new Error('API_ERROR: Invalid response format');
      }

      return this.transformMapData(data.data);

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('TIMEOUT: Request to CurseForge API timed out');
      }
      throw error;
    }
  }

  /**
   * Get download URL for a specific file
   * @param {number} modId - Mod ID
   * @param {number} fileId - File ID
   * @returns {Promise<string>} Download URL
   */
  async getDownloadUrl(modId, fileId) {
    if (!this.apiKey) {
      throw new Error('CURSEFORGE_API_KEY is required');
    }

    const url = `${CURSEFORGE_API_BASE}/mods/${modId}/files/${fileId}/download-url`;

    try {
      const response = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API_ERROR: Failed to get download URL: ${response.status}`);
      }

      const data = await response.json();
      return data.data;

    } catch (error) {
      throw new Error(`DOWNLOAD_URL_ERROR: ${error.message}`);
    }
  }

  /**
   * Transform CurseForge API mod data to internal format
   * @param {Object} apiMod - Raw API response mod object
   * @returns {Object} Transformed map object
   */
  transformMapData(apiMod) {
    // Get the latest file for download URL
    const latestFile = apiMod.latestFiles?.[0];
    const primaryFile = apiMod.latestFilesIndexes?.[0];
    
    // Get download URL - try multiple sources
    let downloadUrl = null;
    if (latestFile) {
      downloadUrl = latestFile.downloadUrl || 
                   (latestFile.serverPackFileId ? `https://www.curseforge.com/api/v1/mods/${apiMod.id}/files/${latestFile.id}/download` : null) ||
                   `https://www.curseforge.com/minecraft/worlds/${apiMod.slug}/download`;
    }
    
    // Alternative: construct download URL from primary file
    if (!downloadUrl && primaryFile) {
      downloadUrl = `https://www.curseforge.com/api/v1/mods/${apiMod.id}/files/${primaryFile.fileId}/download`;
    }
    
    // Fallback to project page
    if (!downloadUrl) {
      downloadUrl = `https://www.curseforge.com/minecraft/worlds/${apiMod.slug}`;
    }

    // Transform authors
    const primaryAuthor = apiMod.authors?.[0];
    const author = primaryAuthor ? {
      name: primaryAuthor.name,
      url: primaryAuthor.url || `https://www.curseforge.com/members/${primaryAuthor.name}`
    } : {
      name: 'Unknown',
      url: ''
    };

    // Extract game versions from latest file
    const gameVersions = latestFile?.gameVersions || [];
    
    // Transform screenshots
    const screenshots = apiMod.screenshots?.map(s => ({
      url: s.url,
      thumbnailUrl: s.thumbnailUrl || s.url
    })) || [];
    
    // Get file information for download
    const fileInfo = latestFile ? {
      id: latestFile.id,
      filename: latestFile.fileName,
      filesize: latestFile.fileLength,
      uploadDate: latestFile.fileDate
    } : null;

    return {
      id: apiMod.id,
      name: apiMod.name,
      slug: apiMod.slug,
      summary: apiMod.summary || '',
      description: apiMod.description || apiMod.summary || '',
      author: author,
      thumbnail: apiMod.logo?.url || apiMod.logo?.thumbnailUrl || '',
      screenshots: screenshots,
      downloadUrl: downloadUrl,
      fileInfo: fileInfo,
      downloadCount: apiMod.downloadCount || 0,
      gameVersions: gameVersions,
      primaryGameVersion: gameVersions[0] || null,
      category: this.getCategoryName(apiMod.classId),
      classId: apiMod.classId,
      dateCreated: apiMod.dateCreated,
      dateModified: apiMod.dateModified,
      source: 'curseforge',
      isFeatured: apiMod.isFeatured || false,
      popularityScore: apiMod.popularityScore || 0,
      primaryLanguage: apiMod.primaryLanguage || 'en',
      curseforge: {
        modId: apiMod.id,
        fileId: latestFile?.id || primaryFile?.fileId || null
      }
    };
  }

  /**
   * Get human-readable category name from class ID
   * @param {number} classId 
   * @returns {string}
   */
  getCategoryName(classId) {
    const categories = {
      17: 'World',      // Worlds/Maps
      6: 'Mod',
      12: 'Resource Pack',
      4559: 'Data Pack',
      4471: 'Shader'
    };
    return categories[classId] || 'Other';
  }

  /**
   * Get API status and key validation
   * @returns {Promise<Object>} Status info
   */
  async getStatus() {
    if (!this.apiKey) {
      return {
        valid: false,
        error: 'No API key configured'
      };
    }

    try {
      const url = `${CURSEFORGE_API_BASE}/games`;
      const response = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        return {
          valid: true,
          message: 'API key is valid'
        };
      } else if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          error: 'Invalid API key'
        };
      } else {
        return {
          valid: false,
          error: `API returned status ${response.status}`
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = CurseForgeClient;