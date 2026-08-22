'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const userDataEnv = path.join(process.env.APPDATA || '', 'opencluely', '.env');
const projectEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(userDataEnv)) {
  require('dotenv').config({ path: userDataEnv });
} else if (fs.existsSync(projectEnv)) {
  require('dotenv').config({ path: projectEnv });
}

const speechService = require('../src/services/speech.service');

const cases = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

const sanitize = speechService.sanitizeWhisperLanguage;
check('sanitize tiny → auto', sanitize('tiny'), 'auto');
check('sanitize small → auto', sanitize('small'), 'auto');
check('sanitize auto stays auto', sanitize('auto'), 'auto');
check('sanitize en stays en', sanitize('en'), 'en');
check('getter rejects model-as-language', speechService._getWhisperLanguage(), 'auto');

const worker = speechService.whisperWorker;
const status = speechService.getStatus();
console.log('');
console.log('provider:', status.provider);
console.log('whisperModel:', status.effectiveSettings.whisperModel);
console.log('whisperLanguage:', status.effectiveSettings.whisperLanguage);
console.log('worker.configured:', worker.isConfigured());
console.log('worker.pythonPath:', worker.pythonPath);
console.log('whisperCommand:', status.effectiveSettings.whisperCommand);

if (!worker.isConfigured()) {
  console.log('FAIL  persistent worker did not configure');
  process.exit(1);
}
if (status.effectiveSettings.whisperLanguage === 'tiny') {
  console.log('FAIL  language is still tiny');
  process.exit(1);
}
if (cases.some((ok) => !ok)) {
  process.exit(1);
}
console.log('');
console.log('Whisper config checks passed');
