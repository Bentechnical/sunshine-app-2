// server.js
const fs = require('fs');
const https = require('https');
const express = require('express');
const next = require('next');

const port = 3000;
const hostname = 'local.sunshinedogs.app';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync('./local.sunshinedogs.app-key.pem'),
  cert: fs.readFileSync('./local.sunshinedogs.app.pem'),
};

app.prepare().then(() => {
  const server = express();

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  https.createServer(httpsOptions, server).listen(port, () => {
    console.log(`✅ Secure server running at https://${hostname}:${port}`);
  });
});
