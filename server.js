const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;

const options = {
  key: fs.readFileSync(path.join(__dirname, "certs", "localhost-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "localhost.pem")),
};

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
};

const server = https.createServer(options, (req, res) => {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.join(ROOT, pathname);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`HTTPS server running at https://0.0.0.0:${PORT}`);
});
