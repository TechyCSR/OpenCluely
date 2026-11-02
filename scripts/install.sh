#!/usr/bin/env bash
# OpenCluely v2 - Native macOS & Linux 1-Line Installer
# Run: curl -fsSL https://opencluely.techycsr.dev/install.sh | bash

set -e

REPO="TechyCSR/OpenCluely"
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "=========================================="
echo "    Installing OpenCluely v2 ($OS $ARCH)  "
echo "=========================================="

if [ "$OS" = "Darwin" ]; then
    echo "[1/4] Fetching latest macOS release..."
    LATEST_JSON=$(curl -sSL "https://api.github.com/repos/$REPO/releases/latest")
    DMG_URL=$(echo "$LATEST_JSON" | grep -o 'https://[^"]*OpenCluely[^"]*\.dmg' | head -n 1)

    if [ -z "$DMG_URL" ]; then
        echo "Error: Could not locate a valid macOS .dmg asset."
        exit 1
    fi

    TMP_DMG="/tmp/OpenCluely.dmg"
    echo "[2/4] Downloading OpenCluely DMG..."
    curl -L "$DMG_URL" -o "$TMP_DMG"

    echo "[3/4] Installing OpenCluely to /Applications..."
    MOUNT_DIR=$(mktemp -d -t opencluely_mount)
    hdiutil attach "$TMP_DMG" -mountpoint "$MOUNT_DIR" -nobrowse -quiet
    
    cp -R "$MOUNT_DIR/OpenCluely.app" /Applications/
    hdiutil detach "$MOUNT_DIR" -quiet
    rm -rf "$TMP_DMG" "$MOUNT_DIR"

    echo "[4/4] Removing Gatekeeper quarantine attribute..."
    xattr -cr /Applications/OpenCluely.app

    echo "Launching OpenCluely v2..."
    open /Applications/OpenCluely.app
    echo "Done! OpenCluely is installed in /Applications."

elif [ "$OS" = "Linux" ]; then
    echo "[1/3] Fetching latest Linux release..."
    LATEST_JSON=$(curl -sSL "https://api.github.com/repos/$REPO/releases/latest")
    APPIMAGE_URL=$(echo "$LATEST_JSON" | grep -o 'https://[^"]*\.AppImage' | head -n 1)

    if [ -z "$APPIMAGE_URL" ]; then
        echo "Error: Could not locate Linux AppImage asset."
        exit 1
    fi

    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
    echo "[2/3] Downloading OpenCluely AppImage..."
    curl -L "$APPIMAGE_URL" -o "$INSTALL_DIR/opencluely"
    chmod +x "$INSTALL_DIR/opencluely"

    echo "[3/3] Done! Launching OpenCluely..."
    "$INSTALL_DIR/opencluely" &
else
    echo "Unsupported OS: $OS"
    exit 1
fi
