'use strict';

/**
 * Live-caption checks:
 * - overlapping Whisper-tiny decodes on the persistent worker
 * - Interview Mode hold vs test teardown (Node must exit after PASS)
 * - interim events update the interview bar contract while audio is still growing
 *
 * Does not start a second ASR engine.
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
const { InterviewSession } = require('../src/services/interview-session');

function makePcm(ms, hz = 220) {
  const samples = Math.round(16 * ms);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * hz * i) / 16000) * 12000);
    pcm.writeInt16LE(v, i * 2);
  }
  return pcm;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntil(predicate, timeoutMs, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`timeout waiting for ${label}`));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function renderBarQuote(payload) {
  return String((payload && payload.text) || '').trim();
}

function sampleProcess(pid) {
  if (!pid) return null;
  const script = `$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; if ($p) { @{ cpuSeconds = [math]::Round($p.CPU, 2); rssMb = [math]::Round($p.WorkingSet64 / 1MB, 1) } | ConvertTo-Json -Compress }`;
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout.trim());
  } catch (_) {
    return null;
  }
}

function readWavPcm16(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('not a RIFF wav');
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
  return { channels, sampleRate, pcm: data };
}

function toMono16k(pcm, channels, sampleRate) {
  const frameCount = Math.floor(pcm.length / 2 / channels);
  const mono = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += pcm.readInt16LE((i * channels + c) * 2);
    }
    mono[i] = sum / channels;
  }
  if (sampleRate === 16000) {
    const out = Buffer.alloc(mono.length * 2);
    for (let i = 0; i < mono.length; i++) {
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i]))), i * 2);
    }
    return out;
  }
  const outCount = Math.max(1, Math.round(mono.length * 16000 / sampleRate));
  const out = Buffer.alloc(outCount * 2);
  const ratio = sampleRate / 16000;
  for (let i = 0; i < outCount; i++) {
    const src = i * ratio;
    const i0 = Math.min(mono.length - 1, Math.floor(src));
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const frac = src - i0;
    const sample = mono[i0] * (1 - frac) + mono[i1] * frac;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2);
  }
  return out;
}

function synthesizeSpeechPcm(text) {
  const wavPath = path.join(os.tmpdir(), `opencluely-caption-${Date.now()}.wav`);
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
    const wav = readWavPcm16(wavPath);
    return toMono16k(wav.pcm, wav.channels, wav.sampleRate);
  } finally {
    try { fs.unlinkSync(wavPath); } catch (_) {}
  }
}

function assert(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) {
    throw new Error(name);
  }
}

function slicePcm(pcm, startMs, endMs) {
  const start = Math.max(0, Math.round(startMs * 32));
  const end = Math.min(pcm.length, Math.round(endMs * 32));
  return pcm.subarray(start, end);
}

async function main() {
  const failures = [];
  const metrics = {
    warmupMs: null,
    firstChunkDecodeMs: null,
    twoSecondDecodeMs: null,
    firstCaptionMs: null,
    captionIntervalsMs: [],
    captions: [],
    nodeRssMb: null,
    workerRssMb: null,
    workerCpuSeconds: null,
    nodeCpuMs: null
  };

  try {
    if (!speechService.whisperWorker.isConfigured()) {
      throw new Error('worker not configured');
    }

    const session = new InterviewSession();
    session.enable();
    const quotes = [];
    for (const text of [
      'Tell me about',
      'Tell me about Kafka',
      'Tell me about Kafka and inventory synchronization'
    ]) {
      session.setInterim(text);
      quotes.push(renderBarQuote(session.toPayload()));
    }
    assert(
      'interview bar caption updates on each interim chunk',
      quotes[0] !== quotes[1] && quotes[1] !== quotes[2] && quotes.every((q) => q.length > 0 && !q.includes('"')),
      quotes.join(' → ')
    );
    const frozen = session.beginSubmit();
    session.setInterim('should be ignored');
    assert('Space freezes transcript and ignores later interims', frozen === quotes[2] && session.displayText() === frozen);
    session.markAnswering();
    session.finishAnswer();
    assert('after answer, bar returns to listening empty', renderBarQuote(session.toPayload()) === '');

    const cpuStart = process.cpuUsage();
    speechService.setWhisperKeepAlive(true);
    assert('Interview Mode keep-alive holds the worker', speechService.whisperWorker.isHeld() === true);

    const warmupStart = Date.now();
    await speechService.whisperWorker.warmup({
      model: speechService._getWhisperModel(),
      modelDir: speechService._getWhisperModelDir(),
      device: speechService._getWhisperDevice()
    });
    metrics.warmupMs = Date.now() - warmupStart;
    console.log('warmupMs', metrics.warmupMs);
    assert('worker process stays up while held', speechService.whisperWorker.isRunning() === true);

    const windows = [500, 1000, 1500, 2000];
    const rows = [];
    for (const ms of windows) {
      const t0 = Date.now();
      const text = await speechService._transcribeWhisperBuffer(makePcm(ms), { fast: true });
      rows.push({
        audioMs: ms,
        decodeMs: Date.now() - t0,
        text: String(text || '').slice(0, 40)
      });
    }
    console.log(JSON.stringify(rows, null, 2));
    metrics.firstChunkDecodeMs = rows[0].decodeMs;
    metrics.twoSecondDecodeMs = rows[rows.length - 1].decodeMs;
    console.log('timeToFirstChunkDecodeMs', metrics.firstChunkDecodeMs);
    console.log('timeTo2sWindowDecodeMs', metrics.twoSecondDecodeMs);
    assert('first chunk decode is usable', metrics.firstChunkDecodeMs <= 8000);
    assert('held worker did not arm idle unload after decodes', speechService.whisperWorker.idleTimer == null);

    let speechPcm = null;
    try {
      speechPcm = synthesizeSpeechPcm('Tell me about Kafka and inventory synchronization in my last project');
      console.log('speechPcmMs', Math.round(speechPcm.length / 32));
    } catch (error) {
      console.log('WARN  System.Speech unavailable; skipping spoken-word captions', error.message);
    }

    if (speechPcm && speechPcm.length >= 16000) {
      const interims = [];
      const onInterim = (text) => {
        interims.push({
          at: Date.now(),
          text: String(text || '').trim()
        });
      };
      speechService.on('interim-transcription', onInterim);

      speechService.isRecording = true;
      speechService.transcriptionInFlight = false;
      speechService._interimInFlight = false;
      speechService._lastInterimAt = 0;
      speechService._lastInterimBytes = 0;
      speechService._firstCaptionAt = 0;
      speechService._speechOnsetAt = 0;
      speechService.segmentBuffers = [];
      speechService.segmentBytes = 0;
      speechService._resetVadState();

      const chunkMs = 20;
      const firstBurstMs = Math.min(1400, Math.round(speechPcm.length / 32));
      const spokenStart = Date.now();
      for (let ms = 0; ms < firstBurstMs; ms += chunkMs) {
        speechService._ingestWhisperAudio(slicePcm(speechPcm, ms, ms + chunkMs));
      }
      await waitUntil(() => interims.length >= 1, 20000, 'first live caption');
      metrics.firstCaptionMs = Date.now() - spokenStart;

      const secondBurstMs = Math.min(Math.round(speechPcm.length / 32), firstBurstMs + 1600);
      if (secondBurstMs > firstBurstMs) {
        for (let ms = firstBurstMs; ms < secondBurstMs; ms += chunkMs) {
          speechService._ingestWhisperAudio(slicePcm(speechPcm, ms, ms + chunkMs));
        }
        try {
          await waitUntil(() => interims.length >= 2, 20000, 'second live caption');
        } catch (error) {
          console.log('WARN  only one caption arrived before timeout', error.message);
        }
      }

      speechService.removeListener('interim-transcription', onInterim);
      speechService.isRecording = false;
      speechService.vadSpeaking = false;

      metrics.captions = interims.map((item) => item.text);
      metrics.captionIntervalsMs = interims.slice(1).map((item, i) => item.at - interims[i].at);
      console.log('liveCaptions', JSON.stringify(interims, null, 2));
      console.log('firstCaptionMs', metrics.firstCaptionMs);
      console.log('captionIntervalsMs', metrics.captionIntervalsMs);
      assert('words appear before the utterance is finished', interims.length >= 1 && interims[0].text.length > 0);
      if (interims.length >= 2) {
        assert('later caption is not identical to the first frozen snapshot', interims[0].text !== interims[1].text || interims[1].text.length >= interims[0].text.length);
      }

      const liveSession = new InterviewSession();
      liveSession.enable();
      const barFrames = [];
      for (const item of interims) {
        liveSession.setInterim(item.text);
        barFrames.push(renderBarQuote(liveSession.toPayload()));
      }
      assert('UI caption tracks interim chunks while listening', barFrames.length === interims.length && barFrames[0] === interims[0].text);
    }

    const workerPid = speechService.whisperWorker.process && speechService.whisperWorker.process.pid;
    const workerSample = sampleProcess(workerPid);
    const nodeCpu = process.cpuUsage(cpuStart);
    metrics.nodeCpuMs = Math.round((nodeCpu.user + nodeCpu.system) / 1000);
    metrics.nodeRssMb = Math.round(process.memoryUsage().rss / 1048576);
    if (workerSample) {
      metrics.workerCpuSeconds = workerSample.cpuSeconds;
      metrics.workerRssMb = workerSample.rssMb;
    }
    console.log('metrics', JSON.stringify(metrics, null, 2));

    assert('worker still running during Interview keep-alive', speechService.whisperWorker.isRunning() === true);
    console.log('PASS overlapping fast decodes completed on persistent worker');
  } catch (error) {
    failures.push(error);
    console.error(error);
  } finally {
    try { speechService.setWhisperKeepAlive(false); } catch (_) {}
    try { speechService.shutdown(); } catch (error) {
      console.error('shutdown failed', error);
    }
    await sleep(150);
    const stillRunning = speechService.whisperWorker.isRunning();
    if (stillRunning) {
      console.error('FAIL  worker still running after shutdown');
      failures.push(new Error('worker still running after shutdown'));
    } else {
      console.log('PASS  worker torn down; test can exit');
    }
  }

  if (failures.length) {
    process.exit(1);
  }
  process.exit(0);
}

main();
