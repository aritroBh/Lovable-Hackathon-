import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ include: ["node-mac-permissions"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ include: ["node-mac-permissions"] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          overlay: resolve(__dirname, "src/preload/overlay.ts"),
          clinical: resolve(__dirname, "src/preload/clinical.ts"),
          dashboard: resolve(__dirname, "src/preload/dashboard.ts"),
          ambient: resolve(__dirname, "src/preload/ambient.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
    // ponytail: Skills Hub owns :5173 — Specter overlay must stay on :5174
    server: {
      port: 5174,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          overlay: resolve(__dirname, "src/renderer/overlay.html"),
          clinical: resolve(__dirname, "src/renderer/clinical.html"),
          dashboard: resolve(__dirname, "src/renderer/dashboard.html"),
          ghostCursorTest: resolve(
            __dirname,
            "src/renderer/ghost-cursor-test.html",
          ),
        },
      },
    },
  },
});
