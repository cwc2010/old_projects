const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");

const app = express();

// Serve static files
app.use(express.static("public"));

// Ports
const HTTP_PORT = 3000;     // HTTP (redirects to HTTPS)
const HTTPS_PORT = 3443;    // HTTPS (actual app)

// Load SSL certs (generated with mkcert; see steps below)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem")),
};

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Socket.io over HTTPS
const io = new Server(httpsServer);

// Example socket handler (optional)
// io.on('connection', (socket) => {
//   console.log('client connected');
// });

// Start HTTPS
httpsServer.listen(HTTPS_PORT, () => {
  console.log("HTTPS hosting on:");
  printAddresses("https", HTTPS_PORT);
});

// Create an HTTP server that redirects to HTTPS
const redirectApp = express();
redirectApp.enable("trust proxy");
redirectApp.use((req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  return res.redirect(301, `https://${host}:${HTTPS_PORT}${req.url}`);
});

const httpServer = http.createServer(redirectApp);

// Start HTTP
httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP on :${HTTP_PORT} (redirecting -> HTTPS :${HTTPS_PORT})`);
  printAddresses("http", HTTP_PORT);
});

function printAddresses(proto, port) {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4") {
        console.log(`${proto}://${net.address}:${port}`);
      }
    }
  }
  console.log(`${proto}://localhost:${port}`);
}