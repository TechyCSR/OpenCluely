'use strict';

/**
 * Focused regression matrix for routeIntent (Step 1).
 * Mocks resume.service so results do not depend on a local resume.json.
 *
 * Usage: node scripts/test-intent-router.js
 */

const path = require('path');

const resumeModulePath = require.resolve('../src/services/resume.service');
const routerModulePath = require.resolve('../src/services/intent-router');

function loadRouter(resumeSnippet) {
  delete require.cache[resumeModulePath];
  delete require.cache[routerModulePath];

  require.cache[resumeModulePath] = {
    id: resumeModulePath,
    filename: resumeModulePath,
    loaded: true,
    exports: {
      getRelevantSnippet() {
        return resumeSnippet || '';
      },
      getGroundingContext() {
        return {
          hasResume: Boolean(resumeSnippet),
          type: resumeSnippet ? 'TARGETED' : 'NONE',
          context: resumeSnippet || '',
          wordCount: resumeSnippet ? resumeSnippet.split(/\s+/).length : 0
        };
      }
    }
  };

  return require(routerModulePath);
}

const cases = [
  {
    name: 'merge sort → code',
    text: 'merge sort',
    resume: '',
    activeSkill: 'dsa',
    expected: 'code'
  },
  {
    name: 'binary search → code',
    text: 'binary search',
    resume: '',
    activeSkill: 'dsa',
    expected: 'code'
  },
  {
    name: 'implement trie → code',
    text: 'implement trie',
    resume: '',
    activeSkill: 'dsa',
    expected: 'code'
  },
  {
    name: 'find two numbers in an array → code',
    text: 'find two numbers in an array',
    resume: '',
    activeSkill: 'dsa',
    expected: 'code'
  },
  {
    name: 'inventory service with resume → general',
    text: 'inventory service',
    resume: 'Built an Inventory service for order fulfillment at Acme.',
    activeSkill: 'dsa',
    expected: 'general',
    expectedReason: 'resume entity match'
  },
  {
    name: 'inventory service without resume → general',
    text: 'inventory service',
    resume: '',
    activeSkill: 'dsa',
    expected: 'general'
  },
  {
    name: 'explain distributed caching → explain',
    text: 'explain distributed caching',
    resume: '',
    activeSkill: 'dsa',
    expected: 'explain'
  },
  {
    name: 'my Kafka project → general',
    text: 'my Kafka project',
    resume: '',
    activeSkill: 'dsa',
    expected: 'general'
  },
  {
    name: 'graph → general unless explicit coding intent exists',
    text: 'graph',
    resume: '',
    activeSkill: 'dsa',
    expected: 'general'
  }
];

let failed = 0;

for (const testCase of cases) {
  const { routeIntent } = loadRouter(testCase.resume);
  const result = routeIntent(testCase.text, testCase.activeSkill);
  const modeOk = result.mode === testCase.expected;
  const reasonOk = !testCase.expectedReason || result.reason === testCase.expectedReason;
  const ok = modeOk && reasonOk;

  if (!ok) failed += 1;

  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${testCase.name}`);
  console.log(`      text=${JSON.stringify(testCase.text)} skill=${testCase.activeSkill} resume=${testCase.resume ? 'yes' : 'no'}`);
  console.log(`      expected=${testCase.expected}${testCase.expectedReason ? ` (${testCase.expectedReason})` : ''}`);
  console.log(`      actual=${result.mode} (${result.reason})`);
}

console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}

console.log(`All ${cases.length} cases passed`);
