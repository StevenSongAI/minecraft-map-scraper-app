/**
 * Planet Minecraft Scraper
 * Scrapes minecraft maps from planetminecraft.com using Playwright for browser automation
 */

const { BaseScraper } = require('./base');
const { chromium } = require('playwright');

class PlanetMinecraftScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'planetminecraft',
      baseUrl: 'https://www.planetminecraft.com',
      sourceName: 'Planet Minecraft',
      ...options
    });
    this.browser = null;
    this.context = null;
    this.maxRetries = 2;
    this.retryDelay = 1000;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080'
        ]
      });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York'
      });
    }
  }

  async closeBrowser() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
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
              await this.initBrowser();
              let results = await this.scrapeSearch(query, limit);
              
              // Normalize to CurseForge format
              results = results.map(r => this.normalizeToCurseForgeFormat(r));
              
              // Validate download URLs
              console.log(`[Planet Minecraft] Validating ${results.length} download URLs...`);
              results = await this.validateMapDownloads(results, { maxConcurrent: 2 });
              
              // Filter out maps without verified downloads
              const verifiedCount = results.filter(r => r.downloadVerified).length;
              console.log(`[Planet Minecraft] ${verifiedCount}/${results.length} download URLs verified`);
              
              return results;
            } catch (error) {
              lastError = error;
              retries++;
              console.warn(`[Planet Minecraft] Retry ${retries}/${this.maxRetries} after error: ${error.message}`);
              await this.sleep(this.retryDelay * retries);
              
              // Reset browser on error
              await this.closeBrowser();
            }
          }

          throw new Error(`Failed after ${this.maxRetries} retries: ${lastError.message}`);
        });
      });
    });
  }

  async scrapeSearch(query, limit) {
    const page = await this.context.newPage();
    
    try {
      // Build search URL
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `${this.baseUrl}/resources/projects/?text=${encodedQuery}&order=order_popularity`;
      
      console.log(`[Planet Minecraft] Navigating to: ${searchUrl}`);
      
      // Navigate with timeout and wait for content (use domcontentloaded for faster response)
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });

      // Wait for results to load with shorter timeout
      await page.waitForSelector('.resource, .r-content, .project-card, [data-project-id], .cont, article', 
        { timeout: 8000 });

      // Extract map data from the page
      const maps = await page.evaluate((limit) => {
        const results = [];
        
        // Try multiple selectors for different page layouts
        const selectors = [
          '.resource',
          '.r-content',
          '.project-card',
          '[data-project-id]',
          '.cont .r-item',
          '.resource-item'
        ];
        
        let elements = [];
        for (const selector of selectors) {
          elements = document.querySelectorAll(selector);
          if (elements.length > 0) break;
        }

        elements.forEach((el, index) => {
          if (index >= limit) return;

          try {
            // Extract data with multiple fallback selectors
            const titleEl = el.querySelector('.r-title a, .title a, h3 a, .resource-title a, a[href*="/project/"]');
            const authorEl = el.querySelector('.r-author a, .author a, .user a, [href*="/member/"]');
            const descEl = el.querySelector('.r-desc, .description, .summary, p');
            const thumbEl = el.querySelector('.r-img img, .thumbnail img, .preview img, img[src*="planetminecraft"]');
            const downloadsEl = el.querySelector('.r-details .fa-eye, .r-stats, .stats');
            
            if (titleEl) {
              const title = titleEl.textContent.trim();
              const url = titleEl.href;
              const projectMatch = url.match(/\/project\/([^\/]+)/);
              const projectId = projectMatch ? projectMatch[1] : null;
              
              // Get thumbnail - handle lazy loaded images
              let thumbnail = '';
              if (thumbEl) {
                thumbnail = thumbEl.dataset.src || thumbEl.src || '';
              }
              
              // Parse download count
              let downloads = 0;
              if (downloadsEl) {
                const text = downloadsEl.textContent || downloadsEl.parentElement.textContent || '';
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
                description: descEl ? descEl.textContent.trim().substring(0, 500) : '',
                author: authorEl ? authorEl.textContent.trim() : 'Unknown',
                authorUrl: authorEl ? authorEl.href : '',
                url: url.startsWith('http') ? url : `https://www.planetminecraft.com${url}`,
                thumbnail: thumbnail,
                downloads: downloads,
                category: 'World',
                dateCreated: new Date().toISOString(),
                dateModified: new Date().toISOString()
              });
            }
          } catch (e) {
            // Skip invalid items
          }
        });

        return results;
      }, limit);

      console.log(`[Planet Minecraft] Found ${maps.length} maps`);
      
      // Now fetch download URLs for each map (with timeout to keep it fast)
      for (const map of maps) {
        if (map.slug) {
          try {
            // Use a quick timeout for download URL fetching
            const downloadPromise = this.getDownloadUrl(page, map.slug);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Download URL timeout')), 5000)
            );
            map.downloadUrl = await Promise.race([downloadPromise, timeoutPromise]);
          } catch (e) {
            // Fallback to project page URL
            map.downloadUrl = `${this.baseUrl}/project/${map.slug}/download`;
          }
        }
      }

      return maps;
    } finally {
      await page.close();
    }
  }

  async getDownloadUrl(page, projectSlug) {
    try {
      const downloadPageUrl = `${this.baseUrl}/project/${projectSlug}/download`;
      
      // Open new page for download
      const downloadPage = await this.context.newPage();
      
      try {
        await downloadPage.goto(downloadPageUrl, { waitUntil: 'networkidle', timeout: 20000 });
        
        // Look for download button/link with improved selectors
        const downloadInfo = await downloadPage.evaluate(() => {
          // Try multiple selectors for direct download link
          const selectors = [
            'a[href*=".zip"]',
            'a[href*=".rar"]',
            'a[href*=".mcworld"]',
            'a[href*=".mcpack"]',
            'a[href*="mediafire.com"]',
            'a[href*="curseforge.com"]',
            'a.download-button',
            'a[href*="download"]:not([href*="/download"])',
            'button[data-download]',
            '.download a',
            '[data-download-url]'
          ];
          
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
              const href = el.href || el.dataset.download || el.dataset.url || el.dataset.downloadUrl;
              if (href && !href.includes('javascript:')) {
                return { url: href, source: 'selector', selector };
              }
            }
          }
          
          // Look for any link with download text
          const links = document.querySelectorAll('a');
          for (const link of links) {
            const text = link.textContent.toLowerCase();
            const href = link.href;
            if (text.includes('download') && href && 
                (href.includes('.zip') || href.includes('.rar') || href.includes('.mcworld') || 
                 href.includes('mediafire') || href.includes('curseforge'))) {
              return { url: href, source: 'text-match' };
            }
          }
          
          return null;
        });

        return downloadInfo ? downloadInfo.url : null;
      } finally {
        await downloadPage.close();
      }
    } catch (error) {
      console.warn(`[Planet Minecraft] Failed to get download URL for ${projectSlug}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract and validate direct download URL from a Planet Minecraft project page
   * Overrides BaseScraper.extractDownloadUrl
   */
  async extractDownloadUrl(mapUrl, options = {}) {
    if (!mapUrl) return null;
    
    // Extract project slug from URL
    const slugMatch = mapUrl.match(/\/project\/([^\/]+)/);
    if (!slugMatch) {
      console.warn(`[Planet Minecraft] Could not extract slug from URL: ${mapUrl}`);
      return null;
    }
    
    const projectSlug = slugMatch[1];
    
    try {
      await this.initBrowser();
      const page = await this.context.newPage();
      
      try {
        // First try the download page
        const downloadUrl = await this.getDownloadUrl(page, projectSlug);
        
        if (downloadUrl) {
          // Validate the URL returns HTTP 200
          const validatedUrl = await this.validateDownloadUrl(downloadUrl, options);
          if (validatedUrl) {
            console.log(`[Planet Minecraft] Validated download URL for ${projectSlug}`);
            return validatedUrl;
          }
        }
        
        return null;
      } finally {
        await page.close();
      }
    } catch (error) {
      console.warn(`[Planet Minecraft] Error extracting download URL: ${error.message}`);
      return null;
    }
  }

  // Health check
  async checkHealth() {
    try {
      await this.initBrowser();
      const page = await this.context.newPage();
      
      try {
        await page.goto(this.baseUrl, { timeout: 10000 });
        const title = await page.title();
        const isAccessible = title.toLowerCase().includes('planet minecraft');
        
        return {
          ...this.getHealth(),
          accessible: isAccessible,
          pageTitle: title
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.message
      };
    }
  }
}

module.exports = PlanetMinecraftScraper;
