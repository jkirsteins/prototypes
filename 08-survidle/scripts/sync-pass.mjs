/**
 * The save sync's browser pass: two headless Chromium instances, a desktop
 * at 1440 by 900 and a phone at 390 wide with touch emulation, each with
 * its own profile, against a running dev server and a running store.
 *
 * It plays the spec's pass in order: turn sync on at the desktop, open the
 * link on the phone and see the held banner, take over from the phone and
 * see the desktop's revoked banner appear without a reload, reload the
 * desktop from the phone's save, take the world back, then freeze the
 * desktop tab past the grace period, take over on the phone without force,
 * wake the desktop and confirm it does not catch up. Screenshots land in
 * docs/sync-shots/ at both widths.
 *
 *   npm run worker:dev                              (one terminal)
 *   npm run dev                                     (another)
 *   npm run sync-pass                               (a third)
 *
 * E2E_URL names the page, SYNC_URL the store the pass reads directly, and
 * CHROME_PATH the browser. Every reading is taken from the page as the
 * player sees it - the banner's text, the html element's class, the store's
 * own headers - and from `window.survidle.state.minute` for the clock.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.E2E_URL ?? "http://127.0.0.1:5173/prototypes/08/";
const STORE = process.env.SYNC_URL ?? "http://127.0.0.1:8787";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/sync-shots");
const GRACE_MS = 60_000;
const HEARTBEAT_MS = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };
const started = Date.now();
const log = (line) => process.stdout.write(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}\n`);

async function launch(name, port, size) {
  // A browser left over from a killed run answers on the port and would be
  // driven instead of a fresh one, with its tabs in whatever state that run
  // reached. Refuse rather than read a stale page.
  try {
    await fetch(`http://localhost:${port}/json/version`);
    throw new Error(`${name}: something already listens on ${port}; kill the stale browser first`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("already listens")) throw e;
  }
  const profile = mkdtempSync(resolve(tmpdir(), `survidle-sync-${name}-`));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-sandbox", `--window-size=${size}`, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 200; i++) {
    try {
      await fetch(`http://localhost:${port}/json/version`);
      break;
    } catch {
      await sleep(100);
    }
  }
  return { chrome, profile, port, name };
}

async function page(browser) {
  const target = await (await fetch(`http://localhost:${browser.port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) waiting.get(message.id)(message);
    else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? "exception");
    else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  // A reply that never comes is a hang nobody can read; thirty seconds is
  // longer than any evaluate on a page that is solving a world.
  const send = (method, params = {}) => {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((r, reject) => {
      const timer = setTimeout(() => { waiting.delete(callId); reject(new Error(`${browser.name}: ${method} did not answer in 30 s`)); }, 30_000);
      waiting.set(callId, (m) => { clearTimeout(timer); r(m); });
    });
  };
  const evalJs = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(300);
  };
  const waitFor = async (expression, what, tries = 240, gap = 250) => {
    for (let i = 0; i < tries; i++) {
      if (await evalJs(`Boolean(${expression})`)) return;
      await sleep(gap);
    }
    throw new Error(`${browser.name}: ${what} did not happen`);
  };
  const click = (selector) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  /** A real touch on the element's centre, so the phone's tap is a tap and not a synthetic click. */
  const tap = async (selector) => {
    const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!r) throw new Error(`${browser.name}: nothing to tap at ${selector}`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y }] });
    await sleep(40);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const shot = async (name) => {
    const image = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(image.result.data, "base64"));
  };
  const banner = () => evalJs(`(() => { const b = document.getElementById("syncbanner"); return b && !b.hidden ? b.textContent.trim() : ""; })()`);
  const readonly = () => evalJs(`document.documentElement.classList.contains("sync-readonly")`);
  const minute = () => evalJs(`window.survidle.state.minute`);
  return { send, evalJs, errors, goto, waitFor, click, tap, shot, banner, readonly, minute };
}

async function storeHead(code) {
  const res = await fetch(`${STORE}/w/${code}/save`, { method: "HEAD", headers: { "X-Device": "pass" } });
  return { status: res.status, savedAt: Number(res.headers.get("X-Saved-At")), lease: JSON.parse(res.headers.get("X-Lease") ?? "null") };
}

/** Every modal that can stand in front of a landed run, closed so the sim runs. */
async function closeDoors(p) {
  const doors = ["[data-act=welcome-close]", "[data-act=teach-close]", "[data-act=opportunity-modal-ok]", "[data-act=recognition-close]", "[data-act=goal-close]"];
  for (let i = 0; i < 12; i++) {
    let any = false;
    for (const d of doors) if (await p.click(d)) any = true;
    if (!any) break;
    await sleep(200);
  }
}

mkdirSync(OUT, { recursive: true });
log("launching");
const desktop = await launch("desktop", 9481, "1440,900");
const phone = await launch("phone", 9482, "390,844");
try {
  log("browsers up");
  const A = await page(desktop);
  const B = await page(phone);
  log("pages open");
  await B.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await B.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await B.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });

  log("1. The desktop lands");
  // 1. The desktop lands a survivor on a known seed, then opens the page as a player would.
  await A.goto(`${URL_BASE}?seed=42&day=200`);
  await A.waitFor("window.survidle && document.querySelector('[data-act=pick-candidate]')", "the landing");
  await A.click("[data-act=pick-candidate]");
  await A.click("[data-act=land]");
  await A.waitFor("window.survidle && !window.survidle.state.landing", "landing");
  await closeDoors(A);
  await sleep(1500);
  await A.goto(URL_BASE);
  await A.waitFor("window.survidle && !window.survidle.state.landing && document.documentElement.dataset.loading !== 'true'", "the reload");
  await closeDoors(A);
  check((await A.banner()) === "" && !(await A.readonly()), "desktop: no banner and not read-only with sync off");

  log("2. Turn sync on");
  // 2. Turn sync on at the desktop.
  await A.click("[data-act=settings-open]");
  await A.waitFor("document.querySelector('[data-sync=on]') && !document.querySelector('[data-sync=on]').hidden", "the turn-on button");
  await A.click("[data-sync=on]");
  await A.waitFor("document.querySelector('#sync code') && document.querySelector('#sync code').textContent.includes('-')", "the code");
  const code = await A.evalJs("document.querySelector('#sync code').textContent");
  log(`code: ${code}`);
  await A.waitFor("!document.documentElement.classList.contains('sync-readonly') && document.getElementById('syncbanner').hidden", "the desktop running with sync on");
  check(await A.evalJs("document.querySelector('#sync').textContent.includes('This device runs the world')"), "desktop: the settings line says this device runs the world");
  let head = await storeHead(code);
  check(head.status === 200, `store: holds the save after turn on (${head.status})`);
  check(head.lease?.label === "desktop", `store: the desktop holds the lease (${JSON.stringify(head.lease)})`);
  await A.shot("01-desktop-sync-on");
  await A.click("[data-act=settings-close]");

  log("3. The phone opens");
  // 3. The phone opens the link and sees the held banner, read-only.
  await B.goto(`${URL_BASE}?sync=${code}`);
  await B.waitFor("window.survidle && document.documentElement.dataset.loading !== 'true'", "the phone's page");
  await B.waitFor("!document.getElementById('syncbanner').hidden && document.getElementById('syncbanner').textContent.includes('has the world')", "the held banner on the phone");
  const heldText = await B.banner();
  log(`phone banner: ${heldText}`);
  check(heldText.startsWith("The desktop has the world"), `phone: the banner names the desktop (${heldText})`);
  check(await B.readonly(), "phone: read-only class while the desktop holds the world");
  check((await B.evalJs("location.search")) === "", "phone: the sync parameter left the address");
  check((await B.evalJs("localStorage.getItem('survidle.sync.code')")) === code, "phone: the code is stored");
  check((await B.evalJs("getComputedStyle(document.getElementById('app')).pointerEvents")) === "none", "phone: the page under the banner takes no pointer");
  check(await B.evalJs("document.querySelector('[data-act=sync-take-over]').getBoundingClientRect().height >= 40"), "phone: the take-over button is thumb height");
  check((await B.evalJs("window.matchMedia('(pointer: coarse)').matches")), "phone: the emulation reads as a coarse pointer");
  const phoneMinute = await B.minute();
  await sleep(2500);
  check((await B.minute()) === phoneMinute, "phone: the world does not advance while read-only");
  await B.shot("02-phone-held");

  log("4. The phone takes over");
  // 4. The phone takes over; the desktop hears it without a reload.
  await A.evalJs("window.__syncPassMarker = 1");
  const desktopMinuteBeforeRevoke = await A.minute();
  const t0 = Date.now();
  await B.tap("[data-act=sync-take-over]");
  await B.waitFor("document.getElementById('syncbanner').hidden && !document.documentElement.classList.contains('sync-readonly')", "the phone running");
  await A.waitFor("!document.getElementById('syncbanner').hidden && document.getElementById('syncbanner').textContent.includes('took over')", "the desktop's revoked banner");
  const noticed = Date.now() - t0;
  log(`desktop revoked banner after ${noticed} ms`);
  check(noticed < 5000, `desktop: heard the take-over inside five seconds (${noticed} ms)`);
  check((await A.evalJs("window.__syncPassMarker")) === 1, "desktop: no reload happened");
  const revokedText = await A.banner();
  check(revokedText.startsWith("The phone took over"), `desktop: the banner names the phone (${revokedText})`);
  check(await A.readonly(), "desktop: read-only once revoked");
  await sleep(2500);
  check((await A.minute()) <= desktopMinuteBeforeRevoke + 1, "desktop: the world stops on revoke");
  head = await storeHead(code);
  check(head.lease?.label === "phone", `store: the phone holds the lease (${JSON.stringify(head.lease)})`);
  await A.shot("03-desktop-revoked");
  await B.shot("04-phone-running");

  log("5. The desktop reloads");
  // 5. The desktop reloads from the phone's save, then takes the world back; the phone reloads in turn.
  await A.click("[data-act=sync-reload]");
  await A.waitFor("!document.getElementById('syncbanner').hidden && document.getElementById('syncbanner').textContent.includes('The phone has the world')", "the desktop read-only");
  check(await A.readonly(), "desktop: read-only after the reload");
  await A.shot("05-desktop-readonly");
  await A.click("[data-act=sync-take-over]");
  await A.waitFor("document.getElementById('syncbanner').hidden && !document.documentElement.classList.contains('sync-readonly')", "the desktop running again");
  await B.waitFor("!document.getElementById('syncbanner').hidden && document.getElementById('syncbanner').textContent.includes('The desktop took over')", "the phone's revoked banner");
  await B.shot("06-phone-revoked");
  await B.tap("[data-act=sync-reload]");
  await B.waitFor("!document.getElementById('syncbanner').hidden && document.getElementById('syncbanner').textContent.includes('The desktop has the world')", "the phone read-only again");

  log("6. The desktop sleeps");
  // 6. The desktop sleeps past the grace period; the phone takes the lapsed lease without force; the desktop wakes and does not catch up.
  await closeDoors(A);
  const desktopMinuteAsleep = await A.minute();
  await A.send("Page.setWebLifecycleState", { state: "frozen" });
  const lapse = GRACE_MS + HEARTBEAT_MS + 5000;
  log(`desktop frozen; waiting ${lapse / 1000} s for the lease to lapse`);
  await sleep(lapse);
  head = await storeHead(code);
  check(Date.now() - head.lease.lastSeen > GRACE_MS, `store: the desktop's lease lapsed (last seen ${Math.round((Date.now() - head.lease.lastSeen) / 1000)} s ago)`);
  await B.tap("[data-act=sync-refresh]");
  await B.waitFor("document.getElementById('syncbanner').hidden && !document.documentElement.classList.contains('sync-readonly')", "the phone taking the lapsed lease");
  head = await storeHead(code);
  check(head.lease?.label === "phone", `store: the phone holds the lapsed lease (${JSON.stringify(head.lease)})`);
  // The phone's save goes up as its tab hides, so the desktop wakes to a newer save.
  const savedBefore = head.savedAt;
  await sleep(2000);
  await B.send("Page.setWebLifecycleState", { state: "frozen" });
  await sleep(1500);
  await B.send("Page.setWebLifecycleState", { state: "active" });
  for (let i = 0; i < 40 && (await storeHead(code)).savedAt === savedBefore; i++) await sleep(250);
  head = await storeHead(code);
  check(head.savedAt > savedBefore, "store: the phone's put landed as its tab hid");
  await B.shot("07-phone-took-lapsed");
  await A.send("Page.setWebLifecycleState", { state: "active" });
  await A.waitFor("!document.getElementById('syncbanner').hidden && document.getElementById('syncbanner').textContent.includes('took over')", "the woken desktop learning it was revoked");
  check((await A.minute()) === desktopMinuteAsleep, `desktop: no catch-up after waking (${desktopMinuteAsleep} -> ${await A.minute()})`);
  check(await A.readonly(), "desktop: read-only after waking");
  await A.shot("08-desktop-woken-no-catchup");

  log("7. Turn off on the phone");
  // 7. Turn off on the phone: it keeps running its world; the store is left as it is.
  // Clicks rather than taps here: a tab that has been frozen and woken no
  // longer takes dispatched touch events in headless Chromium, and the tap
  // has been proved above.
  await B.click("[data-act=settings-open]");
  await B.waitFor("document.querySelector('[data-sync=off]') && !document.querySelector('[data-sync=off]').hidden", "the phone's turn-off button");
  await B.click("[data-sync=off]");
  await B.waitFor("localStorage.getItem('survidle.sync.code') === null", "the phone forgetting the code");
  check((await B.banner()) === "" && !(await B.readonly()), "phone: runs on with sync off");
  head = await storeHead(code);
  check(head.status === 200, "store: the save stays after turn off");
  await B.shot("09-phone-sync-off");

  for (const [name, p] of [["desktop", A], ["phone", B]]) check(p.errors.length === 0, `${name}: the page threw nothing (${p.errors.join(" | ")})`);
} catch (err) {
  // Said before the cleanup, which can fail on its own while Chromium is still writing its profile.
  log(`sync pass: threw ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  failures.push(String(err instanceof Error ? err.message : err));
} finally {
  desktop.chrome.kill();
  phone.chrome.kill();
  await sleep(1000);
  for (const dir of [desktop.profile, phone.profile]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      // A profile left in the temp dir is not a failed pass.
    }
  }
}
if (failures.length) {
  log(`sync pass: ${failures.length} failed`);
  for (const f of failures) log(`  - ${f}`);
  process.exit(1);
}
log("sync pass: ok");
