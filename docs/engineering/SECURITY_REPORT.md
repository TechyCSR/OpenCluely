# Security Review

## Verified controls

- Browser windows use `nodeIntegration: false` and `contextIsolation: true`.
- External web navigation is routed to the system browser and popup creation is denied.
- API keys are stored locally and logger redaction covers common key/token fields.
- Candidate and target-job text is labeled as reference data in the model prompt, mitigating instruction injection from pasted material.
- V3 hardening disables DevTools in packaged windows.

## Findings

| Priority | Finding | Impact | Remediation |
|---|---|---|---|
| High | Content Security Policy is not visibly defined in local HTML pages | A future script injection bug has wider renderer impact | Add restrictive CSP (`default-src 'self'`; explicit style/font/image allowances) and remove unsafe inline script/style gradually. |
| High | IPC validation and sender authorization are incomplete | A compromised renderer may request privileged main actions | Add typed handler wrappers and per-window authorization. |
| Medium | Secrets are persisted in a local `.env` plaintext file | Local account compromise exposes API keys | Document OS account protection; migrate secrets to Keychain/Credential Manager for packaged builds. |
| Medium | Global error handling retains process after fatal errors | Security-sensitive partial failures can leave an unknown state | Mark health degraded and restart or disable the failing subsystem. |
| Medium | No signed/notarized macOS distribution pipeline | Users cannot establish binary provenance | Add code signing and notarization before public production release. |
| Low | Some legacy naming/configuration still refers to stealth behavior | It conflicts with the authorised-preparation product boundary | Remove or rename legacy implementation and documentation in a dedicated compatibility review. |

## Security release gate

Before a public non-beta release: zero known high-severity dependency advisories; IPC schema tests pass; CSP is enabled; packaged DevTools remain disabled; secret redaction tests pass; and signed distribution is configured.
