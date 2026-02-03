/**
 * MinecraftMaps.com HTTP Scraper
 * Uses fetch + Cheerio with aggressive timeouts and fallback strategies
 */

const { BaseScraper } = require('./base');
const cheerio = require('cheerio');

class MinecraftMapsScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'minecraftmaps',
      baseUrl: 'https://www.minecraftmaps.com',
      sourceName: 'MinecraftMaps',
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
            console.warn(`[MinecraftMaps] Search error: ${error.message}`);
            return []; // Return empty on error
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    
    // Try multiple URL patterns with quick fallbacks
    const searchUrls = [
      `${this.baseUrl}/?s=${encodedQuery}&post_type=maps`,
      `${this.baseUrl}/maps/?s=${encodedQuery}`,
    ];
    
    for (const searchUrl of searchUrls) {
      try {
        console.log(`[MinecraftMaps] Trying: ${searchUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        const response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'Connection': 'keep-alive',
          }
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[MinecraftMaps] HTTP ${response.status} for ${searchUrl}`);
          continue;
        }

        const html = await response.text();
        
        // Quick check for valid content
        if (html.length < 1000 || html.includes('captcha') || html.includes('blocked')) {
          console.warn(`[MinecraftMaps] Invalid response from ${searchUrl}`);
          continue;
        }
        
        const results = this.parseSearchHTML(html, limit);
        if (results.length > 0) {
          return results;
        }
      } catch (error) {
        console.warn(`[MinecraftMaps] Error with ${searchUrl}: ${error.message}`);
        continue;
      }
    }
    
    // All URLs failed - return empty
    return [];
  }
  
  parseSearchHTML(html, limit) {
    const $ = cheerio.load(html);
    const maps = [];
    
    // Try multiple selectors
    const selectors = [
      'article.type-maps',
      '.map-item',
      '.map-card',
      'article.post',
      '.listing-item',
      '.item',
      'article'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (maps.length >= limit) return false;
        
        const $el = $(element);
        
        // Find title link
        const titleEl = $el.find('h2 a, h3 a, .title a, a[href*="/maps/"]').first();
        if (!titleEl.length) return;
        
        const title = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        if (!url) return;
        
        const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
        
        // Extract slug
        const slugMatch = url.match(/\/maps\/(?:\d+-)?([^/]+)/);
        const mapId = slugMatch ? slugMatch[1] : null;
        
        // Extract thumbnail
        const thumbEl = $el.find('img').first();
        const thumbnail = thumbEl.attr('data-src') || thumbEl.attr('src') || '';
        
        // Extract description
        const descEl = $el.find('.description, .summary, p').first();
        const description = descEl.text().trim().substring(0, 300);
        
        // Extract author
        const authorEl = $el.find('a[href*="/user/"], a[href*="/author/"]').first();
        const author = authorEl.text().trim() || 'Unknown';
        
        // Parse downloads if available
        let downloads = 0;
        const text = $el.text();
        const downloadsMatch = text.match(/([\d,.]+)([KM]?)\s*(?:downloads?|views?)/i);
        if (downloadsMatch) {
          let num = parseFloat(downloadsMatch[1].replace(/,/g, ''));
          if (downloadsMatch[2] === 'K') num *= 1000;
          if (downloadsMatch[2] === 'M') num *= 1000000;
          downloads = Math.floor(num);
        }
        
        maps.push({
          id: mapId || `mm-${Date.now()}-${index}`,
          title: title,
          slug: mapId || '',
          description: description,
          author: author,
          url: fullUrl,
          thumbnail: thumbnail,
          downloads: downloads,
          downloadUrl: fullUrl,
          category: this.detectCategory(title, description),
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'minecraftmaps'
        });
      });
      
      if (maps.length > 0) break;
    }
    
    console.log(`[MinecraftMaps] Found ${maps.length} maps`);
    return maps;
  }

  detectCategory(title, description) {
    const text = ((title || '') + ' ' + (description || '')).toLowerCase();
    
    if (text.includes('parkour')) return 'Parkour';
    if (text.includes('puzzle')) return 'Puzzle';
    if (text.includes('adventure')) return 'Adventure';
    if (text.includes('survival')) return 'Survival';
    if (text.includes('horror')) return 'Horror';
    if (text.includes('pvp')) return 'PvP';
    if (text.includes('minigame') || text.includes('mini-game')) return 'Minigame';
    if (text.includes('city')) return 'City';
    if (text.includes('castle')) return 'Castle';
    if (text.includes('house') || text.includes('mansion')) return 'House';
    if (text.includes('skyblock')) return 'Skyblock';
    
    return 'World';
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      // Test actual search functionality
      const searchUrl = `${this.baseUrl}/?s=castle&post_type=maps`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });
      
      clearTimeout(timeoutId);
      
      let canSearch = false;
      if (response.ok) {
        const html = await response.text();
        canSearch = html.includes('article') || html.includes('maps') || html.length > 3000;
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

module.exports = MinecraftMapsScraper;
