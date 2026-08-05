// tools/mixamo-fetch.mjs
// Downloads Mixamo animations as without-skin FBX via the session's own
// export API. Convenience only - the supported fallback is clicking
// Download in the Mixamo UI with the same settings. Usage:
//   node tools/mixamo-fetch.mjs <bearer-token> <character-id> <outdir>
// Token + character id come from the logged-in session (localStorage
// access_token, read via a CDP driver against the open mixamo.com tab).
//
// Endpoints (observed working against a real logged-in session):
//   search:  GET  https://www.mixamo.com/api/v1/products?page=1&limit=24&type=Motion&query=<name>
//   details: GET  https://www.mixamo.com/api/v1/products/<id>?similar=0&character_id=<charId>
//   export:  POST https://www.mixamo.com/api/v1/animations/export
//   monitor: GET  https://www.mixamo.com/api/v1/characters/<charId>/monitor
//   download: plain GET of the signed job_result URL
//
// The monitor endpoint tracks the LATEST job for the character, so exports
// must run sequentially: export one, poll to completion, download, then
// move to the next. If a clip's FBX already exists in outdir, it is
// skipped - this makes reruns after a token refresh (401 mid-run) cheap.

const NAMES = [
  "Great Sword Idle", "Great Sword Walk", "Great Sword Slash",
  "Great Sword Blocking", "Great Sword Impact", "Standing Dodge Backward",
  "Stabbing", "Unarmed Idle", "Two Handed Sword Death",
];

const API = "https://www.mixamo.com/api/v1";
const POLL_MS = 2000;
const TIMEOUT_MS = 60_000;

const [token, characterId, outdir] = process.argv.slice(2);
if (!token || !characterId || !outdir) {
  console.error("usage: node tools/mixamo-fetch.mjs <bearer-token> <character-id> <outdir>");
  process.exit(1);
}

const authHeaders = {
  "X-Api-Key": "mixamo2",
  Authorization: `Bearer ${token}`,
};

async function apiGet(url) {
  const res = await fetch(url, { headers: authHeaders });
  if (res.status === 401) throw new Error(`401 unauthorized: ${url}`);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function searchProduct(name) {
  const url = `${API}/products?page=1&limit=24&type=Motion&query=${encodeURIComponent(name)}`;
  const data = await apiGet(url);
  const exact = (data.results || []).find((r) => r.name === name);
  if (!exact) return null;
  return exact.id;
}

async function fetchDetails(id) {
  const url = `${API}/products/${id}?similar=0&character_id=${characterId}`;
  const data = await apiGet(url);
  return data.details.gms_hash;
}

async function startExport(name, gmsHash) {
  const params = Array.isArray(gmsHash.params)
    ? gmsHash.params.map((p) => p[1]).join(",")
    : String(gmsHash.params ?? "0");
  const body = {
    character_id: characterId,
    gms_hash: [{ ...gmsHash, inplace: true, params }],
    preferences: { format: "fbx7", skin: "false", fps: "30", reducekf: "0" },
    product_name: name,
    type: "Motion",
  };
  const res = await fetch(`${API}/animations/export`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("401 unauthorized: export");
  if (!res.ok) throw new Error(`export -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function pollMonitor() {
  const url = `${API}/characters/${characterId}/monitor`;
  const start = Date.now();
  for (;;) {
    const data = await apiGet(url);
    if (data.status === "completed") return data.job_result;
    if (data.status === "failed") throw new Error("monitor reported failed");
    if (Date.now() - start > TIMEOUT_MS) throw new Error("monitor poll timed out");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function downloadFbx(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await import("node:fs/promises").then((fs) => fs.writeFile(destPath, buf));
}

async function main() {
  const fs = await import("node:fs/promises");
  await fs.mkdir(outdir, { recursive: true });

  const results = [];
  for (const name of NAMES) {
    const destPath = `${outdir}/${name}.fbx`;
    if (await fs.access(destPath).then(() => true).catch(() => false)) {
      console.log(`skip (already downloaded): ${name}`);
      results.push({ name, ok: true, skipped: true });
      continue;
    }
    try {
      console.log(`search: ${name}`);
      const id = await searchProduct(name);
      if (!id) {
        console.error(`NO EXACT MATCH for "${name}" - reporting instead of substituting`);
        results.push({ name, ok: false, reason: "no exact match" });
        continue;
      }
      console.log(`  product id ${id}, fetching details`);
      const gmsHash = await fetchDetails(id);
      console.log(`  starting export`);
      await startExport(name, gmsHash);
      console.log(`  polling monitor`);
      const jobResult = await pollMonitor();
      console.log(`  downloading -> ${destPath}`);
      await downloadFbx(jobResult, destPath);
      console.log(`  done: ${name}`);
      results.push({ name, ok: true, productId: id });
    } catch (err) {
      console.error(`FAILED: ${name}: ${err.message}`);
      results.push({ name, ok: false, reason: err.message });
    }
  }

  console.log("\nSummary:");
  for (const r of results) {
    console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.name}${r.productId ? ` (product ${r.productId})` : ""}${r.reason ? ` - ${r.reason}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} clip(s) failed - fall back to manual UI download for these.`);
    process.exitCode = 1;
  }
}

await main();
