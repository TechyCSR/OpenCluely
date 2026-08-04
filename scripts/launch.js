#!/usr/bin/env node
'use strict';

/**
 * A cross-platform Electron launcher that replaces the Unix-only
 * `env -u ELECTRON_RUN_AS_NODE electron .` command.
 * It deletes ELECTRON_RUN_AS_NODE from the environment, ensuring
 * that Electron starts normally instead of as a Node.js process.
 */

// Delete the environment variable that tells Electron to run as Node
delete process.env.ELECTRON_RUN_AS_NODE;

// Require electron. When required from a Node.js script, it exports the path to the electron binary.
const electron = require('electron');
const { spawn } = require('child_process');

// Forward any extra CLI args to electron
const extraArgs = process.argv.slice(2);

// Spawn electron with '.' (current directory) and any extra args
const child = spawn(electron, ['.', ...extraArgs], {
  stdio: 'inherit'
});

// Forward the exit code from the child process
child.on('exit', (code) => {
  process.exit(code || 0);
});
