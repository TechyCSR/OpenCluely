'use strict';

const { InterviewPerfTrace } = require('../src/services/perf-trace');

const tracer = new InterviewPerfTrace();
if (process.env.OPENCLUELY_PERF_DIR) {
  tracer.setDir(process.env.OPENCLUELY_PERF_DIR);
}

const samples = [
  {
    ts: '2026-08-17T10:00:00.000Z',
    firstCaptionMs: 1045,
    decodeMs: 912,
    firstTokenMs: 2234,
    nodeRssMb: 81,
    workerRssMb: 480,
    cpuMs: 180,
    transcriptLength: 64,
    provider: 'whisper',
    whisperModel: 'tiny',
    workerWarm: false
  },
  {
    ts: '2026-08-17T10:02:00.000Z',
    firstCaptionMs: 890,
    decodeMs: 840,
    firstTokenMs: 1980,
    nodeRssMb: 83,
    workerRssMb: 478,
    cpuMs: 150,
    transcriptLength: 71,
    provider: 'whisper',
    whisperModel: 'tiny',
    workerWarm: true
  },
  {
    ts: '2026-08-17T10:04:00.000Z',
    firstCaptionMs: 1210,
    decodeMs: 1010,
    firstTokenMs: 2510,
    nodeRssMb: 84,
    workerRssMb: 482,
    cpuMs: 210,
    transcriptLength: 88,
    provider: 'whisper',
    whisperModel: 'tiny',
    workerWarm: true
  }
];

const files = samples.map((sample) => tracer.writeRecord(sample));
console.log(`wrote ${samples.length} sample turns`);
console.log(`file: ${files[files.length - 1]}`);
