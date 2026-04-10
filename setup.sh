#!/usr/bin/env bash
set -euo pipefail

DO_BUILD=0
DO_RUN=1
USE_CI=0
INSTALL_SYSTEM_DEPS=0
SETUP_WHISPER=1
WHISPER_MODEL="${WHISPER_MODEL:-base}"
WHISPER_LANGUAGE="${WHISPER_LANGUAGE:-en}"
WHISPER_SEGMENT_MS="${WHISPER_SEGMENT_MS:-4000}"
WHISPER_VENV_DIR=".venv-whisper"
WHISPER_MODEL_DIR=".whisper-models"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_NAME="unknown"
PLATFORM_BUILD_SCRIPT="build"
PYTHON_BIN="python3"
WHISPER_PIP_PATH=""
WHISPER_COMMAND_PATH=""

print_header() {
  echo "========================================"
  echo " OpenCluely Setup"
  echo "========================================"
}

usage() {
  cat <<EOF
Usage: ./setup.sh [options]

This script will:
1. Create .env from env.example when needed
2. Install Node dependencies
3. Optionally set up local Whisper in ${WHISPER_VENV_DIR}
4. Optionally install system audio dependencies
5. Optionally build the app
6. Optionally run OpenCluely

Options:
  --build                 Build a distributable for this OS
  --no-run                Do not start the app after setup
  --run                   Start the app after setup (default)
  --ci                    Use 'npm ci' instead of 'npm install'
  --install-system-deps   Attempt to install sox where possible
  --skip-whisper          Skip local Whisper environment setup
  -h, --help              Show this help

Environment variables:
  GEMINI_API_KEY          If provided, writes into .env
  WHISPER_MODEL           Whisper model to configure (default: base)
  WHISPER_LANGUAGE        Whisper language to configure (default: en)
  WHISPER_SEGMENT_MS      Segment size in ms (default: 4000)

Example:
  GEMINI_API_KEY=your_key_here ./setup.sh --install-system-deps
EOF
}

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    --no-run) DO_RUN=0 ;;
    --run) DO_RUN=1 ;;
    --ci) USE_CI=1 ;;
    --install-system-deps) INSTALL_SYSTEM_DEPS=1 ;;
    --skip-whisper) SETUP_WHISPER=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

print_header
cd "$SCRIPT_DIR"

detect_os() {
  local uname_out
  uname_out=$(uname -s || echo "unknown")
  case "$uname_out" in
    Linux*) OS_NAME="linux" ;;
    Darwin*) OS_NAME="macos" ;;
    CYGWIN*|MINGW*|MSYS*) OS_NAME="windows" ;;
    *) OS_NAME="unknown" ;;
  esac

  case "$OS_NAME" in
    macos) PLATFORM_BUILD_SCRIPT="build:mac" ;;
    windows) PLATFORM_BUILD_SCRIPT="build:win" ;;
    linux) PLATFORM_BUILD_SCRIPT="build:linux" ;;
    *) PLATFORM_BUILD_SCRIPT="build" ;;
  esac

  case "$OS_NAME" in
    windows)
      PYTHON_BIN="python"
      WHISPER_PIP_PATH="${WHISPER_VENV_DIR}/Scripts/pip.exe"
      WHISPER_COMMAND_PATH="${WHISPER_VENV_DIR}/Scripts/whisper.exe"
      ;;
    *)
      PYTHON_BIN="python3"
      WHISPER_PIP_PATH="${WHISPER_VENV_DIR}/bin/pip"
      WHISPER_COMMAND_PATH="${WHISPER_VENV_DIR}/bin/whisper"
      ;;
  esac
}

require_command() {
  local cmd="$1"
  local message="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: ${message}"
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f .env ]]; then
    if [[ -f env.example ]]; then
      echo "Creating .env from env.example"
      cp env.example .env
    else
      echo "Error: env.example is missing"
      exit 1
    fi
  fi
}

upsert_env() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env 2>/dev/null; then
    perl -0pi -e "s/^${key}=.*\$/${key}=${value}/m" .env
  else
    printf "%s=%s\n" "$key" "$value" >> .env
  fi
}

ensure_gemini_key() {
  if [[ -n "${GEMINI_API_KEY:-}" ]]; then
    upsert_env "GEMINI_API_KEY" "$GEMINI_API_KEY"
  fi

  if ! grep -q '^GEMINI_API_KEY=' .env 2>/dev/null || grep -q 'your_gemini_api_key_here' .env 2>/dev/null; then
    echo ""
    echo "=========================================="
    echo " API KEY REQUIRED"
    echo "=========================================="
    echo ""
    echo "Add your Gemini API key to .env and rerun this script if needed."
    echo "Get a key from: https://aistudio.google.com/"
    echo ""
    read -r -p "Press Enter after you've updated .env..."
  fi

  if grep -q 'your_gemini_api_key_here' .env 2>/dev/null; then
    echo "Error: GEMINI_API_KEY is still not configured in .env"
    exit 1
  fi
}

install_system_deps() {
  if [[ "$INSTALL_SYSTEM_DEPS" -ne 1 ]]; then
    return
  fi

  echo "Attempting to install system audio dependencies"

  if command -v sox >/dev/null 2>&1; then
    echo "sox already installed"
    return
  fi

  case "$OS_NAME" in
    macos)
      if command -v brew >/dev/null 2>&1; then
        brew install sox || echo "Could not install sox automatically. Install it manually with: brew install sox"
      else
        echo "Homebrew not found. Install sox manually."
      fi
      ;;
    linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y sox || echo "Could not install sox via apt-get"
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y sox || echo "Could not install sox via dnf"
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm sox || echo "Could not install sox via pacman"
      else
        echo "Unknown package manager. Install sox manually."
      fi
      ;;
    windows)
      echo "Install sox manually on Windows, for example via Chocolatey: choco install sox"
      ;;
    *)
      echo "Unknown OS. Install sox manually if you want microphone capture."
      ;;
  esac
}

install_node_deps() {
  if [[ -f package-lock.json && "$USE_CI" -eq 1 ]]; then
    echo "Installing Node dependencies with npm ci"
    npm ci
  else
    echo "Installing Node dependencies with npm install"
    npm install
  fi
}

setup_whisper_env() {
  if [[ "$SETUP_WHISPER" -ne 1 ]]; then
    echo "Skipping local Whisper setup"
    return
  fi

  require_command "$PYTHON_BIN" "Python 3 is required for local Whisper setup."

  if [[ ! -d "$WHISPER_VENV_DIR" ]]; then
    echo "Creating Whisper virtual environment at $WHISPER_VENV_DIR"
    "$PYTHON_BIN" -m venv "$WHISPER_VENV_DIR"
  fi

  echo "Installing local Whisper into $WHISPER_VENV_DIR"
  "$WHISPER_PIP_PATH" install --upgrade pip
  "$WHISPER_PIP_PATH" install openai-whisper

  mkdir -p "$WHISPER_MODEL_DIR"

  upsert_env "SPEECH_PROVIDER" "whisper"
  upsert_env "AZURE_SPEECH_KEY" ""
  upsert_env "AZURE_SPEECH_REGION" ""
  upsert_env "WHISPER_COMMAND" "${WHISPER_COMMAND_PATH}"
  upsert_env "WHISPER_MODEL_DIR" "${WHISPER_MODEL_DIR}"
  upsert_env "WHISPER_MODEL" "${WHISPER_MODEL}"
  upsert_env "WHISPER_LANGUAGE" "${WHISPER_LANGUAGE}"
  upsert_env "WHISPER_SEGMENT_MS" "${WHISPER_SEGMENT_MS}"

  echo "Running Whisper smoke test"
  npm run test-speech
}

build_app() {
  if [[ "$DO_BUILD" -eq 1 ]]; then
    echo "Building app for $OS_NAME with npm run $PLATFORM_BUILD_SCRIPT"
    npm run "$PLATFORM_BUILD_SCRIPT"
  fi
}

run_app() {
  if [[ "$DO_RUN" -eq 1 ]]; then
    echo "Starting app"
    npm start
  else
    echo "Setup complete. Skipping run."
  fi
}

detect_os
echo "Detected OS: $OS_NAME"
require_command node "Node.js 18+ is required."
require_command npm "npm is required."
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

ensure_env_file
ensure_gemini_key
install_system_deps
install_node_deps
setup_whisper_env
build_app
run_app
