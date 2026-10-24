#!/bin/bash
set -e

PROJECT_DIR="/Users/jenilrevaliya/Desktop/Projects/cluely/OpenCluely"
APP_TARGET="/Applications/Setting.app"
DESKTOP_SETTING="$HOME/Desktop/Setting.app"
DESKTOP_SETTINGS="$HOME/Desktop/Settings.app"
SOURCE_APP="$PROJECT_DIR/node_modules/electron/dist/Settings.app"
if [ ! -d "$SOURCE_APP" ]; then
    SOURCE_APP="$PROJECT_DIR/node_modules/electron/dist/Electron.app"
fi

echo "=== Building Setting.app for macOS ==="

# 1. Compile Swift helpers if needed
if [ -f "$PROJECT_DIR/scripts/request_permissions.swift" ]; then
    echo "Compiling request_permissions helper..."
    swiftc -O "$PROJECT_DIR/scripts/request_permissions.swift" -o "$PROJECT_DIR/scripts/request_permissions" 2>/dev/null || true
fi

if [ -f "$PROJECT_DIR/scripts/caps_led.swift" ]; then
    echo "Compiling caps_led helper..."
    swiftc -O "$PROJECT_DIR/scripts/caps_led.swift" -o "$PROJECT_DIR/scripts/caps_led" 2>/dev/null || true
fi

if [ -f "$PROJECT_DIR/scripts/system_audio_recorder.swift" ]; then
    echo "Compiling system_audio_recorder helper..."
    swiftc -O "$PROJECT_DIR/scripts/system_audio_recorder.swift" -o "$PROJECT_DIR/scripts/system_audio_recorder" 2>/dev/null || true
fi

if [ -f "$PROJECT_DIR/scripts/native_typer.swift" ]; then
    echo "Compiling native_typer helper..."
    swiftc -O "$PROJECT_DIR/scripts/native_typer.swift" -o "$PROJECT_DIR/scripts/native_typer" 2>/dev/null || true
fi

# 2. Re-create /Applications/Setting.app
echo "Packaging into $APP_TARGET..."
rm -rf "$APP_TARGET"
mkdir -p "/Applications"
cp -R "$SOURCE_APP" "$APP_TARGET"

# 3. Configure Contents/MacOS executables
MAIN_EXEC="$APP_TARGET/Contents/MacOS/Setting"
if [ ! -f "$MAIN_EXEC" ]; then
    if [ -f "$APP_TARGET/Contents/MacOS/Electron" ]; then
        cp "$APP_TARGET/Contents/MacOS/Electron" "$MAIN_EXEC"
    elif [ -f "$APP_TARGET/Contents/MacOS/Settings" ]; then
        cp "$APP_TARGET/Contents/MacOS/Settings" "$MAIN_EXEC"
    fi
fi
chmod +x "$MAIN_EXEC"

if [ -f "$PROJECT_DIR/scripts/request_permissions" ]; then
    cp "$PROJECT_DIR/scripts/request_permissions" "$APP_TARGET/Contents/MacOS/request_permissions"
    chmod +x "$APP_TARGET/Contents/MacOS/request_permissions"
fi

if [ -f "$PROJECT_DIR/scripts/caps_led" ]; then
    cp "$PROJECT_DIR/scripts/caps_led" "$APP_TARGET/Contents/MacOS/caps_led"
    chmod +x "$APP_TARGET/Contents/MacOS/caps_led"
fi

if [ -f "$PROJECT_DIR/scripts/system_audio_recorder" ]; then
    cp "$PROJECT_DIR/scripts/system_audio_recorder" "$APP_TARGET/Contents/MacOS/system_audio_recorder"
    chmod +x "$APP_TARGET/Contents/MacOS/system_audio_recorder"
fi

if [ -f "$PROJECT_DIR/scripts/native_typer" ]; then
    cp "$PROJECT_DIR/scripts/native_typer" "$APP_TARGET/Contents/MacOS/native_typer"
    chmod +x "$APP_TARGET/Contents/MacOS/native_typer"
fi

# 4. Copy authentic macOS System Settings icons
SYS_ICON="/System/Applications/System Settings.app/Contents/Resources/SystemSettings.icns"
if [ -f "$SYS_ICON" ]; then
    echo "Installing authentic macOS System Settings gear icon..."
    cp "$SYS_ICON" "$APP_TARGET/Contents/Resources/app.icns"
    cp "$SYS_ICON" "$APP_TARGET/Contents/Resources/electron.icns"
    cp "$SYS_ICON" "$PROJECT_DIR/assests/icons/setting.icns" 2>/dev/null || true
    cp "$SYS_ICON" "$PROJECT_DIR/assests/icons/settings.icns" 2>/dev/null || true
fi

# 5. Wire Resources/app symlink to project repository
echo "Linking Resources/app to $PROJECT_DIR..."
rm -rf "$APP_TARGET/Contents/Resources/app"
ln -sfn "$PROJECT_DIR" "$APP_TARGET/Contents/Resources/app"
rm -f "$APP_TARGET/Contents/Resources/default_app.asar"

# 6. Generate Info.plist with explicit Screen Recording & Microphone descriptions
echo "Writing Info.plist..."
cat << 'EOF' > "$APP_TARGET/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Setting</string>
	<key>CFBundleExecutable</key>
	<string>Setting</string>
	<key>CFBundleIconFile</key>
	<string>app.icns</string>
	<key>CFBundleIdentifier</key>
	<string>com.cluely.setting</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>Setting</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0.0</string>
	<key>CFBundleVersion</key>
	<string>1.0.0</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.utilities</string>
	<key>LSMinimumSystemVersion</key>
	<string>12.0</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<true/>
	</dict>
	<key>NSBluetoothAlwaysUsageDescription</key>
	<string>Setting needs access to Bluetooth</string>
	<key>NSBluetoothPeripheralUsageDescription</key>
	<string>Setting needs access to Bluetooth</string>
	<key>NSCameraUsageDescription</key>
	<string>Setting needs access to the camera</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>Setting requires microphone access for audio assistance.</string>
	<key>NSScreenCaptureUsageDescription</key>
	<string>Setting requires screen recording permission to assist with onscreen questions and assessments.</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSMainNibFile</key>
	<string>MainMenu</string>
	<key>NSPrincipalClass</key>
	<string>AtomApplication</string>
	<key>NSQuitAlwaysKeepsWindows</key>
	<false/>
	<key>NSRequiresAquaSystemAppearance</key>
	<false/>
	<key>NSSupportsAutomaticGraphicsSwitching</key>
	<true/>
</dict>
</plist>
EOF

# 7. Code signing for macOS TCC validation
echo "Signing Setting.app with ad-hoc signature..."
codesign --force --deep --sign - "$APP_TARGET"
codesign -v "$APP_TARGET" && echo "Code signature verified successfully!"

# 8. Register with macOS LaunchServices
echo "Registering with LaunchServices..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_TARGET"

# 9. Create Desktop shortcuts
echo "Creating Desktop links..."
rm -rf "$DESKTOP_SETTING" "$DESKTOP_SETTINGS"
ln -sfn "$APP_TARGET" "$DESKTOP_SETTING"
ln -sfn "$APP_TARGET" "$DESKTOP_SETTINGS"

# 10. Sync environment and API keys
echo "Syncing active API key to Application Support..."
mkdir -p "$HOME/Library/Application Support/Setting" "$HOME/Library/Application Support/Settings"
if [ -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env" "$HOME/Library/Application Support/Setting/.env"
    cp "$PROJECT_DIR/.env" "$HOME/Library/Application Support/Settings/.env"
fi

# 11. Add to macOS Dock if not already present
echo "Checking Dock persistence..."
if ! defaults read com.apple.dock persistent-apps | grep -q "Setting.app"; then
    echo "Adding Setting.app to macOS Dock..."
    defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$APP_TARGET/</string><key>_CFURLStringType</key><integer>15</integer></dict><key>file-label</key><string>Setting</string></dict></dict>"
    killall Dock 2>/dev/null || true
else
    echo "Setting.app is already pinned in the Dock."
fi

echo "=== Build Complete! Setting.app is ready in /Applications and on Desktop ==="
