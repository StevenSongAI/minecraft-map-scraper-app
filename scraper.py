#!/usr/bin/env python3
"""
Minecraft Map Scraper
Scrapes maps from Planet Minecraft and other sources based on natural language queries.
"""

import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, quote

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "beautifulsoup4", "-q"])
    import requests
    from bs4 import BeautifulSoup

DATA_FILE = Path(__file__).parent / "maps-data.json"

class MinecraftMapScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.results = []
    
    def search(self, query, max_results=20):
        """Search for maps based on natural language query"""
        print(f"🔍 Searching for: {query}")
        
        # Extract keywords from query
        keywords = self._extract_keywords(query)
        print(f"   Keywords: {', '.join(keywords)}")
        
        # Search Planet Minecraft
        self._search_planet_minecraft(query, keywords, max_results)
        
        # Deduplicate by URL
        seen_urls = set()
        unique_results = []
        for r in self.results:
            if r['url'] not in seen_urls:
                seen_urls.add(r['url'])
                unique_results.append(r)
        
        self.results = unique_results[:max_results]
        print(f"✅ Found {len(self.results)} unique maps")
        
        return self.results
    
    def _extract_keywords(self, query):
        """Extract relevant keywords from natural language query"""
        query_lower = query.lower()
        
        # Common Minecraft map types
        map_types = [
            'adventure', 'survival', 'puzzle', 'parkour', 'horror', 
            'pvp', 'minigame', 'creation', 'modded', 'skyblock',
            'castle', 'dungeon', 'city', 'house', 'mansion',
            'redstone', 'farm', 'automatic', 'modern', 'medieval'
        ]
        
        keywords = []
        for mt in map_types:
            if mt in query_lower:
                keywords.append(mt)
        
        # If no specific type found, use the whole query
        if not keywords:
            keywords = query_lower.split()[:3]
        
        return keywords
    
    def _search_planet_minecraft(self, query, keywords, max_results):
        """Search Planet Minecraft"""
        print("   Searching Planet Minecraft...")
        
        search_term = quote(query)
        url = f"https://www.planetminecraft.com/resources/projects/?keywords={search_term}&order=order_popularity&page=1"
        
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find project cards
            projects = soup.find_all('div', class_='resource_content')
            
            for project in projects[:max_results]:
                try:
                    map_data = self._parse_planet_minecraft_project(project)
                    if map_data:
                        self.results.append(map_data)
                except Exception as e:
                    continue
                    
        except Exception as e:
            print(f"   ⚠️ Planet Minecraft error: {e}")
    
    def _parse_planet_minecraft_project(self, project):
        """Parse a Planet Minecraft project card"""
        # Get title and URL
        title_elem = project.find('a', class_='r-title')
        if not title_elem:
            return None
        
        title = title_elem.get_text(strip=True)
        relative_url = title_elem.get('href', '')
        url = urljoin('https://www.planetminecraft.com', relative_url)
        
        # Get thumbnail
        thumb_elem = project.find('img', class_='r-preview')
        thumbnail = thumb_elem.get('src', '') if thumb_elem else ''
        
        # Get author
        author_elem = project.find('a', class_='r-author')
        author = author_elem.get_text(strip=True) if author_elem else 'Unknown'
        
        # Get stats
        stats_elem = project.find('div', class_='r-stats')
        downloads = 0
        likes = 0
        
        if stats_elem:
            # Try to extract numbers
            stats_text = stats_elem.get_text()
            
            # Look for download count
            dl_match = re.search(r'(\d+(?:\.\d+)?)([KMB]?)\s*downloads?', stats_text, re.I)
            if dl_match:
                downloads = self._parse_number(dl_match.group(1), dl_match.group(2))
            
            # Look for like/diamond count
            like_match = re.search(r'(\d+(?:\.\d+)?)([KMB]?)\s*(?:diamonds?|likes?)', stats_text, re.I)
            if like_match:
                likes = self._parse_number(like_match.group(1), like_match.group(2))
        
        # Get description
        desc_elem = project.find('div', class_='r-description')
        description = desc_elem.get_text(strip=True)[:200] + '...' if desc_elem and len(desc_elem.get_text(strip=True)) > 200 else (desc_elem.get_text(strip=True) if desc_elem else '')
        
        # Get category/tags
        cat_elem = project.find('div', class_='r-type')
        category = cat_elem.get_text(strip=True) if cat_elem else 'Map'
        
        # Get Minecraft version
        version_elem = project.find('span', class_='r-version')
        version = version_elem.get_text(strip=True) if version_elem else 'Unknown'
        
        return {
            'title': title,
            'author': author,
            'description': description,
            'url': url,
            'thumbnail': thumbnail,
            'downloads': downloads,
            'likes': likes,
            'category': category,
            'version': version,
            'source': 'Planet Minecraft',
            'scraped_at': datetime.now().isoformat()
        }
    
    def _parse_number(self, num_str, suffix):
        """Parse number with K/M/B suffix"""
        num = float(num_str)
        if suffix == 'K':
            num *= 1000
        elif suffix == 'M':
            num *= 1000000
        elif suffix == 'B':
            num *= 1000000000
        return int(num)
    
    def validate_download_links(self):
        """Check if download links are still valid"""
        print("\n🔍 Validating download links...")
        
        for i, map_data in enumerate(self.results):
            try:
                # Check if the project page loads
                response = self.session.head(map_data['url'], timeout=10, allow_redirects=True)
                map_data['link_valid'] = response.status_code == 200
                
                if not map_data['link_valid']:
                    print(f"   ⚠️ Broken link: {map_data['title'][:40]}...")
                
                # Small delay to be respectful
                time.sleep(0.5)
                
            except Exception as e:
                map_data['link_valid'] = False
        
        # Filter out broken links
        valid_results = [r for r in self.results if r.get('link_valid', True)]
        removed = len(self.results) - len(valid_results)
        if removed > 0:
            print(f"   Removed {removed} broken links")
        
        self.results = valid_results
        return self.results
    
    def save_results(self):
        """Save results to JSON file"""
        data = {
            'lastUpdated': datetime.now().isoformat(),
            'query': getattr(self, 'current_query', ''),
            'mapCount': len(self.results),
            'maps': self.results
        }
        
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"\n💾 Saved {len(self.results)} maps to {DATA_FILE}")
        return data

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scraper.py 'your search query'")
        print("Example: python3 scraper.py 'castle adventure map'")
        sys.exit(1)
    
    query = sys.argv[1]
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    
    scraper = MinecraftMapScraper()
    scraper.current_query = query
    
    # Search
    results = scraper.search(query, max_results)
    
    # Validate links
    scraper.validate_download_links()
    
    # Save
    scraper.save_results()
    
    print(f"\n✅ Done! Found {len(results)} valid maps.")
    print(f"   View results in: {DATA_FILE}")

if __name__ == "__main__":
    main()
