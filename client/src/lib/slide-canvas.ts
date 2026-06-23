/**
 * client/src/lib/slide-canvas.ts — Rendu des slides de carrousel en images.
 *
 * Approche hybride : le TEXTE est dessiné par-dessus le fond (texte réel, accents
 * parfaits), le fond venant de l'IA (ou d'un dégradé de marque en repli). Style
 * « éditorial » : texte sur la photo + voile vert dégradé garanti pour la lisibilité.
 * Format Instagram 4:5 (1080×1350). Aucune dépendance externe (Canvas natif).
 *
 * `wrapLines` est PUR (fonction de mesure injectée) → testable hors navigateur.
 */

export interface CarouselSlide { kicker: string; title: string; body: string; }
export interface CarouselDeck { slides: CarouselSlide[]; caption: string; hashtags: string[]; }
export interface RenderedSlide { index: number; blob: Blob; url: string; }

const W = 1080;
const H = 1350;
const PAD = 80;
const PRIMARY = "#186749";
const ACCENT = "#17EC9B";
const DARK = "#16382b";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

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

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
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
  ctx.fillStyle = "rgba(16,40,30,0.30)"; // léger assombrissement global
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, H * 0.32, 0, H); // voile bas pour le texte
  g.addColorStop(0, "rgba(16,40,30,0)");
  g.addColorStop(1, "rgba(14,36,27,0.93)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: CarouselSlide,
  index: number,
  total: number,
  practitionerName: string,
): void {
  drawScrim(ctx);
  const kicker = stripMarkdown(slide.kicker);
  const title = stripMarkdown(slide.title);
  const body = stripMarkdown(slide.body);
  const measure = (s: string) => ctx.measureText(s).width;
  const maxTextW = W - PAD * 2;

  // En-tête : nom de la praticienne (gauche) + numéro de slide (droite).
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(practitionerName, PAD, 100);
  ctx.textAlign = "right";
  ctx.fillStyle = ACCENT;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(`${index + 1} / ${total}`, W - PAD, 100);
  ctx.textAlign = "left";

  // Pré-calcul des lignes.
  ctx.font = `700 64px ${FONT}`;
  const titleLines = wrapLines(measure, title, maxTextW).slice(0, 4);
  ctx.font = `400 34px ${FONT}`;
  const bodyLines = wrapLines(measure, body, maxTextW).slice(0, 5);

  const kickerH = kicker ? 30 + 22 : 0;
  const titleH = titleLines.length * 76;
  const bodyH = bodyLines.length ? 26 + bodyLines.length * 46 : 0;
  const blockH = kickerH + titleH + bodyH;

  const dotsY = H - 96;
  let y = H - 156 - blockH; // ancré en bas
  if (y < 380) y = 380;

  // Kicker (accent).
  if (kicker) {
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = ACCENT;
    ctx.fillText(kicker, PAD, y + 26);
    y += kickerH;
  }
  // Titre (blanc, gras).
  ctx.font = `700 64px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  for (const line of titleLines) { ctx.fillText(line, PAD, y + 52); y += 76; }
  // Corps (blanc atténué).
  if (bodyLines.length) {
    y += 26;
    ctx.font = `400 34px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const line of bodyLines) { ctx.fillText(line, PAD, y + 28); y += 46; }
  }

  // Pastilles de progression.
  let dx = PAD;
  for (let i = 0; i < total; i++) {
    const active = i === index;
    ctx.fillStyle = active ? ACCENT : "rgba(255,255,255,0.4)";
    const w = active ? 20 : 8;
    ctx.fillRect(dx, dotsY, w, 6);
    dx += w + 8;
  }
}

/**
 * Rend chaque slide du deck en PNG 1080×1350. `background` = data-URL (fond IA)
 * ou `null` (→ dégradé de marque). Renvoie blobs + URLs d'aperçu (à révoquer par
 * l'appelant lors d'un nouveau rendu).
 */
export async function renderCarouselSlides(
  deck: CarouselDeck,
  opts: { background: string | null; practitionerName: string },
): Promise<RenderedSlide[]> {
  try { await (document as any).fonts?.ready; } catch { /* police par défaut */ }
  const bg = opts.background ? await loadImage(opts.background) : null;

  const out: RenderedSlide[] = [];
  for (let i = 0; i < deck.slides.length; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    if (bg) drawCover(ctx, bg); else drawBrandGradient(ctx);
    drawSlide(ctx, deck.slides[i], i, deck.slides.length, opts.practitionerName);
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
