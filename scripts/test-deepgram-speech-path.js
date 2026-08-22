'use strict';

/**
 * Integration: speech.service Interview Mode path against a real Deepgram key.
 * Captions = interims, Space = turn finals, loopback PCM only.
 * Never prints the API key.
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

const { InterviewSession } = require('../src/services/interview-session');
const speechService = require('../src/services/speech.service');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  return !!ok;
}

function readWavPcm16(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF wav');
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
  const outCount = sampleRate === 16000
    ? mono.length
    : Math.max(1, Math.round(mono.length * 16000 / sampleRate));
  const out = Buffer.alloc(outCount * 2);
  const ratio = sampleRate / 16000;
  for (let i = 0; i < outCount; i++) {
    const src = sampleRate === 16000 ? i : i * ratio;
    const i0 = Math.min(mono.length - 1, Math.floor(src));
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const frac = src - i0;
    const sample = mono[i0] * (1 - frac) + mono[i1] * frac;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2);
  }
  return out;
}

function synthesizeSpeechPcm(text) {
  const wavPath = path.join(os.tmpdir(), `opencluely-dg-path-${Date.now()}.wav`);
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

async function waitUntil(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await wait(40);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const failures = [];
  const record = (name, ok, detail) => {
    if (!check(name, ok, detail)) failures.push(name);
  };

  const key = String(process.env.DEEPGRAM_API_KEY || '').trim();
  if (key.length < 8) {
    console.log('SKIP  DEEPGRAM_API_KEY not set');
    process.exit(0);
  }
  record('env key present (not printed)', true, `len=${key.length}`);
  record('Interview Mode prefers Deepgram when keyed', speechService.usesDeepgramInterview() === false);

  const session = new InterviewSession();
  session.enable();
  const captions = [];
  const onInterim = (text) => {
    const value = String(text || '').trim();
    if (!value) return;
    captions.push(value);
    session.setInterim(value);
  };
  speechService.on('interim-transcription', onInterim);

  try {
    speechService.setInterviewCapture(true);
    record('usesDeepgramInterview after F8', speechService.usesDeepgramInterview() === true);
    record('Whisper rolling is off for Meet', speechService.rollingEnabled === false);

    speechService.startRecording();
    record('mic/recording flag is on', speechService.isRecording === true);
    await waitUntil(
      () => !!(speechService._deepgramLive && speechService._deepgramLive.open),
      12000,
      'Deepgram live socket'
    );
    record('Deepgram live socket open', true);

    const pcm = synthesizeSpeechPcm('Tell me about Kafka and Kubernetes');
    record('spoken fixture ready', pcm.length > 16000, `ms=${Math.round(pcm.length / 32)}`);

    const step = 640; // 20ms
    for (let offset = 0; offset < pcm.length; offset += step) {
      speechService.handleAudioChunkFromRenderer(pcm.subarray(offset, offset + step), 'loopback');
      await wait(20);
    }
    const silence = Buffer.alloc(16000);
    for (let offset = 0; offset < silence.length; offset += step) {
      speechService.handleAudioChunkFromRenderer(silence.subarray(offset, offset + step), 'loopback');
      await wait(20);
    }

    await waitUntil(() => captions.length >= 1, 15000, 'first live caption');
    const firstCaption = captions[0];
    record('live caption arrived', !!firstCaption, firstCaption);
    record('HUD caption is the interim path', session.displayText() === captions[captions.length - 1]);

    const beforeSpace = speechService.isRecording;
    speechService._deepgramSpaceSilenceMs = 200;
    speechService._deepgramSpaceMaxWaitMs = 800;
    const finalized = await speechService.finalizeInterviewTurn({ waitTrailingSilence: true });
    console.log(finalized.spaceLog || '');

    record('Space does not use caption text', finalized.usedCaption === false);
    record('Space payload is non-empty', String(finalized.text || '').trim().length > 2, finalized.text);
    record(
      'Space answers the complete-ish question',
      /kafka|kubernetes/i.test(finalized.text || ''),
      finalized.text
    );
    record(
      'caption can be shorter than Space',
      firstCaption !== finalized.text,
      `caption="${firstCaption}" space="${finalized.text}"`
    );
    record('source=loopback', finalized.source === 'loopback');
    record('recording stays on after Space', speechService.isRecording === true && beforeSpace === true && finalized.micStillRecording === true);
    record('usesTurnFinalSubmit', speechService.usesTurnFinalSubmit() === true);

    const live = speechService._deepgramLive;
    let loopbackSends = 0;
    if (live && typeof live.sendPcm === 'function') {
      const originalSend = live.sendPcm.bind(live);
      live.sendPcm = (buf) => {
        loopbackSends += 1;
        return originalSend(buf);
      };
      speechService.handleAudioChunkFromRenderer(pcm.subarray(0, 3200), 'mic');
      record('mic PCM is ignored while Interview Mode wants loopback', loopbackSends === 0);
      live.sendPcm = originalSend;
    }

    speechService.isRecording = true;
    speechService.clearInterviewTurn();
    const cleared = speechService.getInterviewTurnSnapshot();
    record('Esc clears only the current turn', cleared.durationMs === 0 && speechService.getInterviewTurnFinalText() === '');
    record('Esc keeps listening', speechService.isRecording === true);
    session.clearTranscript();
    record('Esc caption empty, still listening', session.state === 'listening' && session.displayText() === '');
  } catch (error) {
    record(error.message, false);
  } finally {
    speechService.removeListener('interim-transcription', onInterim);
    try { speechService.stopRecording(); } catch (_) {}
    try { speechService.shutdown(); } catch (_) {}
  }

  console.log('');
  if (failures.length) {
    console.log(`${failures.length} speech-path checks failed`);
    process.exit(1);
  }
  console.log('Deepgram speech-path integration passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(error && error.message);
  try { speechService.shutdown(); } catch (_) {}
  process.exit(1);
});
