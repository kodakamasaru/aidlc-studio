import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy /api to the local Hono studio server (same-origin in the browser).
// Prod: `vite build` emits dist/, served statically by the Hono server.
const API_TARGET = process.env.AIDLC_API_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
