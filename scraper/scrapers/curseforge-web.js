/**
 * CurseForge Web Scraper
 * Scrapes real map data from CurseForge website using Puppeteer
 * Bypasses the need for an API key by using web scraping
 */

const puppeteer = require('puppeteer');
const BaseScraper = require('./base');

class CurseForgeWebScraper extends BaseScraper {
  constructor() {
    super('curseforge-web', 'CurseForge (Web)', 'https://www.curseforge.com');
    this.baseUrl = 'https://www.curseforge.com/minecraft/worlds';
    this.browser = null;
    this.maxRetries = 3;
  }

  async getBrowser() {
    if (!this.browser) {
      try {
        // Use system Chromium if available, otherwise download
        const launchOptions = {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--single-process',
            '--no-first-run',
            '--no-zygote'
          ]
        };

        // Check if system Chromium is available
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
          launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        this.browser = await puppeteer.launch(launchOptions);
        console.log('[CurseForge Web] Browser launched successfully');
      } catch (error) {
        console.error('[CurseForge Web] Failed to launch browser:', error.message);
        throw error;
      }
    }
    return this.browser;
  }

  async search(query, options = {}) {
    const { limit = 20 } = options;
    
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      
      try {
        // Set user agent to avoid blocking
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        
        // Navigate to CurseForge maps with search query
        const searchUrl = `${this.baseUrl}?search=${encodeURIComponent(query)}`;
        console.log(`[CurseForge Web] Navigating to: ${searchUrl}`);
        
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        // Wait for search results to load
        await page.waitForSelector('[class*="project-card"], .project-item', {
          timeout: 15000
        }).catch(() => {
          console.log('[CurseForge Web] Results selector not found, continuing anyway');
        });
        
        // Extract map data from the page
        const maps = await page.evaluate((queryTerm) => {
          const results = [];
          
          // Try multiple selectors for project cards
          const cardSelectors = [
            '[class*="project-card"]',
            '.project-item',
            '[class*="world-card"]',
            'article[class*="card"]'
          ];
          
          for (const selector of cardSelectors) {
            const cards = document.querySelectorAll(selector);
            if (cards.length > 0) {
              console.log(`Found ${cards.length} cards with selector: ${selector}`);
              break;
            }
          }
          
          // Get all project cards
          const cards = document.querySelectorAll(
            '[class*="project-card"], .project-item, [class*="world-card"], article[class*="card"]'
          );
          
          cards.forEach((card, index) => {
            try {
              // Extract title
              const titleEl = card.querySelector('h3, h2, [class*="title"], .project-name');
              const title = titleEl?.textContent?.trim() || '';
              
              // Extract link and ID
              const linkEl = card.querySelector('a[href*="/minecraft/worlds"]');
              const url = linkEl?.href || '';
              const id = url.split('/worlds/')[1]?.split('/')?.[0] || '';
              
              // Extract author
              const authorEl = card.querySelector('[class*="author"], .project-author, [class*="creator"]');
              const author = authorEl?.textContent?.trim() || 'Unknown';
              
              // Extract description
              const descEl = card.querySelector('[class*="description"], .project-description, p');
              const description = descEl?.textContent?.trim() || '';
              
              // Extract download count
              const dlEl = card.querySelector('[class*="download"]');
              const downloads = parseInt(dlEl?.textContent?.match(/\d+/)?.[0] || 0);
              
              // Extract thumbnail image
              const imgEl = card.querySelector('img');
              const thumbnail = imgEl?.src || '';
              
              if (title && id) {
                results.push({
                  id,
                  title,
                  author,
                  description,
                  url: `https://www.curseforge.com/minecraft/worlds/${id}`,
                  downloadUrl: `https://www.curseforge.com/minecraft/worlds/${id}/download`,
                  downloads,
                  thumbnail,
                  category: 'World',
                  source: 'curseforge-web'
                });
              }
            } catch (error) {
              console.error('Error parsing card:', error.message);
            }
          });
          
          return results;
        }, query);
        
        console.log(`[CurseForge Web] Found ${maps.length} maps from web scraping`);
        return maps.slice(0, limit);
        
      } finally {
        await page.close();
      }
      
    } catch (error) {
      console.error('[CurseForge Web] Search failed:', error.message);
      if (error.message.includes('browser') || error.message.includes('detached')) {
        // Reset browser on connection errors
        this.browser = null;
      }
      return [];
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
      } catch (error) {
        console.error('[CurseForge Web] Error closing browser:', error.message);
      }
    }
  }

  async getHealth() {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      
      try {
        await page.goto('https://www.curseforge.com/minecraft/worlds', {
          waitUntil: 'networkidle2',
          timeout: 15000
        });
        
        const accessible = page.url().includes('curseforge.com');
        return {
          name: this.scraperName,
          source: this.source,
          accessible,
          status: accessible ? 'healthy' : 'unhealthy',
          error: accessible ? null : 'Cannot access CurseForge website'
        };
        
      } finally {
        await page.close();
      }
      
    } catch (error) {
      return {
        name: this.scraperName,
        source: this.source,
        accessible: false,
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = CurseForgeWebScraper;
