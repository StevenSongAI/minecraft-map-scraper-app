/**
 * Modrinth API Scraper
 * Uses the official Modrinth API for Minecraft maps/worlds
 * No Cloudflare blocks, reliable JSON API
 */

const { BaseScraper } = require('./base');

class ModrinthScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'modrinth',
      baseUrl: 'https://api.modrinth.com/v2',
      sourceName: 'Modrinth',
      ...options
    });
    this.requestTimeout = options.requestTimeout || 10000; // FIXED (Round 10): 10s timeout
  }

  async search(query, options = {}) {
    const { limit = 8 } = options;
    
    return this.searchWithCache(query, options, async (q, opts) => {
      return this.circuitBreaker.execute(async () => {
        return this.rateLimitedRequest(async () => {
          try {
            // fetchSearchResults already transforms results, don't double-transform
            const results = await this.fetchSearchResults(query, limit);
            return results;
          } catch (error) {
            console.warn(`[Modrinth] Search error: ${error.message}`);
            return [];
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    // FIXED (Round 10): Search without project type restriction to get all content
    // Then filter for map-related keywords
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/search?query=${encodedQuery}&limit=${Math.min(limit * 2, 40)}&offset=0`;
    
    console.log(`[Modrinth] Fetching: ${searchUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
    
    try {
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MinecraftMapScraper/2.0 (+https://github.com/StevenSongAI/minecraft-map-scraper-app)',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const results = data.hits || [];
      
      // FIXED (Round 10): Stricter filtering to exclude pure mods
      const filteredResults = results.filter(hit => {
        const text = `${hit.title || ''} ${hit.description || ''}`.toLowerCase();
        
        // Must have at least one strong map indicator
        const strongMapKeywords = ['map', 'world', 'adventure', 'structure', 'datapack', 'castle', 'city build'];
        const hasStrongIndicator = strongMapKeywords.some(kw => text.includes(kw));
        
        // Exclude obvious non-map content (weapons, armor, tech mods, etc.)
        // Use regex with word boundaries to catch plurals and variations
        const exclusionPatterns = [
          /weapon/, /gun/, /armor/, /sword/, /integration/, /mekanism/, /robot/, 
          /vehicle/, /car/, /plane/, /magic spell/, /enchantment/, /\btool\b/, /axe/, /pickaxe/,
          /mod\b/, /plugin/  // Exclude things explicitly marked as mods/plugins
        ];
        const hasExclusion = exclusionPatterns.some(pattern => pattern.test(text));
        
        // FIXED (Round 10): If it has exclusion keywords, always exclude it
        // Only accept if: (has strong indicator AND no exclusion) OR is datapack/worldgen
        if (hasExclusion) {
          return false; // Always exclude mods with weapon/armor/tech keywords
        }
        
        // Accept if has strong indicator OR is explicitly a datapack/worldgen
        const isDatapack = hit.project_type === 'datapack';
        const hasWorldGenCategory = hit.categories && hit.categories.some(cat => 
          ['worldgen', 'world-generation', 'adventure'].includes(cat));
        
        return hasStrongIndicator || isDatapack || hasWorldGenCategory;
      });
      
      console.log(`[Modrinth] Found ${results.length} results, ${filteredResults.length} map-related`);
      
      // FIXED (Round 10): Use sync transform to avoid timeout issues
      // Fetch version info separately only when needed
      const transformedResults = filteredResults.map(hit => this.transformHitToMapSync(hit));
      return transformedResults;
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  transformHitToMapSync(hit) {
    // FIXED (Round 10): Get proper thumbnail and use sync transform
    // FIXED (Round 10): Use 'name' field to match CurseForge format
    // FIXED (Round 11): Better download URL handling with version info
    const projectId = hit.project_id || hit.slug;
    
    // Use project page as default, will be updated with direct URL when available
    const downloadUrl = `https://modrinth.com/project/${hit.slug}/versions`;
    
    return {
      id: projectId,
      name: hit.title,
      title: hit.title,
      slug: hit.slug,
      summary: hit.description || '',
      description: hit.description || '',
      author: {
        name: hit.author || 'Unknown',
        url: hit.author ? `https://modrinth.com/user/${hit.author}` : ''
      },
      thumbnail: hit.icon_url || hit.gallery?.[0]?.url || '',
      screenshots: hit.gallery || [],
      downloadUrl: downloadUrl,
      downloadType: 'page',
      downloadNote: 'Visit Modrinth page to download',
      fileInfo: null,
      downloadCount: hit.downloads || 0,
      downloads: hit.downloads || 0,
      gameVersions: hit.versions || [],
      primaryGameVersion: hit.versions?.[0] || null,
      category: this.detectCategory(hit.title, hit.description),
      dateCreated: hit.date_created || new Date().toISOString(),
      dateModified: hit.date_modified || new Date().toISOString(),
      source: 'modrinth',
      sourceName: 'Modrinth',
      isFeatured: hit.featured || false,
      popularityScore: Math.log10((hit.downloads || 0) + 1),
      primaryLanguage: 'en',
      curseforge: {
        modId: null,
        fileId: null
      },
      likes: hit.follows || 0,
      license: hit.license || '',
      clientSide: hit.client_side,
      serverSide: hit.server_side,
      url: `https://modrinth.com/project/${hit.slug}`,
      // Store version IDs for later download URL fetching
      _versionIds: hit.versions || []
    };
  }

  /**
   * CRITICAL FIX (Round 11): Fetch direct download URL for a project
   * This method can be called separately to get the actual download URL
   */
  async fetchDirectDownloadUrl(projectId, versionId = null) {
    try {
      // If no version ID provided, fetch latest version first
      let targetVersionId = versionId;
      
      if (!targetVersionId) {
        const versionsUrl = `${this.baseUrl}/project/${projectId}/version`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const versionsResponse = await fetch(versionsUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': this.getUserAgent(),
            'Accept': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!versionsResponse.ok) {
          console.warn(`[Modrinth] Failed to fetch versions for ${projectId}: ${versionsResponse.status}`);
          return null;
        }
        
        const versions = await versionsResponse.json();
        if (!versions || versions.length === 0) {
          return null;
        }
        
        // Find first version with files
        const versionWithFiles = versions.find(v => v.files && v.files.length > 0);
        if (!versionWithFiles) {
          return null;
        }
        
        targetVersionId = versionWithFiles.id;
      }
      
      // Now fetch the specific version to get download URL
      // FIXED (Round 11): Use correct endpoint format
      const versionUrl = `${this.baseUrl}/version/${targetVersionId}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(versionUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`[Modrinth] Failed to fetch version ${targetVersionId}: ${response.status}`);
        return null;
      }
      
      const versionData = await response.json();
      
      if (!versionData.files || versionData.files.length === 0) {
        return null;
      }
      
      // Get primary file or first file
      const primaryFile = versionData.files.find(f => f.primary) || versionData.files[0];
      
      return {
        downloadUrl: primaryFile.url,
        filename: primaryFile.filename,
        filesize: primaryFile.size,
        version: versionData.version_number,
        gameVersions: versionData.game_versions || []
      };
    } catch (error) {
      console.warn(`[Modrinth] Error fetching direct download: ${error.message}`);
      return null;
    }
  }

  async getLatestVersionInfo(projectId) {
    // CRITICAL FIX (Round 11): Use correct API endpoint format
    try {
      // First get versions list
      const versionsUrl = `${this.baseUrl}/project/${projectId}/version`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(versionsUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return null;
      }
      
      const versions = await response.json();
      if (!versions || versions.length === 0) {
        return null;
      }
      
      // Get the first version ID
      const latestVersion = versions[0];
      const versionId = latestVersion.id;
      
      // CRITICAL FIX: Fetch the specific version for file details
      const versionDetailUrl = `${this.baseUrl}/version/${versionId}`;
      const detailController = new AbortController();
      const detailTimeoutId = setTimeout(() => detailController.abort(), 3000);
      
      const detailResponse = await fetch(versionDetailUrl, {
        signal: detailController.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(detailTimeoutId);
      
      if (!detailResponse.ok) {
        return null;
      }
      
      const versionData = await detailResponse.json();
      const primaryFile = versionData.files?.find(f => f.primary) || versionData.files?.[0];
      
      if (!primaryFile) {
        return null;
      }
      
      return {
        downloadUrl: primaryFile.url,
        fileInfo: {
          id: versionData.id,
          filename: primaryFile.filename,
          filesize: primaryFile.size,
          version: versionData.version_number,
          gameVersions: versionData.game_versions
        }
      };
    } catch (error) {
      console.warn(`[Modrinth] Error fetching version info: ${error.message}`);
      return null;
    }
  }
  
  detectCategory(title, description) {
    const text = ((title || '') + ' ' + (description || '')).toLowerCase();
    
    if (text.includes('parkour')) return 'Parkour';
    if (text.includes('puzzle')) return 'Puzzle';
    if (text.includes('adventure')) return 'Adventure';
    if (text.includes('survival')) return 'Survival';
    if (text.includes('horror')) return 'Horror';
    if (text.includes('pvp')) return 'PvP';
    if (text.includes('minigame') || text.includes('mini game')) return 'Minigame';
    if (text.includes('city')) return 'City';
    if (text.includes('castle')) return 'Castle';
    if (text.includes('house') || text.includes('mansion')) return 'House';
    if (text.includes('skyblock')) return 'Skyblock';
    if (text.includes('dungeon')) return 'Dungeon';
    if (text.includes('quest')) return 'Quest';
    
    return 'World';
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      // Test API availability with a simple search
      const searchUrl = `${this.baseUrl}/search?query=castle&limit=1`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      let canSearch = false;
      if (response.ok) {
        const data = await response.json();
        canSearch = data.hits !== undefined;
      }
      
      return {
        ...this.getHealth(),
        accessible: response.ok && canSearch,
        statusCode: response.status,
        canSearch: canSearch,
        error: canSearch ? null : 'API not returning valid search results'
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.name === 'AbortError' ? 'Health check timeout' : error.message
      };
    }
  }
}

module.exports = ModrinthScraper;
