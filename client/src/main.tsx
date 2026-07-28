import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// L'app utilise le hash routing (/#/p/mon-slug). Une URL en CHEMIN — celle qu'une
// praticienne partage naturellement, app.ecole-naturo.fr/p/mon-slug — arrive donc sans
// hash : le routeur retombait sur la page d'accueil de Naturo Pro au lieu de la page de
// réservation. On convertit le chemin en hash avant le montage de React, ce qui rend les
// deux formes équivalentes. `replace` évite de polluer l'historique du navigateur.
// (Le pré-rendu SEO côté serveur, lui, répond toujours sur le chemin : les robots qui
// n'exécutent pas JS reçoivent bien les balises meta de la praticienne.)
if (!window.location.hash) {
  const { pathname, search } = window.location;
  window.location.replace(pathname === "/" ? "/#/" : `/#${pathname}${search}`);
}

// Thème clair par défaut pour tout le monde : on ne pose aucune classe ici
// (absence de ".dark" = thème clair). La préférence par compte ("dark"/"light"),
// stockée côté backend (cf. users.theme_preference), est appliquée ensuite par
// AuthProvider une fois le profil chargé — aucun stockage côté client.

createRoot(document.getElementById("root")!).render(<App />);
