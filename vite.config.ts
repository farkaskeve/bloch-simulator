import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Everything (JS, CSS, three.js) is inlined into one dist/index.html that runs offline.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { target: "es2019", assetsInlineLimit: 100_000_000 },
});
