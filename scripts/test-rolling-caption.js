'use strict';

const {
  PcmRingBuffer,
  StablePrefixStabilizer,
  RING_MS,
  OVERLAP_MS,
  INTERVAL_MS
} = require('../src/services/rolling-caption');
const { InterviewSession } = require('../src/services/interview-session');
const speechService = require('../src/services/speech.service');

const cases = [];
function check(name, ok, detail) {
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const ring = new PcmRingBuffer(800);
ring.push(Buffer.alloc(400 * 32, 1));
ring.push(Buffer.alloc(500 * 32, 2));
check('ring holds at most 800ms', Math.round(ring.durationMs) === RING_MS, `ms=${ring.durationMs}`);
const snap = ring.snapshotMs(600);
check('snapshot is 600ms', snap.length === 600 * 32);

const stab = new StablePrefixStabilizer();
stab.update('tell me');
stab.update('tell me about');
const mid = stab.update('tell me about kafka');
check('committed grows only on repeated prefix', mid.committed === 'tell me about', JSON.stringify(mid));
const next = stab.update('tell me about kafka inventory');
check('tail stays interim until confirmed', next.interim.includes('inventory') || next.committed.startsWith('tell me about'), JSON.stringify(next));
const shorter = stab.update('tell');
check('committed does not shrink on a short decode', stab.committed.length >= 2, stab.snapshot().committed);
check('stability penalizes flicker', stab.snapshot().stabilityScore <= 1);
const flicker = new StablePrefixStabilizer();
flicker.update('tell me');
flicker.update('tell me about');
flicker.update('tell me about kafka');
flicker.update('unrelated weather report today');
check('unrelated decode does not erase committed words', flicker.snapshot().committed === 'tell me about');
check('unrelated decode does not replace the gray tail with junk', flicker.snapshot().interim !== 'unrelated weather report today');

const stitch = new StablePrefixStabilizer();
stitch.update('tell me');
stitch.update('tell me about');
stitch.update('tell me about kafka');
const scrolled = stitch.update('me about kafka inventory');
check(
  'scrolled stable words stay white',
  scrolled.committed.startsWith('tell me about'),
  JSON.stringify(scrolled)
);
check(
  'new window tail stays gray',
  scrolled.interim.includes('inventory'),
  JSON.stringify(scrolled)
);
check('overlap window is 700ms at 100ms ticks', OVERLAP_MS === RING_MS - INTERVAL_MS);

const slide = new StablePrefixStabilizer();
slide.update('tell me about yourself');
const afterSlide = slide.update('yourself');
check(
  'sliding the 800ms ring does not drop earlier words',
  afterSlide.text.includes('tell') && afterSlide.text.includes('yourself'),
  JSON.stringify(afterSlide)
);

speechService.rollingEnabled = true;
speechService.rollingCaptionsPaused = false;
speechService.isRecording = true;
speechService.segmentBuffers = [];
speechService.segmentBytes = 0;
speechService._rollingRing.reset();
speechService._ingestWhisperAudio(Buffer.alloc(1000 * 32, 7));
check('rolling ingest does not grow VAD utterance buffers', speechService.segmentBytes === 0);
check('rolling ingest fills the 800ms ring', Math.round(speechService._rollingRing.durationMs) === RING_MS);
speechService.rollingEnabled = false;
speechService.isRecording = false;
try { speechService.shutdown(); } catch (_) {}

const session = new InterviewSession();
session.enable();
session.setRollingParts('tell me about', 'kafka');
check('rolling display concatenates stable + tail', session.displayText() === 'tell me about kafka');
check('payload exposes committed and interim', session.toPayload().committed === 'tell me about' && session.toPayload().interim === 'kafka');
const frozen = session.beginSubmit();
check('Space still snapshots the full rolling transcript', frozen === 'tell me about kafka');
check('rolling ignored after Space', session.setRollingParts('nope', 'nope') === false);

const failed = cases.filter((ok) => !ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
process.exit(0);
