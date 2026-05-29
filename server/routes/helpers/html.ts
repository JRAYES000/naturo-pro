/**
 * server/routes/helpers/html.ts
 *
 * Helpers HTML pour les pages publiques de feedback (confirm/cancel).
 * Extrait de server/routes.ts (Phase 4.0 — split par domaine). Comportement identique.
 */

export function escapeHtmlMin(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function htmlFeedbackPage(
  variant: "success" | "warning" | "error",
  title: string,
  message: string,
): string {
  const colors = {
    success: { bg: "#d1f0e0", border: "#186749", text: "#0f4d35", icon: "✓" },
    warning: { bg: "#fff4d6", border: "#b8860b", text: "#7a5800", icon: "⚠" },
    error:   { bg: "#fde2e2", border: "#c0392b", text: "#922020", icon: "✕" },
  }[variant];
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtmlMin(title)}</title>
<style>
  body { margin:0; padding:0; min-height:100vh; background:#f7faf9; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; display:flex; align-items:center; justify-content:center; }
  .card { max-width:480px; width:90%; margin:24px; background:#fff; border-radius:14px; box-shadow:0 2px 12px rgba(0,0,0,0.06); overflow:hidden; }
  .head { padding:32px 28px 20px; text-align:center; background:${colors.bg}; border-bottom:3px solid ${colors.border}; }
  .icon { display:inline-flex; align-items:center; justify-content:center; width:56px; height:56px; border-radius:50%; background:${colors.border}; color:#fff; font-size:32px; font-weight:700; margin-bottom:12px; }
  h1 { margin:0; font-size:20px; color:${colors.text}; font-weight:700; }
  .body { padding:24px 28px 32px; text-align:center; color:#1a1a1a; line-height:1.6; font-size:15px; }
  .footer { padding:14px; text-align:center; font-size:12px; color:#6b7a76; background:#f9fbfa; }
</style></head>
<body><div class="card">
  <div class="head"><div class="icon">${colors.icon}</div><h1>${escapeHtmlMin(title)}</h1></div>
  <div class="body">${message}</div>
  <div class="footer">Naturo Pro — cabinet de naturopathie</div>
</div></body></html>`;
}
