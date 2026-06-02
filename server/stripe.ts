/**
 * server/stripe.ts — intégration Stripe via API REST (fetch natif Node), SANS dépendance npm.
 *
 * Modèle : clé secrète PERSO par praticien (stockée sur users.stripe_secret_key).
 * Usage : acompte à la réservation en ligne via Stripe Checkout (mode payment).
 * Pas de webhook — on confirme le paiement en récupérant la session au retour
 * (success_url) avec la clé du praticien. La clé secrète ne sort jamais du serveur.
 */

const STRIPE_API = "https://api.stripe.com/v1";

/** Encodage form (application/x-www-form-urlencoded) avec notation crochets (objets/arrays imbriqués). */
function formEncode(obj: Record<string, any>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") parts.push(...formEncode(item, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (v && typeof v === "object") {
      parts.push(...formEncode(v, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts;
}

export interface CheckoutSessionInput {
  amountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  currency?: string;
  customerEmail?: string | null;
  metadata?: Record<string, string>;
}

/** Crée une Stripe Checkout Session. Retourne {id,url} ou {error}. */
export async function createCheckoutSession(
  secretKey: string,
  input: CheckoutSessionInput,
): Promise<{ id: string; url: string } | { error: string }> {
  const body: Record<string, any> = {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency || "eur",
          unit_amount: input.amountCents,
          product_data: { name: input.productName },
        },
      },
    ],
  };
  if (input.customerEmail) body.customer_email = input.customerEmail;
  if (input.metadata) body.metadata = input.metadata;
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formEncode(body).join("&"),
    });
    const data: any = await res.json();
    if (!res.ok) return { error: data?.error?.message || `Stripe HTTP ${res.status}` };
    if (!data?.url) return { error: "Réponse Stripe sans URL de paiement" };
    return { id: data.id, url: data.url };
  } catch (e: any) {
    return { error: e?.message || "Échec requête Stripe" };
  }
}

/** Récupère une Checkout Session (pour confirmer le paiement). Null si erreur. */
export async function retrieveCheckoutSession(secretKey: string, sessionId: string): Promise<any | null> {
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
