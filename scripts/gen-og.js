// One-off generator: renders webapp/og-image.html to webapp/og-image.png at
// 1200x630 using Electron's offscreen renderer. Run with:
//   xvfb-run -a ./node_modules/.bin/electron scripts/gen-og.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 630,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });

  await win.loadFile(path.join(__dirname, '..', 'webapp', 'og-image.html'));
  // Give fonts/gradients a moment to settle before capture.
  await new Promise((r) => setTimeout(r, 1200));

  const image = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'webapp', 'og-image.png');
  fs.writeFileSync(out, image.toPNG());
  const size = image.getSize();
  console.log(`Wrote ${out} (${size.width}x${size.height})`);

  win.destroy();
  app.quit();
});
