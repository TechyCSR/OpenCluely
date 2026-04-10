require('dotenv').config();

const speechService = require('../src/services/speech.service');

async function main() {
  const status = speechService.getStatus();

  console.log('Speech provider:', status.provider);
  console.log('Initialized:', status.isInitialized);
  console.log('Available:', speechService.isAvailable());
  console.log('Effective settings:', JSON.stringify(status.effectiveSettings, null, 2));

  try {
    const connection = await speechService.testConnection();
    console.log('Connection test:', JSON.stringify(connection, null, 2));
  } catch (error) {
    console.error('Connection test failed:', error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
