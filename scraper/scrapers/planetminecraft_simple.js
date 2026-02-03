/**
 * Simple HTTP-based Planet Minecraft Scraper
 * Uses fetch instead of Playwright for environments without browser automation
 */

const { BaseScraper } = require('./base');

class SimplePlanetMinecraftScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'planetminecraft',
      baseUrl: 'https://www.planetminecraft.com',
      sourceName: 'Planet Minecraft',
      ...options
    });
  }

  async search(query, options = {}) {
    const { limit = 10 } = options;
    
    return this.searchWithCache(query, options, async (q, opts) => {
      return this.circuitBreaker.execute(async () => {
        return this.rateLimitedRequest(async () => {
          try {
            const results = await this.fetchSearchResults(query, limit);
            return results.map(r => this.normalizeToCurseForgeFormat(r));
          } catch (error) {
            console.warn(`[Planet Minecraft HTTP] Search error: ${error.message}`);
            return []; // Return empty array on error
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/resources/projects/?text=${encodedQuery}&order=order_popularity`;
    
    console.log(`[Planet Minecraft HTTP] Fetching: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return this.parseSearchHTML(html, limit);
  }

  parseSearchHTML(html, limit) {
    const results = [];
    
    // Simple regex-based parsing (more reliable than DOM in Node without JSDOM)
    // Match resource items
    const resourceRegex = /<article[^>]*class="[^"]*resource[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
    const resources = html.match(resourceRegex) || [];
    
    for (let i = 0; i < Math.min(resources.length, limit); i++) {
      const resource = resources[i];
      
      try {
        // Extract title and URL
        const titleMatch = resource.match(/<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) continue;
        
        const url = titleMatch[1].startsWith('http') ? titleMatch[1] : `${this.baseUrl}${titleMatch[1]}`;
        const title = this.stripHtml(titleMatch[2]).trim();
        
        // Extract project ID from URL
        const projectMatch = url.match(/\/project\/([^\/]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        
        // Extract thumbnail
        const thumbMatch = resource.match(/<img[^>]*src="([^"]*)"[^>]*class="[^"]*preview[^"]*"|<img[^>]*data-src="([^"]*)"[^>]*>/i);
        const thumbnail = thumbMatch ? (thumbMatch[1] || thumbMatch[2]) : '';
        
        // Extract description
        const descMatch = resource.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        const description = descMatch ? this.stripHtml(descMatch[1]).trim().substring(0, 200) : '';
        
        // Extract author
        const authorMatch = resource.match(/<a[^>]*href="\/member\/([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        const author = authorMatch ? this.stripHtml(authorMatch[2]).trim() : 'Unknown';
        
        // Extract download count
        const downloadsMatch = resource.match(/([\d,]+)\s*(?:downloads?|views?)/i);
        const downloads = downloadsMatch ? parseInt(downloadsMatch[1].replace(/,/g, '')) : 0;
        
        results.push({
          id: projectId || `pmc-${Date.now()}-${i}`,
          title: title,
          slug: projectId || '',
          description: description,
          author: author,
          authorUrl: authorMatch ? `${this.baseUrl}/member/${authorMatch[1]}` : '',
          url: url,
          thumbnail: thumbnail,
          downloads: downloads,
          downloadUrl: projectId ? `${this.baseUrl}/project/${projectId}/download` : null,
          category: 'World',
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'planetminecraft'
        });
      } catch (e) {
        // Skip invalid items
      }
    }
    
    console.log(`[Planet Minecraft HTTP] Parsed ${results.length} results`);
    return results;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async checkHealth() {
    try {
      const response = await fetch(this.baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      return {
        ...this.getHealth(),
        accessible: response.ok,
        statusCode: response.status
      };
    } catch (error) {
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.message
      };
    }
  }
}

module.exports = SimplePlanetMinecraftScraper;
