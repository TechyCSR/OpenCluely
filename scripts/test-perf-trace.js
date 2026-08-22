'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { InterviewPerfTrace, summarize, MAX_FILES } = require('../src/services/perf-trace');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-perf-'));
const tracer = new InterviewPerfTrace();
tracer.setDir(dir);

const cases = [];
function check(name, ok, detail) {
  cases.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

tracer.interviewEnabled({ provider: 'whisper', whisperModel: 'tiny', workerWarm: false });
tracer.mark('firstAudio');
tracer.mark('vadSpeechStart');
tracer.setMeta({ decodeMs: 900 });
tracer.mark('firstCaption');
tracer.mark('finalTranscript');
tracer.mark('space');
tracer.mark('geminiRequest');
tracer.mark('firstToken');
tracer.mark('answerComplete');
tracer.setMeta({
  transcriptLength: 40,
  workerWarm: true,
  workerRssMb: 400,
  rollingIntervalMs: 100,
  ringBufferMs: 800,
  overlapMs: 700,
  stablePrefixLength: 6,
  interimUpdatesPerSec: 4.2,
  droppedUpdates: 3,
  committedWords: 8,
  interimWords: 2,
  rollbackCount: 0,
  submittedText: 'tell me about yourself'
});
const rec = tracer.finishTurn();
check('turn writes firstCaptionMs', typeof rec.firstCaptionMs === 'number');
check('turn writes firstTokenMs', typeof rec.firstTokenMs === 'number');
check('turn writes provider', rec.provider === 'whisper');
check('turn writes rolling interval', rec.rollingIntervalMs === 100);
check('turn writes ring buffer size', rec.ringBufferMs === 800);
check('turn writes overlap size', rec.overlapMs === 700);
check('turn writes stable prefix length', rec.stablePrefixLength === 6);
check('turn writes interim updates/sec', rec.interimUpdatesPerSec === 4.2);
check('turn writes dropped updates', rec.droppedUpdates === 3);
check('turn writes committedWords', rec.committedWords === 8);
check('turn writes interimWords', rec.interimWords === 2);
check('turn writes rollbackCount', rec.rollbackCount === 0);
check('turn writes submittedText', rec.submittedText === 'tell me about yourself');

const file = path.join(dir, `perf-${new Date().toISOString().slice(0, 10)}.jsonl`);
check('daily jsonl exists', fs.existsSync(file));
const lines = fs.readFileSync(file, 'utf8').trim().split(/\n/);
check('one object per turn', lines.length === 1);

for (let i = 0; i < 3; i += 1) {
  tracer.writeRecord({
    firstCaptionMs: 1000 + i * 50,
    decodeMs: 900 + i * 20,
    firstTokenMs: 2000 + i * 100,
    nodeRssMb: 80,
    workerRssMb: 470,
    provider: 'whisper',
    workerWarm: i > 0
  });
}
const stats = summarize(dir);
check('summary counts turns', stats.turns === 4);
check('summary has averages', stats.avgFirstCaptionMs > 0 && stats.p95FirstTokenMs > 0);

for (let i = 0; i < MAX_FILES + 3; i += 1) {
  const stamp = `perf-1999-01-${String(i + 1).padStart(2, '0')}.jsonl`;
  fs.writeFileSync(path.join(dir, stamp), '{}\n');
}
const keep = path.join(dir, `perf-${new Date().toISOString().slice(0, 10)}.jsonl`);
const now = Date.now() / 1000;
fs.utimesSync(keep, now + 10, now + 10);
tracer.prune(dir);
const remaining = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
check('keeps at most 20 files', remaining.length <= MAX_FILES, `n=${remaining.length}`);
check('keeps the newest daily file', remaining.includes(path.basename(keep)));

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}

const failed = cases.filter((ok) => !ok).length;
console.log('');
if (failed) {
  console.log(`${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
