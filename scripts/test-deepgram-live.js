'use strict';

/**
 * Live Deepgram smoke test. Reads DEEPGRAM_API_KEY from env.
 * Never prints the key. Skips if the key is missing.
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

const {
  DeepgramLiveClient,
  transcribePrerecorded,
  buildListenUrl,
  DEFAULT_KEYTERMS
} = require('../src/services/deepgram-live');

function keyPresent() {
  return String(process.env.DEEPGRAM_API_KEY || '').trim().length > 8;
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
  const wavPath = path.join(os.tmpdir(), `opencluely-dg-live-${Date.now()}.wav`);
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

function chunkRms(buffer) {
  const sampleCount = Math.floor(buffer.length / 2);
  if (!sampleCount) return 0;
  let sum = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = buffer.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / sampleCount);
}

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  return ok;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLive(pcm, apiKey) {
  const interims = [];
  const finals = [];
  const errors = [];
  const client = new DeepgramLiveClient({ apiKey });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('live socket timeout')), 20000);
    client.on('open', resolve);
    client.on('error', (error) => {
      errors.push(error && error.message);
      reject(error);
    });
    client.connect();
    timer.unref && timer.unref();
  }).finally(() => {});

  client.on('message', (msg) => {
    const text = (((msg.channel || {}).alternatives || [])[0] || {}).transcript;
    const clean = String(text || '').trim();
    if (!clean) return;
    if (msg.is_final || msg.speech_final) {
      finals.push(clean);
    } else {
      interims.push(clean);
    }
  });

  const step = 3200; // 100ms of 16k mono s16
  for (let offset = 0; offset < pcm.length; offset += step) {
    client.sendPcm(pcm.subarray(offset, Math.min(pcm.length, offset + step)));
    await wait(40);
  }
  const silence = Buffer.alloc(16000 * 2);
  for (let offset = 0; offset < silence.length; offset += step) {
    client.sendPcm(silence.subarray(offset, Math.min(silence.length, offset + step)));
    await wait(40);
  }
  await wait(1800);
  client.close();
  return { interims, finals, errors, url: buildListenUrl() };
}

async function main() {
  if (!keyPresent()) {
    console.log('SKIP  DEEPGRAM_API_KEY not set');
    process.exit(0);
  }

  const apiKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  const failures = [];
  const record = (name, ok, detail) => {
    if (!check(name, ok, detail)) failures.push(name);
  };

  record('key is present (value not printed)', true, `len=${apiKey.length}`);
  record('live URL has keyterms', DEFAULT_KEYTERMS.every((term) => buildListenUrl().includes(term)));

  let pcm;
  try {
    pcm = synthesizeSpeechPcm('Tell me about Kafka and Kubernetes');
  } catch (error) {
    console.log('FAIL  could not synthesize speech fixture', error.message);
    process.exit(1);
  }
  const rms = chunkRms(pcm);
  record('fixture PCM has energy', pcm.length > 16000 && rms > 0.01, `ms=${Math.round(pcm.length / 32)} rms=${rms.toFixed(4)}`);

  try {
    const prerecorded = await transcribePrerecorded(pcm, { apiKey });
    console.log('prerecorded:', prerecorded || '(empty)');
    record('prerecorded returned text', String(prerecorded || '').trim().length > 0);
    record(
      'prerecorded keeps Kafka or Kubernetes',
      /kafka|kubernetes/i.test(String(prerecorded || ''))
    );
  } catch (error) {
    record('prerecorded request', false, error.message);
  }

  try {
    const live = await runLive(pcm, apiKey);
    console.log('live interims:', interimsPreview(live.interims));
    console.log('live finals:', live.finals.join(' | ') || '(none)');
    record('live socket accepted the key', live.errors.length === 0);
    record('live interims arrived', live.interims.length > 0, `n=${live.interims.length}`);
    record('live finals arrived', live.finals.length > 0, `n=${live.finals.length}`);
    const all = `${live.interims.join(' ')} ${live.finals.join(' ')}`;
    record('live transcript mentions Kafka or Kubernetes', /kafka|kubernetes/i.test(all), all.slice(0, 120));
    if (live.interims[0] && live.finals.join(' ')) {
      record(
        'interims can differ from finals (two paths)',
        true,
        `caption="${live.interims[0]}" final="${live.finals.join(' ')}"`
      );
    }
  } catch (error) {
    record('live websocket', false, error.message);
  }

  console.log('');
  if (failures.length) {
    console.log(`${failures.length} live checks failed`);
    process.exit(1);
  }
  console.log('Deepgram live key test passed');
  process.exit(0);
}

function interimsPreview(interims) {
  if (!interims.length) return '(none)';
  if (interims.length <= 3) return interims.join(' → ');
  return `${interims[0]} → … → ${interims[interims.length - 1]} (${interims.length})`;
}

main().catch((error) => {
  console.error('live test failed:', error.message);
  process.exit(1);
});
