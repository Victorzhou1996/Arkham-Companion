/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import { bundleStats } from "rollup-plugin-bundle-stats";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const arkhamHorrorBase = (env.VITE_ARKHAM_HORROR_BASE || "").replace(/\/$/, "");

  return {
    base:
      env.VITE_ARKHAM_HORROR_MODE === "true"
        ? `${arkhamHorrorBase}/build/`
        : "/",
    build: {
      rolldownOptions: {
        output: {
          assetFileNames: "assets/[name].[hash][extname]",
          chunkFileNames: "assets/[name].[hash].js",
          entryFileNames: "assets/[name].[hash].js",
        },
      },
    },
    css: {
      postcss: {
        plugins: [autoprefixer()],
      },
    },
    plugins: [
      react(),
      bundleStats({
        baseline: true,
        silent: true,
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@test": path.resolve(__dirname, "../test"),
      },
    },
    server: {
      port: 3000,
    },
    preview: {
      port: 3000,
    },
    test: {
      environment: "happy-dom",
      exclude: ["src/test/e2e/**", "node_modules/**"],
      setupFiles: "./src/test/setup.ts",
      passWithNoTests: true,
      coverage: {
        provider: "v8",
      },
    },
  };
});
