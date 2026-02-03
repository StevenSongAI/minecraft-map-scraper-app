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
            const results = await this.fetchSearchResults(query, limit);
            return results.map(r => this.normalizeToCurseForgeFormat(r));
          } catch (error) {
            console.warn(`[Modrinth] Search error: ${error.message}`);
            return [];
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    // Modrinth API: search for projects with category 'map'
    const params = new URLSearchParams({
      query: query,
      limit: Math.min(limit, 20).toString(),
      offset: '0',
      facets: '[["categories:map"]]'
    });

    const searchUrl = `${this.baseUrl}/search?${params.toString()}`;
    
    console.log(`[Modrinth] Fetching: ${searchUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MinecraftMapScraper/1.0 (steven.ai@example.com)',
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const results = data.hits || [];
      
      console.log(`[Modrinth] Found ${results.length} results`);
      return results.map(hit => this.transformHitToMap(hit));
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  transformHitToMap(hit) {
    return {
      id: hit.project_id || hit.slug,
      title: hit.title,
      slug: hit.slug,
      description: hit.description || '',
      author: hit.author || 'Unknown',
      authorUrl: hit.author ? `https://modrinth.com/user/${hit.author}` : '',
      url: `https://modrinth.com/project/${hit.slug}`,
      thumbnail: hit.icon_url || '',
      downloads: hit.downloads || 0,
      downloadUrl: `https://modrinth.com/project/${hit.slug}/versions`,
      category: 'World',
      gameVersions: hit.versions || [],
      dateCreated: hit.date_created || new Date().toISOString(),
      dateModified: hit.date_modified || new Date().toISOString(),
      source: 'modrinth',
      likes: hit.follows || 0,
      license: hit.license || '',
      clientSide: hit.client_side,
      serverSide: hit.server_side
    };
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
          'User-Agent': 'MinecraftMapScraper/1.0',
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
