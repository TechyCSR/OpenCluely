# Master Optimization Roadmap

## Phase A — Stabilize the execution boundary (High, 1–2 weeks)

1. Centralize window scheduler and clear all intervals/listeners on close.
2. Add IPC schemas, sender authorization, audio/image limits, and unsubscribe-capable renderer listeners.
3. Replace global “keep alive” fatal handlers with subsystem health/degraded-state recovery.
4. Add startup, shutdown, process-resource, and per-window timing spans.

Expected outcome: fewer hangs, lower idle wakeups, bounded resource lifecycle, and actionable failures.

## Phase B — Establish measurable quality (High, 1–2 weeks)

1. Add a Node test runner for pure modules and an Electron smoke test runner.
2. Build repeatable cold/warm startup, voice, LLM, UI, memory, and CPU benchmarks.
3. Add one-hour stress automation: window cycles, mock stream chunks, API errors, and cancellation.
4. Run `npm audit` and create a dependency-update policy.

Expected outcome: a defensible performance baseline and regressions caught before packaging.

## Phase C — Reduce end-to-end latency (Medium, 1–2 weeks)

1. Use persisted metrics to identify the dominant latency segment; do not optimize blind.
2. Lazily load non-active skill prompts and reduce session initialization work.
3. Keep current Gemini streaming and cache; add cancellation/timeout propagation.
4. Batch renderer updates to animation frames and verify no extra resize/repaint cycles.

Expected outcome: faster first visible answer and fewer unnecessary CPU wakeups.

## Phase D — Security and distribution (Medium, 1–3 weeks)

1. Add CSP and remove unsafe inline execution progressively.
2. Move packaged API secrets to OS credential storage.
3. Sign/notarize macOS builds; add artifact provenance and release checklist.
4. Remove remaining legacy stealth terminology/paths during a compatibility review.

## Phase E — Long-running reliability (Low, ongoing)

1. Execute 6-, 12-, and 24-hour provider-aware soak tests.
2. Alert on heap/RSS slope, listener counts, audio context counts, error rate, and request queue depth.
3. Establish performance budgets in CI from Phase B baselines.

## Prioritization principle

Do not add more features until Phase A and Phase B have an automated safety net. Optimizations must be driven by measured p50/p95 latency and resource data, not single-run impressions.
