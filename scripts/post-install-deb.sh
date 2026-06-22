#!/bin/bash
# Post-install script for OpenCluely .deb package
# Runs after the .deb installs the app on Debian/Ubuntu.
#
# Responsibilities:
#   1. Create a default .env from env.example if one doesn't exist
#   2. Try to bootstrap the local Whisper environment (non-blocking;
#      failures only warn — speech is optional)
#   3. Never fail the apt install if either step fails

set -e

APP_DIR="/opt/OpenCluely"
ENV_EXAMPLE_SRC="/opt/OpenCluely/env.example"
LOG="/var/log/opencluely-postinstall.log"

log() {
    echo "[opencluely-postinstall] $*" | tee -a "$LOG" || true
}

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log "Running post-install for OpenCluely deb"

# ── 1. Create default .env if missing ──
USER_HOME="${SUDO_USER_HOME:-}"
if [ -n "$SUDO_USER" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
fi

# Fallback: just create .env in /opt/OpenCluely if we can't determine the user
TARGET_DIR="${USER_HOME:-$APP_DIR}"
TARGET_ENV="$TARGET_DIR/.env"

if [ -f "$ENV_EXAMPLE_SRC" ]; then
    if [ ! -f "$TARGET_ENV" ]; then
        cp "$ENV_EXAMPLE_SRC" "$TARGET_ENV"
        # Make sure the invoking user owns it
        if [ -n "$SUDO_USER" ]; then
            chown "$SUDO_USER:$SUDO_USER" "$TARGET_ENV" 2>/dev/null || true
        fi
        log "Created default .env at $TARGET_ENV"
        log "User must edit it to set GEMINI_API_KEY before first run"
    else
        log "Existing .env at $TARGET_ENV — not overwriting"
    fi
fi

# ── 2. Try to bootstrap Whisper (best-effort) ──
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
    PYTHON_VERSION="$($PYTHON_BIN -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
    PYTHON_MAJOR="$(echo "$PYTHON_VERSION" | cut -d. -f1)"
    PYTHON_MINOR="$(echo "$PYTHON_VERSION" | cut -d. -f2)"

    if [ "$PYTHON_MAJOR" -ge 3 ] && [ "$PYTHON_MINOR" -ge 10 ]; then
        VENV_DIR="$TARGET_DIR/.venv-whisper"
        if [ ! -d "$VENV_DIR" ]; then
            log "Python $PYTHON_VERSION detected — attempting to set up local Whisper"
            if sudo -u "$SUDO_USER" $PYTHON_BIN -m venv "$VENV_DIR" 2>>"$LOG"; then
                log "Created Whisper virtualenv at $VENV_DIR"
                if sudo -u "$SUDO_USER" "$VENV_DIR/bin/pip" install --quiet openai-whisper 2>>"$LOG"; then
                    log "Installed openai-whisper into the virtualenv"
                    log "Update WHISPER_COMMAND in .env to: $VENV_DIR/bin/whisper"
                else
                    log "WARNING: pip install openai-whisper failed (see $LOG)"
                fi
            else
                log "WARNING: Could not create Whisper virtualenv"
            fi
        else
            log "Whisper virtualenv already exists at $VENV_DIR"
        fi
    else
        log "Python $PYTHON_VERSION is too old; Whisper needs 3.10+"
    fi
else
    log "Python 3 not found; skipping Whisper bootstrap. Install python3 to enable local speech."
fi

log "Post-install complete"
exit 0
