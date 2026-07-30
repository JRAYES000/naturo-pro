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
    // Chunking manuel : on regroupe les gros modules "lourds et rarement modifiés"
    // dans des chunks vendor séparés pour maximiser le cache long-terme. Quand la
    // praticienne revient après un déploiement, seuls les chunks qui ont vraiment
    // changé sont re-téléchargés (le vendor React, le calendrier, les charts, les
    // primitives Radix ne bougent quasi jamais d'une version à l'autre).
    rollupOptions: {
      output: {
        manualChunks: {
          // Runtime React + query : partagé par TOUTES les pages.
          "vendor-react": ["react", "react-dom", "wouter", "@tanstack/react-query"],
          // Calendrier : n'est utilisé que dans Agenda + Availability.
          "vendor-calendar": ["react-big-calendar", "date-fns", "react-day-picker"],
          // Charts : uniquement Stats. ~90 Ko qu'on évitait de charger sur Landing.
          "vendor-charts": ["recharts"],
          // Primitives Radix : utilisées partout mais mises à jour rarement.
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
