'use strict';

/**
 * Voice Reliability 1.0 — transcript must never lose committed words,
 * and Space must submit exactly the visible caption.
 */
const { StablePrefixStabilizer } = require('../src/services/rolling-caption');
const { InterviewSession } = require('../src/services/interview-session');
const { replayWindowTexts } = require('../src/services/asr-replay');

const cases = [];
function check(name, ok, detail) {
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

function committedNeverShrinks(events) {
  let max = 0;
  for (const event of events) {
    if (event.tick === 'submit') continue;
    const n = event.committedWords || 0;
    if (n < max) return false;
    max = Math.max(max, n);
  }
  return true;
}

function includesPhrase(text, phrase) {
  const norm = (value) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const hay = ` ${norm(text)} `;
  const needles = norm(phrase).split(' ').filter(Boolean);
  return needles.every((word) => hay.includes(` ${word} `));
}

function runCase(name, windows, requiredPhrase) {
  const result = replayWindowTexts(windows);
  check(`${name}: submitted matches caption`, result.submittedMatchesCaption === true, result.submitted);
  check(`${name}: committed never shrinks`, committedNeverShrinks(result.events));
  check(`${name}: caption always equals pipeline text`, result.events.every((event) => event.captionMatchesPipeline !== false));
  if (requiredPhrase) {
    check(`${name}: submitted keeps the phrase`, includesPhrase(result.submitted, requiredPhrase), result.submitted);
  }
  return result;
}

// 1. Short intro that often fits in one 800ms window, then slides off.
runCase(
  'Tell me about yourself',
  [
    'tell me about yourself',
    'about yourself',
    'yourself'
  ],
  'tell me about yourself'
);

// 2. Technical explanation with a sliding window.
runCase(
  'Explain Kafka inventory synchronization',
  [
    'explain kafka',
    'explain kafka inventory',
    'kafka inventory synchronization',
    'inventory synchronization',
    'synchronization'
  ],
  'explain kafka inventory synchronization'
);

// 3. ~10s behavioral answer as overlapping 800ms-style windows.
runCase(
  '10-second behavioral answer',
  [
    'in my last role i led',
    'last role i led a migration',
    'i led a migration of the inventory',
    'a migration of the inventory service',
    'of the inventory service to kafka',
    'inventory service to kafka so that',
    'to kafka so that orders stayed',
    'so that orders stayed consistent',
    'orders stayed consistent across regions',
    'stayed consistent across regions even',
    'consistent across regions even during peaks',
    'across regions even during peaks'
  ],
  'inventory service to kafka'
);

// 4. Fast speech — bigger jumps per window.
runCase(
  'Fast speech',
  [
    'tell me about',
    'about kafka inventory synchronization in my last project'
  ],
  'tell me about kafka inventory synchronization'
);

// 5. Short pause mid-sentence (empty / unrelated decode) then continue.
runCase(
  'Short pause mid-sentence',
  [
    'tell me about',
    'tell me about kafka',
    '',
    'thank you',
    'about kafka inventory',
    'kafka inventory synchronization'
  ],
  'tell me about kafka'
);

const lostPrefix = replayWindowTexts([
  'tell me about yourself',
  'yourself'
]);
check(
  'first-window phrase is not discarded when the ring slides',
  includesPhrase(lostPrefix.submitted, 'tell me about yourself'),
  lostPrefix.submitted
);

const session = new InterviewSession();
session.enable();
session.setRollingParts('tell me about yourself', '');
session.setRollingParts('yourself', 'extra');
check(
  'session refuses committed rollback',
  session.committed === 'tell me about yourself',
  session.committed
);
const submitted = session.beginSubmit();
check(
  'Space submits committed + current tail',
  submitted === 'tell me about yourself extra',
  submitted
);

const stab = new StablePrefixStabilizer();
stab.update('tell me about yourself');
stab.update('yourself');
check('stabilizer rollbackCount is recorded', typeof stab.snapshot().rollbackCount === 'number');
check(
  'stabilizer keeps the prefix after a short window',
  includesPhrase(stab.snapshot().text, 'tell me about yourself'),
  stab.snapshot().text
);

const failed = cases.filter((ok) => !ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
process.exit(0);
