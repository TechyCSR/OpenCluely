'use strict';

const CARD_MIN_WIDTH = 560;
const CARD_MAX_WIDTH = 920;
const CARD_WIDTH_RATIO = 0.5;
const MIN_HEIGHT = 280;
const MAX_HEIGHT_RATIO = 0.78;
const BAR_HEIGHT = 32;
const BAR_MARGIN_Y = 6;
const BAR_SIDE_INSET = 40;
const CARD_GAP = 10;
const SIDE_MARGIN = 16;

function formatCaptionText(payload) {
  return String((payload && payload.text) || '').trim();
}

function computeInterviewBarBounds(workArea) {
  const x0 = workArea.x || 0;
  const y0 = workArea.y || 0;
  const areaW = workArea.width || 1280;
  return {
    x: Math.round(x0 + BAR_SIDE_INSET),
    y: Math.round(y0 + BAR_MARGIN_Y),
    width: Math.max(320, Math.round(areaW - BAR_SIDE_INSET * 2)),
    height: BAR_HEIGHT
  };
}

function computeInterviewCardSize(workArea, { contentHeight = MIN_HEIGHT } = {}) {
  const areaW = workArea.width || 1280;
  const areaH = workArea.height || 720;
  const maxHeight = Math.max(MIN_HEIGHT, Math.round(areaH * MAX_HEIGHT_RATIO));
  const width = Math.max(
    CARD_MIN_WIDTH,
    Math.min(CARD_MAX_WIDTH, Math.round(areaW * CARD_WIDTH_RATIO))
  );
  const height = Math.max(MIN_HEIGHT, Math.min(maxHeight, Math.round(contentHeight || MIN_HEIGHT)));
  return { width, height, maxHeight };
}

function computeInterviewCardBounds(workArea, dock, metrics) {
  const { width, height } = computeInterviewCardSize(workArea, metrics);
  const x0 = workArea.x || 0;
  const y0 = workArea.y || 0;
  const areaW = workArea.width || 1280;
  const belowBar = y0 + BAR_MARGIN_Y + BAR_HEIGHT + CARD_GAP;
  let x;
  if (dock === 'left') {
    x = x0 + SIDE_MARGIN;
  } else if (dock === 'top') {
    x = x0 + Math.round((areaW - width) / 2);
  } else {
    x = x0 + areaW - width - SIDE_MARGIN;
  }
  return {
    x: Math.round(x),
    y: Math.round(belowBar),
    width,
    height
  };
}

/**
 * Streaming resize: origin stays put. Height grows down.
 * Width may upgrade prose → code once; X never changes.
 */
function applyStreamingResize(locked, { width, height } = {}) {
  const nextWidth = Number(width);
  const nextHeight = Number(height);
  return {
    x: locked.x,
    y: locked.y,
    width: Number.isFinite(nextWidth) && nextWidth > 0 ? Math.round(nextWidth) : locked.width,
    height: Number.isFinite(nextHeight) && nextHeight > 0 ? Math.round(nextHeight) : locked.height
  };
}

function resolveStreamingWidth(workArea, lock) {
  const size = computeInterviewCardSize(workArea, { contentHeight: MIN_HEIGHT });
  if (lock && lock.width > 0) {
    return { width: lock.width, mode: 'card' };
  }
  return { width: size.width, mode: 'card' };
}

/**
 * Pick the next card height.
 * During a live stream, grow down to fit content and never shrink.
 * After the answer is frozen, keep the current height so talking / late
 * tokens / a queued next answer cannot keep expanding the window.
 */
function chooseInterviewCardHeight({
  needed = MIN_HEIGHT,
  current = 0,
  maxHeight,
  frozen = false,
  fit = false
} = {}) {
  const cap = Number.isFinite(Number(maxHeight)) && Number(maxHeight) > 0
    ? Number(maxHeight)
    : Math.max(MIN_HEIGHT, Math.round(Number(needed) || MIN_HEIGHT));
  const want = Math.max(MIN_HEIGHT, Math.min(cap, Math.round(Number(needed) || MIN_HEIGHT)));
  const now = Math.max(0, Math.round(Number(current) || 0));
  if (fit) {
    return want;
  }
  if (frozen && now >= MIN_HEIGHT) {
    return Math.min(now, cap);
  }
  return Math.max(now, want);
}

module.exports = {
  formatCaptionText,
  computeInterviewBarBounds,
  computeInterviewCardSize,
  computeInterviewCardBounds,
  applyStreamingResize,
  resolveStreamingWidth,
  chooseInterviewCardHeight,
  CARD_MIN_WIDTH,
  CARD_MAX_WIDTH,
  CARD_WIDTH_RATIO,
  MIN_HEIGHT,
  MAX_HEIGHT_RATIO,
  BAR_HEIGHT
};
