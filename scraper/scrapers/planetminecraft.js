/**
 * Planet Minecraft HTTP Scraper (No Playwright)
 * Uses fetch + Cheerio for reliable HTTP-based scraping
 */

const { BaseScraper } = require('./base');
const cheerio = require('cheerio');

class PlanetMinecraftScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'planetminecraft',
      baseUrl: 'https://www.planetminecraft.com',
      sourceName: 'Planet Minecraft',
      ...options
    });
    this.requestTimeout = options.requestTimeout || 5000; // 5s timeout per request
  }

  async search(query, options = {}) {
    const { limit = 8 } = options;
    
    return this.searchWithCache(query, options, async (q, opts) => {
      return this.circuitBreaker.execute(async () => {
        return this.rateLimitedRequest(async () => {
          // FIXED: Throw error instead of returning empty array
          // This ensures proper error reporting when Planet Minecraft is blocked
          const results = await this.fetchSearchResults(query, limit);
          
          // Check if we got blocked by Cloudflare
          if (results.length === 0) {
            // This might be a legitimate "no results" or a block
            // Let's check by doing a health check
            const health = await this.checkHealth();
            if (!health.accessible) {
              throw new Error('Planet Minecraft blocked by Cloudflare - cannot search');
            }
          }
          
          return results.map(r => this.normalizeToCurseForgeFormat(r));
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    const encodedQuery = encodeURIComponent(query);
    // FIXED: Use correct URL format per Red Team spec: /projects/tag/map/?keywords=QUERY
    const searchUrl = `${this.baseUrl}/projects/tag/map/?keywords=${encodedQuery}&order=order_popularity`;
    
    console.log(`[Planet Minecraft HTTP] Fetching: ${searchUrl}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    // FIXED: Enhanced bot evasion with realistic browser headers
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Add small random delay to appear more human-like
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    try {
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Cache-Control': 'max-age=0',
        },
        redirect: 'follow'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
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
    const results = [];
    
    // Planet Minecraft uses .resource or article elements
    const selectors = [
      '.resource',
      'article.resource',
      '.r-item',
      '.content .resource'
    ];
    
    for (const selector of selectors) {
      $(selector).each((index, element) => {
        if (results.length >= limit) return false;
        
        const $el = $(element);
        
        // Extract title and URL
        const titleEl = $el.find('h3 a, .r-title a, a[href*="/project/"]').first();
        if (!titleEl.length) return;
        
        const title = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        if (!url) return;
        
        const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
        
        // Extract project slug
        const projectMatch = url.match(/\/project\/([^\/]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        
        // Extract thumbnail - handle lazy loading
        const thumbEl = $el.find('img').first();
        let thumbnail = '';
        if (thumbEl.length) {
          thumbnail = thumbEl.attr('data-src') || thumbEl.attr('src') || '';
        }
        
        // Extract description
        const descEl = $el.find('.r-desc, .description, p').first();
        const description = descEl.text().trim().substring(0, 300);
        
        // Extract author
        const authorEl = $el.find('a[href*="/member/"]').first();
        const author = authorEl.text().trim() || 'Unknown';
        
        // Extract downloads/views
        let downloads = 0;
        const statsEl = $el.find('.r-details, .stats').first();
        if (statsEl.length) {
          const text = statsEl.text();
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
          description: description,
          author: author,
          authorUrl: authorEl.attr('href') ? `${this.baseUrl}${authorEl.attr('href')}` : '',
          url: fullUrl,
          thumbnail: thumbnail,
          downloads: downloads,
          downloadUrl: projectId ? `${this.baseUrl}/project/${projectId}/download` : null,
          category: 'World',
          dateCreated: new Date().toISOString(),
          dateModified: new Date().toISOString(),
          source: 'planetminecraft',
          sourceName: 'Planet Minecraft' // FIXED: Add sourceName for display
        });
      });
      
      if (results.length > 0) break;
    }
    
    console.log(`[Planet Minecraft HTTP] Parsed ${results.length} results`);
    return results;
  }

  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      // Test actual search functionality
      const searchUrl = `${this.baseUrl}/projects/tag/map/?keywords=castle`;
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      let canSearch = false;
      let errorDetail = null;
      
      if (response.ok) {
        const html = await response.text();
        // Check if we got valid search results vs Cloudflare block page
        const isCloudflareBlock = html.includes('Cloudflare') && html.includes('blocked');
        canSearch = !isCloudflareBlock && html.includes('resource') && html.includes('project') && html.length > 5000;
        
        if (isCloudflareBlock) {
          errorDetail = 'Blocked by Cloudflare bot protection (requires JavaScript/cookies)';
        } else if (!canSearch) {
          errorDetail = 'Invalid response format';
        }
      } else if (response.status === 403) {
        errorDetail = 'HTTP 403 Forbidden - Cloudflare bot protection active';
      } else {
        errorDetail = `HTTP ${response.status}`;
      }
      
      return {
        ...this.getHealth(),
        accessible: response.ok && canSearch,
        statusCode: response.status,
        canSearch: canSearch,
        error: errorDetail,
        note: 'Planet Minecraft uses Cloudflare bot protection - HTTP-only scraping blocked'
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.name === 'AbortError' ? 'Health check timeout' : error.message,
        note: 'Planet Minecraft uses Cloudflare bot protection - HTTP-only scraping blocked'
      };
    }
  }
}

module.exports = PlanetMinecraftScraper;
