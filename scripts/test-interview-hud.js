'use strict';

const {
  formatCaptionText,
  computeInterviewCardSize,
  computeInterviewCardBounds,
  computeInterviewBarBounds,
  applyStreamingResize,
  resolveStreamingWidth,
  chooseInterviewCardHeight,
  CARD_MIN_WIDTH,
  CARD_MAX_WIDTH,
  CARD_WIDTH_RATIO,
  MIN_HEIGHT,
  MAX_HEIGHT_RATIO
} = require('../src/ui/interview-hud');

const cases = [];
function check(name, ok, detail) {
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const area = { x: 0, y: 0, width: 1600, height: 1000 };
const expectedWidth = Math.max(
  CARD_MIN_WIDTH,
  Math.min(CARD_MAX_WIDTH, Math.round(area.width * CARD_WIDTH_RATIO))
);

check(
  'caption has no quotes',
  formatCaptionText({ text: 'Tell me about Kafka' }) === 'Tell me about Kafka'
);
check('empty caption is blank', formatCaptionText({ text: '  ' }) === '');

const textSize = computeInterviewCardSize(area, { hasCode: false, contentHeight: 320 });
const codeSize = computeInterviewCardSize(area, { hasCode: true, contentHeight: 320 });
check('one big box width for text', textSize.width === expectedWidth, `w=${textSize.width}`);
check('code uses the same box width', codeSize.width === textSize.width, `w=${codeSize.width}`);
check('height grows with content', textSize.height === 320);
check('box is wider than the old 340 strip', textSize.width > 340);

const tall = computeInterviewCardSize(area, { hasCode: false, contentHeight: 900 });
const cap = Math.round(area.height * MAX_HEIGHT_RATIO);
check('height never exceeds the screen cap', tall.height === cap && tall.height <= area.height * MAX_HEIGHT_RATIO, `h=${tall.height}`);
check('minimum height is a real reading box', computeInterviewCardSize(area, { contentHeight: 10 }).height === MIN_HEIGHT);

const left = computeInterviewCardBounds(area, 'left', { contentHeight: 320 });
const right = computeInterviewCardBounds(area, 'right', { contentHeight: 320 });
const top = computeInterviewCardBounds(area, 'top', { contentHeight: 320 });
check('left dock is on the left half', left.x < area.width / 2);
check('right dock pins to the right edge', right.x + right.width >= area.width - 20);
check('top dock is centered', Math.abs(top.x - (area.width - top.width) / 2) <= 1);
check('card sits below the caption strip', left.y > computeInterviewBarBounds(area).y);

for (const [name, origin] of [['left', left], ['right', right], ['top', top]]) {
  const grown = applyStreamingResize(origin, { width: origin.width, height: origin.height + 80 });
  check(`${name} dock keeps X/Y while height grows`, grown.x === origin.x && grown.y === origin.y && grown.height === origin.height + 80);
  const wider = applyStreamingResize(origin, { width: origin.width + 200, height: origin.height + 80 });
  check(`${name} dock never shifts sideways when width upgrades`, wider.x === origin.x && wider.y === origin.y);
}

const lock = { x: right.x, y: right.y, width: expectedWidth, widthMode: 'card' };
const upgraded = resolveStreamingWidth(area, lock, true);
const stillSame = resolveStreamingWidth(area, { ...lock, width: upgraded.width }, true);
check('streaming keeps one box width', upgraded.mode === 'card' && upgraded.width === expectedWidth);
check('width stays locked to that box', stillSame.width === upgraded.width);

const maxH = Math.round(area.height * MAX_HEIGHT_RATIO);
check(
  'stream grows down to fit content',
  chooseInterviewCardHeight({ needed: 420, current: 280, maxHeight: maxH, frozen: false }) === 420
);
check(
  'stream does not shrink mid-answer',
  chooseInterviewCardHeight({ needed: 300, current: 420, maxHeight: maxH, frozen: false }) === 420
);
check(
  'finished answer stays put even if a later measure is huge',
  chooseInterviewCardHeight({ needed: 900, current: 420, maxHeight: maxH, frozen: true }) === 420
);
check(
  'finished answer ignores the old window-plus-padding ratchet',
  chooseInterviewCardHeight({ needed: 444, current: 420, maxHeight: maxH, frozen: true }) === 420
);
check(
  'history page can refit to that answer',
  chooseInterviewCardHeight({ needed: 360, current: 700, maxHeight: maxH, frozen: false, fit: true }) === 360
);

const fs = require('fs');
const path = require('path');
const overlay = fs.readFileSync(path.join(__dirname, '..', 'llm-response.html'), 'utf8');
check(
  'interview overlay hides the two-panel split',
  overlay.includes('#split-layout')
    && overlay.includes('display: none !important')
);
check(
  'coding answers always render in one stacked box',
  overlay.includes('displayFullLayout(response)')
    && !overlay.includes('if (hasCode && !useSingleColumn())')
);
check(
  'interview overlay keeps a single card chrome',
  overlay.includes('body.interview-card .full-content-inner')
    && !/body\.interview-card \.full-content-inner,\s*body\.interview-card \.text-panel,\s*body\.interview-card \.code-panel/.test(overlay)
);
check(
  'caption updates do not wipe previous answers',
  overlay.includes('applyInterviewHudPayload(ipcData(arguments), { clearHistory: false })')
);
check(
  'previous answers stay available while a new one streams',
  overlay.includes('if (!viewingHistory) historyIndex = turnHistory.length - 1')
);
check(
  'Alt arrows navigate answer history even when click-through is on',
  overlay.includes("e.key === 'ArrowLeft'") && overlay.includes('navigateHistory(-1)')
);
check(
  'answer card measures markdown content, not the 100vh window',
  overlay.includes('function measureAnswerCardHeight')
    && overlay.includes('markdown.scrollHeight')
    && !overlay.includes('root.scrollHeight')
);
check(
  'talking after Space cannot keep expanding a finished answer',
  overlay.includes('answerCardFrozen')
    && overlay.includes('if (viewingHistory || answerCardFrozen) return')
);

const codingPrompt = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'coding.md'), 'utf8');
check(
  'coding prompt is summary then code then a short close',
  /Opening summary/i.test(codingPrompt)
    && /one complete implementation/i.test(codingPrompt)
    && /Closing \(1–2 short lines\)/i.test(codingPrompt)
    && /Never put the explanation beside the code/i.test(codingPrompt)
);

const failed = cases.filter((ok) => !ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
