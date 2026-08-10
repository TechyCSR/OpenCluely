#!/usr/bin/env bash
set -euo pipefail

DO_BUILD=0
DO_RUN=1
USE_CI=0
INSTALL_SYSTEM_DEPS=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

This script will:
1. Create .env from env.example when needed
2. Install Node dependencies
3. Optionally install system audio dependencies
4. Optionally build the app
5. Optionally run OpenCluely

Options:
  --build                 Build a distributable for this OS
  --no-run                Do not start the app after setup
  --run                   Start the app after setup (default)
  --ci                    Use 'npm ci' instead of 'npm install'
  --install-system-deps   Attempt to install sox where possible
  -h, --help              Show this help

Environment variables:
  GOOGLE_CLOUD_PROJECT    Vertex AI project to write into .env

Example:
  GOOGLE_CLOUD_PROJECT=your-project ./setup.sh --install-system-deps
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
    perl -0pi -e "s|^${key}=.*\$|${key}=${value}|m" .env
  else
    printf "%s=%s\n" "$key" "$value" >> .env
  fi
}

ensure_google_cloud_config() {
  if [[ -n "${GOOGLE_CLOUD_PROJECT:-}" ]]; then
    upsert_env "GOOGLE_CLOUD_PROJECT" "$GOOGLE_CLOUD_PROJECT"
  fi

  if ! grep -Eq '^GOOGLE_CLOUD_PROJECT=.+$' .env 2>/dev/null; then
    echo ""
    echo "=========================================="
    echo " No Google Cloud project configured"
    echo "=========================================="
    echo ""
    echo "Set GOOGLE_CLOUD_PROJECT in .env and authenticate with:"
    echo "  gcloud auth application-default login"
    echo ""
    echo "Setup will continue without blocking."
    echo ""
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
      # OpenCluely captures microphone audio via the renderer (Web Audio API) on
      # macOS, so the native sox/arecord recorders are not used. Skip installing
      # sox to avoid an unnecessary Homebrew dependency.
      echo "macOS uses built-in renderer audio capture; skipping sox install."
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
ensure_google_cloud_config
install_system_deps
install_node_deps
build_app
run_app
