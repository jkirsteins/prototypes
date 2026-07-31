#!/usr/bin/env node
/**
 * Root dev server for the prototypes repo.
 *
 * Starts every prototype's own Vite dev server (so each keeps hot reload) and
 * puts a single front door in front of them at /prototypes/, serving the same
 * landing page that GitHub Pages uses. That way local dev has the same URL
 * shape as production, and an unlinked or misconfigured prototype shows up
 * here instead of after a deploy.
 *
 * Zero dependencies, node builtins only.
 */
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONT_PORT = Number(process.env.PORT ?? 4173);
const INDEX = join(ROOT, ".github", "pages-index.html");

/** Every NN-* directory, in order. Child port is 5100 + NN. */
function discover() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d\d-/.test(e.name))
    .map((e) => ({ dir: e.name, num: e.name.slice(0, 2) }))
    .sort((a, b) => a.num.localeCompare(b.num))
    .map((p) => ({ ...p, port: 5100 + Number(p.num) }));
}

const protos = discover();
if (protos.length === 0) {
  console.error("No NN-* prototype directories found.");
  process.exit(1);
}

/** Warn loudly if the landing page does not link a prototype that exists. */
function checkIndexLinks() {
  const html = readFileSync(INDEX, "utf8");
  const missing = protos.filter((p) => !html.includes(`./${p.num}/`));
  if (missing.length > 0) {
    console.warn(
      `\n  WARNING: not linked from .github/pages-index.html: ${missing
        .map((p) => p.dir)
        .join(", ")}`,
    );
    console.warn("  It would deploy but be unreachable from the landing page.\n");
  }
}

const children = protos.map((p) => {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--port", String(p.port), "--strictPort"],
    { cwd: join(ROOT, p.dir), stdio: ["ignore", "pipe", "pipe"] },
  );
  const tag = `[${p.num}]`;
  child.stdout.on("data", (b) => process.stdout.write(prefix(tag, b)));
  child.stderr.on("data", (b) => process.stderr.write(prefix(tag, b)));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`${tag} exited with code ${code}`);
  });
  return child;
});

function prefix(tag, buf) {
  return String(buf)
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => `${tag} ${l}\n`)
    .join("");
}

function protoFor(url) {
  const m = /^\/prototypes\/(\d\d)(\/|$)/.exec(url);
  if (!m) return null;
  return protos.find((p) => p.num === m[1]) ?? null;
}

const front = createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/" || url === "/prototypes" || url === "/prototypes/") {
    if (url === "/") {
      res.writeHead(302, { location: "/prototypes/" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(INDEX));
    return;
  }

  const target = protoFor(url);
  if (!target) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found. Try /prototypes/\n");
    return;
  }

  const proxied = httpRequest(
    { host: "127.0.0.1", port: target.port, path: url, method: req.method, headers: req.headers },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxied.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Prototype ${target.num} is not up yet. Retry in a moment.\n`);
  });
  req.pipe(proxied);
});

// Forward websocket upgrades so hot reload works through the front door.
front.on("upgrade", (req, socket, head) => {
  const target = protoFor(req.url ?? "/");
  if (!target) {
    socket.destroy();
    return;
  }
  const upstream = connect(target.port, "127.0.0.1", () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`)
          .join("") +
        "\r\n",
    );
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

front.listen(FRONT_PORT, "127.0.0.1", () => {
  checkIndexLinks();
  console.log(`  Prototypes: http://127.0.0.1:${FRONT_PORT}/prototypes/`);
  for (const p of protos) {
    console.log(`    ${p.num}  ${p.dir}  ->  /prototypes/${p.num}/  (vite on ${p.port})`);
  }
  console.log("");
});

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  front.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
