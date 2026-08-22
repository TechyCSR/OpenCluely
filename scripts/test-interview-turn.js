'use strict';

/**
 * Phase 1 — Space submits a finalized Tiny decode of the interviewer turn,
 * never the live caption string.
 */
const { InterviewTurnBuffer, TURN_MS, TRAILING_SILENCE_MS } = require('../src/services/interview-turn-buffer');
const { InterviewSession } = require('../src/services/interview-session');
const speechService = require('../src/services/speech.service');

const cases = [];
function check(name, ok, detail) {
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

function makePcm(ms, hz = 220) {
  const samples = Math.round(16 * ms);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * hz * i) / 16000) * 12000);
    pcm.writeInt16LE(v, i * 2);
  }
  return pcm;
}

function ingest(pcm, chunkMs = 20) {
  const step = chunkMs * 32;
  for (let offset = 0; offset < pcm.length; offset += step) {
    speechService._ingestWhisperAudio(pcm.subarray(offset, Math.min(pcm.length, offset + step)));
  }
}

const buf = new InterviewTurnBuffer(TURN_MS);
check('turn starts inactive', buf.active === false);
check('trailing silence helper exists', TRAILING_SILENCE_MS === 300);
buf.begin(1000);
check('begin records startedAt', buf.startedAt === 1000);
buf.push(makePcm(500), { now: 1500, voiced: true });
check('duration tracks PCM', Math.round(buf.durationMs) === 500);
check('lastVoiceAt stamped', buf.lastVoiceAt === 1500);
buf.push(makePcm(13000), { now: 14500, voiced: true });
check('caps at 12 seconds', Math.round(buf.durationMs) === TURN_MS, `ms=${buf.durationMs}`);
const snap = buf.snapshot();
check('snapshot keeps timestamps', snap.startedAt === 1000 && snap.lastVoiceAt === 14500);
buf.deactivate();
check('deactivate keeps PCM', Math.round(buf.durationMs) === TURN_MS && buf.active === false);
buf.reset();
check('reset clears the turn', buf.durationMs === 0 && buf.startedAt === 0);

speechService.rollingEnabled = true;
speechService.rollingCaptionsPaused = false;
speechService.isRecording = true;
speechService._resetRollingState();
ingest(makePcm(800));
const afterVad = speechService.getInterviewTurnSnapshot();
check('VAD speech start opens a turn buffer', afterVad.startedAt > 0 && afterVad.durationMs > 0, `ms=${afterVad.durationMs}`);

const captionSession = new InterviewSession();
captionSession.enable();
captionSession.setRollingParts('Tell me.', '');
check('caption may be incomplete', captionSession.displayText() === 'Tell me.');

const originalDecode = speechService._transcribeWhisperBuffer.bind(speechService);
let decodeModel = null;
let decodeFast = null;
let decodeRolling = null;
let decodeMs = 0;
speechService._transcribeWhisperBuffer = async (pcm, options = {}) => {
  decodeModel = options.model;
  decodeFast = !!options.fast;
  decodeRolling = !!options.rolling;
  decodeMs = pcm.length / 32;
  return 'Tell me about yourself';
};

speechService.finalizeInterviewTurn({ waitTrailingSilence: false }).then((finalized) => {
  check('Space does not send the caption string', finalized.text !== captionSession.displayText());
  check(
    'Tell me about yourself reaches Gemini as the full sentence',
    finalized.text === 'Tell me about yourself',
    finalized.text
  );
  check('caption is still Tell me.', captionSession.displayText() === 'Tell me.');
  check('finalize uses Whisper Tiny', decodeModel === 'tiny');
  check('finalize is a full decode not a rolling window', decodeFast === false && decodeRolling === false);
  check('Space during speech still has turn audio', decodeMs >= 500, `pcmMs=${decodeMs}`);
  check('mic remains active after Space', speechService.isRecording === true && finalized.micStillRecording === true);
  check('never flagged as caption text', finalized.usedCaption === false);

  captionSession.beginAnalyze();
  check('HUD can think without rewriting caption', captionSession.displayText() === 'Tell me.' && captionSession.state === 'thinking');
  captionSession.resumeListening();
  check('failed Space can return to listening', captionSession.state === 'listening');

  speechService.clearInterviewTurn();
  const cleared = speechService.getInterviewTurnSnapshot();
  check('Esc clears only the current turn', cleared.durationMs === 0 && cleared.startedAt === 0);
  check('Esc keeps the mic', speechService.isRecording === true);
  captionSession.clearTranscript();
  check('Esc keeps listening', captionSession.state === 'listening' && captionSession.displayText() === '');

  speechService._transcribeWhisperBuffer = originalDecode;
  speechService.rollingEnabled = false;
  speechService.isRecording = false;
  speechService._resetRollingState();
  try { speechService.shutdown(); } catch (_) {}

  const failed = cases.filter((ok) => !ok).length;
  console.log('');
  if (failed) {
    console.log(`${failed} of ${cases.length} failed`);
    process.exit(1);
  }
  console.log(`All ${cases.length} cases passed`);
  process.exit(0);
}).catch((error) => {
  console.error(error);
  try { speechService.shutdown(); } catch (_) {}
  process.exit(1);
});
