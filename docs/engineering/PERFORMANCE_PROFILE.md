# Static Performance Profile

## Likely hot paths to measure first

1. **WindowManager enforcement:** recurring 3-second timers are installed per window, alongside delayed focus/show/blur enforcement. Measure idle wakeups and verify interval cleanup.
2. **Audio path:** renderer `ScriptProcessor` callbacks serialize PCM to main through IPC. Measure chunks/second, bytes/second, queue length, and main-process processing time.
3. **Speech segmentation:** VAD/segment timers determine when transcription reaches the LLM. Measure voice-end to final transcript separately from model latency.
4. **LLM streaming:** request construction includes system prompt, role preferences, and bounded history; chunk rendering is throttled to roughly 33 ms. Measure prompt characters, first token, completion, and renderer paint.
5. **Window resize/reposition:** streaming answers may drive resize operations. Measure resize count per response and coalesce updates if needed.

## Existing positive controls

- Gemini client is reused and uses a keep-alive HTTPS agent.
- Definition-style responses can be cached with a bounded 100-entry, 10-minute cache.
- Streaming deltas are throttled before renderer delivery.
- Voice interview history is bounded more tightly than general history.

## Do not optimize before measuring

- Replacing Azure Speech or Gemini model/provider.
- Adding worker threads.
- Compressing IPC payloads.
- Removing renderer audio processing.

Each has functional or latency trade-offs and needs evidence from the benchmark plan.
