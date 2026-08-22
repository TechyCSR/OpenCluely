'use strict';

const {
  formatCaptionText,
  computeInterviewCardSize,
  computeInterviewCardBounds,
  computeInterviewBarBounds,
  applyStreamingResize,
  resolveStreamingWidth,
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

const failed = cases.filter((ok) => !ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
