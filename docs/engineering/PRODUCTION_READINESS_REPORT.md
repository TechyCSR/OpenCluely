# Production Readiness Report

## Status: beta, not production-ready

The app has working foundations—renderer isolation, local settings, reusable Gemini client, bounded LLM cache, streaming, rotated/redacted logs, and explicit speech cleanup—but it lacks the evidence and hardening required for a production release.

## Release gates

| Gate | Status | Requirement |
|---|---|---|
| Static syntax checks | Passing | Run before every commit. |
| Unit/integration test suite | Missing | Add CI and baseline coverage. |
| End-to-end smoke test | Manual only | Automate core Electron launch/window/settings flows. |
| 1-hour stress test | Missing | No crashes, bounded memory, no listener growth. |
| 8-hour soak test | Missing | Required before stable release. |
| Security IPC/CSP hardening | Incomplete | Resolve high findings in security report. |
| Dependency vulnerability scan | Not measured | Run `npm audit` in a networked CI environment. |
| macOS signing/notarization | Missing | Required for public production distribution. |
| Crash recovery policy | Incomplete | Implement degraded-state recovery and safe restart. |

## Safe beta operating model

- Run locally with `npm start` during validation.
- Use for authorised preparation and development only.
- Treat Gemini/Azure network failures as recoverable feature failures, not application failures.
- Do not create a public release until the gates above have recorded evidence.
