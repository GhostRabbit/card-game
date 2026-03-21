import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@compile/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: parseInt(process.env.VITE_PORT || "5173"),
    proxy: {
      "/socket.io": {
        target: `http://localhost:${process.env.VITE_API_PORT || "3000"}`,
        ws: true,
      },
    },
  },
});
