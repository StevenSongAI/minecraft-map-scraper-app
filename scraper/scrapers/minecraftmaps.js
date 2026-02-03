/**
 * MinecraftMaps.com Scraper
 * Scrapes minecraft maps from minecraftmaps.com
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
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async search(query, options = {}) {
    const { limit = 20 } = options;
    
    // Use caching layer
    return this.searchWithCache(query, options, async (q, opts) => {
      return this.circuitBreaker.execute(async () => {
        return this.rateLimitedRequest(async () => {
          let retries = 0;
          let lastError;

          while (retries < this.maxRetries) {
            try {
              let results = await this.scrapeSearch(query, limit);
              
              // Normalize to CurseForge format
              results = results.map(r => this.normalizeToCurseForgeFormat(r));
              
              // Validate download URLs
              console.log(`[MinecraftMaps] Validating ${results.length} download URLs...`);
              results = await this.validateMapDownloads(results, { maxConcurrent: 2 });
              
              // Filter out maps without verified downloads
              const verifiedCount = results.filter(r => r.downloadVerified).length;
              console.log(`[MinecraftMaps] ${verifiedCount}/${results.length} download URLs verified`);
              
              return results;
            } catch (error) {
              lastError = error;
              retries++;
              console.warn(`[MinecraftMaps] Retry ${retries}/${this.maxRetries} after error: ${error.message}`);
              await this.sleep(this.retryDelay * retries);
            }
          }

          throw new Error(`Failed after ${this.maxRetries} retries: ${lastError.message}`);
        });
      });
    });
  }

  async scrapeSearch(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/search?q=${encodedQuery}`;
    
    console.log(`[MinecraftMaps] Fetching: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': this.getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const maps = [];
    
    // MinecraftMaps.com uses various layouts - try multiple selectors
    const selectors = [
      '.map-item',
      '.map-card',
      '.content-item',
      '.post',
      '.listing-item',
      '.map-listing',
      '.item'
    ];
    
    let foundElements = false;
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (maps.length >= limit) return false;
        foundElements = true;
        
        try {
          const $el = $(element);
          
          // Try multiple selectors for each field
          const titleEl = $el.find('h2 a, h3 a, .title a, a[href*="/maps/"]').first();
          const descEl = $el.find('.description, .summary, p').first();
          const thumbEl = $el.find('img').first();
          const authorEl = $el.find('.author a, .user a, [href*="/user/"]').first();
          const downloadsEl = $el.find('.downloads, .stats, .meta').first();
          
          if (titleEl.length) {
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
            
            // Extract slug from URL
            const slugMatch = url.match(/\/maps\/(\d+)-?([^/]+)/);
            const mapId = slugMatch ? slugMatch[1] : null;
            const slug = slugMatch ? slugMatch[2] : '';
            
            // Parse downloads
            let downloads = 0;
            const downloadsText = downloadsEl.text() || '';
            const downloadsMatch = downloadsText.match(/([\d,.]+)([KM]?)\s*(?:downloads?|views?)/i);
            if (downloadsMatch) {
              let num = parseFloat(downloadsMatch[1].replace(/,/g, ''));
              if (downloadsMatch[2] === 'K') num *= 1000;
              if (downloadsMatch[2] === 'M') num *= 1000000;
              downloads = Math.floor(num);
            }
            
            maps.push({
              id: mapId || `mm-${Date.now()}-${index}`,
              title: title,
              slug: slug || mapId || '',
              description: descEl.text().trim().substring(0, 500),
              author: authorEl.text().trim() || 'Unknown',
              authorUrl: authorEl.attr('href') ? (authorEl.attr('href').startsWith('http') ? authorEl.attr('href') : `${this.baseUrl}${authorEl.attr('href')}`) : '',
              url: fullUrl,
              thumbnail: thumbEl.attr('src') || thumbEl.attr('data-src') || '',
              downloads: downloads,
              downloadUrl: fullUrl, // Will be resolved when accessing
              category: this.detectCategory(title, descEl.text()),
              dateCreated: new Date().toISOString(),
              dateModified: new Date().toISOString()
            });
          }
        } catch (e) {
          // Skip invalid items
        }
      });
      
      if (foundElements) break;
    }
    
    // If no results with specific selectors, try generic article/list items
    if (maps.length === 0) {
      $('article, .post, .entry, li').each((index, element) => {
        if (maps.length >= limit) return false;
        
        try {
          const $el = $(element);
          const linkEl = $el.find('a[href*="/maps/"]').first();
          
          if (linkEl.length) {
            const title = linkEl.text().trim() || $el.find('h2, h3, .title').first().text().trim();
            const url = linkEl.attr('href');
            
            if (title && url) {
              const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
              const slugMatch = url.match(/\/maps\/(\d+)-?([^/]+)/);
              
              maps.push({
                id: slugMatch ? slugMatch[1] : `mm-${Date.now()}-${index}`,
                title: title,
                slug: slugMatch ? slugMatch[2] : '',
                description: $el.find('p').first().text().trim().substring(0, 500),
                author: 'Unknown',
                url: fullUrl,
                thumbnail: $el.find('img').first().attr('src') || '',
                downloads: 0,
                downloadUrl: fullUrl,
                category: 'World',
                dateCreated: new Date().toISOString(),
                dateModified: new Date().toISOString()
              });
            }
          }
        } catch (e) {
          // Skip invalid items
        }
      });
    }
    
    console.log(`[MinecraftMaps] Found ${maps.length} maps`);
    return maps;
  }

  detectCategory(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    
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

  async getDownloadUrl(mapSlug) {
    try {
      const mapUrl = `${this.baseUrl}/maps/${mapSlug}`;
      
      const response = await fetch(mapUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) return null;

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Look for direct download links with improved selectors
      const downloadSelectors = [
        'a[href*=".zip"]',
        'a[href*=".rar"]',
        'a[href*=".mcworld"]',
        'a[href*=".mcpack"]',
        'a[href*="mediafire.com"]',
        'a[href*="curseforge.com"]',
        'a[href*="dropbox.com"]',
        'a[href*="drive.google.com"]',
        'a.download',
        '.download a',
        'a.btn-download'
      ];
      
      for (const selector of downloadSelectors) {
        const downloadLink = $(selector).first();
        if (downloadLink.length) {
          const href = downloadLink.attr('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
            // Validate the URL
            const validatedUrl = await this.validateDownloadUrl(fullUrl, { timeout: 8000 });
            if (validatedUrl) {
              return validatedUrl;
            }
          }
        }
      }
      
      // Fallback: try to validate the map page URL
      const validatedPageUrl = await this.validateDownloadUrl(mapUrl, { timeout: 5000 });
      if (validatedPageUrl) {
        return mapUrl;
      }
      
      return null;
    } catch (error) {
      console.warn(`[MinecraftMaps] Failed to get download URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract and validate direct download URL from a MinecraftMaps detail page
   * Overrides BaseScraper.extractDownloadUrl
   */
  async extractDownloadUrl(mapUrl, options = {}) {
    if (!mapUrl) return null;
    
    // Extract map slug from URL
    const slugMatch = mapUrl.match(/\/maps\/(?:\d+-)?([^\/]+)/);
    if (!slugMatch) {
      console.warn(`[MinecraftMaps] Could not extract slug from URL: ${mapUrl}`);
      return null;
    }
    
    const mapSlug = slugMatch[1];
    return this.getDownloadUrl(mapSlug);
  }

  async checkHealth() {
    try {
      const response = await fetch(this.baseUrl, {
        headers: { 'User-Agent': this.getRandomUserAgent() },
        timeout: 10000
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

module.exports = MinecraftMapsScraper;
