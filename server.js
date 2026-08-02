const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 4174);
const PFX_PATH = path.join(ROOT, "certs", "wand-server.pfx");
const PFX_PASSPHRASE = "wand-local-dev";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requestPath = decodeURIComponent(url.pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);

  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const contentType = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

const server = http.createServer(handleRequest);

function lanAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos || []) {
      if (info.family === "IPv4" && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Wand magic app running at http://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`LAN: http://${address}:${PORT}`);
  }
});

if (fs.existsSync(PFX_PATH)) {
  const httpsServer = https.createServer({
    pfx: fs.readFileSync(PFX_PATH),
    passphrase: PFX_PASSPHRASE
  }, handleRequest);

  httpsServer.listen(HTTPS_PORT, "0.0.0.0", () => {
    console.log(`HTTPS mobile URL: https://localhost:${HTTPS_PORT}`);
    for (const address of lanAddresses()) {
      console.log(`HTTPS LAN: https://${address}:${HTTPS_PORT}`);
    }
  });
} else {
  console.log("HTTPS not enabled: certs/wand-server.pfx not found.");
}
