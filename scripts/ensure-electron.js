#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

function getPlatformPath() {
  const platform = process.env.npm_config_platform || os.platform();
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      return 'electron';
  }
}

async function main() {
  const electronDir = path.dirname(require.resolve('electron/package.json'));
  const electronPkg = require(path.join(electronDir, 'package.json'));
  const platformPath = getPlatformPath();
  const distDir = path.join(electronDir, 'dist');
  const targetExecutable = path.join(distDir, platformPath);
  const pathFile = path.join(electronDir, 'path.txt');

  if (fs.existsSync(targetExecutable) && fs.existsSync(pathFile)) {
    try {
      require('electron');
      console.log('Electron is verified and ready.');
      return;
    } catch (e) {
      // Corrupt or failed installation; proceed to fix
    }
  }

  console.log(`Ensuring Electron v${electronPkg.version} binary is installed...`);

  const { downloadArtifact } = require('@electron/get');
  const platform = process.env.npm_config_platform || process.platform;
  let arch = process.env.npm_config_arch || process.arch;

  if (platform === 'darwin' && process.platform === 'darwin' && arch === 'x64') {
    try {
      const output = childProcess.execSync('sysctl -in sysctl.proc_translated');
      if (output.toString().trim() === '1') {
        arch = 'arm64';
      }
    } catch {}
  }

  const zipPath = await downloadArtifact({
    version: electronPkg.version,
    artifactName: 'electron',
    force: false,
    platform,
    arch
  });

  fs.mkdirSync(distDir, { recursive: true });

  console.log(`Extracting Electron to ${distDir}...`);
  let extracted = false;
  try {
    childProcess.execSync(`unzip -o -q "${zipPath}" -d "${distDir}"`, { stdio: 'inherit' });
    extracted = true;
  } catch (e) {
    try {
      childProcess.execSync(`tar -xf "${zipPath}" -C "${distDir}"`, { stdio: 'inherit' });
      extracted = true;
    } catch (err) {
      const extract = require('extract-zip');
      await extract(zipPath, { dir: distDir });
      extracted = true;
    }
  }

  const srcTypeDefPath = path.join(distDir, 'electron.d.ts');
  const targetTypeDefPath = path.join(electronDir, 'electron.d.ts');
  if (fs.existsSync(srcTypeDefPath)) {
    try {
      fs.renameSync(srcTypeDefPath, targetTypeDefPath);
    } catch {}
  }

  fs.writeFileSync(pathFile, platformPath, 'utf-8');

  if (platform !== 'win32' && fs.existsSync(targetExecutable)) {
    try {
      fs.chmodSync(targetExecutable, 0o755);
    } catch {}
  }

  console.log('Electron verified successfully at:', targetExecutable);
}

main().catch(err => {
  console.error('Failed to ensure electron installation:', err);
  process.exit(1);
});
