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
    this.requestTimeout = options.requestTimeout || 5000;
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
    // FIXED (Round 9): Search without project type restriction to get all content
    // Then filter for map-related keywords
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/search?query=${encodedQuery}&limit=${Math.min(limit, 30)}&offset=0`;
    
    console.log(`[Modrinth] Fetching: ${searchUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
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
      
      // FIXED (Round 9): More inclusive filtering - accept datapacks and modpacks with world/map content
      const mapKeywords = ['map', 'world', 'adventure', 'dungeon', 'quest', 'exploration', 'structure', 
                           'datapack', 'survival', 'city', 'castle', 'house', 'parkour', 'puzzle'];
      const filteredResults = results.filter(hit => {
        const text = `${hit.title || ''} ${hit.description || ''}`.toLowerCase();
        // Accept if has map keywords OR is explicitly a world/datapack project type
        return mapKeywords.some(kw => text.includes(kw)) || 
               hit.project_type === 'datapack' ||
               (hit.categories && hit.categories.some(cat => 
                 ['worldgen', 'adventure', 'world-generation'].includes(cat)));
      });
      
      console.log(`[Modrinth] Found ${results.length} results, ${filteredResults.length} map-related`);
      
      // Transform all hits (async)
      const transformedResults = await Promise.all(
        filteredResults.map(hit => this.transformHitToMap(hit))
      );
      return transformedResults;
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async transformHitToMap(hit) {
    // FIXED (Round 10): Get direct download URL and proper thumbnail
    // FIXED (Round 10): Use 'name' field to match CurseForge format
    const projectId = hit.project_id || hit.slug;
    
    // Get direct download URL from Modrinth API
    let directDownloadUrl = null;
    let fileInfo = null;
    try {
      const versionInfo = await this.getLatestVersionInfo(hit.project_id);
      if (versionInfo) {
        directDownloadUrl = versionInfo.downloadUrl;
        fileInfo = versionInfo.fileInfo;
      }
    } catch (error) {
      console.warn(`[Modrinth] Failed to get version info for ${hit.slug}: ${error.message}`);
    }
    
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
      downloadUrl: directDownloadUrl || `https://modrinth.com/project/${hit.slug}/versions`,
      downloadType: directDownloadUrl ? 'direct' : 'page',
      downloadNote: directDownloadUrl ? null : 'Visit Modrinth page to download',
      fileInfo: fileInfo,
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
      url: `https://modrinth.com/project/${hit.slug}`
    };
  }

  async getLatestVersionInfo(projectId) {
    try {
      const versionsUrl = `${this.baseUrl}/project/${projectId}/version?limit=1`;
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
      
      const latestVersion = versions[0];
      const primaryFile = latestVersion.files?.find(f => f.primary) || latestVersion.files?.[0];
      
      if (!primaryFile) {
        return null;
      }
      
      return {
        downloadUrl: primaryFile.url,
        fileInfo: {
          id: latestVersion.id,
          filename: primaryFile.filename,
          filesize: primaryFile.size,
          version: latestVersion.version_number,
          gameVersions: latestVersion.game_versions
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
