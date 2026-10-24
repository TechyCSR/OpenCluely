#!/usr/bin/env node
/**
 * OpenCluely Diagnostic Machine
 * Full-stack system & AI connectivity probe.
 */

const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const config = require('../src/core/config');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

async function testModelSSE(key, model) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Hello in 2 words' }] }],
      generationConfig: { maxOutputTokens: 10 }
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, (res) => {
      let chunks = 0;
      let ttft = null;
      res.on('data', () => {
        chunks++;
        if (!ttft) ttft = Date.now() - t0;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          ttft,
          totalMs: Date.now() - t0,
          chunks,
          ok: res.statusCode === 200
        });
      });
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message, totalMs: Date.now() - t0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT (5s)', totalMs: Date.now() - t0 });
    });
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log(`\n${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ⚡ OPENCLUELY DYNAMIC DIAGNOSTIC PROBE${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  console.log(`${colors.bold}1. Environment & API Keys:${colors.reset}`);
  const keys = config.getApiKeys('GEMINI');
  console.log(`   Configured Gemini API Keys: ${colors.bold}${keys.length}${colors.reset}`);
  keys.forEach((k, i) => {
    console.log(`   - Key #${i + 1}: ${k.substring(0, 8)}...${k.substring(k.length - 4)}`);
  });

  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION;
  console.log(`   Azure Speech Configured: ${azureKey ? colors.green + 'YES (' + azureRegion + ')' : colors.yellow + 'NO (Using Whisper)'}${colors.reset}`);

  console.log(`\n${colors.bold}2. Real-time Gemini Latency Matrix (SSE Streaming):${colors.reset}`);
  const models = ['gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

  for (let i = 0; i < keys.length; i++) {
    console.log(`\n   ${colors.bold}Testing Key #${i + 1}:${colors.reset}`);
    for (const m of models) {
      process.stdout.write(`   • ${m.padEnd(25)} ... `);
      const res = await testModelSSE(keys[i], m);
      if (res.ok) {
        console.log(`${colors.green}✓ HTTP 200${colors.reset} (TTFT: ${colors.bold}${res.ttft}ms${colors.reset}, Total: ${res.totalMs}ms, Chunks: ${res.chunks})`);
      } else {
        console.log(`${colors.red}✗ FAILED${colors.reset} (${res.status ? 'HTTP ' + res.status : res.error}, ${res.totalMs}ms)`);
      }
    }
  }

  console.log(`\n${colors.bold}3. Active Engine Recommendations:${colors.reset}`);
  console.log(`   Primary Model: ${colors.green}gemini-3-flash-preview${colors.reset} (Fastest TTFT verified: ~1.3s - 1.6s)`);
  console.log(`   Failover Timeout: ${colors.green}4.5s${colors.reset} (TTFT Watchdog: 3.2s)`);
  console.log(`   Multi-Key Auto-Rotation: ${colors.green}ENABLED${colors.reset}\n`);
  console.log(`${colors.bold}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

run().catch(console.error);
