import { defineConfig } from "vite";

export default defineConfig({
  base: "/prototypes/08/",
  build: {
    rollupOptions: {
      // faces.html is the face self-test page, reached from the game by ?faces=1.
      input: { main: "index.html", faces: "faces.html" },
    },
  },
});
