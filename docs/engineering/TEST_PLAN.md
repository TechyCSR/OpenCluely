# V3 Beta Test Plan

## Test layers

| Layer | Scope | Initial target |
|---|---|---|
| Unit | skill catalogue, prompt loader, profile normalization, cache keys, metrics aggregation, IPC validators | 80% of pure modules |
| Integration | settings persistence, Gemini request construction, session bounds, capture fallback selection | Critical-path coverage |
| Electron smoke | app startup, window load, settings open/close, chat send, mic start/stop | macOS Intel and Apple Silicon |
| Manual provider | Azure valid/invalid key, Gemini valid/invalid key, network loss | Every beta candidate |
| Stress | repeated window lifecycle, simulated audio chunks, cache pressure, request cancellation | 1 hour before release |

## Regression scenarios

1. Start with no keys: onboarding/settings remains usable and no crash occurs.
2. Save role, response mode, language, candidate profile, and target job; restart and verify each persists.
3. Switch every catalogue category and send a text question.
4. Start/stop microphone repeatedly; verify no duplicate transcript and no growing listener count.
5. Trigger screenshot capture with permission granted and denied; verify actionable UI error.
6. Simulate Gemini timeout, quota error, invalid key, and offline network; verify one useful message and recovery on next request.
7. Open/close Chat and Settings 100 times; record process memory before and after.

## Coverage statement

Current automated coverage: not established; no test runner is configured. A numeric coverage target is therefore not yet meaningful. Add the test framework and report line/branch/function coverage from CI rather than asserting 90% without evidence.
