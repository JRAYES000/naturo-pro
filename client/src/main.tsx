import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Dark mode automatique selon la préférence système (prefers-color-scheme),
// sans aucun stockage côté client (conforme aux conventions du projet).
const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = (dark: boolean) => document.documentElement.classList.toggle("dark", dark);
applyTheme(darkMq.matches);
darkMq.addEventListener("change", (e) => applyTheme(e.matches));

createRoot(document.getElementById("root")!).render(<App />);
