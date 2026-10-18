/**
 * EInvoicingStatus — état de préparation à la réforme de la facturation
 * électronique : format Factur-X, informations légales manquantes, plateforme
 * agréée (connexion du compte Super PDP), seuil de la franchise en base et
 * calendrier (GET /api/einvoicing/status).
 */
import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileCheck2, CheckCircle2, AlertTriangle, CircleAlert, CalendarClock, ExternalLink, Link2, RefreshCw, Inbox, Unlink,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

interface Issue { code: string; level: "erreur" | "attention"; where: string; message: string }
export interface EInvoicingStatusData {
  regime: string;
  readiness: Issue[];
  franchise: null | { year: number; revenueCents: number; thresholdCents: number; majoredCents: number };
  platform: {
    available: boolean;
    connected: boolean;
    name: string | null;
    env: string | null;
    companyName: string | null;
    companyNumber: string | null;
    lastSyncAt: number | null;
    lastError: string | null;
  };
  milestones: Array<{ date: string; label: string }>;
}

const PA_LIST_URL = "https://www.impots.gouv.fr/je-consulte-la-liste-des-plateformes-agreees";

function dateFr(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Retour de la connexion OAuth (?einvoicing=connecte|erreur placé avant le hash). */
function useConnectionFeedback() {
  const { toast } = useToast();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("einvoicing");
    if (!state) return;
    if (state === "connecte") {
      toast({ title: "Compte Super PDP connecté", description: "Vos factures B2B peuvent être transmises et vos factures reçues consultées.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["/api/einvoicing/status"] });
    } else {
      toast({ title: "Connexion à Super PDP impossible", description: params.get("raison") || "Réessayez dans un instant.", variant: "destructive" });
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }, [toast]);
}

function PlatformBlock({ p }: { p: EInvoicingStatusData["platform"] }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const syncMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/einvoicing/sync", {})).json(),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/einvoicing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Statuts synchronisés", description: `${r.updated} facture(s) mise(s) à jour.`, variant: "success" });
    },
    onError: (e: any) => toast({ title: "Synchronisation impossible", description: e.message, variant: "destructive" }),
  });
  const disconnectMut = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/einvoicing/superpdp/disconnect", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/einvoicing/status"] }),
  });

  if (p.connected) {
    return (
      <div className="rounded-md border p-3 text-sm space-y-2" data-testid="block-platform-connected">
        <p className="font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Plateforme agréée : {p.name}
          {p.env === "sandbox" && <span className="text-xs font-normal text-amber-700">(bac à sable)</span>}
        </p>
        <p className="text-muted-foreground">
          {p.companyName}{p.companyNumber ? ` — SIREN ${p.companyNumber}` : ""}.
          {p.lastSyncAt ? ` Statuts relevés le ${new Date(p.lastSyncAt).toLocaleString("fr-FR")}.` : ""}
        </p>
        {p.lastError && <p className="text-xs text-destructive">Dernière erreur : {p.lastError}</p>}
        <div className="flex flex-wrap gap-2">
          <Link href="/app/invoices/received">
            <Button variant="outline" size="sm" className="rounded-md" data-testid="link-received-invoices">
              <Inbox className="h-4 w-4 mr-1" /> Factures reçues
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="rounded-md" onClick={() => syncMut.mutate()} disabled={syncMut.isPending} data-testid="button-einvoicing-sync">
            <RefreshCw className="h-4 w-4 mr-1" /> Synchroniser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-md text-destructive"
            onClick={async () => {
              if (!(await confirm({
                title: "Déconnecter Super PDP ?",
                description: "Naturo Pro ne pourra plus transmettre vos factures ni afficher vos factures reçues. Votre compte Super PDP reste actif.",
                confirmLabel: "Déconnecter",
                cancelLabel: "Annuler",
                destructive: true,
              }))) return;
              disconnectMut.mutate();
            }}
            data-testid="button-einvoicing-disconnect"
          >
            <Unlink className="h-4 w-4 mr-1" /> Déconnecter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 text-sm space-y-2">
      <p className="font-semibold text-foreground">Plateforme agréée</p>
      <p>
        Depuis le 1er septembre 2026, toute entreprise doit pouvoir <strong>recevoir</strong> ses factures
        fournisseurs par une plateforme agréée ; l'émission électronique B2B suivra au 1er septembre 2027.
      </p>
      {p.available ? (
        <>
          <p className="text-muted-foreground">
            Connectez votre compte Super PDP (plateforme immatriculée) : création du compte, vérification d'identité et
            inscription à l'annuaire se font chez eux, puis Naturo Pro transmet vos factures et affiche celles que vous recevez.
          </p>
          <a href="/api/einvoicing/superpdp/connect" data-testid="button-einvoicing-connect">
            <Button size="sm" className="rounded-md font-bold">
              <Link2 className="h-4 w-4 mr-1" /> Connecter mon compte Super PDP
            </Button>
          </a>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            Naturo Pro prépare son raccordement à Super PDP ; en attendant, choisissez votre plateforme de réception dans la
            liste officielle.
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
  );
}

export function EInvoicingStatus() {
  useConnectionFeedback();
  const { data, isError } = useQuery<EInvoicingStatusData>({ queryKey: ["/api/einvoicing/status"] });
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

      <PlatformBlock p={data.platform} />

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
