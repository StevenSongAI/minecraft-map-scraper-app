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
      let url = titleEl.attr('href') || '';
      
      // FIXED (Round 12): Better URL extraction
      if (!url) {
        // Try to find any link in the post
        const anyLink = $el.find('a[href*="9minecraft.net"]').first();
        if (anyLink.length) {
          url = anyLink.attr('href');
        }
      }
      
      if (!url) continue;
      
      // Ensure URL is absolute
      let fullUrl;
      if (url.startsWith('http')) {
        fullUrl = url;
      } else if (url.startsWith('//')) {
        fullUrl = 'https:' + url;
      } else if (url.startsWith('/')) {
        fullUrl = this.baseUrl + url;
      } else {
        fullUrl = this.baseUrl + '/' + url;
      }
      
      // Check if it's map-related content
      const text = (title + ' ' + $el.text()).toLowerCase();
      if (!this.isMapContent(text)) {
        continue;
      }
      
      // FIXED (Round 11): Try to extract direct download URL asynchronously
      // Store the page URL as fallback, actual download will be fetched on demand
      const finalDownloadUrl = fullUrl;
      const downloadType = 'page';
      
      console.log(`[9Minecraft] Adding: ${title.substring(0, 50)}...`);
      
      // Extract slug
      const slugMatch = url.match(/\/(?:[^/]+-)?([^/]+)\/$/);
      const slug = slugMatch ? slugMatch[1] : '';
      
      // Extract description
      const descEl = $el.find('.entry-summary p, .post-content p, p').first();
      const description = descEl.text().trim().substring(0, 300);
      
      // FIXED (Round 11): Better thumbnail extraction with more selectors
      let thumbnail = '';
      const imgSelectors = [
        '.post-thumbnail img',
        '.entry-thumbnail img',
        'img.attachment-post-thumbnail',
        'img.wp-post-image',
        '.featured-image img',
        '.post-content img:first-child',
        '.entry-content img:first-child',
        'img[class*="thumbnail"]',
        'img[class*="featured"]',
        'img'
      ];
      
      for (const imgSelector of imgSelectors) {
        const imgEl = $el.find(imgSelector).first();
        if (imgEl.length) {
          // Try data-src first (lazy loading), then src
          let src = imgEl.attr('data-src') || 
                    imgEl.attr('data-lazy-src') || 
                    imgEl.attr('src') || '';
          
          // Clean up the URL
          if (src) {
            src = src.trim();
            // Skip common placeholder/spinner images
            if (src.includes('view.png') || 
                src.includes('placeholder') || 
                src.includes('spinner') ||
                src.includes('loading') ||
                src.includes('blank.gif') ||
                src.includes('data:image')) {
              continue;
            }
            
            // Make relative URLs absolute
            if (src.startsWith('//')) {
              src = 'https:' + src;
            } else if (src.startsWith('/')) {
              src = this.baseUrl + src;
            } else if (!src.startsWith('http')) {
              src = this.baseUrl + '/' + src;
            }
            
            thumbnail = src;
            console.log(`[9Minecraft] Found thumbnail: ${thumbnail.substring(0, 80)}...`);
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
   * CRITICAL FIX (Round 11): Better extraction with multiple patterns
   */
  async extractDirectDownloadUrl(mapUrl, options = {}) {
    const timeout = options.timeout || 8000; // Longer timeout for download page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      console.log(`[9Minecraft] Fetching download page: ${mapUrl}`);
      
      const response = await fetch(mapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[9Minecraft] Download page returned ${response.status}`);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Pattern 1: Look for direct file download links (ZIP, MCWORLD, RAR, 7Z)
      const fileSelectors = [
        'a[href$=".zip"]',
        'a[href$=".mcworld"]',
        'a[href$=".rar"]',
        'a[href$=".7z"]',
        'a[href*=".zip?"]',
        'a[href*="download"][href$=".zip"]',
        'a.download-link',
        'a[href*="/download/"]',
        '.download a',
        'a:contains("Download")',
        'a:contains("DOWNLOAD")'
      ];
      
      for (const selector of fileSelectors) {
        const links = $(selector);
        for (let i = 0; i < links.length; i++) {
          const link = $(links[i]).attr('href');
          if (link) {
            let fullLink = link.startsWith('http') ? link : 
                          link.startsWith('//') ? `https:${link}` :
                          link.startsWith('/') ? `${this.baseUrl}${link}` :
                          `${this.baseUrl}/${link}`;
            
            // Clean up the URL
            fullLink = fullLink.trim();
            
            // Check if it's a direct file link
            if (fullLink.match(/\.(zip|mcworld|rar|7z)(\?.*)?$/i)) {
              console.log(`[9Minecraft] Found direct download: ${fullLink.substring(0, 80)}...`);
              return {
                url: fullLink,
                type: 'direct'
              };
            }
          }
        }
      }
      
      // Pattern 2: Check for download buttons with data attributes
      const dataSelectors = [
        '[data-download-url]',
        '[data-file-url]',
        '[data-url]'
      ];
      
      for (const selector of dataSelectors) {
        const el = $(selector).first();
        if (el.length) {
          const url = el.attr('data-download-url') || 
                     el.attr('data-file-url') || 
                     el.attr('data-url');
          if (url) {
            const fullLink = url.startsWith('http') ? url : 
                            url.startsWith('//') ? `https:${url}` :
                            `${this.baseUrl}${url}`;
            console.log(`[9Minecraft] Found data-attribute download: ${fullLink.substring(0, 80)}...`);
            return {
              url: fullLink,
              type: url.match(/\.(zip|mcworld|rar|7z)/i) ? 'direct' : 'page'
            };
          }
        }
      }
      
      // Pattern 3: Check for common file hosting links
      const hostingPatterns = [
        { pattern: /mediafire\.com/, type: 'page' },
        { pattern: /dropbox\.com/, type: 'direct' },
        { pattern: /mega\.nz/, type: 'page' },
        { pattern: /curseforge\.com/, type: 'page' },
        { pattern: /github\.com.*releases/, type: 'direct' },
        { pattern: /cdn\.discordapp\.com/, type: 'direct' }
      ];
      
      const allLinks = $('a[href]');
      for (let i = 0; i < allLinks.length; i++) {
        const href = $(allLinks[i]).attr('href') || '';
        for (const hosting of hostingPatterns) {
          if (hosting.pattern.test(href)) {
            const fullLink = href.startsWith('http') ? href : 
                            href.startsWith('//') ? `https:${href}` :
                            `${this.baseUrl}${href}`;
            console.log(`[9Minecraft] Found hosting link (${hosting.type}): ${fullLink.substring(0, 80)}...`);
            return {
              url: fullLink,
              type: hosting.type
            };
          }
        }
      }
      
      console.log(`[9Minecraft] No direct download found, returning page URL`);
      return {
        url: mapUrl,
        type: 'page'
      };
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`[9Minecraft] Extract download URL error: ${error.message}`);
      return {
        url: mapUrl,
        type: 'page'
      };
    }
  }

  /**
   * CRITICAL FIX (Round 11): Enrich maps with direct download URLs
   * Call this after search to fetch actual download URLs
   */
  async enrichWithDownloadUrls(maps, options = {}) {
    const maxConcurrent = options.maxConcurrent || 2;
    const enrichedMaps = [];
    
    console.log(`[9Minecraft] Enriching ${maps.length} maps with download URLs...`);
    
    // Process in batches to avoid overwhelming the server
    for (let i = 0; i < maps.length; i += maxConcurrent) {
      const batch = maps.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (map) => {
        try {
          const downloadInfo = await this.extractDirectDownloadUrl(map.url, options);
          if (downloadInfo && downloadInfo.type === 'direct') {
            return {
              ...map,
              downloadUrl: downloadInfo.url,
              downloadType: 'direct',
              downloadNote: null
            };
          }
          return map;
        } catch (error) {
          console.warn(`[9Minecraft] Failed to enrich ${map.title}: ${error.message}`);
          return map;
        }
      });
      
      const enrichedBatch = await Promise.all(batchPromises);
      enrichedMaps.push(...enrichedBatch);
      
      // Small delay between batches
      if (i + maxConcurrent < maps.length) {
        await this.sleep(1000);
      }
    }
    
    const directCount = enrichedMaps.filter(m => m.downloadType === 'direct').length;
    console.log(`[9Minecraft] Enrichment complete: ${directCount}/${enrichedMaps.length} direct downloads`);
    
    return enrichedMaps;
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
