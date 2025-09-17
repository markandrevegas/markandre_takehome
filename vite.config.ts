import { defineConfig, UserConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 9292,
    proxy: {
      "/api": {
        target: "http://localhost:9293",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/cable": {
        target: "ws://localhost:9293",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    setupFiles: ["src/setupTests.ts"],
  },
} as UserConfig);
