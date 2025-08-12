#!/usr/bin/env bash
set -euo pipefail

# OpenCluely one-shot setup: install deps, (optionally) build, and run
# Works on macOS, Linux, and Windows (Git Bash / MSYS2 / Cygwin)

# Defaults
DO_BUILD=0
DO_RUN=1
USE_CI=0
INSTALL_SYSTEM_DEPS=0
OS_NAME="unknown"
PLATFORM_BUILD_SCRIPT="build"

print_header() {
  echo "========================================"
  echo " OpenCluely Setup"
  echo "========================================"
}

usage() {
  cat <<EOF
Usage: ./setup.sh [options]

Options:
  --build                 Build a distributable for this OS (electron-builder)
  --no-run                Do not start the app after setup
  --run                   Start the app after setup (default)
  --ci                    Use 'npm ci' instead of 'npm install' if lockfile exists
  --install-system-deps   Attempt to install required system dependencies (sox) where possible
  -h, --help              Show this help

Environment variables picked up:
  GEMINI_API_KEY          If provided, will be written into .env if missing
EOF
}

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    --no-run) DO_RUN=0 ;;
    --run) DO_RUN=1 ;;
    --ci) USE_CI=1 ;;
    --install-system-deps) INSTALL_SYSTEM_DEPS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
  shift || true
done

print_header

# Detect OS
UNAME_OUT=$(uname -s || echo "unknown")
case "$UNAME_OUT" in
  Linux*)   OS_NAME="linux" ;;
  Darwin*)  OS_NAME="macos" ;;
  CYGWIN*|MINGW*|MSYS*) OS_NAME="windows" ;;
  *)        OS_NAME="unknown" ;;
 esac

echo "Detected OS: $OS_NAME"

# Map build script per platform (optional)
case "$OS_NAME" in
  macos) PLATFORM_BUILD_SCRIPT="build:mac" ;;
  windows) PLATFORM_BUILD_SCRIPT="build:win" ;;
  linux) PLATFORM_BUILD_SCRIPT="build:linux" ;;
  *) PLATFORM_BUILD_SCRIPT="build" ;;
 esac

# Check Node & npm
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed or not in PATH. Please install Node 18+ and retry."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not in PATH."
  exit 1
fi

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

# Install system dependencies (optional best-effort)
if [[ "$INSTALL_SYSTEM_DEPS" -eq 1 ]]; then
  echo "Attempting to install system dependencies (best effort)"
  if ! command -v sox >/dev/null 2>&1; then
    case "$OS_NAME" in
      macos)
        if command -v brew >/dev/null 2>&1; then
          echo "Installing sox via Homebrew..."
          brew install sox || echo "Could not install sox via brew. You can install it manually: brew install sox"
        else
          echo "Homebrew not found. Install sox manually: https://formulae.brew.sh/formula/sox"
        fi
        ;;
      linux)
        if command -v apt-get >/dev/null 2>&1; then
          echo "Installing sox via apt-get (sudo may prompt)..."
          sudo apt-get update -y && sudo apt-get install -y sox || echo "Could not install sox via apt-get."
        elif command -v dnf >/dev/null 2>&1; then
          echo "Installing sox via dnf (sudo may prompt)..."
          sudo dnf install -y sox || echo "Could not install sox via dnf."
        elif command -v pacman >/dev/null 2>&1; then
          echo "Installing sox via pacman (sudo may prompt)..."
          sudo pacman -S --noconfirm sox || echo "Could not install sox via pacman."
        else
          echo "Unknown package manager. Please install 'sox' manually."
        fi
        ;;
      windows)
        echo "On Windows, install sox via Chocolatey (Admin PowerShell): choco install sox"
        ;;
      *)
        echo "Unknown OS; please install 'sox' manually if you need microphone capture."
        ;;
    esac
  else
    echo "sox already installed."
  fi
fi

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure .env exists
if [[ ! -f .env && -f env.example ]]; then
  echo "Creating .env from env.example"
  cp env.example .env
fi

# If GEMINI_API_KEY is provided via env and .env lacks it, append it
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  if ! grep -q '^GEMINI_API_KEY=' .env 2>/dev/null; then
    echo "GEMINI_API_KEY is set in the environment; writing to .env"
    printf "GEMINI_API_KEY=%s\n" "$GEMINI_API_KEY" >> .env
  fi
fi

# Install node dependencies
if [[ -f package-lock.json && "$USE_CI" -eq 1 ]]; then
  echo "Installing dependencies with npm ci"
  npm ci
else
  echo "Installing dependencies with npm install"
  npm install
fi

# Build (optional)
if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "Building app for $OS_NAME via npm run $PLATFORM_BUILD_SCRIPT"
  npm run "$PLATFORM_BUILD_SCRIPT"
fi

# Run (default)
if [[ "$DO_RUN" -eq 1 ]]; then
  echo "Starting app (npm start)"
  npm start
else
  echo "Setup complete. Skipping run."
fi
