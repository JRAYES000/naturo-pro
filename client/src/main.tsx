import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Thème clair par défaut pour tout le monde : on ne pose aucune classe ici
// (absence de ".dark" = thème clair). La préférence par compte ("dark"/"light"),
// stockée côté backend (cf. users.theme_preference), est appliquée ensuite par
// AuthProvider une fois le profil chargé — aucun stockage côté client.

createRoot(document.getElementById("root")!).render(<App />);
