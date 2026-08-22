'use strict';

/**
 * Deepgram Interview Mode: live captions (interims) vs Space (turn finals).
 * Never reads caption text for Gemini. Never prints API keys.
 */
const { EventEmitter } = require('events');
const {
  buildListenUrl,
  buildPrerecordedUrl,
  formatSpaceLogLine,
  DEFAULT_KEYTERMS,
  LOOPBACK_MIN_RMS
} = require('../src/services/deepgram-live');
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

function makeSilence(ms) {
  return Buffer.alloc(Math.round(16 * ms) * 2);
}

function deepgramResult(transcript, { isFinal = false, speechFinal = false } = {}) {
  return {
    type: 'Results',
    is_final: isFinal,
    speech_final: speechFinal,
    channel: {
      alternatives: [{ transcript }]
    }
  };
}

class MockSocket extends EventEmitter {
  constructor(url, opts) {
    super();
    this.url = url;
    this.opts = opts || {};
    this.readyState = 1;
    this.sent = [];
    MockSocket.instances.push(this);
    setImmediate(() => this.emit('open'));
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  mockMessage(obj) {
    this.emit('message', JSON.stringify(obj));
  }
}
MockSocket.instances = [];

async function main() {
  const url = buildListenUrl();
  check('live URL uses nova-3', url.includes('model=nova-3'));
  check('live URL is English', url.includes('language=en'));
  check('live URL punctuates', url.includes('punctuate=true'));
  check('live URL requests interims', url.includes('interim_results=true'));
  check('live URL smart_format', url.includes('smart_format=true'));
  check('live URL endpointing 800', url.includes('endpointing=800'));
  check('live URL utterance_end_ms 1200', url.includes('utterance_end_ms=1200'));
  check('live URL linear16 16k', url.includes('encoding=linear16') && url.includes('sample_rate=16000'));
  check(
    'live URL has Kafka / Kubernetes / HPA / microservices keyterms',
    DEFAULT_KEYTERMS.every((term) => url.includes(`keyterm=${encodeURIComponent(term)}`)),
    DEFAULT_KEYTERMS.join(',')
  );
  check('live URL does not embed a token', !/token=/i.test(url));

  const restUrl = buildPrerecordedUrl();
  check('prerecorded URL keeps keyterms', restUrl.includes('keyterm=Kafka') && restUrl.includes('keyterm=Kubernetes'));

  const spaceLine = formatSpaceLogLine({
    source: 'loopback',
    provider: 'deepgram',
    bufferMs: 1840,
    rms: 0.0412,
    transcript: 'Tell me about yourself.'
  });
  check(
    'Space log line shape',
    spaceLine === 'source=loopback provider=deepgram bufferMs=1840 rms=0.0412 transcript=Tell me about yourself.'
  );

  speechService.runtimeSettings.deepgramKey = 'dg-test-key';
  speechService.WebSocketImpl = MockSocket;
  speechService._deepgramFetchImpl = async () => ({
    json: async () => ({
      results: {
        channels: [{ alternatives: [{ transcript: 'Tell me about Kafka and Kubernetes' }] }]
      }
    })
  });
  speechService.setInterviewCapture(true);
  speechService.available = true;
  speechService.isRecording = true;
  speechService._deepgramActive = true;
  speechService.useRendererCapture = true;
  speechService._gotLoopbackAudio = true;
  speechService._lastLoopbackRms = 0.05;
  speechService._lastChunkSource = 'loopback';
  speechService._audioCaptureSource = 'loopback';
  speechService._deepgramCaptionsPaused = false;
  speechService.clearInterviewTurn();

  let caption = '';
  const onInterim = (text) => { caption = String(text || ''); };
  speechService.on('interim-transcription', onInterim);

  const chunk = makePcm(40);
  for (let i = 0; i < 20; i += 1) {
    speechService.handleAudioChunkFromRenderer(chunk, 'loopback');
  }

  speechService._handleDeepgramMessage(deepgramResult('Tell me.'));
  const captionSession = new InterviewSession();
  captionSession.enable();
  captionSession.setInterim(caption);
  check('caption can be incomplete Tell me.', caption === 'Tell me.' && captionSession.displayText() === 'Tell me.');

  speechService._handleDeepgramMessage(deepgramResult('Tell me about yourself.', { isFinal: true }));
  check('turn final is the complete question', speechService.getInterviewTurnFinalText() === 'Tell me about yourself.');
  check('final does not overwrite the caption path', caption === 'Tell me.');

  speechService._deepgramSpaceSilenceMs = 50;
  speechService._deepgramSpaceMaxWaitMs = 80;
  const finalized = await speechService.finalizeInterviewTurn({ waitTrailingSilence: false });
  check('Space does not send the caption string', finalized.text !== captionSession.displayText());
  check('Space payload is the Deepgram turn final', finalized.text === 'Tell me about yourself.', finalized.text);
  check('never flagged as caption text', finalized.usedCaption === false);
  check('mic remains active after Space', speechService.isRecording === true && finalized.micStillRecording === true);
  check('source is loopback', finalized.source === 'loopback');
  check('RMS is above the silent-loopback gate', finalized.rms > LOOPBACK_MIN_RMS);
  check(
    'Space log uses loopback/deepgram',
    typeof finalized.spaceLog === 'string'
      && finalized.spaceLog.startsWith('source=loopback provider=deepgram bufferMs=')
      && finalized.spaceLog.includes('transcript=Tell me about yourself.')
  );

  speechService._deepgramCaptionsPaused = false;
  speechService._turnFinalText = 'Tell me about yourself.';
  speechService._gotLoopbackAudio = true;
  speechService._lastLoopbackRms = 0.2;
  speechService._turnBuffer.begin(Date.now());
  speechService._turnBuffer.push(makePcm(400), { now: Date.now(), voiced: true });
  speechService.isRecording = true;
  speechService._deepgramSpaceSilenceMs = 40;
  speechService._deepgramSpaceMaxWaitMs = 120;
  const startedWait = Date.now();
  const duringSpeech = await speechService.finalizeInterviewTurn({ waitTrailingSilence: true });
  const waited = Date.now() - startedWait;
  check('Space during speech still submits a complete-ish turn', duringSpeech.text === 'Tell me about yourself.');
  check('silence wait is bounded', waited >= 80 && waited < 1500, `waited=${waited}ms`);
  check('recording flag remains active after waited Space', duringSpeech.micStillRecording === true);

  speechService.isRecording = true;
  speechService._deepgramActive = true;
  speechService._gotLoopbackAudio = true;
  speechService._lastLoopbackRms = 0.05;
  speechService._turnFinalText = 'next question about HPA';
  speechService._captionInterim = 'Tell me.';
  speechService._turnBuffer.begin(Date.now());
  speechService._turnBuffer.push(makePcm(200), { now: Date.now(), voiced: true });
  speechService.clearInterviewTurn();
  const cleared = speechService.getInterviewTurnSnapshot();
  check('Esc clears only the current turn', cleared.durationMs === 0 && cleared.startedAt === 0);
  check('Esc clears turn finals', speechService.getInterviewTurnFinalText() === '');
  check('Esc keeps the mic', speechService.isRecording === true);

  speechService._deepgramCaptionsPaused = false;
  speechService._gotLoopbackAudio = true;
  speechService._lastChunkSource = 'loopback';
  speechService.isRecording = true;
  speechService._turnFinalText = '';
  speechService._turnBuffer.begin(Date.now());
  speechService._turnBuffer.push(makePcm(500), { now: Date.now(), voiced: true });
  const fallback = await speechService.finalizeInterviewTurn({ waitTrailingSilence: false });
  check(
    'empty finals fall back to prerecorded PCM, not caption text',
    fallback.text === 'Tell me about Kafka and Kubernetes' && fallback.usedCaption === false,
    fallback.text
  );
  check('Kafka / Kubernetes survive the fixture path', /kafka/i.test(fallback.text) && /kubernetes/i.test(fallback.text));

  speechService._deepgramCaptionsPaused = false;
  speechService._gotLoopbackAudio = false;
  speechService._lastChunkSource = 'mic';
  speechService._turnFinalText = 'should not send mic audio';
  speechService._turnBuffer.begin(Date.now());
  speechService._turnBuffer.push(makePcm(300), { now: Date.now(), voiced: true });
  const micBlocked = await speechService.finalizeInterviewTurn({ waitTrailingSilence: false });
  check('mic capture does not send anything to Gemini', micBlocked.text === '' && micBlocked.blocked === true);
  check('mic block log names source=mic', micBlocked.spaceLog.startsWith('source=mic provider=deepgram'));

  speechService._deepgramCaptionsPaused = false;
  speechService._gotLoopbackAudio = true;
  speechService._lastChunkSource = 'loopback';
  speechService._turnFinalText = 'hallucinated on silence';
  speechService._turnBuffer.begin(Date.now());
  speechService._turnBuffer.push(makeSilence(400), { now: Date.now(), voiced: false });
  speechService._lastLoopbackRms = 0;
  const silent = await speechService.finalizeInterviewTurn({ waitTrailingSilence: false });
  check('silent loopback does not send to Gemini', silent.text === '' && silent.blocked === true);
  check('silent log keeps source=loopback with empty transcript', /source=loopback/.test(silent.spaceLog) && /transcript=$/.test(silent.spaceLog));

  MockSocket.instances = [];
  speechService._deepgramActive = false;
  speechService.isRecording = false;
  speechService.setInterviewCapture(true);
  speechService.available = true;
  speechService.startRecording();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const sock = MockSocket.instances[0];
  check('Interview Mode opens a Deepgram socket', !!sock);
  check('socket URL has keyterms', !!(sock && DEFAULT_KEYTERMS.every((term) => sock.url.includes(term))));
  check('socket auth uses Token header without putting the key in the URL', !!(sock && sock.opts.headers && /^Token\s+\S+/.test(sock.opts.headers.Authorization) && !/dg-test-key/.test(sock.url)));
  speechService.handleAudioChunkFromRenderer(makePcm(60), 'loopback');
  check('loopback PCM is streamed to Deepgram', !!(sock && sock.sent.some((item) => Buffer.isBuffer(item) && item.length > 0)));
  speechService.handleAudioChunkFromRenderer(makePcm(60), 'mic');
  const sentAfterMic = sock ? sock.sent.length : 0;
  speechService.handleAudioChunkFromRenderer(makePcm(60), 'mic');
  check('mic PCM is not streamed while Interview Mode wants loopback', sock && sock.sent.length === sentAfterMic);

  sock.mockMessage(deepgramResult('Tell me about', { isFinal: false }));
  sock.mockMessage(deepgramResult('Tell me about Kafka.', { isFinal: true }));
  check('mocked interims vs finals stay on two paths', speechService.getInterviewTurnFinalText().includes('Kafka') && caption !== speechService.getInterviewTurnFinalText());

  const stillRecording = speechService.isRecording;
  const afterSubmit = await speechService.finalizeInterviewTurn({ waitTrailingSilence: false });
  check('socket stays up after Space', speechService.isRecording === true && stillRecording === true && afterSubmit.micStillRecording === true);
  check('usesTurnFinalSubmit is on for Deepgram interview', speechService.usesTurnFinalSubmit() === true);

  speechService.removeListener('interim-transcription', onInterim);
  try { speechService.shutdown(); } catch (_) {}

  const failed = cases.filter((ok) => !ok).length;
  console.log('');
  if (failed) {
    console.log(`${failed} of ${cases.length} failed`);
    process.exit(1);
  }
  console.log(`All ${cases.length} cases passed`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error && error.message);
  try { speechService.shutdown(); } catch (_) {}
  process.exit(1);
});
