import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { pluggyApi } from "./server/pluggy";

export default defineConfig(({ mode }) => {
  // "" prefix loads every var, but only the vite server sees them
  // nothing without the VITE_ prefix is exposed to the browser bundle
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), pluggyApi(env)],
    server: {
      proxy: {
        // repassa /py/* para a api python na porta 8000
        "/py": {
          target: "http://localhost:8000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/py/, ""),
        },
      },
    },
  };
});