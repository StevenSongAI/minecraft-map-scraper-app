/**
 * MC-Maps.com HTTP Scraper
 * Alternative source for Minecraft maps - simpler structure than Planet Minecraft
 * FIXED (Round 21): Added as replacement/alternative to Planet Minecraft
 */

const { BaseScraper } = require('./base');
const cheerio = require('cheerio');

class MCMapsScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'mcmaps',
      baseUrl: 'https://mc-maps.com',
      sourceName: 'MC-Maps',
      ...options
    });
    this.requestTimeout = options.requestTimeout || 8000;
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
            console.warn(`[MC-Maps] Search error: ${error.message}`);
            return [];
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    
    // MC-Maps.com search URLs to try
    const searchUrls = [
      `${this.baseUrl}/?s=${encodedQuery}`,
      `${this.baseUrl}/search/${encodedQuery}/`,
    ];
    
    for (const searchUrl of searchUrls) {
      try {
        console.log(`[MC-Maps] Trying: ${searchUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        const response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.google.com/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'DNT': '1'
          }
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[MC-Maps] HTTP ${response.status} for ${searchUrl}`);
          continue;
        }

        const html = await response.text();
        
        // Check for blocking
        if (html.includes('cf-browser-verification') || 
            html.includes('cloudflare') || 
            html.includes('captcha') ||
            html.length < 500) {
          console.warn(`[MC-Maps] Blocked or invalid response from ${searchUrl}`);
          continue;
        }
        
        const results = this.parseSearchHTML(html, limit);
        if (results.length > 0) {
          console.log(`[MC-Maps] Found ${results.length} results`);
          return results;
        }
      } catch (error) {
        console.warn(`[MC-Maps] Error with ${searchUrl}: ${error.message}`);
        continue;
      }
    }
    
    console.warn('[MC-Maps] All search URLs failed');
    return [];
  }
  
  parseSearchHTML(html, limit) {
    const $ = cheerio.load(html);
    const maps = [];
    
    // Try multiple selectors for map items
    const selectors = [
      'article.map-item',
      '.map-item',
      '.map-card',
      'article.post',
      '.post',
      '.entry',
      'article',
      '.item'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (maps.length >= limit) return false;
        
        const $el = $(element);
        
        // Extract title and URL
        const titleEl = $el.find('h2 a, h3 a, .title a, a[href*="/map/"], a[href*="/download/"]').first();
        if (!titleEl.length) return;
        
        const title = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        
        if (!url) return;
        if (!url.startsWith('http')) {
          url = url.startsWith('/') ? `${this.baseUrl}${url}` : `${this.baseUrl}/${url}`;
        }
        
        // Extract slug from URL
        const slugMatch = url.match(/\/map\/([^/]+)/) || url.match(/\/download\/([^/]+)/);
        const mapId = slugMatch ? slugMatch[1] : `mcmaps-${Date.now()}-${index}`;
        
        // Extract thumbnail
        let thumbnail = '';
        const imgEl = $el.find('img').first();
        if (imgEl.length) {
          thumbnail = imgEl.attr('data-src') || 
                     imgEl.attr('data-lazy-src') || 
                     imgEl.attr('src') || '';
          
          // Make absolute
          if (thumbnail && !thumbnail.startsWith('http')) {
            thumbnail = thumbnail.startsWith('/') ? `${this.baseUrl}${thumbnail}` : `${this.baseUrl}/${thumbnail}`;
          }
        }
        
        // Extract description
        const descEl = $el.find('.description, .summary, .excerpt, p').first();
        const description = descEl.text().trim().substring(0, 300);
        
        // Extract author
        let author = 'Unknown';
        const authorEl = $el.find('.author a, a[href*="/author/"], .byline a').first();
        if (authorEl.length) {
          author = authorEl.text().trim();
        }
        
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
        
        // Detect category
        const category = this.detectCategory(title, description);
        
        // Build download URL - often direct or page-based
        const downloadUrl = this.buildDownloadUrl(url, mapId);
        
        maps.push({
          id: mapId,
          title: title,
          slug: mapId,
          description: description,
          author: author,
          url: url,
          thumbnail: thumbnail,
          downloads: downloads,
          downloadUrl: downloadUrl,
          downloadType: 'page', // Usually requires visiting page
          downloadNote: 'Visit MC-Maps page for download',
          category: category,
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'mcmaps',
          sourceName: 'MC-Maps'
        });
      });
      
      if (maps.length > 0) break;
    }
    
    return maps;
  }
  
  buildDownloadUrl(pageUrl, mapId) {
    // Try to construct download URL from page URL
    if (pageUrl.includes('/map/')) {
      return pageUrl.replace('/map/', '/download/');
    }
    return pageUrl;
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
    if (text.includes('dungeon')) return 'Dungeon';
    
    return 'World';
  }

  /**
   * FIXED (Round 21): Extract direct download URL from MC-Maps detail page
   */
  async extractDirectDownloadUrl(mapUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      console.log(`[MC-Maps] Fetching download page: ${mapUrl}`);
      
      const response = await fetch(mapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { url: mapUrl, type: 'page' };
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Look for direct download links
      const fileSelectors = [
        'a[href$=".zip"]',
        'a[href$=".mcworld"]',
        'a[href$=".rar"]',
        'a[href*=".zip?"]',
        'a.download-link',
        'a[href*="/download/"]',
        '.download a',
        'a:contains("Download")'
      ];
      
      for (const selector of fileSelectors) {
        const link = $(selector).first().attr('href');
        if (link) {
          let fullLink = link.startsWith('http') ? link : 
                        link.startsWith('/') ? `${this.baseUrl}${link}` :
                        `${this.baseUrl}/${link}`;
          
          if (fullLink.match(/\.(zip|mcworld|rar|7z)(\?.*)?$/i)) {
            console.log(`[MC-Maps] Found direct download: ${fullLink.substring(0, 80)}...`);
            return { url: fullLink, type: 'direct' };
          }
        }
      }
      
      return { url: mapUrl, type: 'page' };
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`[MC-Maps] Extract download error: ${error.message}`);
      return { url: mapUrl, type: 'page' };
    }
  }

  async checkHealth() {
    try {
      // FIXED (Round 56): Test actual search functionality, not just endpoint
      const results = await this.search('test', { limit: 1 });
      return {
        ...this.getHealth(),
        accessible: true,
        status: results.length > 0 ? 'healthy' : 'unhealthy',
        canSearch: results.length > 0,
        error: results.length > 0 ? null : 'No results returned in test search'
      };
    } catch (err) {
      return { 
        ...this.getHealth(),
        accessible: false, 
        status: 'unavailable', 
        error: err.message 
      };
    }
  }
}

module.exports = MCMapsScraper;
