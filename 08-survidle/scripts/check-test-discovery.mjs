import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = resolve(root, "node_modules/.bin/vitest");

function discovered(suite) {
  const output = execFileSync(vitest, ["list", "--filesOnly"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SURVIDLE_TEST_SUITE: suite },
  });
  return output.trim().split("\n").filter(Boolean).map((file) =>
    relative(root, resolve(root, file)).split(sep).join("/")
  );
}

function testFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".test.ts")
      ? [relative(root, path).split(sep).join("/")]
      : [];
  });
}

const fast = discovered("fast");
const slow = discovered("slow");
const all = testFiles(resolve(root, "tests"));
const escaped = [...fast, ...slow].filter((file) => !file.startsWith("tests/"));
const overlap = fast.filter((file) => slow.includes(file));
const missed = all.filter((file) => !fast.includes(file) && !slow.includes(file));
const duplicates = [...fast, ...slow].filter((file, i, files) => files.indexOf(file) !== i);

if (fast.length === 0 || slow.length === 0) throw new Error("test discovery found an empty suite");
if (escaped.length > 0) throw new Error(`test discovery escaped tests/:\n${escaped.join("\n")}`);
if (overlap.length > 0) throw new Error(`test discovery put files in both suites:\n${overlap.join("\n")}`);
if (missed.length > 0) throw new Error(`test discovery missed files:\n${missed.join("\n")}`);
if (duplicates.length > 0) throw new Error(`test discovery found duplicate files:\n${duplicates.join("\n")}`);

console.log(`test discovery: ${fast.length} fast files, ${slow.length} slow files, no overlap or escape`);
