import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "WebMPC",
        short_name: "WebMPC",
        description: "Local-first browser MPC sampler",
        theme_color: "#101418",
        background_color: "#101418",
        display: "standalone",
        icons: []
      }
    })
  ]
});
