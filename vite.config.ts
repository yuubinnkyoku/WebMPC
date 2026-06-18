import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    allowedHosts: ["asus.tail4fb972.ts.net"]
  },
  preview: {
    allowedHosts: ["asus.tail4fb972.ts.net"]
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "WebMPC",
        short_name: "WebMPC",
        description: "Local-first browser MPC sampler",
        start_url: "/",
        scope: "/",
        theme_color: "#101418",
        background_color: "#101418",
        display: "standalone",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
