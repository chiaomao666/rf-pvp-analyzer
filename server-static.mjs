import http from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "dist", "public");
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function safeFile(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  try {
    const details = await stat(candidate);
    return details.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const direct = await safeFile(req.url || "/");
  const file = direct || (req.url?.split("?")[0]?.includes(".") ? null : await safeFile("/index.html"));
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentTypes[path.extname(file)] || "application/octet-stream",
    "Cache-Control": path.basename(file) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[RF PVP Analyzer] static server listening on port ${port}`);
});
