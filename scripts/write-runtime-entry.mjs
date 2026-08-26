import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await writeFile("dist/index.js", 'import "../scripts/static-server.mjs";\n', "utf8");
