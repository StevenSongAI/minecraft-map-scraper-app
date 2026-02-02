const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;
const WORLDS_CLASS_ID = 17; // Maps/Worlds category

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
   * Extract search keywords from natural language query
   * @param {string} query - Natural language query
   * @returns {Object} Extracted keywords and search terms
   */
  extractSearchTerms(query) {
    const lowerQuery = query.toLowerCase();
    
    // Map category keywords
    const categoryMap = {
      'adventure': ['adventure', 'quest', 'story', 'rpg', 'exploration'],
      'survival': ['survival', 'island', 'skyblock', 'hardcore', 'stranded'],
      'parkour': ['parkour', 'jump', 'jumping', 'obstacle', 'course'],
      'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy', 'dark'],
      'puzzle': ['puzzle', 'maze', 'brain', 'logic', 'redstone'],
      'pvp': ['pvp', 'arena', 'combat', 'battle', 'fight', 'war'],
      'creation': ['creation', 'build', 'city', 'town', 'village', 'castle'],
      'modern': ['modern', 'contemporary', 'futuristic', 'sci-fi', 'cyberpunk'],
      'medieval': ['medieval', 'castle', 'fortress', 'kingdom', 'fantasy'],
      'house': ['house', 'home', 'mansion', 'estate', 'building']
    };
    
    // Detect categories from query
    const detectedCategories = [];
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(kw => lowerQuery.includes(kw))) {
        detectedCategories.push(category);
      }
    }
    
    // Extract key features
    const features = [];
    const featureKeywords = [
      'redstone', 'railway', 'rail', 'train', 'metro', 'subway',
      'multiplayer', 'singleplayer', 'coop', 'co-op',
      'checkpoints', 'secrets', 'hidden', 'easter egg',
      'decorated', 'detailed', 'large', 'small', 'mini',
      'automatic', 'flying', 'underwater', 'space', 'nether', 'end'
    ];
    
    for (const feature of featureKeywords) {
      if (lowerQuery.includes(feature)) {
        features.push(feature);
      }
    }
    
    // Build optimized search query
    const searchTerms = [...new Set([...detectedCategories, ...features])];
    
    const optimizedQuery = searchTerms.length > 0 
      ? `${query} ${searchTerms.join(' ')}`
      : query;
    
    return {
      originalQuery: query,
      optimizedQuery: optimizedQuery,
      categories: detectedCategories,
      features: features
    };
  }

  /**
   * Search for Minecraft maps on CurseForge with natural language support
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
    
    // Extract and optimize search terms for natural language queries
    const searchTerms = this.extractSearchTerms(query);
    console.log(`[CurseForge] Searching for: "${query}"`);
    console.log(`[CurseForge] Optimized query: "${searchTerms.optimizedQuery}"`);
    console.log(`[CurseForge] Detected categories: ${searchTerms.categories.join(', ') || 'none'}`);

    const url = new URL(`${CURSEFORGE_API_BASE}/mods/search`);
    url.searchParams.append('gameId', MINECRAFT_GAME_ID.toString());
    url.searchParams.append('classId', WORLDS_CLASS_ID.toString());
    url.searchParams.append('searchFilter', searchTerms.optimizedQuery);
    url.searchParams.append('pageSize', Math.min(pageSize, 50).toString());
    url.searchParams.append('index', index.toString());
    
    // Sort by popularity
    if (sortBy === 'popularity') {
      url.searchParams.append('sortField', '6'); // 6 = Popularity
      url.searchParams.append('sortOrder', 'desc');
    }
    
    if (gameVersion) {
      url.searchParams.append('gameVersion', gameVersion);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

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
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API_ERROR: CurseForge API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('API_ERROR: Invalid response format from CurseForge API');
      }

      // Transform and sort by relevance
      const maps = data.data.map(mod => this.transformMapData(mod));
      return this.sortByRelevance(maps, query, searchTerms);

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('TIMEOUT: Request to CurseForge API timed out after 15 seconds');
      }
      
      if (error.message.startsWith('RATE_LIMITED') || 
          error.message.startsWith('AUTH_ERROR') || 
          error.message.startsWith('API_ERROR') ||
          error.message.startsWith('TIMEOUT')) {
        throw error;
      }
      
      throw new Error(`NETWORK_ERROR: ${error.message}`);
    }
  }

  /**
   * Sort maps by relevance to the query
   * @param {Array} maps - Array of map objects
   * @param {string} query - Original search query
   * @param {Object} searchTerms - Extracted search terms
   * @returns {Array} Sorted maps
   */
  sortByRelevance(maps, query, searchTerms) {
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    
    return maps.sort((a, b) => {
      let scoreA = this.calculateRelevanceScore(a, lowerQuery, queryWords, searchTerms);
      let scoreB = this.calculateRelevanceScore(b, lowerQuery, queryWords, searchTerms);
      
      // Factor in popularity
      scoreA += Math.log10((a.downloadCount || 0) + 1) * 0.5;
      scoreB += Math.log10((b.downloadCount || 0) + 1) * 0.5;
      
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate relevance score for a map
   */
  calculateRelevanceScore(map, lowerQuery, queryWords, searchTerms) {
    let score = 0;
    const nameLower = (map.name || '').toLowerCase();
    const summaryLower = (map.summary || '').toLowerCase();
    const descLower = (map.description || '').toLowerCase();
    const searchableText = `${nameLower} ${summaryLower} ${descLower}`;
    
    // Exact name match gets highest score
    if (nameLower.includes(lowerQuery)) {
      score += 100;
    }
    
    // Partial name match
    for (const word of queryWords) {
      if (nameLower.includes(word)) {
        score += 20;
      }
    }
    
    // Summary/description matches
    if (summaryLower.includes(lowerQuery) || descLower.includes(lowerQuery)) {
      score += 30;
    }
    
    for (const word of queryWords) {
      if (summaryLower.includes(word) || descLower.includes(word)) {
        score += 5;
      }
    }
    
    // Category matches
    for (const cat of searchTerms.categories) {
      if (searchableText.includes(cat)) {
        score += 15;
      }
    }
    
    // Feature matches
    for (const feature of searchTerms.features) {
      if (searchableText.includes(feature)) {
        score += 10;
      }
    }
    
    return score;
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
