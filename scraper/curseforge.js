const CURSEFORGE_API_BASE = 'https://api.curseforge.com/v1';

/**
 * CurseForge API Client for Minecraft Maps
 * 
 * Game ID: 432 (Minecraft)
 * Category ID: 17 (Worlds/Maps)
 * 
 * Get API key from: https://console.curseforge.com/
 */
class CurseForgeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Search for Minecraft maps on CurseForge
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} options.gameVersion - Filter by Minecraft version (e.g., '1.20.1')
   * @param {number} options.pageSize - Number of results (default: 20)
   * @param {number} options.index - Pagination offset (default: 0)
   * @returns {Promise<Array>} Array of map objects
   */
  async searchMaps(query, options = {}) {
    if (!this.apiKey) {
      throw new Error('CURSEFORGE_API_KEY is required. Get one at https://console.curseforge.com/');
    }

    const { gameVersion, pageSize = 20, index = 0 } = options;

    const url = new URL(`${CURSEFORGE_API_BASE}/mods/search`);
    url.searchParams.append('gameId', '432'); // Minecraft
    url.searchParams.append('classId', '17'); // Worlds/Maps
    url.searchParams.append('searchFilter', query);
    url.searchParams.append('pageSize', pageSize.toString());
    url.searchParams.append('index', index.toString());
    
    if (gameVersion) {
      url.searchParams.append('gameVersion', gameVersion);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60';
        throw new Error(`RATE_LIMITED: Rate limit exceeded. Retry after ${retryAfter} seconds.`);
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error(`AUTH_ERROR: Invalid API key. Check your CURSEFORGE_API_KEY. Status: ${response.status}`);
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API_ERROR: CurseForge API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('API_ERROR: Invalid response format from CurseForge API');
      }

      // Transform API response to internal format
      return data.data.map(mod => this.transformMapData(mod));

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('TIMEOUT: Request to CurseForge API timed out after 10 seconds');
      }
      
      // Re-throw our custom errors
      if (error.message.startsWith('RATE_LIMITED') || 
          error.message.startsWith('AUTH_ERROR') || 
          error.message.startsWith('API_ERROR') ||
          error.message.startsWith('TIMEOUT')) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new Error(`NETWORK_ERROR: ${error.message}`);
    }
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
   * Transform CurseForge API mod data to internal format
   * @param {Object} apiMod - Raw API response mod object
   * @returns {Object} Transformed map object
   */
  transformMapData(apiMod) {
    // Get the latest file for download URL
    const latestFile = apiMod.latestFiles?.[0];
    
    // Get download URL - prefer server CDN, fallback to direct URL
    let downloadUrl = null;
    if (latestFile) {
      downloadUrl = latestFile.downloadUrl || 
                   latestFile.serverPackFileId ||
                   `https://www.curseforge.com/minecraft/worlds/${apiMod.slug}/download`;
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
      downloadCount: apiMod.downloadCount || 0,
      gameVersions: gameVersions,
      primaryGameVersion: gameVersions[0] || null,
      category: this.getCategoryName(apiMod.classId),
      classId: apiMod.classId,
      dateCreated: apiMod.dateCreated,
      dateModified: apiMod.dateModified,
      source: 'curseforge',
      // Additional metadata
      isFeatured: apiMod.isFeatured || false,
      popularityScore: apiMod.popularityScore || 0,
      primaryLanguage: apiMod.primaryLanguage || 'en'
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
      // Make a simple request to validate the key
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
