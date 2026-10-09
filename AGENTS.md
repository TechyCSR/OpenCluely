# AGENTS.md

## Overview

Electron desktop app ("invisible AI interview copilot"). Plain JavaScript only: CommonJS in the main process, browser-global `<script>` files in renderers. No TypeScript, no bundler, no unit-test framework.

## Commands

- `npm start` / `npm run dev` — launch the app. Both invoke Unix `env -u ELECTRON_RUN_AS_NODE electron .`, so on Windows they only work from Git Bash/WSL; otherwise use `npx electron .` directly (`dev` adds `--no-sandbox --disable-gpu`).
- `npm run lint` — the only automated check (ESLint flat config). Run it before finishing; there is no test suite or typecheck.
- `npm run test-speech` — Whisper transcription smoke test; needs the `.venv-whisper` venv created by `setup.sh`.
- `./setup.sh` — full bootstrap: npm deps, creates `.env` from `env.example`, builds `.venv-whisper` (local Whisper venv), writes Whisper paths into `.env`, launches the app. On Windows: Git Bash/WSL only. Flags: `--build`, `--no-run`, `--ci`, `--skip-whisper`, `--install-system-deps`.
- `npm run build:win|linux|mac` — electron-builder into `dist/`. `npm run pack` gives an unpacked `--dir` build for quick inspection. `postinstall` runs `electron-builder install-app-deps`.

## Architecture

- Entrypoint `main.js` (`ApplicationController`): registers all IPC handlers, global shortcuts, stealth setup, first-run onboarding. Main-process code: `src/core` (config/logger/first-run), `src/managers` (window/session), `src/services` (capture/speech/providers/LLM).
- Renderer windows are root-level HTML (`index.html`, `chat.html`, `settings.html`, `onboarding.html`) loading plain scripts from `src/ui/*.js` — no modules, no imports. ESLint enforces the split: CommonJS for `main.js`, `preload.js`, `prompt-loader.js`, `speech-recognition.js`, `src/{core,managers,services}`, `scripts/**`; classic-script globals (with `require`/`markdown` allowed) for `src/ui/**` and `onboarding.js`. Don't introduce ESM imports in either zone.
- `lib/` is vendored third-party code (markdown.js, mathrender.js) and `webapp/` is the separate static marketing site — both ESLint-ignored; don't refactor them.
- All LLM traffic goes through `src/services/provider.manager.js`, a Proxy routing to the active provider (Gemini or Ollama); call sites use it generically. Adding a provider = new service + registration there, no call-site changes.
- Skills are `prompts/*.md` loaded by `prompt-loader.js` behind an explicit `enabledSkills` allowlist (`['dsa', 'home-depot']`). Adding a skill = new `.md` + allowlist entry + dropdown entry in `settings.html`. `skillsRequiringProgrammingLanguage` gates language-specific answer injection; the chosen skill persists as `ACTIVE_SKILL` in `.env`.
- Speech: on Windows the renderer captures raw PCM via Web Audio → IPC `audio-chunk` → `whisper-worker.service.js` drives a persistent Python worker (`scripts/whisper_worker.py`) from `.venv-whisper`. macOS also uses renderer capture (sox deliberately not installed there); Linux may use native sox/arecord. Azure Speech is the cloud alternative. If no speech provider is configured, mic buttons hide themselves.

## Gotchas

- The `assests/` directory name (misspelled) is intentional and hard-coded in `package.json` (`build.files`, `asarUnpack`, Linux icon). Don't rename it.
- Any file read at runtime must be listed in `build.asarUnpack` (currently `assests/icons/**`, `prompts/**`, `scripts/whisper_worker.py`) or it won't resolve inside packaged builds.
- Releases: push a `v*` tag → GitHub Actions builds Windows + Linux only (macOS is deliberately not shipped — unsigned; users build from source) and syncs `package.json`'s `version` from the tag automatically. Don't bump versions manually for releases.
- `.env` location differs by mode: development prefers repo-root `.env`; packaged builds use Electron's `userData` dir. Settings changes are written back into that same `.env` at runtime (values may become single/double quoted), so treat `.env` as mutable state, not static config.
- `prompts/home-depot.md` is gitignored on purpose (contains personal interview-prep data). Never commit it, even locally — this is a fork of a public repo.
- Stealth naming (`process.title = "Terminal "`, `app.setName`) and the forced GPU-disable flags on Linux in `main.js` are deliberate workarounds — don't "fix" them.
- Log via Winston (`createServiceLogger("SCOPE")` from `src/core/logger`), not `console.log`, in main-process code.

## Conventions

- Commit messages follow Conventional Commits (`feat(scope):`, `fix(llm):`, etc.), matching the existing history.
