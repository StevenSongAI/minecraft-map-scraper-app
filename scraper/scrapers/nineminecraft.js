/**
 * 9Minecraft HTTP Scraper
 * Uses fetch + Cheerio with aggressive timeouts
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
    this.requestTimeout = options.requestTimeout || 5000; // 5s timeout
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
            console.warn(`[9Minecraft] Search error: ${error.message}`);
            return []; // Return empty on error
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    // 9Minecraft is often slow - try with 'map' suffix for better results
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/?s=${encodedQuery}`;
    
    console.log(`[9Minecraft] Fetching: ${searchUrl}`);
    
    // FIXED (Round 7): Check robots.txt compliance
    const robotsCheck = await this.checkRobotsTxt(searchUrl);
    if (!robotsCheck.allowed) {
      console.warn(`[9Minecraft] ${robotsCheck.reason}`);
      throw new Error(`Blocked by robots.txt: ${robotsCheck.reason}`);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(), // FIXED (Round 7): Use scraper user agent
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
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
      
      // Check if response is valid
      if (html.length < 500 || html.includes('captcha') || html.includes('blocked')) {
        throw new Error('Response appears blocked or invalid');
      }
      
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
    const maps = [];
    
    // 9Minecraft uses article.post
    const selectors = [
      'article.post',
      'article.type-post',
      '.post',
      '.entry'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (maps.length >= limit) return false;
        
        const $el = $(element);
        
        // Extract title and URL
        const titleEl = $el.find('h2 a, h3 a, .entry-title a, .post-title a').first();
        if (!titleEl.length) return;
        
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        if (!url) return;
        
        const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
        
        // Check if it's map-related content
        const text = (title + ' ' + $el.text()).toLowerCase();
        if (!this.isMapContent(text)) {
          return;
        }
        
        // Extract slug
        const slugMatch = url.match(/\/(?:[^/]+-)?([^/]+)\/$/);
        const slug = slugMatch ? slugMatch[1] : '';
        
        // Extract description
        const descEl = $el.find('.entry-summary p, .post-content p, p').first();
        const description = descEl.text().trim().substring(0, 300);
        
        // FIXED (Round 7): Extract actual thumbnail - try multiple selectors
        let thumbnail = '';
        
        // Try to find the main post thumbnail image (not the view.png placeholder)
        const imgSelectors = [
          '.post-thumbnail img',
          '.entry-thumbnail img', 
          '.featured-image img',
          'img.wp-post-image',
          'img.attachment-post-thumbnail',
          '.post-content img',
          'img'
        ];
        
        for (const imgSelector of imgSelectors) {
          const imgEl = $el.find(imgSelector).first();
          if (imgEl.length) {
            const src = imgEl.attr('data-src') || imgEl.attr('src') || '';
            // Skip placeholder images
            if (src && !src.includes('view.png') && !src.includes('placeholder') && !src.includes('spinner')) {
              thumbnail = src;
              break;
            }
          }
        }
        
        // FIXED (Round 7): Better author extraction - try multiple patterns
        let author = 'Unknown';
        const metaEl = $el.find('.post-meta, .entry-meta, .meta').first();
        const metaText = metaEl.text() || '';
        
        // Try multiple author extraction patterns
        const authorPatterns = [
          /by\s+([^|]+)/i,
          /author\s*:\s*([^|]+)/i,
          /creator\s*:\s*([^|]+)/i,
          /maker\s*:\s*([^|]+)/i,
          /developer\s*:\s*([^|]+)/i
        ];
        
        for (const pattern of authorPatterns) {
          const match = metaText.match(pattern);
          if (match) {
            author = match[1].trim();
            break;
          }
        }
        
        // Try to extract from author link
        if (author === 'Unknown') {
          const authorLink = $el.find('a[href*="/author/"], .author a, .byline a').first();
          if (authorLink.length) {
            author = authorLink.text().trim();
          }
        }
        
        // Try to extract from span with author class
        if (author === 'Unknown') {
          const authorSpan = $el.find('.author-name, .entry-author, .post-author').first();
          if (authorSpan.length) {
            author = authorSpan.text().trim();
          }
        }
        
        // Clean up title
        const cleanTitle = title.replace(/Map\s+for\s+Minecraft/i, '').trim();
        
        // FIXED (Round 7): Mark 9Minecraft downloads as page visits, not direct downloads
        // The downloadUrl is the map detail page where users need to click download
        maps.push({
          id: `9mc-${Date.now()}-${index}`,
          title: cleanTitle,
          slug: slug,
          description: description,
          author: author && author !== 'Unknown' ? author : this.extractAuthorFromTitle(cleanTitle),
          url: fullUrl,
          thumbnail: thumbnail || '', // Empty string if no thumbnail found (UI should handle fallback)
          downloads: 0, // 9Minecraft doesn't show download counts
          downloadUrl: fullUrl, // Page URL - users must visit to download
          downloadType: 'page', // FIXED: Mark as page visit required (not direct download)
          downloadNote: 'Visit page to download', // FIXED: Clear note for users
          category: this.detectCategory(cleanTitle, description),
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'nineminecraft',
          sourceName: '9Minecraft' // FIXED: Add sourceName for display
        });
      });
      
      if (maps.length > 0) break;
    }
    
    console.log(`[9Minecraft] Found ${maps.length} maps`);
    return maps;
  }
  
  // FIXED (Round 7): Extract author from title as fallback
  extractAuthorFromTitle(title) {
    // Try to extract author name from patterns like "Map Name by AuthorName"
    const patterns = [
      /by\s+([A-Za-z0-9_]+)$/i,
      /by\s+([A-Za-z0-9_]+)\s+/i,
      /\|\s*([A-Za-z0-9_]+)$/i,
      /-?\s*([A-Za-z0-9_]+)\s*$/i
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const potentialAuthor = match[1].trim();
        // Filter out common non-author words
        if (potentialAuthor.length > 2 && 
            !['map', 'for', 'the', 'minecraft', 'download', 'free', 'mod', 'new'].includes(potentialAuthor.toLowerCase())) {
          return potentialAuthor;
        }
      }
    }
    
    return '9Minecraft';
  }

  isMapContent(text) {
    const mapKeywords = [
      'map', 'world', 'adventure', 'survival', 'parkour',
      'puzzle', 'horror', 'city', 'house', 'castle',
      'skyblock', 'minigame', 'pvp'
    ];
    
    return mapKeywords.some(kw => text.toLowerCase().includes(kw));
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
    
    return 'World';
  }

  /**
   * Extract actual download URL from a 9Minecraft map detail page
   * FIXED: Extract real download links from the page
   */
  async extractDownloadUrl(mapUrl, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(mapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(), // FIXED (Round 7): Use scraper user agent
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // 9Minecraft has download links in various formats
      // Try multiple selectors to find the download URL
      const downloadSelectors = [
        'a[href*="download"]',
        'a.download-btn',
        'a.btn-download',
        '.download-link a',
        'a[href*=".zip"]',
        'a[href*="mediafire"]',
        'a[href*="dropbox"]',
        'a[href*="mega.nz"]'
      ];
      
      for (const selector of downloadSelectors) {
        const link = $(selector).attr('href');
        if (link && (link.includes('download') || link.includes('.zip') || link.includes('mediafire') || link.includes('dropbox'))) {
          const fullLink = link.startsWith('http') ? link : `${this.baseUrl}${link}`;
          console.log(`[9Minecraft] Found download link: ${fullLink}`);
          return fullLink;
        }
      }
      
      console.warn(`[9Minecraft] No download link found on page: ${mapUrl}`);
      return null;
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`[9Minecraft] Extract download URL error: ${error.message}`);
      return null;
    }
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      // Test actual search functionality
      const testQuery = 'castle';
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(testQuery)}`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { 
          'User-Agent': this.getUserAgent(), // FIXED (Round 7): Use scraper user agent
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });
      
      clearTimeout(timeoutId);
      
      let canSearch = false;
      if (response.ok) {
        const html = await response.text();
        canSearch = html.includes('article') || html.includes('post') || html.length > 3000;
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

module.exports = NineMinecraftScraper;
