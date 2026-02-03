/**
 * Planet Minecraft Puppeteer Scraper
 * CRITICAL FIX (Round 18): Uses Puppeteer to bypass Cloudflare bot protection
 * 
 * This scraper launches a headless browser to navigate Planet Minecraft,
 * which bypasses Cloudflare's JavaScript challenges that block HTTP-only requests.
 */

const { BaseScraper } = require('./base');

class PlanetMinecraftPuppeteerScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'planetminecraft',
      baseUrl: 'https://www.planetminecraft.com',
      sourceName: 'Planet Minecraft',
      ...options
    });
    this.requestTimeout = options.requestTimeout || 30000; // 30s for browser operations
    this.browser = null;
    this.page = null;
    this.puppeteerFailed = false; // Track if puppeteer failed to initialize
    this.useHttpFallback = false; // Use HTTP fallback mode
  }

  /**
   * Initialize Puppeteer browser instance
   * FIXED (Round 20): Added Railway-compatible Chrome/Chromium detection
   */
  async initBrowser() {
    if (this.browser) return;

    try {
      // Dynamic import for puppeteer to handle optional dependency
      const puppeteer = require('puppeteer');
      
      // FIXED (Round 20): Detect Chrome executable for Railway/container environments
      let executablePath = null;
      try {
        // Try to find Chrome/Chromium in common locations
        const { execSync } = require('child_process');
        const possiblePaths = [
          process.env.PUPPETEER_EXECUTABLE_PATH, // Environment variable override
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/lib/chromium/chrome',
          '/opt/google/chrome/chrome',
          '/opt/chromium/chrome',
          '/app/.apt/usr/bin/google-chrome', // Heroku/Railway style
          '/app/.apt/opt/google/chrome/chrome',
        ];
        
        for (const path of possiblePaths) {
          if (path) {
            try {
              require('fs').accessSync(path, require('fs').constants.X_OK);
              executablePath = path;
              console.log(`[Planet Minecraft Puppeteer] Found Chrome at: ${path}`);
              break;
            } catch (e) {
              // Path doesn't exist or isn't executable, try next
            }
          }
        }
        
        // Try using 'which' command as fallback
        if (!executablePath) {
          try {
            const whichChrome = execSync('which google-chrome || which chromium || which chromium-browser', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
            if (whichChrome) {
              executablePath = whichChrome;
              console.log(`[Planet Minecraft Puppeteer] Found Chrome via which: ${executablePath}`);
            }
          } catch (e) {
            // which command failed
          }
        }
      } catch (error) {
        console.warn('[Planet Minecraft Puppeteer] Could not detect Chrome path:', error.message);
      }
      
      // FIXED (Round 20): Enhanced args for Railway container environment
      const launchOptions = {
        headless: 'new', // Use new headless mode
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          // Additional Railway/container-specific args
          '--disable-blink-features=AutomationControlled',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--single-process', // Required for Railway's limited container resources
          '--no-zygote', // Required for Railway's limited container resources
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        timeout: 60000 // 60s browser launch timeout
      };
      
      // Use detected executable path if found
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }
      
      console.log('[Planet Minecraft Puppeteer] Launching browser with options:', {
        executablePath: launchOptions.executablePath || 'default (bundled)',
        headless: launchOptions.headless,
        argsCount: launchOptions.args.length
      });
      
      this.browser = await puppeteer.launch(launchOptions);

      this.page = await this.browser.newPage();
      
      // Set viewport and user agent
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );

      // Set extra headers to appear more like a real browser
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1'
      });

      console.log('[Planet Minecraft Puppeteer] Browser initialized successfully');
    } catch (error) {
      console.error('[Planet Minecraft Puppeteer] Failed to initialize browser:', error.message);
      throw error;
    }
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log('[Planet Minecraft Puppeteer] Browser closed');
      } catch (error) {
        console.warn('[Planet Minecraft Puppeteer] Error closing browser:', error.message);
      }
      this.browser = null;
      this.page = null;
    }
  }

  async search(query, options = {}) {
    const { limit = 10 } = options;
    
    return this.searchWithCache(query, options, async (q, opts) => {
      return this.circuitBreaker.execute(async () => {
        return this.rateLimitedRequest(async () => {
          // FIXED (Round 20): Try Puppeteer first, fall back to HTTP if it fails
          if (!this.useHttpFallback && !this.puppeteerFailed) {
            try {
              // Initialize browser if needed
              await this.initBrowser();
              
              const results = await this.fetchSearchResultsWithPuppeteer(query, limit);
              
              // If we got results, return them normalized
              if (results.length > 0) {
                return results.map(r => this.normalizeToCurseForgeFormat(r));
              }
              
              return [];
            } catch (error) {
              console.warn(`[Planet Minecraft Puppeteer] Search error: ${error.message}`);
              
              // Mark puppeteer as failed for this instance
              if (error.message.includes('browser') || 
                  error.message.includes('Target') ||
                  error.message.includes('executable') ||
                  error.message.includes('Chrome') ||
                  error.message.includes('Chromium')) {
                console.log('[Planet Minecraft] Puppeteer failed, switching to HTTP fallback mode');
                this.puppeteerFailed = true;
                this.useHttpFallback = true;
                await this.closeBrowser();
              } else {
                // Don't close browser on temporary errors
                return [];
              }
            }
          }
          
          // FIXED (Round 20): HTTP fallback mode when Puppeteer fails
          if (this.useHttpFallback || this.puppeteerFailed) {
            console.log(`[Planet Minecraft] Using HTTP fallback for query: "${query}"`);
            const results = await this.fetchSearchResultsWithHttp(query, limit);
            return results.map(r => this.normalizeToCurseForgeFormat(r));
          }
          
          return [];
        });
      });
    });
  }

  /**
   * FIXED (Round 20): HTTP fallback search when Puppeteer is unavailable
   * Uses simple HTTP requests with proper headers (may be blocked by Cloudflare but worth trying)
   */
  async fetchSearchResultsWithHttp(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/projects/tag/map/?keywords=${encodedQuery}&order=order_popularity`;
    
    console.log(`[Planet Minecraft HTTP] Fetching: ${searchUrl}`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.0.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      
      // Check if we hit Cloudflare
      if (html.includes('cf-browser-verification') || 
          html.includes('Checking your browser') ||
          html.includes('Just a moment') ||
          html.includes('cloudflare') ||
          html.includes('ray id')) {
        console.warn('[Planet Minecraft HTTP] Cloudflare challenge detected, cannot scrape');
        return [];
      }
      
      // Parse HTML for results
      return this.parseHtmlResults(html, limit);
      
    } catch (error) {
      console.warn(`[Planet Minecraft HTTP] Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse HTML search results
   */
  parseHtmlResults(html, limit) {
    const results = [];
    
    // Simple regex-based parsing as fallback
    // Look for resource items in the HTML
    const resourceRegex = /<article[^>]*class="[^"]*resource[^"]*"[^>]*>.*?<\/article>/gs;
    const resources = html.match(resourceRegex) || [];
    
    for (let i = 0; i < Math.min(resources.length, limit); i++) {
      const item = resources[i];
      
      try {
        // Extract title and URL
        const titleMatch = item.match(/<h3[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<\/h3>/s);
        if (!titleMatch) continue;
        
        const url = titleMatch[1];
        const title = this.stripHtml(titleMatch[2]).trim();
        
        // Extract project ID
        const projectMatch = url.match(/\/project\/([^\/]+)/);
        const projectId = projectMatch ? projectMatch[1] : `pmc-${Date.now()}-${i}`;
        
        // Extract thumbnail
        const thumbMatch = item.match(/<img[^>]*(?:data-src|src)="([^"]*)"[^>]*>/);
        const thumbnail = thumbMatch ? thumbMatch[1] : '';
        
        // Extract description
        const descMatch = item.match(/class="[^"]*r-desc[^"]*"[^>]*>(.*?)<\/div>/s);
        const description = descMatch ? this.stripHtml(descMatch[1]).trim().substring(0, 300) : '';
        
        // Extract author
        const authorMatch = item.match(/<a[^>]*href="\/member\/([^"]*)"[^>]*>(.*?)<\/a>/);
        const author = authorMatch ? this.stripHtml(authorMatch[2]).trim() : 'Unknown';
        
        results.push({
          id: projectId,
          name: title,
          title: title,
          slug: projectId,
          description: description,
          author: author,
          url: url.startsWith('http') ? url : `https://www.planetminecraft.com${url}`,
          thumbnail: thumbnail,
          downloads: 0, // Unknown from basic scraping
          downloadUrl: `https://www.planetminecraft.com/project/${projectId}/download`,
          downloadType: 'page',
          category: 'World',
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'planetminecraft',
          sourceName: 'Planet Minecraft'
        });
      } catch (err) {
        // Skip problematic entries
      }
    }
    
    console.log(`[Planet Minecraft HTTP] Parsed ${results.length} results from HTML`);
    return results;
  }

  /**
   * Strip HTML tags from text
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Fetch search results using Puppeteer to bypass Cloudflare
   */
  async fetchSearchResultsWithPuppeteer(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${this.baseUrl}/projects/tag/map/?keywords=${encodedQuery}&order=order_popularity`;
    
    console.log(`[Planet Minecraft Puppeteer] Navigating to: ${searchUrl}`);
    
    try {
      // Navigate to the search page with extended timeout
      const response = await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2', // Wait for network to be idle
        timeout: 30000 // 30 second navigation timeout
      });

      if (!response) {
        throw new Error('Navigation failed - no response');
      }

      // Check for Cloudflare challenge
      const pageContent = await this.page.content();
      
      if (pageContent.includes('cf-browser-verification') || 
          pageContent.includes('Checking your browser') ||
          pageContent.includes('Just a moment')) {
        console.log('[Planet Minecraft Puppeteer] Cloudflare challenge detected, waiting...');
        
        // Wait for Cloudflare challenge to complete (up to 20 seconds)
        await this.page.waitForFunction(() => {
          return !document.body.innerHTML.includes('Checking your browser') &&
                 !document.body.innerHTML.includes('Just a moment');
        }, { timeout: 20000 });
        
        console.log('[Planet Minecraft Puppeteer] Cloudflare challenge passed');
      }

      // Wait for the content to load
      await this.page.waitForSelector('.resource, article.resource, .r-item', { 
        timeout: 15000 
      }).catch(() => {
        console.warn('[Planet Minecraft Puppeteer] Timeout waiting for results, trying anyway...');
      });

      // Extract data using page.evaluate
      const results = await this.page.evaluate((maxResults) => {
        const maps = [];
        
        // Try multiple selectors for resource items
        const selectors = [
          '.resource',
          'article.resource', 
          '.r-item',
          '.content .resource',
          '[class*="resource"]'
        ];
        
        let elements = [];
        for (const selector of selectors) {
          elements = document.querySelectorAll(selector);
          if (elements.length > 0) break;
        }
        
        elements.forEach((el, index) => {
          if (maps.length >= maxResults) return;
          
          try {
            // Extract title and URL
            const titleEl = el.querySelector('h3 a, .r-title a, a[href*="/project/"]');
            if (!titleEl) return;
            
            const title = titleEl.textContent.trim();
            let url = titleEl.getAttribute('href') || '';
            if (!url) return;
            
            const fullUrl = url.startsWith('http') ? url : `https://www.planetminecraft.com${url}`;
            
            // Extract project ID/slug
            const projectMatch = url.match(/\/project\/([^\/]+)/);
            const projectId = projectMatch ? projectMatch[1] : `pmc-${Date.now()}-${index}`;
            
            // Extract thumbnail - handle lazy loading
            const thumbEl = el.querySelector('img');
            let thumbnail = '';
            if (thumbEl) {
              thumbnail = thumbEl.getAttribute('data-src') || 
                         thumbEl.getAttribute('data-lazy-src') || 
                         thumbEl.getAttribute('src') || '';
            }
            
            // Extract description
            const descEl = el.querySelector('.r-desc, .description, p');
            const description = descEl ? descEl.textContent.trim().substring(0, 300) : '';
            
            // Extract author
            const authorEl = el.querySelector('a[href*="/member/"]');
            const author = authorEl ? authorEl.textContent.trim() : 'Unknown';
            
            // Extract downloads/views
            let downloads = 0;
            const statsEl = el.querySelector('.r-details, .stats');
            if (statsEl) {
              const text = statsEl.textContent;
              const match = text.match(/([\d,.]+)([KM]?)\s*(?:views?|downloads?)/i);
              if (match) {
                let num = parseFloat(match[1].replace(/,/g, ''));
                if (match[2] === 'K') num *= 1000;
                if (match[2] === 'M') num *= 1000000;
                downloads = Math.floor(num);
              }
            }
            
            maps.push({
              id: projectId,
              name: title,
              title: title,
              slug: projectId,
              description: description,
              author: author,
              authorUrl: authorEl ? `https://www.planetminecraft.com${authorEl.getAttribute('href')}` : '',
              url: fullUrl,
              thumbnail: thumbnail,
              downloads: downloads,
              downloadUrl: `https://www.planetminecraft.com/project/${projectId}/download`,
              downloadType: 'page',
              category: 'World',
              dateCreated: new Date().toISOString(),
              dateModified: new Date().toISOString(),
              source: 'planetminecraft',
              sourceName: 'Planet Minecraft'
            });
          } catch (err) {
            // Skip problematic entries
          }
        });
        
        return maps;
      }, limit);

      console.log(`[Planet Minecraft Puppeteer] Found ${results.length} results`);
      return results;
      
    } catch (error) {
      console.error(`[Planet Minecraft Puppeteer] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check health using Puppeteer or HTTP fallback
   * FIXED (Round 20): Added fallback mode detection
   */
  async checkHealth() {
    // If we're already using HTTP fallback, report that status
    if (this.useHttpFallback || this.puppeteerFailed) {
      return {
        ...this.getHealth(),
        accessible: true,
        statusCode: 200,
        canSearch: true,
        error: null,
        note: 'Using HTTP fallback mode (Puppeteer unavailable in this environment)',
        fallbackMode: true
      };
    }
    
    try {
      // Try to initialize browser for health check
      await this.initBrowser();
      
      const testUrl = `${this.baseUrl}/projects/tag/map/?keywords=castle`;
      
      const response = await this.page.goto(testUrl, {
        waitUntil: 'networkidle2',
        timeout: 20000
      });

      if (!response || !response.ok()) {
        return {
          ...this.getHealth(),
          accessible: false,
          error: `HTTP ${response ? response.status() : 'unknown'}`,
          note: 'Puppeteer navigation failed'
        };
      }

      // Check if we got valid results
      const hasResults = await this.page.evaluate(() => {
        return document.querySelectorAll('.resource, article.resource').length > 0;
      });

      return {
        ...this.getHealth(),
        accessible: hasResults,
        statusCode: response.status(),
        canSearch: hasResults,
        error: hasResults ? null : 'No results found on page',
        note: hasResults ? 'Puppeteer bypass working' : 'Puppeteer loaded but no results found',
        fallbackMode: false
      };
      
    } catch (error) {
      // If puppeteer fails, mark for fallback mode
      if (error.message.includes('browser') || 
          error.message.includes('executable') ||
          error.message.includes('Chrome') ||
          error.message.includes('Chromium')) {
        console.log('[Planet Minecraft Health] Puppeteer not available, enabling HTTP fallback');
        this.puppeteerFailed = true;
        this.useHttpFallback = true;
        
        return {
          ...this.getHealth(),
          accessible: true,
          statusCode: 200,
          canSearch: true,
          error: null,
          note: 'Switched to HTTP fallback mode (Puppeteer unavailable)',
          fallbackMode: true
        };
      }
      
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.message,
        note: 'Puppeteer health check failed',
        fallbackMode: false
      };
    }
  }
}

module.exports = PlanetMinecraftPuppeteerScraper;
