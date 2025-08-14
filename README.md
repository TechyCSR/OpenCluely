<div align="center">

# 🧠 OpenCluely 

<!-- Development Banner -->
<p align="center">
  <img src="https://img.shields.io/badge/Status-Under%20Active%20Development-FFA500?style=for-the-badge&logo=github&logoColor=white" alt="Under Active Development" />
</p>
<p align="center" style="margin-top:-8px;">
  <em>Core is working; improvements are shipping daily.</em>
</p>

<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&size=35&duration=3000&pause=1000&color=2D9CDB&center=true&vCenter=true&width=600&lines=OpenCluely;Invisible+Interview+Assistant;AI-Powered+Real-Time+Help;Stealth+Technology+Expert" alt="OpenCluely Typing Animation" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenCluely-AI%20Interview%20Assistant-2D9CDB?style=for-the-badge&logo=robot&logoColor=white" alt="OpenCluely Badge" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cross%20Platform-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Stealth-100%25%20Invisible-red?style=flat-square" alt="Stealth" />
  <img src="https://img.shields.io/badge/AI-Gemini%20Powered-orange?style=flat-square" alt="AI" />
  <img src="https://img.shields.io/badge/Speech-Azure%20Optional-blueviolet?style=flat-square" alt="Speech" />
</p>

---


**OpenCluely** is a revolutionary AI-powered desktop application that provides **invisible, real-time assistance** during technical rounds.

</div>

## 🌟 Why OpenCluely?

<table>
<tr>
<td width="50%">

### 🥷 **100% Stealth Mode**
- **Invisible to Screen Sharing**: Zoom, Teams, Meet, Discord
- **Process Disguise**: Appears as normal system process (Terminal, Activity Monitor, Settings)
- **Click-Through Windows**: Transparent overlay technology
- **Draggable UI**: Move windows anywhere on screen
- **Zero Detection**: Bypasses all recording software

</td>
<td width="50%">

### 🚀 **AI-Powered Intelligence**
- **Direct Image Analysis**: Screenshots are analyzed by Gemini (no Tesseract OCR)
- **Voice Commands**: Optional Azure Speech (Whisper questions, get instant answers)
- **Context Memory**: Remembers entire interview conversation
- **Multi-Language Support**: C++, Python, Java, JavaScript, C
- **Smart Response Window**: Draggable with close button

</td>
</tr>
</table>

## 🖼️ Modern UI Features

### 📱 **Interactive Windows**
- **Floating Overlay Bar**: Compact command center with camera, mic, and skill selector
- **Draggable Answer Window**: Move and resize AI response window anywhere
- **Close Button**: Clean × button to close answer window when needed
- **Auto-Hide Mic**: Microphone button appears only when Azure Speech is configured
- **Interactive Chat**: Full conversation window with markdown support

### 🎨 **Visual Design**
- **Glass Morphism**: Beautiful blur effects and transparency
- **Adaptive Layout**: UI adjusts based on available services
- **Smart Resizing**: Windows resize automatically to fit content
- **Professional Look**: Mimics system applications for perfect stealth

---

## 🎯 Functional Overview

### 📋 **Core Components**

<table>
<tr>
<td width="33%">

#### 🖱️ **Main Overlay**
- Floating command bar
- Screenshot capture (⌘⇧S)
- Microphone toggle (Optional)
- Skill selector (DSA)
- Language picker
- Status indicator

</td>
<td width="33%">

#### 💬 **Interactive Chat**
- Real-time transcription
- AI conversation
- Markdown formatting
- Session memory
- Listening animations
- Auto-scroll messages

</td>
<td width="33%">

#### 📊 **Answer Window**
- Draggable interface
- Close button (×)
- Split layout for code
- Full markdown support
- Syntax highlighting
- Smart content sizing

</td>
</tr>
</table>


---
## ✅ To-Do List & Development Status

### 🎯 **Core Features** *(Completed)*

- [x] **Stealth overlay** with draggable command bar and click‑through toggle
- [x] **Screenshot capture** with direct Gemini analysis (no OCR step)
- [x] **AI response window** with markdown and code highlighting
- [x] **Global shortcuts** (capture, visibility, interaction, chat, settings)
- [x] **Session memory** and chat UI
- [x] **Language picker** and DSA skill prompt
- [x] **Optional Azure Speech** integration with auto‑hide mic
- [x] **Multi‑monitor** and area capture APIs
- [x] **Window binding** and positioning system
- [x] **Settings management** with app icon/stealth modes

### 🚧 **Planned Features** *(In Development)*

- [ ] **Hidden during screen share** (auto‑hide all windows while screen is being shared)
- [ ] **Multi‑model support** (OpenAI/Anthropic/Local backends alongside Gemini)
- [ ] **Auto‑typer for code snippets** (paste or simulate typing into editors/IDEs)
- [ ] **Export conversation history** (save sessions as markdown/PDF)
- [ ] **Performance optimizations** (faster startup, reduced memory usage)
- [ ] **Enhanced stealth modes** (process name randomization, deeper OS integration)

---

### ⚙️ **Configuration**

The setup script automatically handles configuration. You only need:

```bash
# Required: Google Gemini API Key (setup script will ask for this)
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Azure Speech Recognition (add later if you want voice features)
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_region
```

**Note**: Speech recognition is completely optional. If Azure credentials are not provided, the microphone button will be automatically hidden from all interfaces.

## 🚀 Quick Start & Installation

### ⚡ Three Simple Steps (All Operating Systems)

1. **Clone the repository**
   ```bash
   git clone https://github.com/TechyCSR/OpenCluely.git
   cd OpenCluely
   ```

2. **Get your Gemini API key** (Required)
   - Visit [Google AI Studio](https://aistudio.google.com/)
   - Click "Create API Key" 
   - Copy the key (you'll need it in step 3)

3. **Run the setup script** (One command does everything!)
   ```bash
   ./setup.sh
   ```
  

**That's it!** The setup script will:
- Install all dependencies automatically
- Create and configure your `.env` file
- Build the app (if needed)
- Launch OpenCluely ready to use (if not works use npm install & then npm start)

### 💻 Platform-Specific Notes

- **Windows**: Use Git Bash (comes with Git for Windows), WSL, or any bash environment
- **macOS/Linux**: Use your regular terminal
- **All platforms**: No manual npm commands needed - the setup script handles everything

### 🎛️ Setup Script Options

```bash
./setup.sh --build          # Build distributable for your OS
./setup.sh --ci             # Use npm ci instead of npm install
./setup.sh --no-run         # Setup only, don't launch the app
./setup.sh --install-system-deps  # Install sox for microphone (optional)
```

### 🔧 **Optional: Azure Speech Setup** (For Voice Features)

Voice recognition is completely optional. The setup script will create a `.env` file with just the required Gemini key. To add voice features:

1. Get Azure Speech credentials:
   - Visit [Azure Portal](https://portal.azure.com/)
   - Create a Speech Service
   - Copy your key and region

2. Add to your `.env` file:
   ```env
   # Already configured by setup script
   GEMINI_API_KEY=your_gemini_api_key_here

   # Add these for voice features (optional)
   AZURE_SPEECH_KEY=your_azure_speech_key
   AZURE_SPEECH_REGION=your_region
   ```

3. Restart the app - microphone buttons will now appear automatically

## 🎮 How to Use

### 🖱️ **Main Controls**

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Screenshot Capture** | `⌘⇧S` | Capture screen and analyze via Gemini (image understanding) |
| **Toggle Speech** | `Alt+R` | Start/stop voice recognition (if configured) |
| **Toggle Visibility** | `⌘⇧V` | Show/hide all windows |
| **Toggle Interaction** | `⌘⇧I` or `Alt+A` | Enable/disable window interaction |
| **Switch to Chat** | `⌘⇧C` | Open interactive chat window |
| **Settings** | `⌘,` | Open settings panel |

### 🎯 **Workflow**

1. **Start OpenCluely** → App appears as system process (Terminal/Activity Monitor)
2. **Position Windows** → Drag overlay and answer windows to preferred locations
3. **Capture Questions** → Use screenshot (⌘⇧S) or voice commands
4. **Get AI Answers** → Instant responses in draggable answer window
5. **Interactive Chat** → Type or speak for detailed conversations
6. **Stay Stealth** → All operations invisible to screen recording

### 🔧 **Advanced Features**

#### 🎨 **Window Management**
- **Draggable Interface**: Click and drag any window to reposition
- **Auto-resize**: Windows automatically adjust to content
- **Close Button**: Click × to close answer window
- **Always on Top**: Windows stay above all applications

#### 🧠 **AI Intelligence**
- **Context Awareness**: Remembers entire conversation
- **Code Detection**: Automatically formats code blocks
- **Language Specific**: Tailored responses for selected programming language
- **Session Memory**: Maintains context across multiple questions
 - **Image Understanding**: DSA prompt is applied only for new image-based queries; chat messages don’t include the full prompt
 - **Multi-monitor & Area Capture**: Programmatic APIs allow targeting a display and optional rectangular crop for focused analysis

#### 🔊 **Optional Voice Features** (Azure Speech)
- **Real-time Transcription**: Speak questions naturally
- **Listening Animation**: Visual feedback during recording
- **Interim Results**: See transcription as you speak
- **Auto-processing**: Instant AI responses to voice input
]
---

<details markdown="1">
<summary>🧩 <b> Troubleshooting</summary>

### Setup Issues

- **setup.sh not found or won't run**
  - Make sure you're in the OpenCluely directory: `cd OpenCluely`
  - Make the script executable: `chmod +x setup.sh`
  - On Windows, use Git Bash (comes with Git for Windows)

- **Setup script stops with exit code 130**
  - This means you pressed Ctrl+C. Just run `./setup.sh` again

- **Node or npm not found**
  - Install Node.js 18+ from [nodejs.org](https://nodejs.org/)
  - Restart your terminal and try again

### App Issues

- **Electron won't start or shows blank window (Linux)**
  - Try: `npm run dev`
  - Ensure X11/XWayland is available if running in headless environments

- **macOS screen capture doesn't work**
  - Grant "Screen Recording" permission in System Settings → Privacy & Security → Screen Recording
  - Quit and relaunch the app after granting permission

- **Windows SmartScreen blocks the app**
  - Click "More info" → "Run anyway" or use `npm start` during development

- **Microphone/voice not working**
  - Voice is optional - ignore related warnings if you don't need it
  - To enable: install `sox` (Linux/macOS) and add Azure keys to `.env`

</details>

<details markdown="2">
<summary>⚖️ Legal & Ethics</summary>

### 📋 **Disclaimer**

OpenCluely is provided for educational and research purposes. Users are responsible for:
- Complying with interview guidelines
- Respecting company policies
- Understanding legal implications
- Using ethically and responsibly

### 🔒 **Privacy**

- No data collection or telemetry
- All processing happens locally
- API communications are encrypted
- Session data stays on your device


### 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


</details>


</b>

## 🙏 Acknowledgments

- **Google Gemini**: Powering AI intelligence
- **Azure Speech**: Optional voice recognition
- **Electron**: Cross-platform desktop framework
- **Community**: Amazing contributors and feedback

- **Vysper**: UI and code structure inspiration — see [Vysper by varun-singhh](https://github.com/varun-singhh/Vysper)

---
<div align="center">



⭐ **Star this repo** if OpenCluely helped you ace your interviews or you vibed with it!

**Made with ❤️ by [TechyCSR](https://techycsr.me)**


</div>
