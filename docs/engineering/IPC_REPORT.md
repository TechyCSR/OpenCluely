# IPC Review

## Current design

`preload.js` uses `contextBridge` and does not expose Node integration. The primary API uses named `invoke`/`send` functions, and the legacy `api` bridge applies a small channel allowlist. Main-process handlers cover capture, speech, settings, logs, diagnostics, windows, session history, model diagnostics, and installer actions.

## Risks and actions

| Priority | Risk | Recommended change |
|---|---|---|
| High | A renderer can invoke many privileged actions without a central sender check | Introduce `assertKnownRenderer(event, allowedWindowTypes)` before sensitive handlers. |
| High | Arbitrary-size buffers can be sent through `audio-chunk` | Enforce a maximum chunk byte size and drop malformed/non-binary payloads before `Buffer.from`. |
| Medium | Window move/resize and capture-area inputs are renderer-controlled | Validate finite numbers, bounds, display ids, and maximum capture dimensions in main. |
| Medium | Many event subscription helpers lack unsubscribe support | Every `on…` preload method should return a removal function, as `onInstallProgress` already does. |
| Low | Duplicate `send` and `invoke` variants blur request semantics | Standardize on `invoke` for request-response and events for streams; remove legacy handlers in a compatibility release. |

## Payload policy for V3

- Strings: normalize and cap size before service calls.
- Audio: fixed maximum frame size and sampling metadata, no unbounded queue.
- Images: enforce image byte/pixel caps before LLM submission.
- Settings: allow only known keys and typed ranges.
- Logs: redact secrets and user-content by default.

## Acceptance tests

1. Unknown renderer/window cannot invoke privileged handlers.
2. Oversize audio/image/settings payload returns a structured error without process memory growth.
3. Reopening Chat or Settings 100 times does not grow listener count.
4. Streamed LLM chunks remain ordered and stop after a request is cancelled.
