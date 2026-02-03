/**
 * 9Minecraft Scraper
 * Scrapes minecraft maps from 9minecraft.net
 */

const { BaseScraper } = require('./base');
const cheerio = require('cheerio');

class NineMinecraftScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'nineminecraft',
      baseUrl: 'https://www.9minecraft.net',
      sourceName: '9Minecraft',
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
              console.log(`[9Minecraft] Validating ${results.length} download URLs...`);
              results = await this.validateMapDownloads(results, { maxConcurrent: 2 });
              
              // Filter out maps without verified downloads
              const verifiedCount = results.filter(r => r.downloadVerified).length;
              console.log(`[9Minecraft] ${verifiedCount}/${results.length} download URLs verified`);
              
              return results;
            } catch (error) {
              lastError = error;
              retries++;
              console.warn(`[9Minecraft] Retry ${retries}/${this.maxRetries} after error: ${error.message}`);
              await this.sleep(this.retryDelay * retries);
            }
          }

          throw new Error(`Failed after ${this.maxRetries} retries: ${lastError.message}`);
        });
      });
    });
  }

  async scrapeSearch(query, limit) {
    const encodedQuery = encodeURIComponent(query + ' map');
    const searchUrl = `${this.baseUrl}/?s=${encodedQuery}`;
    
    console.log(`[9Minecraft] Fetching: ${searchUrl}`);
    
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    try {
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://www.google.com/',
          'Cache-Control': 'max-age=0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Check if response is valid
      if (html.length < 500 || html.includes('captcha') || html.includes('blocked')) {
        throw new Error('Response appears to be blocked or invalid');
      }
      
      return this.parseSearchHTML(html, limit);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout after 8 seconds');
      }
      throw error;
    }
  }
  
  parseSearchHTML(html, limit) {
    const $ = cheerio.load(html);
    
    const maps = [];
    
    // 9Minecraft uses article posts
    const selectors = [
      'article.post',
      '.post',
      '.entry',
      '.item-list article',
      '.content article'
    ];
    
    let foundElements = false;
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (maps.length >= limit) return false;
        foundElements = true;
        
        try {
          const $el = $(element);
          
          // Extract data
          const titleEl = $el.find('h2 a, h3 a, .entry-title a, .post-title a').first();
          const descEl = $el.find('.entry-summary p, .post-content p, .excerpt, p').first();
          const thumbEl = $el.find('img').first();
          const metaEl = $el.find('.post-meta, .entry-meta, .meta').first();
          
          if (titleEl.length) {
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            
            // Only include if it looks like a map
            const text = (title + ' ' + (descEl.text() || '')).toLowerCase();
            if (!this.isMapContent(text)) {
              return;
            }
            
            const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
            
            // Extract slug
            const slugMatch = url.match(/\/(?:[^/]+-)?([^/]+)\/$/);
            const slug = slugMatch ? slugMatch[1] : '';
            
            // Parse author from meta
            let author = 'Unknown';
            const authorMatch = metaEl.text().match(/by\s+([^|]+)/i);
            if (authorMatch) {
              author = authorMatch[1].trim();
            }
            
            // Parse date
            let date = new Date().toISOString();
            const dateMatch = metaEl.text().match(/(\w+\s+\d{1,2},?\s+\d{4})/);
            if (dateMatch) {
              date = new Date(dateMatch[1]).toISOString();
            }
            
            maps.push({
              id: `9mc-${Date.now()}-${index}`,
              title: title.replace(/Map\s+for\s+Minecraft/i, '').trim(),
              slug: slug,
              description: descEl.text().trim().substring(0, 500),
              author: author,
              url: fullUrl,
              thumbnail: thumbEl.attr('src') || thumbEl.attr('data-src') || '',
              downloads: 0, // 9Minecraft doesn't show download counts
              downloadUrl: fullUrl, // Will resolve on detail page
              category: this.detectCategory(title, descEl.text()),
              dateCreated: date,
              dateModified: date
            });
          }
        } catch (e) {
          // Skip invalid items
        }
      });
      
      if (foundElements) break;
    }
    
    console.log(`[9Minecraft] Found ${maps.length} maps`);
    return maps;
  }

  isMapContent(text) {
    const mapKeywords = [
      'map', 'world', 'adventure map', 'survival map', 'parkour map',
      'puzzle map', 'horror map', 'city map', 'house map'
    ];
    
    return mapKeywords.some(kw => text.includes(kw.toLowerCase()));
  }

  detectCategory(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    
    if (text.includes('parkour')) return 'Parkour';
    if (text.includes('puzzle')) return 'Puzzle';
    if (text.includes('adventure')) return 'Adventure';
    if (text.includes('survival')) return 'Survival';
    if (text.includes('horror')) return 'Horror';
    if (text.includes('pvp') || text.includes('pvp map')) return 'PvP';
    if (text.includes('minigame') || text.includes('mini game')) return 'Minigame';
    if (text.includes('city')) return 'City';
    if (text.includes('castle')) return 'Castle';
    if (text.includes('house') || text.includes('mansion')) return 'House';
    if (text.includes('skyblock')) return 'Skyblock';
    
    return 'World';
  }

  async getDownloadUrl(mapUrl) {
    try {
      const response = await fetch(mapUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': this.baseUrl
        }
      });

      if (!response.ok) return null;

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Look for download button/link with improved selectors
      const downloadSelectors = [
        'a[href*="mediafire.com"]',
        'a[href*="curseforge.com"]',
        'a[href*="dropbox.com"]',
        'a[href*="drive.google.com"]',
        'a[href*=".zip"]',
        'a[href*=".rar"]',
        'a[href*=".mcworld"]',
        'a[href*=".mcpack"]',
        '.download-button a',
        'a.btn-download',
        'a[href*="download"]:not([href*="javascript:"])'
      ];
      
      for (const selector of downloadSelectors) {
        const link = $(selector).first();
        if (link.length) {
          const href = link.attr('href');
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
      console.warn(`[9Minecraft] Failed to get download URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract and validate direct download URL from a 9Minecraft detail page
   * Overrides BaseScraper.extractDownloadUrl
   */
  async extractDownloadUrl(mapUrl, options = {}) {
    if (!mapUrl) return null;
    
    // 9Minecraft URLs are typically direct to the post
    return this.getDownloadUrl(mapUrl);
  }

  async checkHealth() {
    try {
      // Try to perform an actual search to verify the site is working for searches
      // Just checking the homepage doesn't catch search timeouts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const testQuery = 'castle'; // Simple test query
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(testQuery)}`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { 
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://www.google.com/'
        }
      });
      
      clearTimeout(timeoutId);
      
      // Also check if we can parse results
      let canSearch = false;
      if (response.ok) {
        try {
          const html = await response.text();
          // Check if the response contains expected content
          canSearch = html.includes('article') || html.includes('post') || html.length > 5000;
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      return {
        ...this.getHealth(),
        accessible: response.ok && canSearch,
        statusCode: response.status,
        canSearch: canSearch,
        error: canSearch ? null : 'Search functionality may be limited'
      };
    } catch (error) {
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.name === 'AbortError' ? 'Health check timeout' : error.message
      };
    }
  }
}

module.exports = NineMinecraftScraper;
