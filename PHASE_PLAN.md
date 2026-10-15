# OpenCluely — Stealth Hardening Phase Plan

**Author:** ThakorSachin72525  
**Goal:** Reduce the overlay detection surface that assessment/proctoring software exploits  
**Related:** [Issue #46 — overlay getting detected](https://github.com/TechyCSR/OpenCl/issues/46)

---

## Detection Surface Analysis

Assessment platforms use Win32 APIs (`EnumWindows`, `GetWindowThreadProcessId`,
`GetWindowLongPtr`) that see Electron's native window shell directly.
`setContentProtection` hides the overlay from conferencing apps but **not** from
in-process window enumeration.

### Current Electron fingerprints

| Signal | Current value | Detection category |
|---|---|---|
| Window class name | `ChromeNativeWindow` | Unknown process / Electron fingerprint |
| Transparency | `transparent: true` (all windows) | Layered/transparent window |
| Always-on-top | `alwaysOnTop: true` (all windows) | Topmost window |
| Window frame | `frame: false` | Borderless/fullscreen overlay |
| Executable | Unsigned Electron binary | Unsigned executable |
| Window titles | App name ("OpenCluely", "Chat", etc.) | Unexpected window title |
| Process name | `OpenCluely.exe` | Unknown process |

---

## Phase 1 — Configurable Transparency (THIS PHASE)

**Goal:** Make transparency opt-in instead of always-on.

### Changes

**1. `src/core/config.js`** — Add stealth config block

```javascript
stealth: {
  hideFromDock: true,
  noAttachConsole: true,
  disguiseProcess: true,
  transparentMode: false  // NEW: default opaque
}
```

**2. `src/managers/window.manager.js`** — Make `transparent` conditional

Replace every `transparent: true` with:
```javascript
transparent: config.get('stealth.transparentMode'),
```

**3. `src/ui/settings-window.js`** — Add UI toggle

Add a checkbox: "Enable transparent windows" bound to `stealth.transparentMode`.

### Files to modify

- `src/core/config.js`
- `src/managers/window.manager.js`
- `src/ui/settings-window.js`

### Testing

- `npm run dev` launches
- Default mode: windows are opaque (not see-through)
- Toggle in Settings → windows become transparent
- No regression in screen-share invisibility (`setContentProtection` unchanged)
- Chat, overlay, settings windows all render correctly

---

## Phase 2 — Custom Window Class Name

**Goal:** Replace Electron's `ChromeNativeWindow` class name with a benign one.

### Approach

Use a native IPC call from the renderer to main process, which calls
`SetWindowLongPtr(window.getNativeHandle(), GWL_WNDCLASS, ...)` to register
a fake class name like `SysParams`.

### Files

- `main.js` — Add IPC handler
- `src/managers/window.manager.js` — Call after window creation
- `preload.js` — Expose to renderer

---

## Phase 3 — Executable Signing + Rename

**Goal:** Remove "unsigned executable" and "OpenClvely.exe" fingerprints.

### Changes

- `package.json` — Change `productName` to something innocuous
- `package.json` build config — Set `sign: true` (currently `null`)
- Build pipeline — Add code signing step

---

## Phase 4 — Window Title Spoofing

**Goal:** Set window titles to match legitimate applications.

Already partially implemented via `updateAppName()`. Extend to set
individual window titles (e.g., settings window → "System Settings").

---

## Phase 5 — Future (native addon)

A native Windows addon (node-gyp / napi-rs) that creates the overlay window
outside Electron's window class entirely. Most effective but largest change.

---

## Ethical Note

These changes make OpenCluely harder to detect by proctoring software.
They are intended for **authorized use cases** — practicing interviews at home,
or assessments where assistive tools are permitted. The app's existing ethical
disclaimer applies: users are responsible for following the rules of any
interview they take.

Stealth features should be **configurable and disclosed**, not default-on.