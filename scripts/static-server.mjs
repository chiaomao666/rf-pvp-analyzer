import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist", "public");
const port = Number(process.env.PORT || 3000);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const candidate = join(root, relative);
  return candidate.startsWith(root) ? candidate : join(root, "index.html");
}

const server = createServer((request, response) => {
  const requested = safePath(request.url || "/");
  const path = existsSync(requested) && statSync(requested).isFile() ? requested : join(root, "index.html");
  response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(path).on("error", () => response.end()).pipe(response);
});

server.listen(port, "0.0.0.0", () => console.log(`[RF STATIC] serving dist/public on port ${port}`));
