/**
 * server/brevo.ts — intégration Brevo (lot 3b, parité naturooo), avec la clé API
 * de la praticienne (stockée chiffrée) : ses SMS et ses contacts restent sur SON
 * compte Brevo, aucun coût pour la plateforme.
 *
 *   - synchronisation des clientes vers une liste de contacts (newsletter) ;
 *   - rappels SMS la veille du rendez-vous (POST /v3/transactionalSMS/send,
 *     l'ancien /v3/transactionalSMS/sms étant déprécié).
 *
 * API REST via fetch, sans dépendance. Fonctions de rendu pures, testées.
 */

const BREVO_API = "https://api.brevo.com/v3";

export class BrevoError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(apiKey: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BREVO_API}${path}`, {
    method,
    headers: { "api-key": apiKey, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = res.status === 401 ? "Clé API Brevo refusée" : data?.message || `Brevo HTTP ${res.status}`;
    throw new BrevoError(msg, res.status);
  }
  return data as T;
}

export interface BrevoAccountInfo { email: string | null; companyName: string | null; smsCredits: number | null }

export async function brevoAccount(apiKey: string): Promise<BrevoAccountInfo> {
  const a: any = await call(apiKey, "GET", "/account");
  const sms = Array.isArray(a?.plan) ? a.plan.find((p: any) => p?.type === "sms" || p?.creditsType === "sms") : null;
  return { email: a?.email ?? null, companyName: a?.companyName ?? null, smsCredits: typeof sms?.credits === "number" ? sms.credits : null };
}

export async function brevoLists(apiKey: string): Promise<Array<{ id: number; name: string; totalSubscribers: number | null }>> {
  const r: any = await call(apiKey, "GET", "/contacts/lists?limit=50&offset=0&sort=desc");
  return (Array.isArray(r?.lists) ? r.lists : []).map((l: any) => ({ id: Number(l.id), name: String(l.name || ""), totalSubscribers: l.totalSubscribers ?? l.uniqueSubscribers ?? null }));
}

/**
 * Noms des attributs prénom / nom du compte : PRENOM / NOM sur un compte en
 * français, FIRSTNAME / LASTNAME en anglais. Un attribut inconnu ferait échouer l'ajout.
 */
export async function brevoNameAttributes(apiKey: string): Promise<{ first: string | null; last: string | null }> {
  const r: any = await call(apiKey, "GET", "/contacts/attributes");
  const names = new Set<string>((Array.isArray(r?.attributes) ? r.attributes : []).map((a: any) => String(a?.name || "").toUpperCase()));
  return pickNameAttributes(names);
}

export function pickNameAttributes(names: Set<string>): { first: string | null; last: string | null } {
  return {
    first: names.has("PRENOM") ? "PRENOM" : names.has("FIRSTNAME") ? "FIRSTNAME" : null,
    last: names.has("NOM") ? "NOM" : names.has("LASTNAME") ? "LASTNAME" : null,
  };
}

/** Crée ou met à jour un contact (updateEnabled) et l'ajoute à la liste. */
export async function brevoUpsertContact(apiKey: string, c: { email: string; attributes: Record<string, string>; listId: number }): Promise<void> {
  await call(apiKey, "POST", "/contacts", { email: c.email, attributes: c.attributes, listIds: [c.listId], updateEnabled: true });
}

export async function brevoSendSms(apiKey: string, sms: { sender: string; recipient: string; content: string; tag?: string }): Promise<{ messageId: string | null }> {
  const r: any = await call(apiKey, "POST", "/transactionalSMS/send", {
    sender: sms.sender, recipient: sms.recipient, content: sms.content, type: "transactional", ...(sms.tag ? { tag: sms.tag } : {}),
  });
  return { messageId: r?.messageId != null ? String(r.messageId) : null };
}

// ── Fonctions pures ──────────────────────────────────────────────────────────

/**
 * Numéro au format attendu par Brevo (indicatif sans « + ») : 06 12 34 56 78 →
 * 33612345678 ; +32 470 12 34 56 → 32470123456. null si le numéro n'est pas exploitable.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  let s = String(raw || "").replace(/[\s.\-()/]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (/^0[1-9]\d{8}$/.test(s)) s = `33${s.slice(1)}`;
  if (!/^\d{10,15}$/.test(s)) return null;
  if (s.startsWith("330")) s = `33${s.slice(3)}`; // +33 0 6… saisi avec le zéro
  return s;
}

/** Expéditeur alphanumérique : 3 à 11 caractères, lettres et chiffres, au moins une lettre. */
export function validSmsSender(s: string | null | undefined): boolean {
  return /^(?=.*[A-Za-z])[A-Za-z0-9]{3,11}$/.test(String(s || ""));
}

/** Sans accents : un SMS en alphabet GSM tient en 160 caractères (70 en Unicode). */
export function toGsm(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/æ/g, "ae").replace(/Æ/g, "AE")
    .replace(/[’‘]/g, "'").replace(/«\s*/g, '"').replace(/\s*»/g, '"').replace(/[“”]/g, '"').replace(/[–—]/g, "-");
}

export function renderSmsReminder(opts: { practitionerName: string; dateText: string; timeText: string; manageUrl?: string | null }): string {
  const base = `Rappel : RDV avec ${opts.practitionerName} demain ${opts.dateText} a ${opts.timeText}.`;
  return toGsm(opts.manageUrl ? `${base} Pour deplacer ou annuler : ${opts.manageUrl}` : base);
}
