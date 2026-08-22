'use strict';

const fs = require('fs');
const {
  PcmRingBuffer,
  StablePrefixStabilizer,
  RING_MS,
  DECODE_MS,
  MIN_DECODE_MS,
  INTERVAL_MS,
  UTTERANCE_MS,
  BYTES_PER_MS
} = require('./rolling-caption');
const { InterviewSession } = require('./interview-session');

const ENERGY_FLOOR = 0.008;

function pcmRmsEnergy(buffer) {
  const sampleCount = Math.floor((buffer && buffer.length) / 2);
  if (!sampleCount) return 0;
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = buffer.readInt16LE(i * 2) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

function loadWavPcm16k(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`not a WAV file: ${filePath}`);
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = 16000;
  let bits = 16;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bits = buf.readUInt16LE(start + 14);
    } else if (id === 'data') {
      data = buf.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!data) throw new Error('wav has no data chunk');
  if (bits !== 16) throw new Error(`unsupported wav bit depth ${bits}`);
  const frameCount = Math.floor(data.length / 2 / channels);
  const mono = new Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += data.readInt16LE((i * channels + c) * 2);
    }
    mono[i] = sum / channels;
  }
  const outCount = Math.max(1, Math.round(mono.length * 16000 / sampleRate));
  const out = Buffer.alloc(outCount * 2);
  const ratio = sampleRate / 16000;
  for (let i = 0; i < outCount; i += 1) {
    const src = i * ratio;
    const i0 = Math.min(mono.length - 1, Math.floor(src));
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const frac = src - i0;
    const sample = mono[i0] * (1 - frac) + mono[i1] * frac;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2);
  }
  return out;
}

function pushEvent(events, extra) {
  events.push(extra);
  return extra;
}

function replayWindowTexts(windowTexts) {
  const stabilizer = new StablePrefixStabilizer();
  const session = new InterviewSession();
  session.enable();
  const events = [];

  for (let i = 0; i < windowTexts.length; i += 1) {
    const raw = windowTexts[i];
    const snap = stabilizer.update(raw);
    session.setRollingParts(snap.committed, snap.interim);
    const caption = session.displayText();
    pushEvent(events, {
      tick: i,
      raw,
      committed: snap.committed,
      interim: snap.interim,
      text: snap.text,
      caption,
      committedWords: snap.committedWords,
      interimWords: snap.interimWords,
      rollbackCount: snap.rollbackCount,
      captionMatchesPipeline: caption === snap.text
    });
  }

  return finishReplay(stabilizer, session, events);
}

function finishReplay(stabilizer, session, events, extra = {}) {
  const promoted = stabilizer.promoteAll();
  session.setRollingParts(promoted.committed, promoted.interim);
  const caption = session.displayText();
  const submitted = session.beginSubmit();
  pushEvent(events, {
    tick: 'submit',
    raw: '',
    committed: promoted.committed,
    interim: promoted.interim,
    text: promoted.text,
    caption,
    submitted,
    committedWords: promoted.committedWords,
    interimWords: promoted.interimWords,
    rollbackCount: promoted.rollbackCount,
    captionMatchesPipeline: caption === promoted.text,
    submittedMatchesCaption: submitted === caption
  });
  return {
    events,
    submitted,
    caption,
    rollbackCount: promoted.rollbackCount,
    committedWords: promoted.committedWords,
    interimWords: promoted.interimWords,
    submittedMatchesCaption: submitted === caption,
    ...extra
  };
}

async function replayPcm(pcm, {
  decode,
  intervalMs = INTERVAL_MS,
  checkEnergy = true
} = {}) {
  if (typeof decode !== 'function') {
    throw new Error('replayPcm requires a decode(pcmWindow) function');
  }
  const ring = new PcmRingBuffer(RING_MS);
  const stabilizer = new StablePrefixStabilizer();
  const session = new InterviewSession();
  session.enable();
  const events = [];
  let simTime = 0;
  let busyUntil = 0;
  let dropped = 0;
  const step = Math.max(1, Math.round(intervalMs * BYTES_PER_MS));

  for (let cursor = 0; cursor < pcm.length; cursor += step) {
    const slice = pcm.subarray(cursor, Math.min(pcm.length, cursor + step));
    ring.push(slice);
    simTime += intervalMs;
    if (ring.durationMs < MIN_DECODE_MS) continue;
    if (simTime < busyUntil) {
      dropped += 1;
      continue;
    }
    const windowMs = ring.durationMs >= 600
      ? Math.min(DECODE_MS, ring.durationMs)
      : ring.durationMs;
    const window = ring.snapshotMs(windowMs);
    if (!window.length) continue;
    const energy = pcmRmsEnergy(window);
    const hasStable = stabilizer.snapshot().committedWords > 0;
    if (checkEnergy) {
      if (energy < ENERGY_FLOOR * 1.15 && !hasStable) continue;
      if (energy < ENERGY_FLOOR * 0.7) continue;
    }
    const started = Date.now();
    const raw = await decode(window);
    const decodeMs = Date.now() - started;
    busyUntil = simTime + decodeMs;
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const snap = stabilizer.update(clean);
    session.setRollingParts(snap.committed, snap.interim);
    const caption = session.displayText();
    pushEvent(events, {
      tick: events.length,
      simMs: simTime,
      decodeMs,
      audioMs: Math.round(window.length / BYTES_PER_MS),
      raw: clean,
      committed: snap.committed,
      interim: snap.interim,
      text: snap.text,
      caption,
      committedWords: snap.committedWords,
      interimWords: snap.interimWords,
      rollbackCount: snap.rollbackCount,
      captionMatchesPipeline: caption === snap.text
    });
  }

  const fullMs = Math.min(UTTERANCE_MS, pcm.length / BYTES_PER_MS);
  if (fullMs >= MIN_DECODE_MS) {
    const take = Math.round(fullMs * BYTES_PER_MS);
    const full = pcm.subarray(Math.max(0, pcm.length - take));
    const started = Date.now();
    const raw = await decode(full);
    const decodeMs = Date.now() - started;
    const clean = String(raw || '').trim();
    if (clean) {
      const snap = stabilizer.update(clean);
      session.setRollingParts(snap.committed, snap.interim);
      pushEvent(events, {
        tick: 'flush',
        simMs: simTime,
        decodeMs,
        audioMs: Math.round(full.length / BYTES_PER_MS),
        raw: clean,
        committed: snap.committed,
        interim: snap.interim,
        text: snap.text,
        caption: session.displayText(),
        committedWords: snap.committedWords,
        interimWords: snap.interimWords,
        rollbackCount: snap.rollbackCount,
        captionMatchesPipeline: session.displayText() === snap.text
      });
    }
  }

  return finishReplay(stabilizer, session, events, { droppedUpdates: dropped });
}

function formatReplay(result) {
  const lines = [];
  lines.push('tick  simMs  decodeMs  rollback  committed | interim');
  lines.push('-'.repeat(72));
  for (const event of result.events) {
    if (event.tick === 'flush') {
      lines.push(`FLUSH  ${String(event.decodeMs || '-').padStart(8)}  ${event.raw}`);
      lines.push(`      committed: ${event.committed || '∅'} | ${event.interim || '∅'}`);
      continue;
    }
    if (event.tick === 'submit') {
      lines.push('-'.repeat(72));
      lines.push(`SUBMITTED: ${event.submitted || ''}`);
      lines.push(`CAPTION:   ${event.caption || ''}`);
      lines.push(`MATCH:     ${event.submittedMatchesCaption ? 'yes' : 'NO'}`);
      lines.push(`committedWords=${event.committedWords}  interimWords=${event.interimWords}  rollbackCount=${event.rollbackCount}`);
      continue;
    }
    const sim = event.simMs == null ? '-' : String(event.simMs);
    const dec = event.decodeMs == null ? '-' : String(event.decodeMs);
    lines.push(
      `${String(event.tick).padStart(4)}  ${sim.padStart(5)}  ${dec.padStart(8)}  `
      + `${String(event.rollbackCount).padStart(8)}  `
      + `${event.committed || '∅'} | ${event.interim || '∅'}`
    );
    lines.push(`      raw: ${event.raw}`);
  }
  return lines.join('\n');
}

module.exports = {
  ENERGY_FLOOR,
  loadWavPcm16k,
  pcmRmsEnergy,
  replayWindowTexts,
  replayPcm,
  formatReplay
};
