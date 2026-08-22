'use strict';

const { summarize, defaultPerfDir } = require('../src/services/perf-trace');

function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

const dir = process.env.OPENCLUELY_PERF_DIR || defaultPerfDir();
const stats = summarize(dir);

console.log(`OpenCluely performance summary`);
console.log(`dir: ${dir}`);
console.log(`turns: ${stats.turns}   files: ${stats.files}`);
console.log('');
console.log(`first caption   avg ${fmt(stats.avgFirstCaptionMs)} ms    p95 ${fmt(stats.p95FirstCaptionMs)} ms`);
console.log(`decode          avg ${fmt(stats.avgDecodeMs)} ms    p95 ${fmt(stats.p95DecodeMs)} ms`);
console.log(`first token     avg ${fmt(stats.avgFirstTokenMs)} ms    p95 ${fmt(stats.p95FirstTokenMs)} ms`);
console.log(`RAM             node ${fmt(stats.avgNodeRssMb, 1)} MB    worker ${fmt(stats.avgWorkerRssMb, 1)} MB`);
console.log(`worker          warm ${stats.warmTurns}    cold ${stats.coldTurns}`);
console.log(`first caption   warm avg ${fmt(stats.avgWarmFirstCaptionMs)} ms    cold avg ${fmt(stats.avgColdFirstCaptionMs)} ms`);
if (stats.avgDroppedUpdates != null) {
  console.log(`rolling         dropped avg ${fmt(stats.avgDroppedUpdates, 1)}    updates/sec ${fmt(stats.avgInterimUpdatesPerSec, 2)}`);
}
if (stats.avgCommittedWords != null) {
  console.log(`transcript      committedWords avg ${fmt(stats.avgCommittedWords, 1)}    rollback avg ${fmt(stats.avgRollbackCount, 2)}`);
}

if (!stats.turns) {
  process.exitCode = 0;
}
