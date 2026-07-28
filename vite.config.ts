import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // Base ABSOLUE. Avec "./", les balises <script src="./assets/…"> se résolvaient
  // relativement à l'URL courante : depuis https://app.ecole-naturo.fr/p/marie-dupont
  // le navigateur demandait /p/assets/index-*.js, le catch-all renvoyait index.html,
  // et le module refusait de s'exécuter → PAGE BLANCHE sur le lien de réservation
  // que les praticiennes partagent. L'app est servie à la racine du domaine.
  base: "/",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
