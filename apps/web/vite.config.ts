import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.CODEX_CONFIG_BOARD_API_PORT ?? "1455";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
