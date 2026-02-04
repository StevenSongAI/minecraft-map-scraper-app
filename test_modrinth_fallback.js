const ModrinthScraper = require('./scraper/scrapers/modrinth');

async function test() {
  const scraper = new ModrinthScraper();
  
  // Test queries that were returning < 5 results
  const testQueries = [
    'castle',
    'survival',
    'medieval'
  ];
  
  for (const query of testQueries) {
    console.log(`\n=== Testing: "${query}" ===`);
    try {
      const results = await scraper.search(query, { limit: 10 });
      console.log(`Results found: ${results.length}`);
      if (results.length > 0) {
        console.log('Sample results:');
        results.slice(0, 3).forEach(r => {
          console.log(`  - ${r.name || r.title}`);
        });
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

test().catch(console.error);
