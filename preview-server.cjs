// Static preview server (zero-dependency) — เสิร์ฟไฟล์ใน ./public
// ใช้ดู mockup china-pay-preview.html โดยไม่ต้องรัน Next dev (node_modules อยู่บน C:)
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "public");
const port = process.env.PORT || 4599;
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/" || p === "") p = "/china-pay-preview.html";
  const fp = path.join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end("<h1>404</h1><p>ลองเปิด /china-pay-preview.html</p>"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(fp).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(port, () => console.log("preview server running on http://localhost:" + port));
