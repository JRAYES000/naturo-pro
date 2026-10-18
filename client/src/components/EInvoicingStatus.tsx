/**
 * EInvoicingStatus — état de préparation à la réforme de la facturation
 * électronique : format Factur-X, informations légales manquantes, seuil de la
 * franchise en base, plateforme agréée et calendrier (GET /api/einvoicing/status).
 */
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, CheckCircle2, AlertTriangle, CircleAlert, CalendarClock, ExternalLink } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatPrice } from "@/lib/format";

interface Issue { code: string; level: "erreur" | "attention"; where: string; message: string }
interface Status {
  regime: string;
  readiness: Issue[];
  franchise: null | { year: number; revenueCents: number; thresholdCents: number; majoredCents: number };
  platform: { connected: boolean; name: string | null };
  milestones: Array<{ date: string; label: string }>;
}

const PA_LIST_URL = "https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees";

function dateFr(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function EInvoicingStatus() {
  const { data, isError } = useQuery<Status>({ queryKey: ["/api/einvoicing/status"] });
  if (isError || !data) return null; // compte gratuit (402) ou chargement : rien à afficher

  const today = new Date().toISOString().slice(0, 10);
  const f = data.franchise;
  const pct = f ? Math.min(100, Math.round((f.revenueCents / f.thresholdCents) * 100)) : 0;

  return (
    <div className="card-naturo space-y-4" data-testid="card-einvoicing-status">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-5 w-5 text-heading" />
        <h2>Facture électronique 2026</h2>
      </div>

      <p className="text-sm flex gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <span>
          Vos factures et avoirs émis sont au format <strong>Factur-X</strong> (PDF/A-3 + XML EN 16931),
          le format reconnu par les plateformes agréées, avec les mentions obligatoires de la réforme.
        </span>
      </p>

      {data.readiness.length === 0 ? (
        <p className="text-sm flex gap-2" data-testid="text-einvoicing-ready">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          Vos informations légales de facturation sont complètes.
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm" data-testid="list-einvoicing-issues">
          {data.readiness.map((i) => (
            <li key={i.code} className="flex gap-2">
              {i.level === "erreur"
                ? <CircleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border p-3 text-sm space-y-1">
        <p className="font-semibold text-foreground">Plateforme agréée</p>
        {data.platform.connected ? (
          <p>Connectée : {data.platform.name}.</p>
        ) : (
          <>
            <p>
              Depuis le 1er septembre 2026, toute entreprise doit pouvoir <strong>recevoir</strong> ses factures
              fournisseurs par une plateforme agréée. Naturo Pro prépare son raccordement à Super PDP ; en attendant,
              choisissez votre plateforme de réception dans la liste officielle.
            </p>
            <a
              href={PA_LIST_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
              data-testid="link-pa-list"
            >
              Liste des plateformes agréées <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>

      {f && (
        <div className="space-y-1.5" data-testid="block-franchise-threshold">
          <div className="flex justify-between text-sm">
            <span>Encaissé en {f.year} (franchise en base)</span>
            <span className="font-semibold">{formatPrice(f.revenueCents)} / {formatPrice(f.thresholdCents)}</span>
          </div>
          <Progress value={pct} className="h-2" />
          {f.revenueCents >= f.thresholdCents * 0.8 && (
            <p className="text-xs text-amber-700 flex gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Au-delà de {formatPrice(f.thresholdCents)} encaissés dans l'année, la franchise cesse au 1er janvier suivant ;
              au-delà de {formatPrice(f.majoredCents)}, la TVA est due dès le dépassement.
            </p>
          )}
        </div>
      )}

      <ul className="space-y-1 text-xs text-muted-foreground">
        {data.milestones.map((m) => (
          <li key={m.date} className="flex gap-2">
            <CalendarClock className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${m.date <= today ? "text-emerald-600" : ""}`} />
            <span><strong>{dateFr(m.date)}</strong> — {m.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
