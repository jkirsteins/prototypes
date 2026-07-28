import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    // Real CSS processing (not the default stub) so a test can load the
    // actual stylesheet and read a computed style back out of it, e.g. to
    // catch a cascade collision between two rules that both match the same
    // selector. See tests/hand-layout.test.ts.
    css: true,
  },
});
