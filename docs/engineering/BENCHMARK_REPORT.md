# Benchmark Baseline and Measurement Plan

## Current evidence

Existing `PerformanceMetrics` records a rolling in-memory sample of 100 named duration entries. LLM streaming already records first-token and total-response timings; speech and answer pipeline metrics are emitted by the current services. The sample is useful for a live diagnostic snapshot but is not a durable benchmark database.

No controlled cold/warm startup, CPU, memory, FPS, disk-I/O, or long-run results were available in this workspace. Values must not be inferred from code or earlier interactive runs.

## Required benchmark matrix

| Area | Metric | Instrumentation point | Target |
|---|---|---|---|
| Startup | process start to ready overlay | before `app.whenReady`, after main window ready | Baseline first; reduce by 20% |
| Speech | mic request to recognizer ready | UI click, `SpeechService` ready event | Baseline first |
| Speech | utterance end to final transcript | Azure/Whisper segment finalization | Baseline first |
| LLM | request build, first token, completion | existing stream spans plus request id | First useful answer under 3 s where network/model allow |
| UI | first streamed chunk to visible paint | renderer `requestAnimationFrame` after update | Under 100 ms |
| Memory | main/renderer RSS, heap used | `process.getProcessMemoryInfo`, `webContents.getProcessMemoryInfo` | No monotonic growth in 8-hour run |
| CPU | idle, recording, streaming | OS sampler with process PID | Idle under 2%; recording under 10%, hardware dependent |
| IPC | count, bytes, handler duration | wrapper around IPC dispatch | No repeated high-frequency payloads |

## Benchmark protocol

1. Use one macOS Intel machine and record OS version, Electron version, network type, model, and provider.
2. Run 10 cold starts and 10 warm starts; report median, p95, and max.
3. Run 30 short technical questions and 10 screenshot requests, with response mode and model recorded.
4. Run a 60-minute voice session with representative pauses and record memory every minute.
5. Repeat after each change with the same setup. Compare median and p95, not a single best result.

## Immediate instrumentation backlog

1. Persist metrics to an opt-in local JSONL diagnostic file with redaction.
2. Add startup spans and per-window `did-finish-load` timings.
3. Add resource snapshots every 60 seconds only while diagnostics are enabled.
4. Include request id, active skill, model, output mode, and cache-hit flag; never include API keys, candidate profile, transcript, screenshot, or generated answer text.
