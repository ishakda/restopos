/**
 * Composes chunked params files for the GitHub MCP push_files action.
 * Usage: node scripts/compose-push.mjs <owner> <repo> <branch> "<message prefix>"
 * Writes /tmp/push-chunk-N.json and prints a summary.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

const [owner = "ishakda", repo = "restopos", branch = "main", prefix = "RestoPOS update"] =
  process.argv.slice(2);

const raw = execSync("git ls-files", { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
const files = raw
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_CHUNK_BYTES = 300_000;
const chunks = [[]];
let size = 0;

for (const path of files) {
  const content = fs.readFileSync(path, "utf8");
  const bytes = Buffer.byteLength(content);
  if (size + bytes > MAX_CHUNK_BYTES && chunks[chunks.length - 1].length > 0) {
    chunks.push([]);
    size = 0;
  }
  chunks[chunks.length - 1].push({ path, content });
  size += bytes;
}

chunks.forEach((chunk, i) => {
  const params = {
    owner,
    repo,
    branch,
    message: `${prefix} (part ${i + 1}/${chunks.length})`,
    files: chunk,
  };
  const out = `/tmp/push-chunk-${i + 1}.json`;
  fs.writeFileSync(out, JSON.stringify(params));
  console.log(
    `chunk ${i + 1}: ${chunk.length} files, ${(JSON.stringify(params).length / 1024).toFixed(0)} kB -> ${out}`
  );
});
console.log("total files:", files.length);
