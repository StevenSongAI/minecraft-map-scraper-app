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
    // CRITICAL FIX (Round 12): Simplified search without restrictive category facets
    // The facets were filtering out valid map results
    const encodedQuery = encodeURIComponent(query);
    
    // Search without restrictive facets - filter results manually instead
    const searchUrl = `${this.baseUrl}/search?query=${encodedQuery}&limit=${Math.min(limit * 3, 50)}&offset=0`;
    
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
      
      // FIXED (Round 12): Balanced filtering - exclude obvious mods but keep maps
      const filteredResults = results.filter(hit => {
        const text = `${hit.title || ''} ${hit.description || ''}`.toLowerCase();
        
        // Exclude obvious non-map content (weapons, armor, tech mods, etc.)
        const exclusionPatterns = [
          /\bweapon\b/, /\bgun\b/, /\barmor\b/, /\bsword\b/, /\bmekanism\b/, /\brobot\b/, 
          /\bvehicle\b/, /\bcar\b/, /\bplane\b/, /\bhelicopter\b/, /\btank\b/,
          /\bjetpack\b/, /\bdrill\b/, /\blaser\b/, /\bmissile\b/, /\brocket\b/,
          /\bhud\b/, /\bminimap\b/, /\bshader\b/, /\boptifine\b/, /\bsodium\b/
        ];
        const hasExclusion = exclusionPatterns.some(pattern => pattern.test(text));
        
        if (hasExclusion) {
          return false; // Exclude obvious mods
        }
        
        // Accept if it's a datapack (maps are often datapacks)
        const isDatapack = hit.project_type === 'datapack';
        
        // Accept if it has any map-related keywords
        const mapKeywords = ['map', 'world', 'adventure', 'parkour', 'puzzle', 'survival', 
                            'horror', 'castle', 'city', 'house', 'mansion', 'dungeon', 
                            'quest', 'minigame', 'pvp', 'spawn', 'structure', 'build'];
        const hasMapKeyword = mapKeywords.some(kw => text.includes(kw));
        
        // Accept if it has worldgen category
        const hasWorldGenCategory = hit.categories && hit.categories.some(cat => 
          ['worldgen', 'world-generation', 'adventure', 'decoration'].includes(cat));
        
        // Accept datapacks, maps with keywords, or worldgen projects
        return isDatapack || hasMapKeyword || hasWorldGenCategory;
      });
      
      console.log(`[Modrinth] Found ${results.length} results, ${filteredResults.length} map-related`);
      
      // FIXED (Round 12): Return all filtered results (increased limit)
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
   * Also filters out mod files (.jar, .mrpack) - only returns map files (.zip, .mcworld)
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
        
        // CRITICAL FIX: Filter out mod files - only accept map files
        const validMapExtensions = /\.(zip|mcworld|rar|7z)$/i;
        const modExtensions = /\.(jar|mrpack|litemod)$/i;
        
        // Find first version with MAP files (not mod files)
        let versionWithMapFiles = null;
        let primaryFile = null;
        
        for (const version of versions) {
          if (!version.files || version.files.length === 0) continue;
          
          // Check if any file is a map file (not a mod)
          const mapFile = version.files.find(f => {
            const filename = (f.filename || '').toLowerCase();
            return validMapExtensions.test(filename) && !modExtensions.test(filename);
          });
          
          if (mapFile) {
            versionWithMapFiles = version;
            primaryFile = mapFile;
            break;
          }
        }
        
        // If no map files found, check if the primary file is a mod
        if (!versionWithMapFiles) {
          const firstVersion = versions.find(v => v.files && v.files.length > 0);
          if (firstVersion) {
            const firstFile = firstVersion.files.find(f => f.primary) || firstVersion.files[0];
            if (firstFile && modExtensions.test(firstFile.filename)) {
              console.log(`[Modrinth] FILTERED: ${firstFile.filename} is a mod file, not a map`);
              return { isMod: true, filename: firstFile.filename }; // Return marker that this is a mod
            }
          }
          return null;
        }
        
        targetVersionId = versionWithMapFiles.id;
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
      
      // CRITICAL FIX: Check if it's a mod file
      const modExtensions = /\.(jar|mrpack|litemod)$/i;
      if (modExtensions.test(primaryFile.filename)) {
        console.log(`[Modrinth] FILTERED: ${primaryFile.filename} is a mod file`);
        return { isMod: true, filename: primaryFile.filename };
      }
      
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
