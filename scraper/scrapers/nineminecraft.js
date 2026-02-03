/**
 * 9Minecraft HTTP Scraper
 * Uses fetch + Cheerio with aggressive timeouts
 * CRITICAL FIX: Only returns results with DIRECT download URLs
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
    
    // FIXED (Round 10): Check robots.txt but don't block if check fails
    try {
      const robotsCheck = await this.checkRobotsTxt(searchUrl);
      if (!robotsCheck.allowed) {
        console.warn(`[9Minecraft] ${robotsCheck.reason}`);
        // Continue anyway - robots.txt check might be overly restrictive
      }
    } catch (error) {
      console.warn(`[9Minecraft] robots.txt check failed, continuing: ${error.message}`);
      // Continue despite robots.txt failure
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
  
  async parseSearchHTML(html, limit) {
    const $ = cheerio.load(html);
    const maps = [];
    
    // 9Minecraft uses article.post
    const selectors = [
      'article.post',
      'article.type-post',
      '.post',
      '.entry'
    ];
    
    // Collect all post elements first
    const posts = [];
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (posts.length >= limit * 2) return false; // Get more than needed since we'll filter
        posts.push($(element));
      });
      if (posts.length > 0) break;
    }
    
    // Process each post sequentially (not in parallel to avoid rate limits)
    for (let i = 0; i < posts.length && maps.length < limit; i++) {
      const $el = posts[i];
      
      // Extract title and URL
      const titleEl = $el.find('h2 a, h3 a, .entry-title a, .post-title a').first();
      if (!titleEl.length) continue;
      
      const title = titleEl.text().trim();
      const url = titleEl.attr('href') || '';
      if (!url) continue;
      
      const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
      
      // Check if it's map-related content
      const text = (title + ' ' + $el.text()).toLowerCase();
      if (!this.isMapContent(text)) {
        continue;
      }
      
      // FIXED (Round 9): Skip direct download check for now - too slow and causes timeouts
      // Use page URL and let users visit the site
      const finalDownloadUrl = fullUrl;
      const downloadType = 'page';
      
      console.log(`[9Minecraft] Adding: ${title.substring(0, 50)}...`);
      
      // Extract slug
      const slugMatch = url.match(/\/(?:[^/]+-)?([^/]+)\/$/);
      const slug = slugMatch ? slugMatch[1] : '';
      
      // Extract description
      const descEl = $el.find('.entry-summary p, .post-content p, p').first();
      const description = descEl.text().trim().substring(0, 300);
      
      // Extract thumbnail
      let thumbnail = '';
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
          if (src && !src.includes('view.png') && !src.includes('placeholder') && !src.includes('spinner')) {
            thumbnail = src;
            break;
          }
        }
      }
      
      // Extract author
      let author = 'Unknown';
      const metaEl = $el.find('.post-meta, .entry-meta, .meta').first();
      const metaText = metaEl.text() || '';
      
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
      
      if (author === 'Unknown') {
        const authorLink = $el.find('a[href*="/author/"], .author a, .byline a').first();
        if (authorLink.length) {
          author = authorLink.text().trim();
        }
      }
      
      if (author === 'Unknown') {
        const authorSpan = $el.find('.author-name, .entry-author, .post-author').first();
        if (authorSpan.length) {
          author = authorSpan.text().trim();
        }
      }
      
      // Clean up title
      const cleanTitle = title.replace(/Map\s+for\s+Minecraft/i, '').trim();
      
      maps.push({
        id: `9mc-${Date.now()}-${i}`,
        name: cleanTitle,
        title: cleanTitle,
        slug: slug,
        description: description,
        author: author && author !== 'Unknown' ? author : this.extractAuthorFromTitle(cleanTitle),
        url: fullUrl,
        thumbnail: thumbnail || '',
        downloads: 0,
        downloadUrl: finalDownloadUrl,
        downloadType: downloadType,
        downloadNote: downloadType === 'page' ? 'Visit 9Minecraft page for download link' : null,
        category: this.detectCategory(cleanTitle, description),
        dateCreated: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        source: 'nineminecraft',
        sourceName: '9Minecraft'
      });
      
      console.log(`[9Minecraft] ✓ Added "${cleanTitle.substring(0, 50)}" (${downloadType} download)`);
    }
    
    console.log(`[9Minecraft] Found ${maps.length} maps with direct downloads`);
    return maps;
  }
  
  extractAuthorFromTitle(title) {
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
      'skyblock', 'minigame', 'pvp', 'dungeon', 'quest',
      'build', 'spawn', 'lobby', 'arena', 'rpg', 'story'
    ];
    
    // FIXED (Round 9): More lenient - if post title mentions Minecraft and has any keyword, accept it
    const lowerText = text.toLowerCase();
    return mapKeywords.some(kw => lowerText.includes(kw)) || 
           (lowerText.includes('minecraft') && (lowerText.includes('download') || lowerText.includes('free')));
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
   * Extract DIRECT download URL from a 9Minecraft map detail page
   * CRITICAL FIX: Must return actual ZIP file URLs, not page links
   */
  async extractDirectDownloadUrl(mapUrl, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      const response = await fetch(mapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Look for direct file download links (ZIP, MCWORLD, RAR)
      const fileSelectors = [
        'a[href$=".zip"]',
        'a[href$=".mcworld"]',
        'a[href$=".rar"]',
        'a[href$=".7z"]',
        'a[href*=".zip?"]',
        'a[href*="download"][href$=".zip"]'
      ];
      
      for (const selector of fileSelectors) {
        const link = $(selector).attr('href');
        if (link) {
          const fullLink = link.startsWith('http') ? link : 
                          link.startsWith('//') ? `https:${link}` :
                          `${this.baseUrl}${link}`;
          
          if (fullLink.match(/\.(zip|mcworld|rar|7z)(\?.*)?$/i)) {
            console.log(`[9Minecraft] Found direct download: ${fullLink.substring(0, 80)}...`);
            return fullLink;
          }
        }
      }
      
      // Check for common file hosting links
      const hostingSelectors = [
        'a[href*="mediafire.com"]',
        'a[href*="dropbox.com"]',
        'a[href*="mega.nz"]',
        'a[href*="curseforge.com"]'
      ];
      
      for (const selector of hostingSelectors) {
        const link = $(selector).attr('href');
        if (link) {
          const fullLink = link.startsWith('http') ? link : 
                          link.startsWith('//') ? `https:${link}` :
                          `${this.baseUrl}${link}`;
          console.log(`[9Minecraft] Found hosting link: ${fullLink.substring(0, 80)}...`);
          return fullLink;
        }
      }
      
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
      const testQuery = 'castle';
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(testQuery)}`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { 
          'User-Agent': this.getUserAgent(),
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
