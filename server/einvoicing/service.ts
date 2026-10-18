// ─────────────────────────────────────────────────────────────────────────────
// Facture électronique, lot 1B — orchestration avec la plateforme agréée.
//
// transmitInvoice : dépôt du Factur-X d'une facture B2B émise.
// syncStatuses    : récupération des statuts du cycle de vie (pas de webhook chez
//                   Super PDP : interrogation par curseur, cf. cron).
// reportPayment   : statut « Encaissée » (fr:212) quand une facture transmise est réglée.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import type { EInvoicingConnection, Invoice } from "@shared/schema-active";
import { buildPractitionerSnapshot, generateInvoicePdf } from "../invoices";
import { buildInvoiceDocument, clientKind, effectiveVatRegime, isProvisionalNumber, type PractitionerSnapshot } from "./document";
import { checkInvoice } from "./compliance";
import { countryCode } from "./identifiers";
import { sealToken, openToken } from "./token-crypto";
import {
  SuperPdpClient, superPdpConfig, invoicePatchFromEvent, EINVOICE_STATUS_LABELS,
  type TokenSet,
} from "./superpdp";

export class EInvoicingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Client Super PDP d'une praticienne ; les jetons rafraîchis sont rechiffrés en base. */
export function clientFor(conn: EInvoicingConnection): SuperPdpClient {
  const cfg = superPdpConfig();
  if (!cfg) throw new EInvoicingError("La plateforme agréée n'est pas configurée sur ce serveur.", 503);
  const accessToken = openToken(conn.accessToken);
  if (!accessToken) throw new EInvoicingError("Connexion à la plateforme expirée : reconnectez votre compte.", 409);
  const tokens: TokenSet = { accessToken, refreshToken: openToken(conn.refreshToken), expiresAt: conn.expiresAt ?? null };
  return new SuperPdpClient(cfg, tokens, async (t) => {
    await storage.updateEInvoicingConnection(conn.id, {
      accessToken: sealToken(t.accessToken),
      refreshToken: t.refreshToken ? sealToken(t.refreshToken) : conn.refreshToken,
      expiresAt: t.expiresAt,
    } as any);
  });
}

function parseSnapshot(inv: Invoice): PractitionerSnapshot {
  try {
    return JSON.parse(inv.practitionerSnapshot || "{}");
  } catch {
    return {} as PractitionerSnapshot;
  }
}

/** Règle de traitement AFNOR selon la cliente (B2B en France, international, particulier). */
export function processingRuleFor(inv: Pick<Invoice, "clientType" | "clientCountry">): "B2B" | "B2BInt" | "B2C" {
  const kind = clientKind(inv.clientType);
  if (kind === "public") throw new EInvoicingError("Une facture à un organisme public se dépose sur Chorus Pro, pas par la plateforme agréée.");
  if (kind === "particulier" || kind === "association") return "B2C";
  return countryCode(inv.clientCountry) === "FR" ? "B2B" : "B2BInt";
}

/** Dépose le Factur-X d'une facture ou d'un avoir émis. */
export async function transmitInvoice(userId: number, invoiceId: number): Promise<Invoice> {
  const conn = await storage.getEInvoicingConnection(userId);
  if (!conn) throw new EInvoicingError("Connectez d'abord votre compte à la plateforme agréée (Réglages).", 409);
  const inv = await storage.getInvoice(invoiceId);
  if (!inv || inv.userId !== userId) throw new EInvoicingError("Facture introuvable.", 404);
  if (inv.docType === "devis") throw new EInvoicingError("Un devis ne se transmet pas.");
  if (inv.status === "draft" || isProvisionalNumber(inv.number)) throw new EInvoicingError("Émettez la facture avant de la transmettre.");
  if (inv.einvoiceExternalId && inv.einvoiceStatus && inv.einvoiceStatus !== "api:invalid") {
    throw new EInvoicingError("Cette facture a déjà été transmise.", 409);
  }
  const rule = processingRuleFor(inv);
  const items = await storage.getInvoiceItems(inv.id);
  const credited = inv.creditedInvoiceId ? await storage.getInvoice(inv.creditedInvoiceId) : null;
  const snapshot = parseSnapshot(inv);
  const errors = checkInvoice(buildInvoiceDocument(inv, items, snapshot, credited), snapshot).filter((i) => i.level === "erreur");
  if (rule !== "B2C" && !inv.clientSiren) errors.push({ code: "BUYER_SIREN", level: "erreur", where: "client", message: "Le SIREN du client est indispensable à la facture électronique." });
  if (errors.length) throw new EInvoicingError(`À corriger avant transmission : ${errors.map((e) => e.message).join(" ")}`);

  const pdf = await generateInvoicePdf(inv, items, snapshot, credited);
  const client = clientFor(conn);
  // external_id unique par praticienne : relie l'événement Super PDP à la facture.
  const sent = await client.sendInvoice(pdf, `naturo-${userId}-${inv.id}`, rule);
  const first = sent.events?.[sent.events.length - 1];
  const patch: Record<string, unknown> = {
    einvoiceExternalId: String(sent.id),
    einvoiceSentAt: Date.now(),
    einvoiceStatus: first?.status_code || "api:uploaded",
    einvoiceStatusLabel: EINVOICE_STATUS_LABELS[first?.status_code || "api:uploaded"],
    einvoiceStatusAt: Date.now(),
    einvoiceError: null,
  };
  return (await storage.updateInvoice(inv.id, patch as any))!;
}

/** Statut « Encaissée » pour une facture transmise et réglée (une seule fois). */
export async function reportPaymentIfTransmitted(inv: Invoice): Promise<void> {
  if (!inv.einvoiceExternalId || inv.einvoicePaidReportedAt || inv.status !== "paid") return;
  const conn = await storage.getEInvoicingConnection(inv.userId);
  if (!conn) return;
  // Option pour la TVA d'après les débits : pas de données de paiement à transmettre.
  if (parseSnapshot(inv).vatOnDebits && effectiveVatRegime(parseSnapshot(inv)) !== "franchise") return;
  await clientFor(conn).reportPayment(Number(inv.einvoiceExternalId));
  await storage.updateInvoice(inv.id, { einvoicePaidReportedAt: Date.now() } as any);
}

/** Récupère les nouveaux statuts d'une praticienne et met ses factures à jour. */
export async function syncStatuses(conn: EInvoicingConnection): Promise<{ events: number; updated: number }> {
  const client = clientFor(conn);
  let cursor = conn.lastEventId ?? null;
  let events = 0;
  let updated = 0;
  for (let page = 0; page < 20; page++) {
    const { data, has_after } = await client.listEvents(cursor);
    for (const ev of data) {
      events++;
      cursor = Math.max(cursor ?? 0, ev.id);
      const inv = await storage.getInvoiceByEInvoiceId(conn.userId, String(ev.invoice_id));
      if (!inv) continue; // facture reçue ou déposée hors de l'app
      await storage.updateInvoice(inv.id, invoicePatchFromEvent(ev) as any);
      updated++;
    }
    if (!has_after || data.length === 0) break;
  }
  await storage.updateEInvoicingConnection(conn.id, { lastEventId: cursor, lastSyncAt: Date.now(), lastError: null } as any);
  return { events, updated };
}

/** Synchronise toutes les praticiennes connectées (cron). */
export async function syncAllStatuses(): Promise<void> {
  if (!superPdpConfig()) return;
  for (const conn of await storage.listEInvoicingConnections()) {
    try {
      const r = await syncStatuses(conn);
      if (r.updated) console.log(`[einvoicing] user=${conn.userId} ${r.updated} statut(s) mis à jour`);
    } catch (e: any) {
      console.error(`[einvoicing] user=${conn.userId}:`, e?.message || e);
      await storage.updateEInvoicingConnection(conn.id, { lastError: String(e?.message || e).slice(0, 500) } as any).catch(() => undefined);
    }
  }
}

/** Snapshot à jour d'une praticienne (pour aligner son régime de TVA chez la plateforme). */
export async function currentSnapshot(userId: number): Promise<PractitionerSnapshot | null> {
  const u = await storage.getUserById(userId);
  return u ? buildPractitionerSnapshot(u) : null;
}
