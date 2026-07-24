#!/usr/bin/env node
// `npx @vinay-madan/studiobubble` entry point: serves the pre-built app (shipped inside the
// published package's dist/) over a local static server and opens it in your default browser.
// Reuses the same zero-dependency server the Electron build uses, so behavior is identical.

const path = require('node:path');
const fs = require('node:fs');
const { exec } = require('node:child_process');
const { startStaticServer } = require('../electron/staticServer.cjs');

async function main() {
  const distDir = path.join(__dirname, '..', 'dist');

  if (!fs.existsSync(distDir)) {
    console.error(
      'dist/ is missing from this package (it should have been built before publish). ' +
        'Try reinstalling: npm install -g @vinay-madan/studiobubble',
    );
    process.exit(1);
  }

  const requestedPort = Number(process.env.PORT) || 4173;
  const { port } = await startStaticServer(distDir, requestedPort);
  const url = `http://127.0.0.1:${port}`;

  console.log(`StudioBubble is running at ${url}`);
  console.log('Open it in Chrome or Edge 122+ (Chrome-only capture APIs). Ctrl+C to stop.');

  const openCommand =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${openCommand} ${url}`, () => {
    /* best-effort; if it fails, the URL above still works */
  });
}

main().catch((err) => {
  console.error('Failed to start StudioBubble:', err);
  process.exit(1);
});
