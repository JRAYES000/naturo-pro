// Phase 3 Lot 2 — Détection sous-domaine personnel
// En prod : les naturopathes ont chacun leur sous-domaine {slug}.app.ecole-naturo.fr.
// Le slug peut aussi être résolu côté serveur (cf. middleware subdomainTenant),
// mais le frontend a besoin de savoir s'il doit appeler /api/public/_self
// au lieu de /api/public/:slug, et s'il doit afficher la page publique du tenant
// à la racine "/" plutôt que la landing principale.

const DEFAULT_BASE_DOMAIN = "app.ecole-naturo.fr";

function baseDomain(): string {
  const env = (import.meta as any)?.env?.VITE_BASE_DOMAIN as string | undefined;
  return (env || DEFAULT_BASE_DOMAIN).toLowerCase();
}

function isIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Retourne le slug du tenant si la page courante est servie depuis un
 * sous-domaine de BASE_DOMAIN (ex : "marie-dupont.app.ecole-naturo.fr"
 * → "marie-dupont"). Retourne null sinon (domaine racine, localhost, IP,
 * "www", sous-sous-domaine).
 */
export function getCurrentTenant(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (!host) return null;
  const base = baseDomain();
  if (host === base) return null;
  if (host === "localhost" || isIp(host)) return null;
  if (!host.endsWith("." + base)) return null;
  const sub = host.slice(0, host.length - ("." + base).length);
  if (!sub || sub === "www") return null;
  if (sub.includes(".")) return null;
  return sub;
}

export function isOnTenantSubdomain(): boolean {
  return getCurrentTenant() !== null;
}

export function getBaseDomain(): string {
  return baseDomain();
}

/**
 * Construit l'URL publique d'un tenant en mode SOUS-DOMAINE :
 * `https://{slug}.{base}/`.
 * Cette URL nécessite un wildcard DNS + SSL wildcard configurés.
 */
export function tenantPublicUrl(slug: string): string {
  return `https://${slug}.${baseDomain()}/`;
}

/**
 * URL publique en mode PATH-BASED (fonctionne sans wildcard DNS/SSL).
 * Format : `https://{base}/#/p/{slug}`. Utilise le hash routing existant.
 */
export function tenantPathUrl(slug: string): string {
  return `https://${baseDomain()}/#/p/${slug}`;
}
