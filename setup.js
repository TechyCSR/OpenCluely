#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 2. Terminal colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function print(color, text) {
  console.log(`${colors[color] || colors.reset}${text}${colors.reset}`);
}

function printHeader() {
  print('cyan', '========================================');
  print('bold', ' OpenCluely Setup');
  print('cyan', '========================================\n');
}

// 4. run(cmd, opts) helper
function run(cmd, opts = {}) {
  print('cyan', `> ${cmd}`);
  try {
    return execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (error) {
    print('red', `Command failed: ${cmd}`);
    throw error;
  }
}

// 3. CLI argument parsing
const args = process.argv.slice(2);
const options = {
  help: args.includes('--help') || args.includes('-h'),
  noRun: args.includes('--no-run'),
  skipWhisper: args.includes('--skip-whisper'),
  build: args.includes('--build'),
  ci: args.includes('--ci'),
  installSystemDeps: args.includes('--install-system-deps'),
};

if (options.help) {
  console.log(`
Usage: node setup.js [options]

This script will:
1. Create .env from env.example when needed
2. Install Node dependencies
3. Optionally set up local Whisper
4. Optionally install system audio dependencies
5. Optionally build the app
6. Optionally run OpenCluely

Options:
  --build                 Build a distributable for this OS
  --no-run                Do not start the app after setup
  --ci                    Use 'npm ci' instead of 'npm install'
  --install-system-deps   Attempt to install sox where possible
  --skip-whisper          Skip local Whisper environment setup
  -h, --help              Show this help
`);
  process.exit(0);
}

// 5. OS detection
const platform = os.platform(); // 'darwin', 'win32', 'linux'
let pythonBin = 'python3';
let pipPath = path.join('.venv-whisper', 'bin', 'pip');
let whisperPath = path.join('.venv-whisper', 'bin', 'whisper');
let buildScript = 'build';

if (platform === 'darwin') {
  buildScript = 'build:mac';
} else if (platform === 'linux') {
  buildScript = 'build:linux';
} else if (platform === 'win32') {
  buildScript = 'build:win';
  pythonBin = 'python';
  pipPath = path.join('.venv-whisper', 'Scripts', 'pip.exe');
  whisperPath = path.join('.venv-whisper', 'Scripts', 'whisper.exe');
}

function checkCommand(cmd) {
  try {
    if (platform === 'win32') {
      execSync(`where ${cmd}`, { stdio: 'ignore' });
    } else {
      execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    }
    return true;
  } catch (e) {
    return false;
  }
}

function updateEnvVar(key, value) {
  const envPath = '.env';
  if (!fs.existsSync(envPath)) return;
  
  let content = fs.readFileSync(envPath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    // Append at the end, ensuring there's a newline before it
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    content += `${key}=${value}\n`;
  }
  
  fs.writeFileSync(envPath, content);
}

// 14. Wrap in async main()
async function main() {
  printHeader();

  let summary = [];

  // 6. Node/npm version check
  if (!checkCommand('node')) throw new Error('Node.js is required.');
  if (!checkCommand('npm')) throw new Error('npm is required.');
  
  const nodeVersion = execSync('node -v').toString().trim();
  // Ensure >= 18
  const major = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
  if (major < 18) throw new Error(`Node.js 18+ is required. Found ${nodeVersion}`);
  
  const npmVersion = execSync('npm -v').toString().trim();
  print('green', `Node: ${nodeVersion}`);
  print('green', `npm:  ${npmVersion}`);
  summary.push(`Node ${nodeVersion}, npm ${npmVersion}`);

  // 7. .env bootstrap
  if (!fs.existsSync('.env')) {
    if (fs.existsSync('env.example')) {
      print('cyan', 'Creating .env from env.example');
      fs.copyFileSync('env.example', '.env');
      summary.push('Created .env from env.example');
    } else {
      print('cyan', 'Creating minimal .env');
      fs.writeFileSync('.env', 'GEMINI_API_KEY=your_gemini_api_key_here\n');
      summary.push('Created minimal .env');
    }
  }

  // 8. Gemini API key check
  const envContent = fs.readFileSync('.env', 'utf8');
  if (envContent.includes('your_gemini_api_key_here')) {
    print('yellow', '\n==========================================');
    print('yellow', ' No Gemini API key detected');
    print('yellow', '==========================================');
    print('yellow', 'The app will start, but AI features won\'t work until you set');
    print('yellow', 'GEMINI_API_KEY in .env (or via the Settings window on first launch).\n');
    print('yellow', 'Setup will continue without blocking.\n');
  } else if (!envContent.includes('GEMINI_API_KEY=')) {
    fs.appendFileSync('.env', '\nGEMINI_API_KEY=your_gemini_api_key_here\n');
  }

  // 10. System deps
  if (options.installSystemDeps) {
    print('cyan', 'Attempting to install system audio dependencies...');
    if (checkCommand('sox')) {
      print('green', 'sox already installed');
    } else {
      if (platform === 'darwin') {
        print('cyan', 'macOS uses built-in renderer audio capture; skipping sox install.');
      } else if (platform === 'linux') {
        if (checkCommand('apt-get')) {
          run('sudo apt-get update -y && sudo apt-get install -y sox');
        } else if (checkCommand('dnf')) {
          run('sudo dnf install -y sox');
        } else if (checkCommand('pacman')) {
          run('sudo pacman -S --noconfirm sox');
        } else {
          print('yellow', 'Unknown package manager. Install sox manually.');
        }
      } else if (platform === 'win32') {
        print('yellow', 'Install sox manually on Windows, for example via Chocolatey: choco install sox');
      }
    }
    summary.push('System deps checked');
  }

  // 9. npm install
  if (options.ci && fs.existsSync('package-lock.json')) {
    print('cyan', 'Installing Node dependencies with npm ci');
    run('npm ci');
    summary.push('Ran npm ci');
  } else {
    print('cyan', 'Installing Node dependencies with npm install');
    run('npm install');
    summary.push('Ran npm install');
  }

  // 11. Whisper setup
  if (!options.skipWhisper && !(options.build && options.noRun)) {
    if (!checkCommand(pythonBin)) {
      print('yellow', 'Python not found. Skipping local Whisper setup.');
      summary.push('Skipped Whisper (Python not found)');
    } else {
      if (!fs.existsSync('.venv-whisper')) {
        print('cyan', `Creating Whisper virtual environment at .venv-whisper`);
        run(`${pythonBin} -m venv .venv-whisper`);
      }
      
      print('cyan', 'Installing local Whisper into .venv-whisper');
      try {
        run(`${pipPath} install --upgrade pip`);
        run(`${pipPath} install openai-whisper`);
      } catch (e) {
        print('yellow', 'WARNING: pip install openai-whisper failed. Whisper may be unavailable.');
      }

      if (!fs.existsSync('.whisper-models')) {
        fs.mkdirSync('.whisper-models');
      }

      let whisperFound = false;
      let actualWhisperCommand = whisperPath;
      
      if (fs.existsSync(whisperPath)) {
        print('green', `Whisper CLI found at: ${whisperPath}`);
        whisperFound = true;
      } else {
        const venvPython = platform === 'win32' ? path.join('.venv-whisper', 'Scripts', 'python.exe') : path.join('.venv-whisper', 'bin', 'python');
        try {
          execSync(`${venvPython} -m whisper --help`, { stdio: 'ignore' });
          print('cyan', `Whisper CLI not found as standalone script, but 'python -m whisper' works.`);
          actualWhisperCommand = venvPython;
          whisperFound = true;
        } catch(e) {
          print('yellow', `WARNING: Whisper CLI not found at ${whisperPath}`);
          print('yellow', `Speech recognition will be unavailable until Whisper is properly installed.`);
        }
      }

      updateEnvVar('SPEECH_PROVIDER', 'whisper');
      updateEnvVar('WHISPER_COMMAND', actualWhisperCommand);
      
      if (whisperFound) {
        try {
          print('cyan', 'Running Whisper smoke test...');
          run('npm run test-speech');
          summary.push('Whisper configured & tested successfully');
        } catch(e) {
          print('yellow', 'Whisper smoke test failed, but continuing.');
          summary.push('Whisper configured (smoke test failed)');
        }
      } else {
        summary.push('Whisper setup skipped (CLI not found)');
      }
    }
  } else {
    summary.push('Skipped local Whisper setup');
  }

  // 12. Build
  if (options.build) {
    print('cyan', `Building app for ${platform} with npm run ${buildScript}`);
    run(`npm run ${buildScript}`);
    summary.push(`Built app (${buildScript})`);
  }

  // 13. Launch
  if (!options.noRun) {
    print('cyan', 'Starting app...');
    summary.push('Launched app');
    run('npm start');
  } else {
    print('cyan', 'Setup complete. Skipping run.');
  }

  // 16. Summary
  print('cyan', '\n========================================');
  print('bold', ' Setup Summary');
  print('cyan', '========================================');
  summary.forEach(item => print('green', `✓ ${item}`));
  console.log();
}

main().catch(err => {
  print('red', `\nError: ${err.message}`);
  process.exit(1);
});
