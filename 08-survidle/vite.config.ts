import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/**
 * What this bundle is, asked of git at build time so the footer can say which
 * deploy is live. Outside a git checkout - a tarball, or a CI job that fetched
 * no history - the SHA the runner names stands in, and "dev" where there is
 * not even that; the footer would rather read "dev" than claim a version.
 */
function git(command: string): string {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const version = git("git describe --tags --always --dirty") || process.env.GITHUB_SHA?.slice(0, 7) || "dev";
const builtAt = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(version),
    __BUILT_AT__: JSON.stringify(builtAt),
  },
  base: "/prototypes/08/",
  build: {
    rollupOptions: {
      // faces.html is the face self-test page, reached from the game by ?faces=1.
      input: { main: "index.html", faces: "faces.html" },
    },
  },
});
