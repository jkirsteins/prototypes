#!/usr/bin/env node
/**
 * Builds public/audio from scripts/audio-sources.json.
 *
 * One entry per output file: fetch the source once into scripts/.audio-cache
 * (an http url, or "repo:<path>" for a file already in this repository),
 * cut the named window out of it, fold it to mono 48 kHz, measure its peak
 * and lift it to the target for its kind, then encode Opus at 64 kbps.
 *
 * The peak pass is why encoding happens twice: ffmpeg only reports a level,
 * so the gain it finds has to be applied by a second run. Intermediates are
 * 32-bit float throughout, because a hot mp3 master routinely decodes past
 * full scale and 16-bit would flatten those samples before anything measured
 * them. Loops get their seam baked in before that measurement, by crossfading
 * their own tail over their head, so the last sample runs into the first.
 *
 * Rewrites the generated half of public/audio/manifest.md. Anything from the
 * "## Silent slots" heading onwards is hand-written and copied through.
 */
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE ?? "ffprobe";

const here = path.dirname(fileURLToPath(import.meta.url));
const proto = path.resolve(here, "..");
const repoRoot = path.resolve(proto, "..");
const cacheDir = path.join(here, ".audio-cache");
const outDir = path.join(proto, "public", "audio");
const sourcesFile = path.join(here, "audio-sources.json");
const manifestFile = path.join(outDir, "manifest.md");

/** Decoded peak each kind is normalized to. Loops sit under the one-shots so a bed never masks an event. */
const TARGET_DBFS = { oneshot: -4, loop: -12 };
/** Seconds of a loop's tail folded back over its head to make the seam. */
const SEAM = 2.0;

const SILENT_HEADING = "## Silent slots";
const HEADER = `# Audio manifest

Every file here is Ogg Opus, 64 kbps, mono, 48000 Hz. One-shots are
normalized to a decoded peak of -4 dBFS and loops to -12 dBFS, so a bed
never masks an event; per-slot gains in src/audio/manifest.ts do the rest.
Loops have their seam baked in - the last ${SEAM} s of the source is crossfaded
back over the head - so the whole file loops without a click, and they carry
no edge fades that would punch a hole at the wrap. One-shots do carry edge
fades, because their cuts start and end mid-waveform.

Files under "Replace before distribution" are NOT CC0. They are here because
this is an unpublished prototype and the sounds are worth hearing while it is
being built. Two different conditions hide under that one heading, and they
are not equally serious. The BBC RemArc licence covers personal, educational
and research use only, so every BBC file must go before this is shipped, sold
or advertised. The two Wikimedia files are CC BY-SA and may stay, provided
the credit below travels with them and the work that carries them is licensed
alike. The CC0 files carry no condition at all; their credits are a courtesy.

scripts/audio-sources.json and scripts/audio-fetch.mjs rebuild this directory
and the two generated sections of this file from scratch.
`;

const dbOf = (s) => {
  const m = [...s.matchAll(/Peak level dB:\s*(-?\d+(?:\.\d+)?|-?inf)/g)]
    .map((x) => (x[1].endsWith("inf") ? -120 : Number(x[1])));
  if (m.length === 0) throw new Error("astats printed no peak level");
  return Math.max(...m);
};

async function ffmpeg(args) {
  try {
    const { stderr } = await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", ...args], { maxBuffer: 64 << 20 });
    return stderr;
  } catch (e) {
    throw new Error(`ffmpeg ${args.join(" ")}\n${e.stderr ?? e.message}`);
  }
}

async function durationOf(file) {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

async function fetchSource(entry, src) {
  if (existsSync(src) && statSync(src).size > 0) return "cached";
  if (entry.url.startsWith("repo:")) {
    const from = path.join(repoRoot, entry.url.slice(5));
    if (!existsSync(from)) throw new Error(`no such file in this repository: ${from}`);
    writeFileSync(src, readFileSync(from));
    return "copied";
  }
  const res = await fetch(entry.url, {
    headers: { "User-Agent": "survidle-audio-fetch/1.0 (prototype asset build; contact via repository)" },
  });
  if (!res.ok) throw new Error(`GET ${entry.url} -> ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`GET ${entry.url} returned an empty body`);
  writeFileSync(src, buf);
  return `downloaded ${(buf.length / 1024).toFixed(0)} kB`;
}

async function build(entry) {
  const target = TARGET_DBFS[entry.kind];
  if (target === undefined) throw new Error(`unknown kind ${entry.kind}`);
  const src = path.join(cacheDir, `${entry.file}.src`);
  const got = await fetchSource(entry, src);

  const cut = path.join(cacheDir, `${entry.file}.cut.wav`);
  const seamed = path.join(cacheDir, `${entry.file}.seam.wav`);
  const [start, end] = entry.trim;

  // Cut, fold to mono, resample, and apply whatever this entry asked for on top.
  const chain = ["aformat=channel_layouts=mono", "aresample=48000", ...(entry.filter ? [entry.filter] : [])];
  await ffmpeg(["-ss", String(start), "-to", String(end), "-i", src, "-af", chain.join(","), "-c:a", "pcm_f32le", cut]);

  let measured = cut;
  if (entry.kind === "loop") {
    const len = await durationOf(cut);
    const body = len - SEAM;
    if (body <= SEAM) throw new Error(`loop ${entry.file} is ${len.toFixed(1)} s, too short for a ${SEAM} s seam`);
    await ffmpeg([
      "-i", cut, "-i", cut,
      "-filter_complex",
      `[0:a]atrim=start=${body},asetpts=N/SR/TB[tail];` +
      `[1:a]atrim=0:${body},asetpts=N/SR/TB[head];` +
      `[tail][head]acrossfade=d=${SEAM}:c1=tri:c2=tri[out]`,
      "-map", "[out]", "-c:a", "pcm_f32le", seamed,
    ]);
    measured = seamed;
  }

  const peak = dbOf(await ffmpeg(["-i", measured, "-af", "astats", "-f", "null", "-"]));
  const gain = target - peak;
  const dur = await durationOf(measured);
  // A one-shot's cut can start or end mid-waveform, so it gets edge fades. A
  // loop must not: its head is already continuous with its tail after the
  // seam, and any fade there would punch a hole at every wrap. The engine
  // starts loops at zero gain and ramps them, so nothing clicks in anyway.
  const post = [`volume=${gain.toFixed(2)}dB`];
  if (entry.kind !== "loop") {
    post.push("afade=t=in:st=0:d=0.002", `afade=t=out:st=${Math.max(0, dur - 0.03).toFixed(3)}:d=0.03`);
  }

  const out = path.join(outDir, entry.file);
  await ffmpeg(["-i", measured, "-af", post.join(","), "-c:a", "libopus", "-b:a", "64k", "-vbr", "on", out]);

  rmSync(cut, { force: true });
  rmSync(seamed, { force: true });

  const kB = statSync(out).size / 1024;
  const after = dbOf(await ffmpeg(["-i", out, "-af", "aformat=sample_fmts=fltp,astats", "-f", "null", "-"]));
  console.log(
    `${entry.slot.padEnd(13)} ${entry.file.padEnd(22)} ${dur.toFixed(2).padStart(6)}s  ` +
    `peak ${peak.toFixed(1).padStart(6)} -> ${after.toFixed(1).padStart(5)} dBFS  ${kB.toFixed(0).padStart(4)} kB  (${got})`,
  );
  return { ...entry, duration: dur, peak: after, bytes: statSync(out).size };
}

function block(e) {
  return [
    `### ${e.file}`,
    "",
    `- Slot: \`${e.slot}\` (${e.kind}).`,
    `- Source: ${e.source}.`,
    `- Author: ${e.author}.`,
    `- Licence: ${e.licence}.`,
    `- URL: ${e.url}`,
    `- Processing: cut ${e.trim[0]}-${e.trim[1]} s${e.filter ? `, ${e.filter}` : ""}, mono, 48 kHz, ` +
    `peak normalized to ${TARGET_DBFS[e.kind]} dBFS${e.kind === "loop" ? `, ${SEAM} s loop seam` : ""}, Opus 64 kbps.`,
    `- Duration: ${e.duration.toFixed(2)} s. Decoded peak: ${e.peak.toFixed(1)} dBFS.`,
    `- Note: ${e.note}`,
    "",
  ].join("\n");
}

function writeManifest(built) {
  const cc0 = built.filter((e) => /^CC0/i.test(e.licence));
  const rest = built.filter((e) => !/^CC0/i.test(e.licence));
  const old = existsSync(manifestFile) ? readFileSync(manifestFile, "utf8") : "";
  const at = old.indexOf(SILENT_HEADING);
  const silent = at >= 0 ? old.slice(at) : `${SILENT_HEADING}\n\nNone recorded yet.\n`;
  const body = [
    HEADER,
    "## CC0",
    "",
    cc0.length ? cc0.map(block).join("\n") : "None.\n",
    "## Replace before distribution",
    "",
    rest.length ? rest.map(block).join("\n") : "None.\n",
    silent.trimEnd(),
    "",
  ].join("\n");
  writeFileSync(manifestFile, body);
}

mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
execFileSync(FFMPEG, ["-hide_banner", "-version"], { stdio: "ignore" });

const only = process.argv.slice(2);
const entries = JSON.parse(readFileSync(sourcesFile, "utf8"));
const built = [];
let failed = 0;
for (const entry of entries) {
  if (only.length > 0 && !only.includes(entry.slot) && !only.includes(entry.file)) continue;
  try {
    built.push(await build(entry));
  } catch (e) {
    failed++;
    console.error(`FAIL ${entry.slot} ${entry.file}: ${e.message}`);
  }
}

if (only.length === 0) {
  writeManifest(built);
  const total = built.reduce((n, e) => n + e.bytes, 0);
  console.log(`\n${built.length} files, ${(total / 1024 / 1024).toFixed(2)} MB, manifest.md rewritten.`);
} else {
  console.log(`\n${built.length} files rebuilt; manifest.md left alone (run with no arguments to rewrite it).`);
}

if (failed > 0) {
  console.error(`${failed} entr${failed === 1 ? "y" : "ies"} failed.`);
  process.exit(1);
}
