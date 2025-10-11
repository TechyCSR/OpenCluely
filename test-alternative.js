const https = require('https');
require('dotenv').config();

async function testAlternativeMethod() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = 'gemini-2.5-flash';
  
  console.log('🧪 Testing alternative HTTPS method...');
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const requestBody = JSON.stringify({
    contents: [{
      parts: [{
        text: "Say 'Hello from OpenCluely alternative method!' in a friendly way."
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    }
  });
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    },
    timeout: 10000
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log(`📊 Status Code: ${res.statusCode}`);
          
          if (res.statusCode !== 200) {
            console.log(`❌ HTTP Error: ${data}`);
            resolve(false);
            return;
          }
          
          const response = JSON.parse(data);
          console.log('🔍 Response structure:');
          console.log('  Has candidates:', !!response.candidates);
          console.log('  Candidates length:', response.candidates?.length);
          
          if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            const text = response.candidates[0].content.parts[0].text;
            console.log('✅ Alternative method SUCCESS!');
            console.log(`📤 Response: ${text}`);
            resolve(true);
          } else {
            console.log('❌ Invalid response structure');
            console.log('🔍 Full response:', JSON.stringify(response, null, 2));
            resolve(false);
          }
        } catch (e) {
          console.log(`❌ Parse error: ${e.message}`);
          console.log(`📄 Raw data: ${data.substring(0, 200)}...`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ Request error: ${error.message}`);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('❌ Request timeout');
      req.destroy();
      resolve(false);
    });
    
    req.write(requestBody);
    req.end();
  });
}

testAlternativeMethod().then((success) => {
  console.log(`\n🎯 Test result: ${success ? 'PASS' : 'FAIL'}`);
  process.exit(success ? 0 : 1);
});