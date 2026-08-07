import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// L'app privée (agenda, dashboard, login...) utilise le hash routing (/#/agenda) —
// choix documenté dans CLAUDE.md, conservé tel quel. Une URL en CHEMIN sans hash sur
// une route privée (ex. /login tapé directement) est donc convertie en hash avant le
// montage de React, ce qui rend les deux formes équivalentes.
// `history.replaceState`, pas `window.location.replace` : ce dernier déclenche une
// vraie navigation (rechargement de document) dès que le pathname change, ce que
// Google interprétait comme une redirection côté client. `replaceState` produit la
// même URL finale sans aucun aller-retour réseau.
//
// EXCEPTION (scope resserré, Action 8) : la racine "/" et les pages praticien
// publiques "/p/:slug" (+ leur tunnel de réservation "/p/:slug/book", et "/book" sur
// un sous-domaine tenant) restent en URL propre, sans conversion. Ce sont des pages
// PUBLIQUES, atteintes avant tout login — la justification historique du hash mode
// ("acceptable car l'app est derrière login", docs/ARCHITECTURE.md) ne s'applique pas
// à elles, et le serveur a déjà un catch-all (server/static.ts) qui sert index.html
// sur n'importe quel chemin : pas besoin de hash pour que le routing fonctionne côté
// serveur. Le reste de l'app (login, register, /app/*, /admin/*...) garde le hash
// routing intact, sans aucune modification de comportement.
const PUBLIC_PATH_ROUTES = /^\/(p\/[^/]+(\/book(\/\d+)?)?\/?|book(\/\d+)?\/?)?$/;
if (!window.location.hash && !PUBLIC_PATH_ROUTES.test(window.location.pathname)) {
  const { pathname, search } = window.location;
  history.replaceState(null, "", pathname === "/" ? "/#/" : `/#${pathname}${search}`);
}

// Thème clair par défaut pour tout le monde : on ne pose aucune classe ici
// (absence de ".dark" = thème clair). La préférence par compte ("dark"/"light"),
// stockée côté backend (cf. users.theme_preference), est appliquée ensuite par
// AuthProvider une fois le profil chargé — aucun stockage côté client.

createRoot(document.getElementById("root")!).render(<App />);
