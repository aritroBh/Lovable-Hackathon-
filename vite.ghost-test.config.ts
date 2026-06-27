import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Minimal Vite config for ghost-cursor Playwright integration tests only. */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [react()],
  server: { port: 5199, strictPort: true },
});
