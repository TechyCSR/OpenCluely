'use strict';

const BYTES_PER_MS = 32;
const RING_MS = 800;
const DECODE_MS = 800;
const MIN_DECODE_MS = 150;
const INTERVAL_MS = 100;
const OVERLAP_MS = RING_MS - INTERVAL_MS;
const UTTERANCE_MS = 15000;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function joinWords(words) {
  return words.join(' ');
}

function isPrefix(prefix, words) {
  if (prefix.length > words.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i] !== words[i]) return false;
  }
  return true;
}

function commonPrefixLength(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/** Longest suffix of `prev` that equals a prefix of `curr`. */
function suffixPrefixOverlap(prev, curr) {
  const max = Math.min(prev.length, curr.length);
  for (let n = max; n >= 1; n -= 1) {
    let ok = true;
    for (let i = 0; i < n; i += 1) {
      if (prev[prev.length - n + i] !== curr[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return n;
  }
  return 0;
}

class PcmRingBuffer {
  constructor(maxMs = RING_MS) {
    this.maxMs = maxMs;
    this.maxBytes = Math.round(maxMs * BYTES_PER_MS);
    this.chunks = [];
    this.bytes = 0;
  }

  get durationMs() {
    return this.bytes / BYTES_PER_MS;
  }

  push(buffer) {
    if (!buffer || !buffer.length) return;
    const chunk = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes > this.maxBytes && this.chunks.length) {
      const extra = this.bytes - this.maxBytes;
      const first = this.chunks[0];
      if (first.length <= extra) {
        this.chunks.shift();
        this.bytes -= first.length;
      } else {
        this.chunks[0] = first.subarray(extra);
        this.bytes -= extra;
      }
    }
  }

  snapshotMs(ms) {
    const need = Math.max(0, Math.round(ms * BYTES_PER_MS));
    if (!need || !this.bytes) return Buffer.alloc(0);
    const take = Math.min(need, this.bytes);
    const out = Buffer.allocUnsafe(take);
    let offset = take;
    for (let i = this.chunks.length - 1; i >= 0 && offset > 0; i -= 1) {
      const chunk = this.chunks[i];
      const n = Math.min(chunk.length, offset);
      chunk.copy(out, offset - n, chunk.length - n);
      offset -= n;
    }
    return out;
  }

  reset() {
    this.chunks = [];
    this.bytes = 0;
  }
}

/**
 * Overlapping-window stabilizer.
 *
 * Consecutive 600–800 ms decodes only agree on a prefix. Words that have
 * already been confirmed and then slide out of the ring stay locked (white).
 * The changing tail of the current window stays interim (gray).
 */
class StablePrefixStabilizer {
  constructor() {
    this.reset();
  }

  reset() {
    this.locked = [];
    this.prevWords = [];
    this.committed = [];
    this.interim = [];
    this.lastRaw = '';
    this.updates = 0;
    this.flickers = 0;
    this.rollbackCount = 0;
  }

  _stableWords() {
    return this.locked.concat(this.committed);
  }

  _freezeScrolled(scrolled) {
    if (!scrolled.length) return;
    let matched = 0;
    while (
      matched < scrolled.length
      && matched < this.committed.length
      && this.committed[matched] === scrolled[matched]
    ) {
      matched += 1;
    }
    if (matched > 0) {
      this.locked.push(...this.committed.slice(0, matched));
      this.committed = this.committed.slice(matched);
    }
    const rest = scrolled.slice(matched);
    if (rest.length) {
      // Words that only lived in the gray tail still leave the ring.
      // Freeze them so "tell me about yourself" cannot lose its prefix.
      this.locked.push(...rest);
    }
  }

  update(rawText) {
    const curr = tokenize(rawText);
    if (!curr.length) {
      return this.snapshot();
    }
    this.updates += 1;
    this.lastRaw = String(rawText || '').trim();

    const prev = this.prevWords;
    const stableBefore = this._stableWords();

    if (!prev.length) {
      this.interim = curr.slice();
      this.prevWords = curr;
      return this.snapshot();
    }

    // Shorter decode of the same window start — keep the longer committed text.
    if (curr.length < prev.length && isPrefix(curr, prev)) {
      return this.snapshot();
    }

    let alignedPrev = prev;
    if (!isPrefix(prev, curr)) {
      const overlap = suffixPrefixOverlap(prev, curr);
      if (overlap > 0) {
        const scrolledCount = prev.length - overlap;
        if (scrolledCount > 0) {
          this._freezeScrolled(prev.slice(0, scrolledCount));
        }
        alignedPrev = prev.slice(scrolledCount);
      } else {
        this.flickers += 1;
        const stable = this._stableWords();
        if (!stable.length) {
          // Nothing is white yet — gray tail may be replaced by a better decode.
          this.interim = curr.slice();
          this.prevWords = curr;
          return this.snapshot();
        }
        if (isPrefix(stable, curr)) {
          this.interim = curr.slice(stable.length);
          this.prevWords = curr;
          return this.snapshot();
        }
        this.rollbackCount += 1;
        return this.snapshot();
      }
    }

    const common = commonPrefixLength(alignedPrev, curr);
    const candidate = curr.slice(0, common);
    if (isPrefix(this.committed, candidate) && candidate.length > this.committed.length) {
      this.committed = candidate.slice();
    } else if (!isPrefix(this.committed, curr) && !isPrefix(this.committed, candidate)) {
      this.rollbackCount += 1;
      return this.snapshot();
    }

    this.interim = isPrefix(this.committed, curr)
      ? curr.slice(this.committed.length)
      : [];
    this.prevWords = curr;

    const stableAfter = this._stableWords();
    if (stableBefore.length && !isPrefix(stableBefore, stableAfter)) {
      this.locked = stableBefore.slice();
      this.committed = [];
      this.interim = isPrefix(this.locked, curr) ? curr.slice(this.locked.length) : this.interim;
      this.rollbackCount += 1;
    }
    return this.snapshot();
  }

  promoteAll() {
    if (this.interim.length) {
      this.committed = this.committed.concat(this.interim);
      this.interim = [];
    }
    return this.snapshot();
  }

  snapshot() {
    const stable = this._stableWords();
    return {
      committed: joinWords(stable),
      interim: joinWords(this.interim),
      text: joinWords(stable.concat(this.interim)),
      stablePrefixLength: stable.length,
      committedWords: stable.length,
      interimWords: this.interim.length,
      rollbackCount: this.rollbackCount,
      updates: this.updates,
      flickers: this.flickers,
      stabilityScore: this.updates === 0 ? 1 : Math.max(0, 1 - this.flickers / this.updates)
    };
  }
}

module.exports = {
  BYTES_PER_MS,
  RING_MS,
  DECODE_MS,
  MIN_DECODE_MS,
  INTERVAL_MS,
  OVERLAP_MS,
  UTTERANCE_MS,
  tokenize,
  joinWords,
  suffixPrefixOverlap,
  PcmRingBuffer,
  StablePrefixStabilizer
};
