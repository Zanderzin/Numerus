import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// in dev, every backend call goes to the python api (numerus-api) on port 8000.
// on vercel the same paths are routed to the numerus-api service by vercel.json.
const API = "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // /py/* → api python (the api also accepts the /py prefix, so no rewrite is needed)
      "/py": { target: API, changeOrigin: true },
      // pluggy routes now live in the python api (app/pluggy.py)
      "/api/pluggy": { target: API, changeOrigin: true },
    },
  },
});
