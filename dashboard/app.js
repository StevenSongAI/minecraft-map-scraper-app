/**
 * Minecraft Map Scraper Dashboard
 * Chat-style interface for searching Minecraft maps via CurseForge API
 */

// Configuration - Use relative URL for same-origin deployments
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : '';  // Empty string = use same origin (works on Railway, Netlify, etc.)
const POLL_INTERVAL = 5000; // Check for updates every 5 seconds
const MAX_RESULTS = 20;

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const connectionStatus = document.getElementById('connection-status');
const resultsCount = document.getElementById('results-count');

// State
let isSearching = false;
let lastSearchQuery = null;
let lastSearchResults = null;
let pollTimer = null;

// Initialize
function init() {
    // Check server connection
    checkConnection();
    setInterval(checkConnection, 10000);

    // Event listeners
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    // Event delegation for download buttons
    chatContainer.addEventListener('click', handleDownloadClick);

    // Auto-focus input
    searchInput.focus();

    console.log('[Dashboard] Initialized');
}

// Handle download button clicks
function handleDownloadClick(e) {
    const downloadBtn = e.target.closest('.download-btn');
    if (!downloadBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const url = downloadBtn.dataset.downloadUrl;
    const filename = downloadBtn.dataset.filename || 'download.zip';

    if (!url) {
        console.error('[Dashboard] No download URL found');
        return;
    }

    // Show loading state
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = 'Downloading...';
    downloadBtn.classList.add('loading');

    // Fetch and download using blob approach
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            // Create object URL and trigger download
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);
            }, 100);

            console.log('[Dashboard] Download triggered:', filename);
        })
        .catch(error => {
            console.error('[Dashboard] Download failed:', error);
            // Fallback: navigate to URL directly
            window.location.href = url;
        })
        .finally(() => {
            // Reset button state
            downloadBtn.textContent = originalText;
            downloadBtn.classList.remove('loading');
        });
}

// Check server connection
async function checkConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'ok') {
                // Show demo mode indicator if using mock data
                if (data.api && !data.api.valid) {
                    setConnectionStatus('demo');
                } else {
                    setConnectionStatus('connected');
                }
            } else {
                setConnectionStatus('disconnected');
            }
        } else {
            setConnectionStatus('disconnected');
        }
    } catch (error) {
        setConnectionStatus('disconnected');
    }
}

// Update connection status indicator
function setConnectionStatus(status) {
    connectionStatus.className = `status ${status}`;
    if (status === 'connected') {
        connectionStatus.title = 'Connected to server (Live API)';
    } else if (status === 'demo') {
        connectionStatus.title = 'Demo mode - Using sample data. Add CURSEFORGE_API_KEY for real results';
    } else {
        connectionStatus.title = 'Server not running. Start it with: npm start';
    }
}

// Set loading state on UI
function setLoadingState(loading) {
    isSearching = loading;
    searchBtn.disabled = loading;
    searchInput.disabled = loading;
    if (loading) {
        searchBtn.classList.add('loading');
        searchInput.placeholder = 'Searching...';
    } else {
        searchBtn.classList.remove('loading');
        searchInput.placeholder = 'Search for Minecraft maps...';
    }
}

// Handle search
async function handleSearch() {
    const query = searchInput.value.trim();
    
    if (!query || isSearching) {
        return;
    }
    
    lastSearchQuery = query;
    
    // Set loading state
    setLoadingState(true);
    
    // Clear input
    searchInput.value = '';
    
    // Add user message to chat
    addUserMessage(query);
    
    // Add searching indicator
    const searchingId = addSearchingMessage();
    
    try {
        // Perform search
        const results = await searchMaps(query);
        
        // Remove searching indicator
        removeMessage(searchingId);
        
        // Display results
        if (results && results.length > 0) {
            lastSearchResults = results;
            addResultsMessage(results);
            startPolling(query);
        } else {
            addBotMessage('No maps found for "' + query + '". Try a different search term.');
            stopPolling();
        }
        
    } catch (error) {
        // Remove searching indicator
        removeMessage(searchingId);
        
        // Show error
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            addErrorMessage('Cannot connect to server. Please make sure the server is running.');
        } else {
            addErrorMessage('Error: ' + error.message);
        }
        stopPolling();
    }
    
    // Reset loading state
    setLoadingState(false);
    searchInput.focus();
}

// Search maps via API
async function searchMaps(query) {
    const url = `${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.results || [];
}

// Add user message to chat
function addUserMessage(text) {
    const messageId = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'message user';
    messageEl.innerHTML = `
        <div class="user-avatar">U</div>
        <div class="message-bubble">${escapeHtml(text)}</div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
    return messageId;
}

// Add bot message to chat
function addBotMessage(text) {
    const messageId = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'message bot';
    messageEl.innerHTML = `
        <div class="bot-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
                <rect x="7" y="7" width="3" height="3"/>
                <rect x="14" y="7" width="3" height="3"/>
                <rect x="7" y="14" width="3" height="3"/>
                <rect x="14" y="14" width="3" height="3"/>
            </svg>
        </div>
        <div class="message-bubble">${escapeHtml(text)}</div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
    return messageId;
}

// Add searching indicator
function addSearchingMessage() {
    const messageId = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'message bot';
    messageEl.innerHTML = `
        <div class="bot-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
                <rect x="7" y="7" width="3" height="3"/>
                <rect x="14" y="7" width="3" height="3"/>
                <rect x="7" y="14" width="3" height="3"/>
                <rect x="14" y="14" width="3" height="3"/>
            </svg>
        </div>
        <div class="message-bubble">
            <div class="searching-indicator">
                <span>Searching</span>
                <div class="dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        </div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
    return messageId;
}

// Add error message
function addErrorMessage(text) {
    const messageId = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'message bot';
    messageEl.innerHTML = `
        <div class="bot-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
                <rect x="7" y="7" width="3" height="3"/>
                <rect x="14" y="7" width="3" height="3"/>
                <rect x="7" y="14" width="3" height="3"/>
                <rect x="14" y="14" width="3" height="3"/>
            </svg>
        </div>
        <div class="message-bubble error-message">${escapeHtml(text)}</div>
    `;
    chatContainer.appendChild(messageEl);
    scrollToBottom();
    return messageId;
}

// Add results message with map cards
function addResultsMessage(results) {
    const messageId = 'msg-' + Date.now();
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'message bot';
    
    // Update results count
    resultsCount.textContent = `${results.length} map${results.length !== 1 ? 's' : ''} found`;
    
    // Build results HTML
    const resultsHtml = `
        <div class="message-bubble" style="max-width: 100%; background: transparent; padding: 0;">
            <div class="results-container">
                ${results.map(map => renderMapCard(map)).join('')}
            </div>
        </div>
    `;
    
    messageEl.innerHTML = `
        <div class="bot-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
                <rect x="7" y="7" width="3" height="3"/>
                <rect x="14" y="7" width="3" height="3"/>
                <rect x="7" y="14" width="3" height="3"/>
                <rect x="14" y="14" width="3" height="3"/>
            </svg>
        </div>
        ${resultsHtml}
    `;
    
    chatContainer.appendChild(messageEl);
    scrollToBottom();
    return messageId;
}

// Render a single map card
function renderMapCard(map) {
    const thumbnail = map.thumbnail 
        ? `<img src="${escapeHtml(map.thumbnail)}" alt="${escapeHtml(map.name)}" class="map-thumbnail" loading="lazy">`
        : `<div class="map-thumbnail-placeholder">🗺️</div>`;
    
    const authorName = map.author?.name || 'Unknown';
    const authorUrl = map.author?.url || '#';
    const downloads = formatNumber(map.downloadCount || 0);
    const description = map.summary || map.description || 'No description available.';
    
    // Limit description length
    const shortDesc = description.length > 150 
        ? description.substring(0, 150) + '...' 
        : description;
    
    // Get up to 3 versions
    const versions = (map.gameVersions || []).slice(0, 3);
    const versionsHtml = versions.length > 0 
        ? `<div class="map-versions">${versions.map(v => `<span class="version-tag">${escapeHtml(v)}</span>`).join('')}</div>`
        : '';
    
    // Download URL - use proxy for direct downloads, fallback to CurseForge page
    const viewUrl = `https://www.curseforge.com/minecraft/worlds/${map.slug}`;
    
    // Build download URL - use proxy if it's a direct file URL, otherwise use CurseForge page
    let downloadUrl;
    if (map.downloadUrl && (map.downloadUrl.includes('media.forgecdn.net') || map.downloadUrl.includes('.zip') || map.downloadUrl.includes('.jar'))) {
      // Use proxy for direct file downloads
      downloadUrl = `${API_BASE_URL}/api/download?url=${encodeURIComponent(map.downloadUrl)}&filename=${encodeURIComponent(map.name + '.zip')}`;
    } else {
      // Fallback to CurseForge page
      downloadUrl = viewUrl;
    }
    
    return `
        <div class="map-card" data-map-id="${map.id}">
            ${thumbnail}
            <div class="map-info">
                <h3 class="map-title">${escapeHtml(map.name)}</h3>
                <div class="map-author">
                    by <a href="${escapeHtml(authorUrl)}" target="_blank" rel="noopener">${escapeHtml(authorName)}</a>
                </div>
                <p class="map-description">${escapeHtml(shortDesc)}</p>
                <div class="map-meta">
                    <div class="map-downloads">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        ${downloads}
                    </div>
                </div>
                ${versionsHtml}
                <div class="map-actions">
                    <a href="${escapeHtml(downloadUrl)}" download="${escapeHtml(map.name + '.zip')}" class="btn btn-primary download-btn" data-download-url="${escapeHtml(downloadUrl)}" data-filename="${escapeHtml(map.name + '.zip')}">Download</a>
                    <a href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">View</a>
                </div>
            </div>
        </div>
    `;
}

// Remove a message by ID
function removeMessage(messageId) {
    const el = document.getElementById(messageId);
    if (el) {
        el.remove();
    }
}

// Scroll to bottom of chat
function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Start polling for new results
function startPolling(query) {
    stopPolling();
    pollTimer = setInterval(async () => {
        try {
            const results = await searchMaps(query);
            if (results && results.length > 0) {
                // Check if results changed
                if (JSON.stringify(results) !== JSON.stringify(lastSearchResults)) {
                    lastSearchResults = results;
                    addBotMessage('Updated results found!');
                    addResultsMessage(results);
                }
            }
        } catch (error) {
            console.log('[Dashboard] Polling error:', error.message);
        }
    }, POLL_INTERVAL);
}

// Stop polling
function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// Utility: Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Format number
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
