import { defineConfig } from "vite";
import packageJson from "./package.json";

const buildTimestamp = new Date()
  .toISOString()
  .replace(/\.\d+Z$/, "")
  .replace(/[-:]/g, "")
  .replace("T", "-");

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      host: "localhost",
      clientPort: 5173
    },
    proxy: {
      "/api": "http://localhost:8787"
    }
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
    "import.meta.env.VITE_BUILD_TIMESTAMP": JSON.stringify(buildTimestamp)
  }
});
