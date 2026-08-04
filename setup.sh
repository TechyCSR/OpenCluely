#!/usr/bin/env bash
# ------------------------------------------------------------------
# OpenCluely setup wrapper
#
# This script delegates to the cross-platform Node.js setup script.
# It exists for backward compatibility so that ./setup.sh still works
# for users who are used to it.
#
# All flags (--no-run, --skip-whisper, --build, --ci, etc.) are
# forwarded directly to setup.js.
#
# If you prefer, you can also run:  node setup.js [options]
#                               or:  npm run setup
# ------------------------------------------------------------------

# Ensure we're in the project directory
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

# Check that Node.js is available
if ! command -v node &>/dev/null; then
  echo ""
  echo "  ✖ Node.js is not installed or not on PATH."
  echo "    Install Node.js 18+ from https://nodejs.org/ and try again."
  echo ""
  exit 1
fi

exec node setup.js "$@"
