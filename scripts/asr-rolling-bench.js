'use strict';

/**
 * Rolling Whisper bench: 100 / 150 / 200 ms ticks on the persistent worker.
 * Does not start a second ASR engine or reload the model.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const userDataEnv = path.join(process.env.APPDATA || '', 'opencluely', '.env');
if (fs.existsSync(userDataEnv)) {
  require('dotenv').config({ path: userDataEnv });
} else {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const speechService = require('../src/services/speech.service');
const {
  PcmRingBuffer,
  StablePrefixStabilizer,
  RING_MS,
  DECODE_MS,
  MIN_DECODE_MS,
  OVERLAP_MS
} = require('../src/services/rolling-caption');
const { sampleRssMb } = require('../src/services/perf-trace');

function synthesizeSpeechPcm(text) {
  const wavPath = path.join(os.tmpdir(), `opencluely-roll-${Date.now()}.wav`);
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$synth.Rate = -2',
    `$synth.SetOutputToWaveFile(${JSON.stringify(wavPath)})`,
    `$synth.Speak(${JSON.stringify(text)})`,
    '$synth.Dispose()'
  ].join('; ');
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000
  });
  if (result.status !== 0 || !fs.existsSync(wavPath)) {
    throw new Error((result.stderr || result.stdout || 'System.Speech failed').trim());
  }
  try {
    const buf = fs.readFileSync(wavPath);
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
    if (!data || bits !== 16) throw new Error('need 16-bit pcm wav');
    const frameCount = Math.floor(data.length / 2 / channels);
    const mono = [];
    for (let i = 0; i < frameCount; i += 1) {
      let sum = 0;
      for (let c = 0; c < channels; c += 1) sum += data.readInt16LE((i * channels + c) * 2);
      mono.push(sum / channels);
    }
    const outCount = Math.max(1, Math.round(mono.length * 16000 / sampleRate));
    const out = Buffer.alloc(outCount * 2);
    const ratio = sampleRate / 16000;
    for (let i = 0; i < outCount; i += 1) {
      const src = i * ratio;
      const i0 = Math.min(mono.length - 1, Math.floor(src));
      const i1 = Math.min(mono.length - 1, i0 + 1);
      const frac = src - i0;
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i0] * (1 - frac) + mono[i1] * frac))), i * 2);
    }
    return out;
  } finally {
    try { fs.unlinkSync(wavPath); } catch (_) {}
  }
}

function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

async function runInterval(pcm, intervalMs, workerPid) {
  const ring = new PcmRingBuffer(RING_MS);
  const stab = new StablePrefixStabilizer();
  const decodes = [];
  let firstCaptionMs = null;
  let dropped = 0;
  let busyUntil = 0;
  let simTime = 0;
  const cpu0 = process.cpuUsage();

  for (let cursor = 0; cursor < pcm.length; cursor += intervalMs * 32) {
    const slice = pcm.subarray(cursor, Math.min(pcm.length, cursor + intervalMs * 32));
    ring.push(slice);
    simTime += intervalMs;
    if (ring.durationMs < MIN_DECODE_MS) continue;
    if (simTime < busyUntil) {
      dropped += 1;
      continue;
    }
    const windowMs = ring.durationMs >= 600 ? Math.min(DECODE_MS, ring.durationMs) : ring.durationMs;
    const window = ring.snapshotMs(windowMs);
    const started = Date.now();
    const text = await speechService._transcribeWhisperBuffer(window, {
      fast: true,
      rolling: true,
      language: 'en'
    });
    const decodeMs = Date.now() - started;
    busyUntil = simTime + decodeMs;
    decodes.push(decodeMs);
    const clean = String(text || '').trim();
    if (clean) {
      const snap = stab.update(clean);
      if (firstCaptionMs == null && snap.text) {
        firstCaptionMs = simTime + decodeMs;
      }
    }
  }

  const cpu = process.cpuUsage(cpu0);
  const snap = stab.snapshot();
  return {
    intervalMs,
    firstCaptionMs,
    avgDecodeMs: decodes.length ? Math.round(decodes.reduce((a, b) => a + b, 0) / decodes.length) : null,
    decodes: decodes.length,
    droppedUpdates: dropped,
    stablePrefixLength: snap.stablePrefixLength,
    stabilityScore: Number(snap.stabilityScore.toFixed(3)),
    nodeRssMb: Math.round(process.memoryUsage().rss / 1048576),
    workerRssMb: sampleRssMb(workerPid),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    workerRunning: speechService.whisperWorker.isRunning(),
    workerPid
  };
}

async function main() {
  if (!speechService.whisperWorker.isConfigured()) {
    console.error('FAIL worker not configured');
    process.exit(1);
  }

  speechService.setWhisperKeepAlive(true);
  await speechService.whisperWorker.warmup({
    model: speechService._getWhisperModel(),
    modelDir: speechService._getWhisperModelDir(),
    device: speechService._getWhisperDevice()
  });
  const pidBefore = speechService.whisperWorker.pid;

  let pcm;
  try {
    pcm = synthesizeSpeechPcm('Tell me about Kafka and inventory synchronization in my last project');
  } catch (error) {
    console.error('TTS unavailable, using tone buffer', error.message);
    pcm = Buffer.alloc(4000 * 32);
    for (let i = 0; i < 4000 * 16; i += 1) {
      pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 180 * i) / 16000) * 10000), i * 2);
    }
  }

  const rows = [];
  for (const interval of [100, 150, 200]) {
    const row = await runInterval(pcm, interval, pidBefore);
    rows.push(row);
    console.log(JSON.stringify(row));
  }

  const pidAfter = speechService.whisperWorker.pid;
  const noRestart = pidBefore && pidAfter && pidBefore === pidAfter && speechService.whisperWorker.isRunning();

  console.log('');
  console.log('Rolling Whisper bench');
  console.log(`ring ${RING_MS} ms    decode ${DECODE_MS} ms    overlap ${OVERLAP_MS} ms`);
  console.log('');
  console.log('interval  firstCaption  avgDecode  cpuMs  nodeRAM  workerRAM  stability  dropped');
  for (const row of rows) {
    console.log(
      `${String(row.intervalMs).padStart(6)} ms  `
      + `${fmt(row.firstCaptionMs).padStart(11)}  `
      + `${fmt(row.avgDecodeMs).padStart(9)}  `
      + `${fmt(row.cpuMs).padStart(5)}  `
      + `${fmt(row.nodeRssMb, 1).padStart(7)}  `
      + `${fmt(row.workerRssMb, 1).padStart(9)}  `
      + `${fmt(row.stabilityScore, 3).padStart(9)}  `
      + `${fmt(row.droppedUpdates).padStart(7)}`
    );
  }
  console.log('');
  console.log(JSON.stringify({
    workerRestarted: !noRestart,
    pidBefore,
    pidAfter,
    ringBufferMs: RING_MS,
    overlapMs: OVERLAP_MS,
    decodeWindowMs: DECODE_MS
  }));

  if (!noRestart) {
    console.error('FAIL worker restarted during rolling bench');
    process.exitCode = 1;
  } else {
    console.log('PASS worker stayed up for all rolling intervals');
  }

  speechService.setWhisperKeepAlive(false);
  speechService.shutdown();
  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error(error);
  try { speechService.shutdown(); } catch (_) {}
  process.exit(1);
});
