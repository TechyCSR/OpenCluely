#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const electronPath = require('electron');

// Some terminals - notably VS Code's integrated terminal, which is itself an
// Electron app - can leak ELECTRON_RUN_AS_NODE=1 into child processes. When
// that's set, Electron launches as a plain Node process instead of the full
// app (no `app`/`BrowserWindow` available), so main.js crashes immediately
// with "Cannot read properties of undefined (reading 'commandLine')".
// Stripping it here works the same way on Windows, macOS and Linux, unlike
// `env -u ELECTRON_RUN_AS_NODE electron .`, which only works in a POSIX
// shell (bash/zsh) and fails outright in PowerShell/cmd.exe on Windows.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const extraArgs = process.argv.slice(2);
const child = spawn(electronPath, [path.join(__dirname, '..'), ...extraArgs], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code === null ? 1 : code);
});
