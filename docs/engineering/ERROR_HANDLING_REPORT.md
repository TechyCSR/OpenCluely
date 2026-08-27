# Error Handling and Recovery Review

## Current behavior

Gemini error messages are normalized for quota, network, and authentication cases. Speech errors are broadcast to renderers. Logs are rotated and exceptions/rejections are recorded. Several services contain local catch blocks and fallbacks.

## Gaps

| Priority | Gap | Recovery design |
|---|---|---|
| High | Process-level error handlers only log and continue | Mark app health degraded; stop the failing subsystem; offer a controlled restart; preserve redacted diagnostic id. |
| Medium | No unified request cancellation | Attach an abort controller to each capture/LLM request; cancel when a newer user request supersedes it or its window closes. |
| Medium | Retries are not consistently policy-driven | Retry only transient network errors with capped exponential backoff and jitter; never retry auth/invalid-request errors. |
| Medium | No circuit breaker for repeated provider failures | After a threshold, pause requests briefly and show provider-status recovery guidance. |
| Low | Fallback responses can hide repeated upstream failure | Include a non-sensitive diagnostic reference and error category in the UI. |

## Acceptance criteria

- A network outage does not crash the process, duplicate a request, or leave the loading state stuck.
- A speech failure releases stream/recognizer resources and allows a clean retry.
- A window close cancels its pending UI updates.
- Repeated fatal service failures lead to a recoverable health state, not silent continued execution.
