import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Cloudflare's build step (wrangler) auto-injects its own plugin here on
  // first deploy — it needs this array to already exist to find where to do so.
  plugins: [],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        harness: resolve(__dirname, "harness.html"),
      },
    },
  },
});
