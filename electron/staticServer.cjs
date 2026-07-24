// Minimal, dependency-free static file server for the built Vite app.
//
// Why not just loadURL('file://.../dist/index.html')? Two of StudioBubble's features need a
// real http(s) origin: the PWA service worker (service workers refuse to register under the
// file: scheme) and Vite's absolute asset paths (which resolve fine under http://, but not
// under file://, where "/assets/..." means the filesystem root, not the app root). Serving
// dist/ over a local loopback HTTP server sidesteps both problems and keeps every web API
// (WebCodecs, OPFS, File System Access) behaving exactly like it does in a real browser tab.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function startStaticServer(rootDir, preferredPort = 0) {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(rootDir, urlPath);

      // Prevent escaping the dist directory.
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (urlPath.endsWith('/') || !path.extname(filePath)) {
        const asIndex = path.join(filePath, 'index.html');
        filePath = fs.existsSync(asIndex) ? asIndex : path.join(rootDir, 'index.html');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: unknown routes resolve to index.html.
          fs.readFile(path.join(rootDir, 'index.html'), (fallbackErr, fallbackData) => {
            if (fallbackErr) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fallbackData);
          });
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    } catch {
      res.writeHead(500);
      res.end('Internal error');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferredPort;
      resolve({ server, port });
    });
  });
}

module.exports = { startStaticServer };
