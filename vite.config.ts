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
    // changé sont re-téléchargés (le vendor React, les primitives Radix ne bougent
    // quasi jamais d'une version à l'autre).
    //
    // vendor-calendar (react-big-calendar/date-fns/react-day-picker) a été retiré
    // volontairement du chunking manuel : ces libs n'étaient utilisées QUE par
    // Agenda et Availability, mais un manualChunk force Vite à générer un
    // <link rel="modulepreload"> pour CE chunk sur TOUTES les pages, y compris
    // les routes publiques (landing, page de réservation /p/:slug, login) qui ne
    // les chargent jamais. Sans entrée manuelle, Rollup fait du chunk-splitting
    // automatique et co-localise ces libs dans les chunks des pages qui les
    // importent réellement — plus de préchargement fantôme sur le public.
    //
    // vendor-charts a été supprimé : recharts n'était importé que par
    // client/src/components/ui/chart.tsx, lui-même jamais importé nulle part.
    // Le chunk généré faisait 482 octets (tree-shaké à vide) mais coûtait quand
    // même un modulepreload sur chaque page. chart.tsx a été supprimé et
    // recharts retiré de package.json.
    rollupOptions: {
      output: {
        manualChunks: {
          // Runtime React + query : partagé par TOUTES les pages.
          "vendor-react": ["react", "react-dom", "wouter", "@tanstack/react-query"],
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
