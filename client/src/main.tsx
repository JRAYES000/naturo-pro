import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Dark mode par défaut pour tout le monde (appliqué avant le rendu React pour
// éviter tout flash). La préférence par compte ("dark" / "light"), stockée côté
// backend (cf. users.theme_preference), est appliquée ensuite par AuthProvider
// une fois le profil chargé — aucun stockage côté client (conforme aux conventions).
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
