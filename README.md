<div align="center">

# OpenCluely

**The invisible AI interview copilot.**

Real-time AI help on a stealth overlay that screen sharing cannot see. Ask by voice or screenshot, and get clear answers that stream in as you need them.

<p>
  <a href="https://github.com/TechyCSR/OpenCluely/releases/latest"><img src="https://img.shields.io/github/v/release/TechyCSR/OpenCluely?style=for-the-badge&label=Latest&color=111111&labelColor=000000" alt="Latest release" /></a>
  <a href="https://github.com/TechyCSR/OpenCluely/releases"><img src="https://img.shields.io/github/downloads/TechyCSR/OpenCluely/total?style=for-the-badge&color=111111&labelColor=000000" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-111111?style=for-the-badge&labelColor=000000" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux-111111?style=for-the-badge&labelColor=000000" alt="Platforms" />
</p>

<a href="https://opencluely.techycsr.dev"><b>Website</b></a> &nbsp;|&nbsp;
<a href="#download">Download</a> &nbsp;|&nbsp;
<a href="#quick-start">Quick start</a> &nbsp;|&nbsp;
<a href="#how-it-works">How it works</a>

</div>

## Demo

https://github.com/user-attachments/assets/896a7140-1e85-405d-bfbe-e05c9f3a816b

## What it is

OpenCluely is a desktop app for technical interviews and practice. It places a small overlay on your screen that recording and conferencing tools do not capture. You can speak a question or take a screenshot, and the AI answers in real time. The answer streams into a floating window and an optional chat panel, with clean code blocks and syntax highlighting.

It is free and open source. Processing stays on your machine, and the only thing that leaves your device is the request you send to the AI provider.

## Highlights

- **Invisible overlay.** Windows stay out of Zoom, Google Meet, Microsoft Teams, Discord, and OBS captures. You see the answer, the call does not.
- **Hidden during screen share.** When a share starts, the app can hide every window on its own.
- **Flexible local voice.** Choose manual start/stop capture or automatic voice-activity detection without fixed-timer sentence cuts.
- **Configurable streamed answers.** Route voice replies to chat, the floating overlay, or both.
- **Direct image analysis.** Screenshots go straight to Gemini for visual reasoning, with no slow OCR step in between.
- **Session memory.** The whole conversation is remembered, so follow-ups, edge cases, and optimizations keep their context.
- **Language aware.** Tailored answers for C++, C, Python, Java, and JavaScript.
- **Stealthy by design.** Runs under ordinary system names, ships with no telemetry, and keeps your session local.
- **Cross platform.** Pre-built installers for Windows and Linux (.deb and AppImage). macOS runs from source in one command.

## Download

Pre-built installers are published with every release. These links always point at the newest version.

| Platform | File | Notes |
|---|---|---|
| Windows | [Setup .exe](https://github.com/TechyCSR/OpenCluely/releases/latest) | NSIS installer. Adds a Start Menu shortcut. |
| Linux (Debian or Ubuntu) | [.deb](https://github.com/TechyCSR/OpenCluely/releases/latest) | Pulls system deps automatically (Python, ffmpeg, GTK). |
| Linux (universal) | [.AppImage](https://github.com/TechyCSR/OpenCluely/releases/latest) | No install. Run `chmod +x` then launch. |

> **macOS:** there is no pre-built download. The app is unsigned and un-notarized, so macOS Gatekeeper blocks it as "damaged and can't be opened." Run OpenCluely from source instead — see [Quick start](#quick-start). It is a one-line `./setup.sh` once Node.js is installed.

Every build is produced automatically on GitHub Actions and ships with SHA-256 checksums. Each release also lists the full set of commits it includes.

The website at [opencluely.techycsr.dev](https://opencluely.techycsr.dev) detects your operating system and offers the right installer directly.

## Quick start

If you would rather build from source, three steps are all it takes.

1. Clone the repository.

   ```bash
   git clone https://github.com/TechyCSR/OpenCluely.git
   cd OpenCluely
   ```

2. Run the setup script.

   ```bash
   ./setup.sh
   ```

   The script installs Node dependencies, creates your `.env` from the example, and launches the app.

3. Configure Google Cloud authentication.

   Set `GOOGLE_CLOUD_PROJECT` in `.env`, then create local Application Default Credentials:

   ```bash
   gcloud auth application-default login
   ```

   The selected project needs Vertex AI access and billing. Credentials remain in your normal local Google Cloud configuration and are not committed to this repository.

### Platform notes

- On Windows, use Git Bash (included with Git for Windows) or WSL to run `setup.sh`.
- On macOS and Linux, your normal terminal works.
- **macOS users must build from source** (steps above) — there is no pre-built `.dmg`. Because the app is unsigned, a downloaded build would be blocked by Gatekeeper as "damaged"; running from source avoids that entirely.
- No manual `npm` commands are needed. The script handles everything.

### Setup script options

```bash
./setup.sh --build                # Build a distributable for your OS
./setup.sh --ci                   # Use npm ci instead of npm install
./setup.sh --no-run               # Set up only, do not launch
./setup.sh --install-system-deps  # Install optional platform audio tools
```

## Configuration

The setup script writes sensible defaults. Gemini Live requires a Google Cloud project and local ADC authentication.

```bash
# Required for Vertex AI and Gemini Live
GOOGLE_CLOUD_PROJECT=your-billed-gcp-project
GOOGLE_CLOUD_LOCATION=europe-west4
GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio

# macOS Call Copilot system audio
SYSTEM_AUDIO_COMMAND=bin/SystemAudioDump
FFMPEG_COMMAND=ffmpeg
CALL_COPILOT_SILENCE_MS=800
```

Live audio is optional. On macOS it requires the bundled `SystemAudioDump` helper, `ffmpeg`, Screen Recording permission, and an authenticated Gemini Live project.

## How it works

1. **Observe.** Start Live Screen, Live Audio, or use the one-shot screenshot shortcut.
2. **Reason.** Gemini maintains the active task while combining recent screen and conversation context.
3. **Assist.** Responses stream to the native overlay, chat window, or optional CoderPad browser rail.

## Keyboard shortcuts

| Action | Shortcut | Description |
|---|---|---|
| Screenshot capture | `Cmd/Ctrl + Shift + S` | Capture the screen and analyze it with Gemini |
| Toggle speech | `Alt + R` | Legacy shortcut; live call assistance uses Call Copilot |
| Toggle visibility | `Cmd/Ctrl + Shift + V` | Show or hide all windows |
| Toggle interaction | `Cmd/Ctrl + Shift + I` or `Alt + A` | Enable or disable click through |
| Open chat | `Cmd/Ctrl + Shift + C` | Open the interactive chat window |
| Toggle Call Copilot | `Cmd/Ctrl + Shift + L` | Listen to macOS system audio and suggest concise responses |
| Settings | `Cmd/Ctrl + ,` | Open the settings panel |

Call Copilot captures the remote/system-audio channel on macOS and streams it
to Gemini Live for real-time transcription and assistance. It starts only when
explicitly toggled and requires Screen Recording permission. Use it only on
calls where recording and AI assistance are permitted.

## Project status

OpenCluely is under active development. The core is stable and improvements ship regularly.

### Done

- Stealth overlay with a draggable command bar and a click through toggle
- Hidden during screen share, with automatic hiding when a share begins
- Screenshot capture with direct Gemini analysis, no OCR step
- Stateful Gemini Live audio and screen context
- Intent anchoring across short conversational detours
- Configurable chat/overlay routing for streamed answers
- AI response window with markdown and syntax highlighting
- Global shortcuts for capture, visibility, interaction, chat, and settings
- Session memory and a full chat UI
- Language picker and a DSA skill prompt
- Optional browser-native response rail for CoderPad
- Multi-monitor and area capture support
- Window binding and positioning
- Settings management with disguise and stealth modes

### Planned

- Multiple model backends alongside Gemini (OpenAI, Anthropic, local)
- Auto typing of code snippets into editors and IDEs
- Export of conversation history to markdown or PDF
- Deeper stealth, including process name randomization

## Troubleshooting

<details>
<summary>Setup issues</summary>

- **setup.sh will not run.** Make sure you are in the project folder (`cd OpenCluely`) and that the script is executable (`chmod +x setup.sh`). On Windows, use Git Bash.
- **Setup stops with exit code 130.** That means Ctrl+C was pressed. Run `./setup.sh` again.
- **Node or npm not found.** Install Node.js 18 or newer from [nodejs.org](https://nodejs.org/), restart the terminal, and retry.

</details>

<details>
<summary>App issues</summary>

- **Electron will not start or shows a blank window on Linux.** Try `npm run dev`, and make sure X11 or XWayland is available in headless setups.
- **macOS screen capture does not work.** Grant Screen Recording permission under System Settings, Privacy and Security, then relaunch the app.
- **Windows SmartScreen blocks the app.** Click More info, then Run anyway, or use `npm start` during development.
- **Gemini Live is not connecting.** Run `gcloud auth application-default login`, set `GOOGLE_CLOUD_PROJECT`, confirm Vertex AI access and billing, then restart OpenCluely.

</details>

<details>

<summary> Limitations </summary>

- **Screen-capture invisibility does not work on Linux.** The overlay stays hidden from screen shares and recordings only on **macOS** and **Windows**. This relies on Electron's `setContentProtection`, which maps to `NSWindowSharingNone` on macOS and `WDA_EXCLUDEFROMCAPTURE` on Windows. Electron provides **no equivalent on Linux** (neither X11 nor Wayland), so on Linux the call is a silent no-op and the overlay **will be visible** to anyone you screen-share with. This is a platform limitation, not a bug — there is no window flag on Linux that excludes a window from framebuffer capture. If you need capture-invisibility, run OpenCluely on macOS or Windows. As a partial workaround on Linux, share a single application window instead of your entire screen, or place the overlay on a monitor you are not sharing.

</details>



## Privacy and ethics

OpenCluely collects no data and sends no telemetry. Processing happens locally, and your session stays on your device. Requests to the AI provider are encrypted in transit.

The app is built for learning and practice. You are responsible for following the rules of any interview you take and the policies of the companies involved.

## License

Released under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Acknowledgments

- Google Gemini for the AI reasoning
- Google Cloud Vertex AI and Gemini Live for real-time assistance
- Electron for the cross platform desktop runtime
- [Vysper by varun-singhh](https://github.com/varun-singhh/Vysper) for UI and structure inspiration

<div align="center">

Built by [TechyCSR](https://techycsr.dev). If OpenCluely helped you, consider giving it a star ⭐

</div>
