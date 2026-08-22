'use strict';

/**
 * Replay a WAV through the Interview Mode rolling pipeline.
 *
 *   npm run asr:replay -- path/to/sample.wav
 *
 * Prints every rolling decode, committed text, interim tail, and the
 * Space-submitted transcript. Does not call Gemini.
 */
const fs = require('fs');
const path = require('path');

const userDataEnv = path.join(process.env.APPDATA || '', 'opencluely', '.env');
if (fs.existsSync(userDataEnv)) {
  require('dotenv').config({ path: userDataEnv });
} else {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const speechService = require('../src/services/speech.service');
const { loadWavPcm16k, replayPcm, formatReplay } = require('../src/services/asr-replay');

function usage() {
  console.error('Usage: npm run asr:replay -- path/to/sample.wav');
  process.exit(2);
}

async function main() {
  const wavPath = process.argv.slice(2).find((arg) => arg && !arg.startsWith('-'));
  if (!wavPath) usage();
  if (!fs.existsSync(wavPath)) {
    console.error(`WAV not found: ${wavPath}`);
    process.exit(1);
  }
  if (!speechService.whisperWorker.isConfigured()) {
    console.error('FAIL Whisper worker is not configured');
    process.exit(1);
  }

  speechService.setWhisperKeepAlive(true);
  await speechService.whisperWorker.warmup({
    model: speechService._getWhisperModel(),
    modelDir: speechService._getWhisperModelDir(),
    device: speechService._getWhisperDevice()
  });

  const pcm = loadWavPcm16k(wavPath);
  const pid = speechService.whisperWorker.pid;
  const result = await replayPcm(pcm, {
    decode: (window) => speechService._transcribeWhisperBuffer(window, {
      fast: true,
      rolling: true,
      language: typeof speechService._rollingFastLanguage === 'function'
        ? speechService._rollingFastLanguage()
        : 'en'
    })
  });

  console.log(`file: ${wavPath}`);
  console.log(`pcmMs: ${Math.round(pcm.length / 32)}  workerPid: ${pid}  dropped: ${result.droppedUpdates || 0}`);
  console.log('');
  console.log(formatReplay(result));

  const stillSamePid = speechService.whisperWorker.pid === pid;
  if (!stillSamePid) {
    console.error('FAIL worker restarted during replay');
    process.exitCode = 1;
  } else if (!result.submittedMatchesCaption) {
    console.error('FAIL submitted text does not match caption');
    process.exitCode = 1;
  } else {
    console.log('PASS replay submitted text matches caption');
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
