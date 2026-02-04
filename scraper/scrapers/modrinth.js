/**
 * Modrinth API Scraper
 * Uses the official Modrinth API for Minecraft maps/worlds
 * No Cloudflare blocks, reliable JSON API
 */

const { BaseScraper } = require('./base');

class ModrinthScraper extends BaseScraper {
  constructor(options = {}) {
    super({
      name: 'modrinth',
      baseUrl: 'https://api.modrinth.com/v2',
      sourceName: 'Modrinth',
      // FIXED (Round 20): Lower threshold for circuit breaker to trigger sooner on timeouts
      failureThreshold: options.failureThreshold || 3,
      resetTimeout: options.resetTimeout || 60000, // 1 minute cooldown
      ...options
    });
    // FIXED (Round 18): Increased timeout to 15s for reliability
    this.requestTimeout = options.requestTimeout || 15000;
    // FIXED (Round 18): Retry configuration
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  /**
   * FIXED (Round 20): Enhanced fetch with retry logic, exponential backoff, and circuit breaker integration
   */
  async fetchWithRetry(url, options = {}, retries = null) {
    const maxRetries = retries !== null ? retries : this.maxRetries;
    let lastError;
    let timeoutCount = 0;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // FIXED (Round 20): Record success to circuit breaker on successful request
        this.circuitBreaker.onSuccess();
        
        return response;
      } catch (error) {
        lastError = error;
        
        // FIXED (Round 20): Track timeout errors specifically for circuit breaker
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          timeoutCount++;
          console.warn(`[Modrinth] Timeout error (${timeoutCount}/${maxRetries}) for ${url}`);
          
          // If we've had multiple timeouts, trigger circuit breaker failure
          if (timeoutCount >= 2) {
            this.circuitBreaker.onFailure();
            console.warn(`[Modrinth] Circuit breaker recorded timeout failure`);
          }
        }
        
        // Don't retry on 4xx errors (client errors)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        if (attempt < maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`[Modrinth] Retry ${attempt + 1}/${maxRetries} after ${delay}ms for ${url}`);
          await this.sleep(delay);
        }
      }
    }
    
    // FIXED (Round 20): Record final failure to circuit breaker
    this.circuitBreaker.onFailure();
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  async search(query, options = {}) {
    const { limit = 8 } = options;
    
    return this.searchWithCache(query, options, async (q, opts) => {
      return this.circuitBreaker.execute(async () => {
        return this.rateLimitedRequest(async () => {
          try {
            // fetchSearchResults already transforms results, don't double-transform
            const results = await this.fetchSearchResults(query, limit);
            return results;
          } catch (error) {
            console.warn(`[Modrinth] Search error: ${error.message}`);
            return [];
          }
        });
      });
    });
  }

  async fetchSearchResults(query, limit) {
    // FIXED (Round 58): Added fallback search strategy for low-result queries
    // FIXED (Round 52): Removed project_type:map facet - Modrinth doesn't have this type
    // FIXED (Round 61 - RED TEAM): Stricter filtering - Modrinth has NO maps, only mods/packs
    // Use content analysis to find map-like projects (most will fail)
    
    const encodedQuery = encodeURIComponent(query);
    let results = [];
    let searchUrl = `${this.baseUrl}/search?query=${encodedQuery}&limit=${Math.min(limit * 4, 60)}&offset=0`;
    
    console.log(`[Modrinth] Fetching: ${searchUrl}`);
    
    try {
      // FIXED (Round 18): Use fetchWithRetry for reliability
      let response = await this.fetchWithRetry(searchUrl, {
        headers: {
          'User-Agent': 'MinecraftMapScraper/2.0 (+https://github.com/StevenSongAI/minecraft-map-scraper-app)',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      let data = await response.json();
      results = data.hits || [];
      
      // CRITICAL FIX (Round 61 - RED TEAM): ULTRA-STRICT filtering to exclude mods and texture packs
      // Modrinth only has: mod, modpack, resourcepack - NO MAPS EXIST
      let filteredResults = results.filter(hit => {
        const projectType = (hit.project_type || '').toLowerCase();
        const title = (hit.title || '').toLowerCase();
        const description = (hit.description || '').toLowerCase();
        const text = `${title} ${description}`.toLowerCase();
        const categories = (hit.categories || []).map(c => c.toLowerCase());
        
        // REJECT mods - these are code modifications
        if (projectType === 'mod') {
          console.log(`[Modrinth] FILTERED (mod): ${hit.title}`);
          return false;
        }
        
        // REJECT modpacks - these are collections of mods
        if (projectType === 'modpack') {
          console.log(`[Modrinth] FILTERED (modpack): ${hit.title}`);
          return false;
        }
        
        // REJECT resource packs - these are texture/sound packs, not maps
        if (projectType === 'resourcepack') {
          console.log(`[Modrinth] FILTERED (resourcepack): ${hit.title}`);
          return false;
        }
        
        // REJECT if categories contain mod-related tags
        const modKeywords = ['fabric', 'forge', 'neoforge', 'bukkit', 'spigot', 'paper', 'plugin'];
        if (categories.some(cat => modKeywords.includes(cat))) {
          console.log(`[Modrinth] FILTERED (mod-category): ${hit.title}`);
          return false;
        }
        
        // REJECT if description is mostly about mods/mechanics
        if (text.includes('mod ') && !text.includes('world') && !text.includes('map')) {
          console.log(`[Modrinth] FILTERED (mod-keywords): ${hit.title}`);
          return false;
        }
        
        // REJECT if no map-like keywords found
        const mapKeywords = ['map', 'world', 'adventure', 'survival', 'puzzle', 'parkour', 'pvp', 'castle', 'city', 'island', 'skyblock'];
        const hasMapKeyword = mapKeywords.some(kw => text.includes(kw));
        if (!hasMapKeyword) {
          console.log(`[Modrinth] FILTERED (no-map-keywords): ${hit.title}`);
          return false;
        }
        
        // ONLY ACCEPT if all above checks pass
        console.log(`[Modrinth] ACCEPTED: ${hit.title}`);
        return true;
      });
      
      // FIXED (Round 58): Try fallback queries if results are too low
      if (filteredResults.length < 5) {
        const fallbackQueries = this.generateFallbackQueries(query);
        
        for (const fallbackQuery of fallbackQueries) {
          if (filteredResults.length >= 5) break;
          
          console.log(`[Modrinth] Low results (${filteredResults.length}), trying fallback: "${fallbackQuery}"`);
          
          try {
            const fallbackUrl = `${this.baseUrl}/search?query=${encodeURIComponent(fallbackQuery)}&limit=60&offset=0`;
            const fallbackResponse = await this.fetchWithRetry(fallbackUrl, {
              headers: {
                'User-Agent': 'MinecraftMapScraper/2.0',
                'Accept': 'application/json'
              }
            }, 2); // Only 2 retries for fallback queries
            
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              const fallbackResults = fallbackData.hits || [];
              const newFiltered = fallbackResults.filter(hit => {
                const projectType = (hit.project_type || '').toLowerCase();
                return projectType !== 'mod' && projectType !== 'modpack';
              });
              
              // Add new results that aren't duplicates
              for (const newHit of newFiltered) {
                const isDuplicate = filteredResults.some(existing => existing.project_id === newHit.project_id);
                if (!isDuplicate) {
                  filteredResults.push(newHit);
                  if (filteredResults.length >= 5) break;
                }
              }
            }
          } catch (fallbackError) {
            console.warn(`[Modrinth] Fallback query failed: ${fallbackError.message}`);
            continue;
          }
        }
      }
      
      // FIXED (Round 16): Enrich with direct download URLs and tags
      const enrichedResults = await this.enrichResultsWithDirectDownloads(filteredResults, limit);
      
      const transformedResults = enrichedResults.map(hit => this.transformHitToMapSync(hit));
      return transformedResults;
      
    } catch (error) {
      console.warn(`[Modrinth] fetchSearchResults error: ${error.message}`);
      throw error;
    }
  }

  /**
   * CRITICAL FIX (Round 16): Enrich search results with direct download URLs
   * Fetches version info for each project to get direct file URLs
   */
  async enrichResultsWithDirectDownloads(hits, limit) {
    // Limit concurrent fetches to avoid rate limiting
    const maxConcurrent = 3;
    const enriched = [];
    
    console.log(`[Modrinth] Enriching ${hits.length} results with direct download URLs...`);
    
    for (let i = 0; i < hits.length; i += maxConcurrent) {
      const batch = hits.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (hit) => {
        try {
          const versionInfo = await this.fetchVersionInfo(hit.project_id);
          return {
            ...hit,
            _directDownloadUrl: versionInfo?.downloadUrl || null,
            _fileInfo: versionInfo?.fileInfo || null,
            _versionNumber: versionInfo?.versionNumber || null
          };
        } catch (error) {
          console.warn(`[Modrinth] Failed to enrich ${hit.title}: ${error.message}`);
          return hit;
        }
      });
      
      const enrichedBatch = await Promise.all(batchPromises);
      enriched.push(...enrichedBatch);
      
      // Small delay between batches to avoid rate limiting
      if (i + maxConcurrent < hits.length) {
        await this.sleep(200);
      }
    }
    
    const withDirectUrl = enriched.filter(h => h._directDownloadUrl).length;
    console.log(`[Modrinth] Enrichment complete: ${withDirectUrl}/${enriched.length} have direct download URLs`);
    
    return enriched;
  }

  /**
   * Fetch version info for a project to get direct download URL
   */
  async fetchVersionInfo(projectId) {
    try {
      const versionsUrl = `${this.baseUrl}/project/${projectId}/version`;
      
      // FIXED (Round 18): Use fetchWithRetry with shorter timeout for version info
      const response = await this.fetchWithRetry(versionsUrl, {
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      }, 2); // Only 2 retries for version info
      
      if (!response.ok) {
        return null;
      }
      
      const versions = await response.json();
      if (!versions || versions.length === 0) {
        return null;
      }
      
      // Find first version with valid map files (not mods)
      for (const version of versions) {
        if (!version.files || version.files.length === 0) continue;
        
        // Find a map file (zip, mcworld) not a mod (jar, mrpack)
        const mapFile = version.files.find(f => {
          const filename = (f.filename || '').toLowerCase();
          return filename.match(/\.(zip|mcworld|rar|7z)$/) && !filename.match(/\.(jar|mrpack|litemod)$/);
        });
        
        if (mapFile) {
          return {
            downloadUrl: mapFile.url,
            fileInfo: {
              filename: mapFile.filename,
              filesize: mapFile.size,
              primary: mapFile.primary
            },
            versionNumber: version.version_number
          };
        }
        
        // If no map file but has primary file, use it (might be a datapack)
        const primaryFile = version.files.find(f => f.primary) || version.files[0];
        if (primaryFile) {
          const filename = (primaryFile.filename || '').toLowerCase();
          // Skip obvious mod files
          if (filename.match(/\.(jar|mrpack|litemod)$/)) {
            continue;
          }
          return {
            downloadUrl: primaryFile.url,
            fileInfo: {
              filename: primaryFile.filename,
              filesize: primaryFile.size,
              primary: primaryFile.primary
            },
            versionNumber: version.version_number
          };
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`[Modrinth] Error fetching version info for ${projectId}: ${error.message}`);
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  transformHitToMapSync(hit) {
    // FIXED (Round 10): Get proper thumbnail and use sync transform
    // FIXED (Round 10): Use 'name' field to match CurseForge format
    // FIXED (Round 11): Better download URL handling with version info
    // FIXED (Round 16): Use direct download URL if available, add tags from categories
    const projectId = hit.project_id || hit.slug;
    
    // CRITICAL FIX (Round 16): Use direct download URL if enriched, otherwise fallback to page
    const hasDirectUrl = !!hit._directDownloadUrl;
    const downloadUrl = hit._directDownloadUrl || `https://modrinth.com/project/${hit.slug}/versions`;
    
    // FIXED (Round 16): Extract tags from categories
    const tags = this.extractTags(hit);
    
    return {
      id: projectId,
      name: hit.title,
      title: hit.title,
      slug: hit.slug,
      summary: hit.description || '',
      description: hit.description || '',
      author: {
        name: hit.author || 'Unknown',
        url: hit.author ? `https://modrinth.com/user/${hit.author}` : ''
      },
      thumbnail: hit.icon_url || hit.gallery?.[0]?.url || '',
      screenshots: hit.gallery || [],
      downloadUrl: downloadUrl,
      downloadType: hasDirectUrl ? 'direct' : 'page',
      downloadNote: hasDirectUrl ? null : 'Visit Modrinth page to download',
      fileInfo: hit._fileInfo || null,
      downloadCount: hit.downloads || 0,
      downloads: hit.downloads || 0,
      gameVersions: hit.versions || [],
      primaryGameVersion: hit.game_versions?.[0] || hit.versions?.[0] || null,
      category: this.detectCategory(hit.title, hit.description),
      tags: tags,
      dateCreated: hit.date_created || new Date().toISOString(),
      dateModified: hit.date_modified || new Date().toISOString(),
      source: 'modrinth',
      sourceName: 'Modrinth',
      isFeatured: hit.featured || false,
      popularityScore: Math.log10((hit.downloads || 0) + 1),
      primaryLanguage: 'en',
      curseforge: {
        modId: null,
        fileId: null
      },
      likes: hit.follows || 0,
      license: hit.license || '',
      clientSide: hit.client_side,
      serverSide: hit.server_side,
      url: `https://modrinth.com/project/${hit.slug}`,
      // Store version IDs for later download URL fetching
      _versionIds: hit.versions || []
    };
  }

  /**
   * FIXED (Round 16): Extract tags from Modrinth categories and project metadata
   */
  extractTags(hit) {
    const tags = [];
    
    // Add categories as tags
    if (hit.categories && Array.isArray(hit.categories)) {
      tags.push(...hit.categories);
    }
    
    // Add display categories if available
    if (hit.display_categories && Array.isArray(hit.display_categories)) {
      for (const cat of hit.display_categories) {
        if (!tags.includes(cat)) {
          tags.push(cat);
        }
      }
    }
    
    // Add project type as tag
    if (hit.project_type && !tags.includes(hit.project_type)) {
      tags.push(hit.project_type);
    }
    
    // Add loaders as tags ( datapacks/resourcepacks often have loaders)
    if (hit.loaders && Array.isArray(hit.loaders)) {
      for (const loader of hit.loaders) {
        if (!tags.includes(loader)) {
          tags.push(loader);
        }
      }
    }
    
    return tags;
  }

  /**
   * CRITICAL FIX (Round 11): Fetch direct download URL for a project
   * This method can be called separately to get the actual download URL
   * Also filters out mod files (.jar, .mrpack) - only returns map files (.zip, .mcworld)
   */
  async fetchDirectDownloadUrl(projectId, versionId = null) {
    try {
      // If no version ID provided, fetch latest version first
      let targetVersionId = versionId;
      
      if (!targetVersionId) {
        const versionsUrl = `${this.baseUrl}/project/${projectId}/version`;
        
        // FIXED (Round 18): Use fetchWithRetry
        const versionsResponse = await this.fetchWithRetry(versionsUrl, {
          headers: {
            'User-Agent': this.getUserAgent(),
            'Accept': 'application/json'
          }
        }, 2);
        
        if (!versionsResponse.ok) {
          console.warn(`[Modrinth] Failed to fetch versions for ${projectId}: ${versionsResponse.status}`);
          return null;
        }
        
        const versions = await versionsResponse.json();
        if (!versions || versions.length === 0) {
          return null;
        }
        
        // CRITICAL FIX: Filter out mod files - only accept map files
        const validMapExtensions = /\.(zip|mcworld|rar|7z)$/i;
        const modExtensions = /\.(jar|mrpack|litemod)$/i;
        
        // Find first version with MAP files (not mod files)
        let versionWithMapFiles = null;
        let primaryFile = null;
        
        for (const version of versions) {
          if (!version.files || version.files.length === 0) continue;
          
          // Check if any file is a map file (not a mod)
          const mapFile = version.files.find(f => {
            const filename = (f.filename || '').toLowerCase();
            return validMapExtensions.test(filename) && !modExtensions.test(filename);
          });
          
          if (mapFile) {
            versionWithMapFiles = version;
            primaryFile = mapFile;
            break;
          }
        }
        
        // If no map files found, check if the primary file is a mod
        if (!versionWithMapFiles) {
          const firstVersion = versions.find(v => v.files && v.files.length > 0);
          if (firstVersion) {
            const firstFile = firstVersion.files.find(f => f.primary) || firstVersion.files[0];
            if (firstFile && modExtensions.test(firstFile.filename)) {
              console.log(`[Modrinth] FILTERED: ${firstFile.filename} is a mod file, not a map`);
              return { isMod: true, filename: firstFile.filename }; // Return marker that this is a mod
            }
          }
          return null;
        }
        
        targetVersionId = versionWithMapFiles.id;
      }
      
      // Now fetch the specific version to get download URL
      // FIXED (Round 11): Use correct endpoint format
      const versionUrl = `${this.baseUrl}/version/${targetVersionId}`;
      
      // FIXED (Round 18): Use fetchWithRetry
      const response = await this.fetchWithRetry(versionUrl, {
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      }, 2);
      
      if (!response.ok) {
        console.warn(`[Modrinth] Failed to fetch version ${targetVersionId}: ${response.status}`);
        return null;
      }
      
      const versionData = await response.json();
      
      if (!versionData.files || versionData.files.length === 0) {
        return null;
      }
      
      // Get primary file or first file
      const primaryFile = versionData.files.find(f => f.primary) || versionData.files[0];
      
      // CRITICAL FIX: Check if it's a mod file
      const modExtensions = /\.(jar|mrpack|litemod)$/i;
      if (modExtensions.test(primaryFile.filename)) {
        console.log(`[Modrinth] FILTERED: ${primaryFile.filename} is a mod file`);
        return { isMod: true, filename: primaryFile.filename };
      }
      
      return {
        downloadUrl: primaryFile.url,
        filename: primaryFile.filename,
        filesize: primaryFile.size,
        version: versionData.version_number,
        gameVersions: versionData.game_versions || []
      };
    } catch (error) {
      console.warn(`[Modrinth] Error fetching direct download: ${error.message}`);
      return null;
    }
  }

  async getLatestVersionInfo(projectId) {
    // CRITICAL FIX (Round 11): Use correct API endpoint format
    try {
      // First get versions list
      const versionsUrl = `${this.baseUrl}/project/${projectId}/version`;
      
      // FIXED (Round 18): Use fetchWithRetry
      const response = await this.fetchWithRetry(versionsUrl, {
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      }, 2);
      
      if (!response.ok) {
        return null;
      }
      
      const versions = await response.json();
      if (!versions || versions.length === 0) {
        return null;
      }
      
      // Get the first version ID
      const latestVersion = versions[0];
      const versionId = latestVersion.id;
      
      // CRITICAL FIX: Fetch the specific version for file details
      const versionDetailUrl = `${this.baseUrl}/version/${versionId}`;
      
      // FIXED (Round 18): Use fetchWithRetry
      const detailResponse = await this.fetchWithRetry(versionDetailUrl, {
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      }, 2);
      
      if (!detailResponse.ok) {
        return null;
      }
      
      const versionData = await detailResponse.json();
      const primaryFile = versionData.files?.find(f => f.primary) || versionData.files?.[0];
      
      if (!primaryFile) {
        return null;
      }
      
      return {
        downloadUrl: primaryFile.url,
        fileInfo: {
          id: versionData.id,
          filename: primaryFile.filename,
          filesize: primaryFile.size,
          version: versionData.version_number,
          gameVersions: versionData.game_versions
        }
      };
    } catch (error) {
      console.warn(`[Modrinth] Error fetching version info: ${error.message}`);
      return null;
    }
  }
  
  /**
   * FIXED (Round 58): Generate fallback search queries when results are low
   * Tries variations with removed words, synonyms, broader terms, and category matching
   */
  generateFallbackQueries(query) {
    const queries = [];
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 0);
    
    // Extended synonym mapping for Minecraft map categories
    const synonyms = {
      'castle': ['fortress', 'stronghold', 'palace', 'keep', 'medieval'],
      'fortress': ['stronghold', 'castle', 'palace', 'keep'],
      'stronghold': ['fortress', 'castle', 'medieval'],
      'house': ['mansion', 'building', 'home', 'cottage'],
      'mansion': ['house', 'palace', 'building'],
      'city': ['town', 'village', 'metropolis', 'urban'],
      'village': ['town', 'city', 'settlement'],
      'medieval': ['fantasy', 'kingdom', 'castle', 'historical'],
      'fantasy': ['medieval', 'magical', 'kingdom'],
      'futuristic': ['scifi', 'sci-fi', 'modern', 'future', 'space'],
      'sci-fi': ['futuristic', 'scifi', 'space', 'modern'],
      'underwater': ['ocean', 'water', 'sea', 'aquatic'],
      'ocean': ['underwater', 'water', 'sea'],
      'water': ['ocean', 'underwater', 'sea', 'aquatic'],
      'nether': ['hell', 'inferno', 'dark', 'demon'],
      'hell': ['nether', 'dark', 'inferno'],
      'survival': ['world', 'vanilla', 'adventure'],
      'vanilla': ['survival', 'world', 'pure'],
      'adventure': ['quest', 'explore', 'exploration', 'journey'],
      'quest': ['adventure', 'mission', 'challenge'],
      'puzzle': ['challenge', 'riddle', 'maze', 'logic'],
      'parkour': ['jump', 'climbing', 'freerun', 'climbing'],
      'pvp': ['combat', 'battle', 'fight', 'war'],
      'combat': ['pvp', 'battle', 'fight', 'war'],
      'horror': ['scary', 'spooky', 'dark', 'creepy', 'haunted'],
      'scary': ['horror', 'spooky', 'creepy', 'dark'],
      'prison': ['jail', 'escape', 'lockup'],
      'jungle': ['tropical', 'wild', 'forest'],
      'mountain': ['peak', 'highland', 'alpine'],
      'desert': ['sandy', 'wasteland', 'arid'],
      'dungeon': ['cave', 'underground', 'crypt'],
      'skyblock': ['sky', 'island', 'block'],
      'island': ['sky', 'terrain', 'land'],
      'snow': ['ice', 'winter', 'frozen'],
      'ice': ['snow', 'frozen', 'winter', 'cold']
    };
    
    // Priority 1: Try single-word main terms (highest probability)
    if (words.length > 1) {
      // Find the most likely "main" word (longest or most specific)
      const mainWords = words
        .filter(w => w.length > 3 && !['with', 'the', 'from', 'near', 'like'].includes(w))
        .sort((a, b) => b.length - a.length);
      
      for (const mainWord of mainWords.slice(0, 3)) {
        queries.push(mainWord);
      }
    }
    
    // Priority 2: Try removing filler words
    const filler = ['with', 'the', 'a', 'in', 'on', 'and', 'or', 'from', 'to', 'by', 'at', 'of'];
    const reduced = words.filter(w => !filler.includes(w));
    if (reduced.length > 0 && reduced.length !== words.length) {
      queries.push(reduced.join(' '));
    }
    
    // Priority 3: Try synonym replacements (most likely to help)
    const seen = new Set(queries);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (synonyms[word]) {
        // Try first 2 synonyms (most relevant)
        for (const synonym of synonyms[word].slice(0, 2)) {
          const synQuery = words.map((w, idx) => idx === i ? synonym : w).join(' ');
          if (!seen.has(synQuery)) {
            queries.push(synQuery);
            seen.add(synQuery);
          }
        }
      }
    }
    
    // Priority 4: Try adding generic suffixes for compound queries
    if (words.length === 1) {
      const suffixes = ['map', 'world', 'terrain'];
      for (const suffix of suffixes) {
        const query = `${words[0]} ${suffix}`;
        if (!seen.has(query)) {
          queries.push(query);
          seen.add(query);
        }
      }
    }
    
    // Priority 5: Try adding category prefixes
    const prefixes = ['minecraft', 'custom'];
    words.forEach(word => {
      if (word.length > 4) {
        for (const prefix of prefixes) {
          const query = `${prefix} ${word}`;
          if (!seen.has(query)) {
            queries.push(query);
            seen.add(query);
          }
        }
      }
    });
    
    console.log(`[Modrinth] Generated ${queries.length} fallback queries (prioritized)`);
    
    return queries.slice(0, 6); // Try up to 6 fallback queries (more aggressive)
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
    if (text.includes('dungeon')) return 'Dungeon';
    if (text.includes('quest')) return 'Quest';
    
    return 'World';
  }

  async checkHealth() {
    try {
      // Test API availability with a simple search
      const searchUrl = `${this.baseUrl}/search?query=castle&limit=1`;
      
      // FIXED (Round 18): Use fetchWithRetry
      const response = await this.fetchWithRetry(searchUrl, {
        headers: {
          'User-Agent': this.getUserAgent(),
          'Accept': 'application/json'
        }
      }, 2);
      
      let canSearch = false;
      if (response.ok) {
        const data = await response.json();
        canSearch = data.hits !== undefined;
      }
      
      return {
        ...this.getHealth(),
        accessible: response.ok && canSearch,
        statusCode: response.status,
        canSearch: canSearch,
        error: canSearch ? null : 'API not returning valid search results'
      };
    } catch (error) {
      return {
        ...this.getHealth(),
        accessible: false,
        error: error.message.includes('timeout') ? 'Health check timeout' : error.message
      };
    }
  }
}

module.exports = ModrinthScraper;
