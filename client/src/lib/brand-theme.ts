import type { CSSProperties } from "react";

// White-label : convertit la couleur (hex) choisie par le praticien en
// surcharges de variables CSS, pour que TOUTE la page publique adopte sa
// couleur (text-primary, bg-primary, btn-primary-naturo, focus, hover…)
// sans réécrire chaque élément. À poser en `style` sur la racine de la page.

function normalizeHex(hex: string): string {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(h) ? h : "186749"; // repli : vert de marque
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const norm = normalizeHex(hex);
  const r = parseInt(norm.slice(0, 2), 16) / 255;
  const g = parseInt(norm.slice(2, 4), 16) / 255;
  const b = parseInt(norm.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = (((g - b) / d) % 6 + 6) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Texte lisible sur un fond donné : blanc si le fond est foncé, vert sombre sinon.
function readableOn(l: number): string {
  return l < 62 ? "0 0% 100%" : "154 43% 18%";
}

/**
 * Variables CSS dérivées des couleurs du praticien, à poser en `style`
 * sur la racine d'une page publique (white-label).
 */
export function brandThemeVars(primaryHex?: string | null, accentHex?: string | null): CSSProperties {
  const p = hexToHsl(primaryHex || "#186749");
  const a = hexToHsl(accentHex || "#17EC9B");
  return {
    "--primary": `${p.h} ${p.s}% ${p.l}%`,
    "--primary-foreground": readableOn(p.l),
    // Teinte claire dérivée de la couleur primaire (chips, fonds doux, hover).
    "--secondary": `${p.h} ${Math.min(p.s, 60)}% 90%`,
    "--secondary-foreground": `${p.h} ${p.s}% ${Math.max(p.l, 22)}%`,
    "--ring": `${p.h} ${p.s}% ${p.l}%`,
    "--accent": `${a.h} ${a.s}% ${a.l}%`,
    "--accent-foreground": readableOn(a.l),
  } as CSSProperties;
}
