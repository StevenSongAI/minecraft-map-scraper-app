/**
 * Planet Minecraft HTTP Scraper (No Playwright)
 * Uses fetch + Cheerio for reliable HTTP-based scraping
 */

const { BaseScraper } = require('./base');
const cheerio = require('cheerio');

class PlanetMinecraftScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'planetminecraft',
      baseUrl: 'https://www.planetminecraft.com',
      sourceName: 'Planet Minecraft',
      ...options
    });
    this.requestTimeout = options.requestTimeout || 5000; // 5s timeout per request
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
            console.warn(`[Planet Minecraft HTTP] Search error: ${error.message}`);
            return []; // Return empty on error - don't fail the whole search
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/resources/projects/?text=${encodedQuery}&order=order_popularity`;
    
    console.log(`[Planet Minecraft HTTP] Fetching: ${searchUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.google.com/',
          'Connection': 'keep-alive',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseSearchHTML(html, limit);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.requestTimeout}ms`);
      }
      throw error;
    }
  }

  parseSearchHTML(html, limit) {
    const $ = cheerio.load(html);
    const results = [];
    
    // Planet Minecraft uses .resource or article elements
    const selectors = [
      '.resource',
      'article.resource',
      '.r-item',
      '.content .resource'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (results.length >= limit) return false;
        
        const $el = $(element);
        
        // Extract title and URL
        const titleEl = $el.find('h3 a, .r-title a, a[href*="/project/"]').first();
        if (!titleEl.length) return;
        
        const title = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        if (!url) return;
        
        const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
        
        // Extract project slug
        const projectMatch = url.match(/\/project\/([^\/]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        
        // Extract thumbnail - handle lazy loading
        const thumbEl = $el.find('img').first();
        let thumbnail = '';
        if (thumbEl.length) {
          thumbnail = thumbEl.attr('data-src') || thumbEl.attr('src') || '';
        }
        
        // Extract description
        const descEl = $el.find('.r-desc, .description, p').first();
        const description = descEl.text().trim().substring(0, 300);
        
        // Extract author
        const authorEl = $el.find('a[href*="/member/"]').first();
        const author = authorEl.text().trim() || 'Unknown';
        
        // Extract downloads/views
        let downloads = 0;
        const statsEl = $el.find('.r-details, .stats').first();
        if (statsEl.length) {
          const text = statsEl.text();
          const match = text.match(/([\d,.]+)([KM]?)\s*(?:views?|downloads?)/i);
          if (match) {
            let num = parseFloat(match[1].replace(/,/g, ''));
            if (match[2] === 'K') num *= 1000;
            if (match[2] === 'M') num *= 1000000;
            downloads = Math.floor(num);
          }
        }
        
        results.push({
          id: projectId || `pmc-${Date.now()}-${index}`,
          title: title,
          slug: projectId || '',
          description: description,
          author: author,
          authorUrl: authorEl.attr('href') ? `${this.baseUrl}${authorEl.attr('href')}` : '',
          url: fullUrl,
          thumbnail: thumbnail,
          downloads: downloads,
          downloadUrl: projectId ? `${this.baseUrl}/project/${projectId}/download` : null,
          category: 'World',
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'planetminecraft'
        });
      });
      
      if (results.length > 0) break;
    }
    
    console.log(`[Planet Minecraft HTTP] Parsed ${results.length} results`);
    return results;
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      // Test actual search functionality
      const searchUrl = `${this.baseUrl}/resources/projects/?text=castle&order=order_popularity`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      let canSearch = false;
      if (response.ok) {
        const html = await response.text();
        // Check if we got valid search results
        canSearch = html.includes('resource') && html.includes('project') && html.length > 5000;
      }
      
      return {
        ...this.getHealth(),
        accessible: response.ok && canSearch,
        statusCode: response.status,
        canSearch: canSearch,
        error: canSearch ? null : 'Search not functional'
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

module.exports = PlanetMinecraftScraper;
