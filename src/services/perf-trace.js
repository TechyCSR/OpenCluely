'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAX_FILES = 20;

function defaultPerfDir() {
  return process.env.OPENCLUELY_PERF_DIR || path.join(os.homedir(), '.OpenCluely', 'perf');
}

function delta(later, earlier) {
  if (!later || !earlier) return null;
  return Math.max(0, later - earlier);
}

function sampleRssMb(pid) {
  if (!pid) return null;
  try {
    if (process.platform === 'win32') {
      const script = `$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; if ($p) { [math]::Round($p.WorkingSet64 / 1MB, 1) }`;
      const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 2500
      });
      const value = Number(String(result.stdout || '').trim());
      return Number.isFinite(value) ? value : null;
    }
    const statusPath = `/proc/${pid}/status`;
    if (fs.existsSync(statusPath)) {
      const text = fs.readFileSync(statusPath, 'utf8');
      const match = text.match(/^VmRSS:\s+(\d+)\s+kB/m);
      if (match) return Math.round(Number(match[1]) / 102.4) / 10;
    }
  } catch (_) {}
  return null;
}

class InterviewPerfTrace {
  constructor() {
    this.dir = defaultPerfDir();
    this.session = null;
    this.turn = null;
  }

  setDir(dir) {
    this.dir = dir || defaultPerfDir();
  }

  interviewEnabled(meta = {}) {
    this.session = {
      enabledAt: Date.now(),
      provider: meta.provider || null,
      whisperModel: meta.whisperModel || null
    };
    this.beginTurn(meta);
    this.mark('interviewEnabled');
  }

  interviewDisabled() {
    this.session = null;
    this.turn = null;
  }

  beginTurn(meta = {}) {
    this.turn = {
      t0: Date.now(),
      cpuStart: process.cpuUsage(),
      marks: {},
      meta: { ...meta }
    };
  }

  mark(name) {
    if (!this.turn) this.beginTurn();
    if (this.turn.marks[name] == null) {
      this.turn.marks[name] = Date.now();
    }
    return this.turn.marks[name];
  }

  setMeta(partial = {}) {
    if (!this.turn) this.beginTurn();
    Object.assign(this.turn.meta, partial);
  }

  buildRecord() {
    if (!this.turn) return null;
    const marks = this.turn.marks;
    const meta = this.turn.meta;
    const vadOrAudio = marks.vadSpeechStart || marks.firstAudio || marks.interviewEnabled || this.turn.t0;
    const spaceOrRequest = marks.space || marks.geminiRequest || this.turn.t0;
    const cpu = process.cpuUsage(this.turn.cpuStart);
    return {
      ts: new Date().toISOString(),
      interviewEnabledAt: marks.interviewEnabled || (this.session && this.session.enabledAt) || null,
      firstAudioMs: delta(marks.firstAudio, marks.interviewEnabled || this.turn.t0),
      vadSpeechStartMs: delta(marks.vadSpeechStart, marks.firstAudio || marks.interviewEnabled || this.turn.t0),
      firstCaptionMs: delta(marks.firstCaption, vadOrAudio),
      finalTranscriptMs: delta(marks.finalTranscript, vadOrAudio),
      spaceMs: delta(marks.space, marks.interviewEnabled || this.turn.t0),
      geminiRequestMs: delta(marks.geminiRequest, marks.space || this.turn.t0),
      firstTokenMs: delta(marks.firstToken, spaceOrRequest),
      answerCompleteMs: delta(marks.answerComplete, marks.geminiRequest || spaceOrRequest),
      decodeMs: meta.decodeMs != null ? meta.decodeMs : null,
      nodeRssMb: Math.round(process.memoryUsage().rss / 1048576),
      workerRssMb: meta.workerRssMb != null ? meta.workerRssMb : null,
      cpuMs: Math.round((cpu.user + cpu.system) / 1000),
      transcriptLength: meta.transcriptLength != null ? meta.transcriptLength : null,
      provider: meta.provider || (this.session && this.session.provider) || null,
      whisperModel: meta.whisperModel || (this.session && this.session.whisperModel) || null,
      workerWarm: meta.workerWarm == null ? null : !!meta.workerWarm,
      rollingIntervalMs: meta.rollingIntervalMs != null ? meta.rollingIntervalMs : null,
      ringBufferMs: meta.ringBufferMs != null ? meta.ringBufferMs : null,
      overlapMs: meta.overlapMs != null ? meta.overlapMs : null,
      stablePrefixLength: meta.stablePrefixLength != null ? meta.stablePrefixLength : null,
      interimUpdatesPerSec: meta.interimUpdatesPerSec != null
        ? Number(meta.interimUpdatesPerSec.toFixed ? meta.interimUpdatesPerSec.toFixed(2) : meta.interimUpdatesPerSec)
        : null,
      droppedUpdates: meta.droppedUpdates != null ? meta.droppedUpdates : null,
      committedWords: meta.committedWords != null ? meta.committedWords : null,
      interimWords: meta.interimWords != null ? meta.interimWords : null,
      rollbackCount: meta.rollbackCount != null ? meta.rollbackCount : null,
      submittedText: meta.submittedText != null ? String(meta.submittedText) : null
    };
  }

  finishTurn() {
    const record = this.buildRecord();
    if (!record) return null;
    this.writeRecord(record);
    this.beginTurn({
      provider: record.provider,
      whisperModel: record.whisperModel,
      workerWarm: true
    });
    return record;
  }

  writeRecord(record) {
    const dir = this.dir;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `perf-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
    this.prune(dir);
    return file;
  }

  prune(dir = this.dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir)
      .filter((name) => /^perf-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .map((name) => ({
        name,
        full: path.join(dir, name),
        mtime: fs.statSync(path.join(dir, name)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(MAX_FILES).forEach((item) => {
      try { fs.unlinkSync(item.full); } catch (_) {}
    });
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readRecords(dir = defaultPerfDir()) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((name) => /^perf-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();
  const rows = [];
  for (const name of files) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch (_) {}
    }
  }
  return rows;
}

function summarize(dir = defaultPerfDir()) {
  const rows = readRecords(dir);
  const pick = (key) => rows.map((row) => row[key]).filter((value) => typeof value === 'number');
  const firstCaption = pick('firstCaptionMs').sort((a, b) => a - b);
  const decode = pick('decodeMs').sort((a, b) => a - b);
  const firstToken = pick('firstTokenMs').sort((a, b) => a - b);
  const ram = pick('nodeRssMb');
  const workerRam = pick('workerRssMb');
  const warm = rows.filter((row) => row.workerWarm === true);
  const cold = rows.filter((row) => row.workerWarm === false);
  return {
    turns: rows.length,
    files: fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => /^perf-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).length
      : 0,
    avgFirstCaptionMs: average(firstCaption),
    p95FirstCaptionMs: percentile(firstCaption, 95),
    avgDecodeMs: average(decode),
    p95DecodeMs: percentile(decode, 95),
    avgFirstTokenMs: average(firstToken),
    p95FirstTokenMs: percentile(firstToken, 95),
    avgNodeRssMb: average(ram),
    avgWorkerRssMb: average(workerRam),
    warmTurns: warm.length,
    coldTurns: cold.length,
    avgWarmFirstCaptionMs: average(warm.map((row) => row.firstCaptionMs).filter((value) => typeof value === 'number')),
    avgColdFirstCaptionMs: average(cold.map((row) => row.firstCaptionMs).filter((value) => typeof value === 'number')),
    avgDroppedUpdates: average(pick('droppedUpdates')),
    avgInterimUpdatesPerSec: average(pick('interimUpdatesPerSec')),
    avgCommittedWords: average(pick('committedWords')),
    avgInterimWords: average(pick('interimWords')),
    avgRollbackCount: average(pick('rollbackCount'))
  };
}

const perfTrace = new InterviewPerfTrace();

module.exports = {
  InterviewPerfTrace,
  perfTrace,
  defaultPerfDir,
  sampleRssMb,
  readRecords,
  summarize,
  MAX_FILES
};
