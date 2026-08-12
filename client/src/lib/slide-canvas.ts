/**
 * client/src/lib/slide-canvas.ts — Rendu des slides de carrousel en images.
 *
 * Trois gabarits selon le rôle de la slide (fini les slides toutes identiques) :
 *   • cover   (1ʳᵉ)        — photo IA plein cadre + voile + titre serif XXL + « Glisse → »
 *   • content (milieu)     — carte crème très lisible : texte sombre, numéro en
 *                            filigrane, formes douces alternées pour le rythme
 *   • cta     (dernière)   — dégradé de marque + accroche + « Enregistre ce post »
 *
 * Format Instagram 4:5 (1080×1350). Typos de la marque (Spectral pour l'affichage,
 * Nunito pour le texte) déjà auto-hébergées par l'app. Aucune dépendance externe.
 *
 * `wrapLines` / `stripMarkdown` / `slideRole` sont PURS → testables hors navigateur.
 */

export interface CarouselSlide { kicker: string; title: string; body: string; }
export interface CarouselDeck { slides: CarouselSlide[]; caption: string; hashtags: string[]; }
export interface RenderedSlide { index: number; blob: Blob; url: string; }

const W = 1080;
const H = 1350;
const PAD = 88;
const PRIMARY = "#186749";
const ACCENT = "#17EC9B";
const DARK = "#16382b";
const CREAM = "#FAF8F4";
const MINT = "#d8f3dc";
const HEADING = "#1b4332";
const INK = "#2f3a34";
const SANS = '"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const DISPLAY = '"Spectral", Georgia, "Times New Roman", serif';

/** Rôle d'une slide selon sa position. PURE. */
export function slideRole(index: number, total: number): "cover" | "content" | "cta" {
  if (index === 0) return "cover";
  if (total >= 2 && index === total - 1) return "cta";
  return "content";
}

/** Retire les marqueurs Markdown (gras/italique/code…) pour un rendu Canvas en texte brut. PURE. */
export function stripMarkdown(s: string): string {
  return (s || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")     // **gras**
    .replace(/__(.*?)__/g, "$1")          // __gras__
    .replace(/~~(.*?)~~/g, "$1")          // ~~barré~~
    .replace(/`([^`]*)`/g, "$1")          // `code`
    .replace(/\*(.*?)\*/g, "$1")          // *italique*
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1$2") // _italique_ (pas les snake_case)
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")   // # titres
    .replace(/[*_`]{2,}/g, "")            // résidus de marqueurs non appariés
    .trim();
}

/** Découpe `text` en lignes tenant dans `maxWidth` selon la fonction de mesure. PURE. */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = cur + " " + words[i];
    if (measure(candidate) <= maxWidth) cur = candidate;
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob a renvoyé null"))), "image/png"));
}

// ── Primitives de dessin ─────────────────────────────────────────────────────

function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawBrandGradient(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#2f6f53");
  g.addColorStop(0.55, PRIMARY);
  g.addColorStop(1, DARK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawScrim(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(16,40,30,0.32)";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, H * 0.28, 0, H);
  g.addColorStop(0, "rgba(16,40,30,0)");
  g.addColorStop(1, "rgba(14,36,27,0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  try { (ctx as any).letterSpacing = `${px}px`; } catch { /* non supporté */ }
}

/** Pastille arrondie avec texte ; renvoie sa largeur. */
function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, text: string,
  opts: { bg: string; fg: string; border?: string; font: string; padX?: number; padY?: number; align?: "left" | "right" },
): number {
  ctx.font = opts.font;
  const padX = opts.padX ?? 28, padY = opts.padY ?? 18;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2, h = 34 + padY * 2;
  const px = opts.align === "right" ? x - w : x;
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(px, y, w, h, h / 2);
  else ctx.rect(px, y, w, h);
  ctx.fillStyle = opts.bg;
  ctx.fill();
  if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = opts.fg;
  ctx.textAlign = "left";
  ctx.fillText(text, px + padX, y + padY + 27);
  return w;
}

/** Choisit la plus grande taille de police dont le texte tient en `maxLines`. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { weight: number | string; family: string; sizes: number[]; maxWidth: number; maxLines: number },
): { size: number; lines: string[] } {
  const measure = (s: string) => ctx.measureText(s).width;
  for (const size of opts.sizes) {
    ctx.font = `${opts.weight} ${size}px ${opts.family}`;
    const lines = wrapLines(measure, text, opts.maxWidth);
    if (lines.length <= opts.maxLines) return { size, lines };
  }
  const size = opts.sizes[opts.sizes.length - 1];
  ctx.font = `${opts.weight} ${size}px ${opts.family}`;
  return { size, lines: wrapLines(measure, text, opts.maxWidth).slice(0, opts.maxLines) };
}

function drawDots(ctx: CanvasRenderingContext2D, index: number, total: number, active: string, rest: string): void {
  const y = H - 96;
  let dx = PAD;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i === index ? active : rest;
    const w = i === index ? 22 : 8;
    ctx.fillRect(dx, y, w, 6);
    dx += w + 8;
  }
}

// ── Gabarits ─────────────────────────────────────────────────────────────────

function drawCoverSlide(
  ctx: CanvasRenderingContext2D, slide: CarouselSlide, total: number, name: string,
): void {
  drawScrim(ctx);
  const maxTextW = W - PAD * 2;

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `600 32px ${SANS}`;
  ctx.fillText(name, PAD, 108);

  // Bloc texte ancré en bas, au-dessus des pastilles.
  const kicker = stripMarkdown(slide.kicker);
  const title = stripMarkdown(slide.title);
  const body = stripMarkdown(slide.body);

  const t = fitText(ctx, title, { weight: 600, family: DISPLAY, sizes: [96, 84, 74], maxWidth: maxTextW, maxLines: 5 });
  const titleLH = Math.round(t.size * 1.14);
  ctx.font = `400 40px ${SANS}`;
  const bodyLines = body ? wrapLines((s) => ctx.measureText(s).width, body, maxTextW).slice(0, 3) : [];

  const kickerH = kicker ? 70 + 34 : 0;
  const blockH = kickerH + t.lines.length * titleLH + (bodyLines.length ? 30 + bodyLines.length * 54 : 0);
  let y = H - 190 - blockH;
  if (y < 320) y = 320;

  if (kicker) {
    setSpacing(ctx, 2);
    drawPill(ctx, PAD, y, kicker.toUpperCase(), { bg: ACCENT, fg: DARK, font: `800 27px ${SANS}` });
    setSpacing(ctx, 0);
    y += kickerH;
  }

  // Titre serif avec ombre douce pour se détacher de la photo.
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  ctx.font = `600 ${t.size}px ${DISPLAY}`;
  ctx.fillStyle = "#ffffff";
  for (const line of t.lines) { ctx.fillText(line, PAD, y + Math.round(t.size * 0.9)); y += titleLH; }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (bodyLines.length) {
    y += 30;
    ctx.font = `400 40px ${SANS}`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (const line of bodyLines) { ctx.fillText(line, PAD, y + 34); y += 54; }
  }

  drawDots(ctx, 0, total, ACCENT, "rgba(255,255,255,0.4)");
  if (total > 1) {
    drawPill(ctx, W - PAD, H - 130, "Glisse →", {
      bg: "rgba(255,255,255,0.14)", fg: "#ffffff", border: "rgba(255,255,255,0.4)",
      font: `700 30px ${SANS}`, align: "right",
    });
  }
}

function drawContentSlide(
  ctx: CanvasRenderingContext2D, slide: CarouselSlide, index: number, total: number, name: string,
): void {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  // Rythme visuel : forme douce alternée + numéro en filigrane.
  ctx.beginPath();
  if (index % 2 === 1) ctx.arc(W + 60, -60, 430, 0, Math.PI * 2);
  else ctx.arc(-90, H + 40, 400, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(216,243,220,0.6)"; // MINT translucide
  ctx.fill();

  ctx.textAlign = "right";
  ctx.font = `600 230px ${DISPLAY}`;
  ctx.fillStyle = "rgba(24,103,73,0.08)";
  ctx.fillText(String(index + 1).padStart(2, "0"), W - 48, 260);
  ctx.textAlign = "left";

  // En-tête.
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = "rgba(24,103,73,0.8)";
  ctx.fillText(name, PAD, 104);
  ctx.textAlign = "right";
  ctx.font = `800 30px ${SANS}`;
  ctx.fillStyle = PRIMARY;
  ctx.fillText(`${index + 1} / ${total}`, W - PAD, 104);
  ctx.textAlign = "left";

  const kicker = stripMarkdown(slide.kicker);
  const title = stripMarkdown(slide.title);
  const body = stripMarkdown(slide.body);
  const maxTextW = W - PAD * 2;

  const t = fitText(ctx, title, { weight: 800, family: SANS, sizes: [68, 60, 52], maxWidth: maxTextW, maxLines: 4 });
  const titleLH = Math.round(t.size * 1.2);
  const b = body
    ? fitText(ctx, body, { weight: 400, family: SANS, sizes: [41, 38], maxWidth: maxTextW, maxLines: 7 })
    : { size: 41, lines: [] as string[] };
  const bodyLH = Math.round(b.size * 1.42);

  const kickerH = kicker ? 46 + 40 : 0;
  const blockH = kickerH + t.lines.length * titleLH + (b.lines.length ? 34 + b.lines.length * bodyLH : 0);
  const zoneTop = 230, zoneBottom = H - 170;
  let y = zoneTop + Math.max(0, (zoneBottom - zoneTop - blockH) / 2 - 20);

  if (kicker) {
    ctx.fillStyle = ACCENT;
    ctx.fillRect(PAD, y, 64, 8);
    setSpacing(ctx, 2);
    ctx.font = `800 30px ${SANS}`;
    ctx.fillStyle = PRIMARY;
    ctx.fillText(kicker.toUpperCase(), PAD, y + 62);
    setSpacing(ctx, 0);
    y += kickerH;
  }

  ctx.font = `800 ${t.size}px ${SANS}`;
  ctx.fillStyle = HEADING;
  for (const line of t.lines) { ctx.fillText(line, PAD, y + Math.round(t.size * 0.85)); y += titleLH; }

  if (b.lines.length) {
    y += 34;
    ctx.font = `400 ${b.size}px ${SANS}`;
    ctx.fillStyle = INK;
    for (const line of b.lines) { ctx.fillText(line, PAD, y + Math.round(b.size * 0.85)); y += bodyLH; }
  }

  drawDots(ctx, index, total, PRIMARY, "rgba(24,103,73,0.25)");
  ctx.textAlign = "right";
  ctx.font = `800 36px ${SANS}`;
  ctx.fillStyle = PRIMARY;
  ctx.fillText("→", W - PAD, H - 84);
  ctx.textAlign = "left";
}

function drawCtaSlide(
  ctx: CanvasRenderingContext2D, slide: CarouselSlide, index: number, total: number, name: string,
): void {
  drawBrandGradient(ctx);

  // Anneau décoratif accent.
  ctx.beginPath();
  ctx.arc(W - 150, 190, 170, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(23,236,155,0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `600 32px ${SANS}`;
  ctx.fillText(name, PAD, 108);

  const kicker = stripMarkdown(slide.kicker);
  const title = stripMarkdown(slide.title);
  const body = stripMarkdown(slide.body);
  const maxTextW = W - PAD * 2;

  const t = fitText(ctx, title, { weight: 600, family: DISPLAY, sizes: [80, 70, 62], maxWidth: maxTextW, maxLines: 4 });
  const titleLH = Math.round(t.size * 1.16);
  ctx.font = `400 40px ${SANS}`;
  const bodyLines = body ? wrapLines((s) => ctx.measureText(s).width, body, maxTextW).slice(0, 5) : [];

  const kickerH = kicker ? 70 + 34 : 0;
  const footerH = 150; // séparateur + rappel « enregistre »
  const blockH = kickerH + t.lines.length * titleLH + (bodyLines.length ? 30 + bodyLines.length * 54 : 0);
  const zoneTop = 240, zoneBottom = H - 160 - footerH;
  let y = zoneTop + Math.max(0, (zoneBottom - zoneTop - blockH) / 2);

  if (kicker) {
    setSpacing(ctx, 2);
    drawPill(ctx, PAD, y, kicker.toUpperCase(), { bg: ACCENT, fg: DARK, font: `800 27px ${SANS}` });
    setSpacing(ctx, 0);
    y += kickerH;
  }

  ctx.font = `600 ${t.size}px ${DISPLAY}`;
  ctx.fillStyle = "#ffffff";
  for (const line of t.lines) { ctx.fillText(line, PAD, y + Math.round(t.size * 0.9)); y += titleLH; }

  if (bodyLines.length) {
    y += 30;
    ctx.font = `400 40px ${SANS}`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const line of bodyLines) { ctx.fillText(line, PAD, y + 34); y += 54; }
  }

  // Pied CTA : séparateur + rappel d'enregistrement (mécanique Instagram).
  const sepY = H - 210;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(PAD, sepY, W - PAD * 2, 2);
  ctx.font = `700 32px ${SANS}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText("📌 Enregistre ce post pour le retrouver", PAD, sepY + 62);

  drawDots(ctx, index, total, ACCENT, "rgba(255,255,255,0.4)");
}

// ── API ──────────────────────────────────────────────────────────────────────

/** Force le chargement des polices de marque avant le rendu Canvas. */
async function ensureFonts(): Promise<void> {
  try {
    const f = (document as any).fonts;
    if (!f) return;
    await Promise.all([
      f.load(`600 96px ${DISPLAY}`),
      f.load(`800 68px ${SANS}`),
      f.load(`400 41px ${SANS}`),
      f.load(`600 32px ${SANS}`),
    ].map((p: Promise<unknown>) => p.catch(() => null)));
    await f.ready;
  } catch { /* police système en repli */ }
}

/**
 * Rend chaque slide du deck en PNG 1080×1350. `background` = data-URL (fond IA,
 * utilisé sur la couverture uniquement) ou `null` (→ dégradé de marque). Renvoie
 * blobs + URLs d'aperçu (à révoquer par l'appelant lors d'un nouveau rendu).
 */
export async function renderCarouselSlides(
  deck: CarouselDeck,
  opts: { background: string | null; practitionerName: string },
): Promise<RenderedSlide[]> {
  await ensureFonts();
  const bg = opts.background ? await loadImage(opts.background) : null;

  const out: RenderedSlide[] = [];
  const total = deck.slides.length;
  for (let i = 0; i < total; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    const role = slideRole(i, total);
    if (role === "cover") {
      if (bg) drawCoverImage(ctx, bg); else drawBrandGradient(ctx);
      drawCoverSlide(ctx, deck.slides[i], total, opts.practitionerName);
    } else if (role === "cta") {
      drawCtaSlide(ctx, deck.slides[i], i, total, opts.practitionerName);
    } else {
      drawContentSlide(ctx, deck.slides[i], i, total, opts.practitionerName);
    }

    const blob = await canvasToPng(canvas);
    out.push({ index: i, blob, url: URL.createObjectURL(blob) });
  }
  return out;
}

/** Construit le contenu de `legende.txt` (légende + hashtags) pour le ZIP. */
export function buildCaptionFile(deck: CarouselDeck): string {
  const parts = [deck.caption?.trim()].filter(Boolean);
  if (deck.hashtags?.length) parts.push(deck.hashtags.join(" "));
  return parts.join("\n\n") + "\n";
}
