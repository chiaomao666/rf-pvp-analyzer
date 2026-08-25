import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/index.js",
  'import "../server-static.mjs";\n',
  "utf8",
);
