// Test Modrinth via curl since fetch might not be available
const { exec } = require('child_process');

function testCommand(name, cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        console.log(`✗ ${name}: ${error.message}`);
        resolve(false);
      } else if (stdout.includes('cloudflare') || stdout.length < 100) {
        console.log(`✗ ${name}: Blocked or invalid response`);
        resolve(false);
      } else {
        console.log(`✓ ${name}: Accessible`);
        resolve(true);
      }
    });
  });
}

async function runTests() {
  console.log('Testing available map sources...\n');
  
  const tests = {
    'Modrinth API': `curl -s 'https://api.modrinth.com/v2/search?query=castle&limit=5' | head -20`,
    'Planet Minecraft': `curl -s -H 'User-Agent: Mozilla/5.0' 'https://www.planetminecraft.com/search/?type=projects&query=castle' | head -100`,
    'MC-Maps': `curl -s -H 'User-Agent: Mozilla/5.0' 'https://mc-maps.com/?s=castle' | head -100`,
    'MinecraftMaps': `curl -s -H 'User-Agent: Mozilla/5.0' 'https://www.minecraftmaps.com/?s=castle' | head -100`
  };
  
  for (const [name, cmd] of Object.entries(tests)) {
    await testCommand(name, cmd);
  }
}

runTests().catch(console.error);
