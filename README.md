<p align="center">
  <img src="https://github.com/user-attachments/assets/186d5458-7e8b-406a-9adc-ce755256298c" 
       alt="Group 14" 
       width="300" 
       style="padding: 10px; border-radius: 8px;"/>
</p>

# OpenCluely

**Professional Interview Assistant with Invisible Screen Overlay**

An AI-powered desktop tool that helps you excel in technical and professional interviews by providing intelligent, real-time assistance while remaining completely invisible to screen sharing and recording software.

### Demo
https://github.com/user-attachments/assets/c5616482-3652-4686-b87b-e04d06572d2f

## Perfect for Interviews
**Completely Stealth** - Invisible to Zoom, Teams, Meet, and all screen sharing tools
**Real-time AI Assistance** - Instant help with coding problems, system design, and interview questions
**Professional Skills** - Specialized modes for different interview types

### Supported Interview Skills
- **DSA (Data Structures & Algorithms)** - Complete solutions with complexity analysis

## 🚀 Quick Start

### Installation
```bash
git clone <repository-url>
cd OpenCluely
brew install tesseract
brew install sox
npm install
npm start
```

### Build Distributable App

#### Step-by-Step Build Process
1. **Clone and Setup** (first time only):
   ```bash
   git clone <repository-url>
   cd OpenCluely
   npm install
   ```

2. **Create Your Build**:
   ```bash
   # For your current platform (recommended)
   npm run build
   
   # Or specific platforms
   npm run build:mac      # macOS (.dmg + .zip)
   npm run build:win      # Windows (.exe installer + portable)
   npm run build:linux    # Linux (.AppImage + .deb)
   npm run build:all      # All platforms
   ```

3. **Find Your App**: Built files appear in `dist/` folder

#### Build Commands Reference
```bash
# Basic builds
npm run build          # Current platform
npm run build:mac      # macOS (.dmg + .zip)
npm run build:win      # Windows (.exe installer + portable)
npm run build:linux    # Linux (.AppImage + .deb)
npm run build:all      # All platforms

# Development & testing
npm run pack           # Quick build for testing (no compression)
npm run clean          # Clean dist/ folder
npm run rebuild        # Clean + build current platform
npm run release        # Clean + build all platforms
```

**Built apps will be in the `dist/` folder:**
- **macOS**: `OpenCluely-1.0.0.dmg` (installer) or `OpenCluely-1.0.0-mac.zip` (portable)
- **Windows**: `OpenCluely Setup 1.0.0.exe` (installer) or `OpenCluely 1.0.0.exe` (portable)
- **Linux**: `OpenCluely-1.0.0.AppImage` (portable) or `OpenCluely_1.0.0_amd64.deb` (installer)

### Installing Built Apps
- **macOS**: Double-click `.dmg` file → Drag to Applications folder
- **Windows**: Run `.exe` installer or double-click portable version
- **Linux**: Make `.AppImage` executable (`chmod +x`) and run, or install `.deb` with `dpkg`

**Clean Build Process:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Essential Setup
1. **Azure Speech** (for voice commands)
   - Get free key from [Azure Portal](https://azure.microsoft.com/en-us/free/students)
   - Add to `.env`: `AZURE_SPEECH_KEY=your_key`

2. **Google Gemini AI** (for intelligent responses)
   - Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Configure in app: Press `Alt+G`

##  📢 🎓 Students gets $100 free credits Azure, and Free Speech To Text for 5 hours of audio

### Environment File
Create `.env`:
```bash
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_region
GEMINI_API_KEY=your_gemini_api_key
```

## ⌨️ Essential Shortcuts

### Core Functions
| Shortcut | Action |
|----------|--------|
| `Cmd + Shift + S` | Screenshot + AI Analysis |
| `Alt/Option + R` | Voice Recording Toggle |
| `Cmd + Shift + \` | Show/Hide All Windows |
| `Alt + A` | Toggle Interactive Mode |

### Navigation
| Shortcut | Action |
|----------|--------|
| `Cmd + Shift + C` | Chat Window |
| `Cmd + Arrow Up/Down` | Skills Selection (only if Interactive mode is on) |
| `Cmd + ,` | Settings |

### Session Management
| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+\` | Clear Session Memory |

### Important Interaction Usage Tip 
* Enable **Interaction Mode** to scroll, click, or select inside windows.
* Use `Cmd+Up/Down` (in Interaction Mode) to switch skills quickly.
* Click thorugh screen works only when interaction mode is disabled
* In **Stealth Mode**, windows are invisible to screen share & mouse.

## 🔧 Key Features

### Stealth Technology
- **Invisible to Screen Sharing** - Completely hidden from Zoom, Teams, Meet
- **Process Disguise** - Appears as "OpenCluely" in system monitors
- **Click-through Mode** - Windows become transparent to mouse clicks
- **No Screen Recording Detection** - Undetectable by recording software

### AI-Powered Analysis
- **Screenshot OCR** - Extract and analyze text from any screen content
- **Voice Commands** - Speak questions and get instant AI responses
- **Context-Aware** - Remembers conversation history for better responses
- **Multi-Format Output** - Clean text and code blocks with syntax highlighting

### Interview-Specific Intelligence
- **Problem Recognition** - Automatically detects interview question types
- **Step-by-Step Solutions** - Detailed explanations with best practices
- **Code Examples** - Multi-language implementations with optimizations

## 💡 Pro Tips

### During Technical Interviews
1. **Position Windows**: Place OpenCluely windows in screen corners before sharing
2. **Use Voice Mode**: Whisper questions during "thinking time"
3. **Screenshot Problems**: Capture coding challenges for instant solutions
4. **Check Solutions**: Verify your approach with AI before implementing

### For System Design
1. **Capture Requirements**: Screenshot or voice record the problem statement
2. **Get Frameworks**: Ask for architectural patterns and trade-offs
3. **Verify Scalability**: Double-check your design decisions

### Behavioral Questions
1. **STAR Method**: Get structured response frameworks
2. **Industry Examples**: Request relevant scenarios for your field
3. **Follow-up Prep**: Prepare for common follow-up questions

## Important Technical Requirements (MUST INSTALL Before Running)
- **Node.js** 16+
- **Tesseract OCR** (`brew install tesseract`)
- **Audio Tool** (`brew install sox`)
- **Azure Speech Services** (Free tier available)
- **Google Gemini API** (Free quota included)

## 🚀 Advanced Usage

### Session Memory
The app remembers your interview context across multiple questions:

## 🤝 Contributing

**Contribute to make OpenCluely the ultimate interview companion, not a cheating tool!**

### Priority Areas
- **New Interview Skills** - Add specialized domains (Finance, Marketing, etc.)
- **Language Support** - Expand beyond English for global users
- **Platform Extensions** - Windows and Linux compatibility
- **LLM Improvements** - Multiple LLM Model selections for the response
- **UI/UX Improvements** - Enhanced interface and user experience

### How to Contribute
1. **Fork the repository**
2. **Star the project** if you find it useful
3. **Report issues** for bugs or feature requests
4. **Submit pull requests** for improvements
5. **Improve documentation** and add examples
6. **Share your success stories**

⭐ **Star this repo** if OpenCluely helped you ace your interviews or you vibed with it!
