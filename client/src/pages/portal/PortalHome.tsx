/**
 * Espace cliente — tableau de bord : prochains rendez-vous, questionnaires à
 * remplir, programmes, bilans, documents partagés, factures et devis.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  CalendarDays, ClipboardList, Leaf, Gauge, FileDown, Receipt, LogOut, ArrowRight, CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDay, formatTime, formatPrice } from "@/lib/format";

const formatDate = (d: string | number) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
import { QUOTE_STATUS, INVOICE_STATUS, STATUS_PILL } from "@/lib/status";

export interface PortalData {
  client: { firstName: string; lastName: string; email: string | null };
  practitioner: { name: string; slug: string; photoUrl: string | null; phone: string | null; email: string | null };
  bookingUrl: string;
  upcoming: Array<{ id: number; startAt: number; endAt: number; status: string; location: string | null; categoryName: string | null; manageUrl: string | null }>;
  past: Array<{ id: number; startAt: number }>;
  invoices: Array<{ id: number; docType: string; number: string; status: string; issueDate: number; totalCents: number; url: string }>;
  programmes: Array<{ id: number; title: string; startDate: string | null }>;
  questionnaires: Array<{ id: number; name: string; url: string }>;
  bilans: Array<{ id: number; name: string; score: number; label: string | null; submittedAt: number }>;
  documents: Array<{ id: number; filename: string; sizeBytes: number | null }>;
}

function Section({ icon: Icon, title, children, testid }: { icon: any; title: string; children: React.ReactNode; testid: string }) {
  return (
    <section className="card-naturo" data-testid={testid}>
      <h2 className="text-heading flex items-center gap-2 mb-3"><Icon className="h-5 w-5 text-primary" /> {title}</h2>
      {children}
    </section>
  );
}

export function PortalExpired() {
  return (
    <div className="min-h-screen leaf-bg flex items-center justify-center px-4 py-10">
      <div className="card-naturo w-full max-w-md text-center space-y-2" data-testid="portal-expired">
        <p className="font-semibold text-foreground">Votre session a expiré</p>
        <p className="text-sm text-muted-foreground">
          Pour revenir dans votre espace, demandez un nouveau lien depuis la page de réservation de votre praticienne
          (« Mon espace »), ou utilisez le dernier lien qu'elle vous a envoyé.
        </p>
      </div>
    </div>
  );
}

export default function PortalHome() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useQuery<PortalData>({ queryKey: ["/api/portal/me"], retry: false });
  const logout = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/portal/me"] });
      navigate(data ? `/espace/connexion/${data.practitioner.slug}` : "/");
    },
  });

  if (isLoading) return <Loading label="Chargement de votre espace…" />;
  if (error || !data) return <PortalExpired />;

  const statut = (docType: string, status: string) =>
    (docType === "devis" ? QUOTE_STATUS : INVOICE_STATUS)[status] ?? { label: status, className: "bg-muted text-muted-foreground" };

  return (
    <div className="min-h-screen leaf-bg px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {data.practitioner.photoUrl
              ? <img src={data.practitioner.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              : <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-primary font-bold">{data.practitioner.name.slice(0, 1)}</div>}
            <div className="min-w-0">
              <h1 className="text-2xl text-heading truncate">Bonjour {data.client.firstName}</h1>
              <p className="text-sm text-muted-foreground truncate">Votre espace avec {data.practitioner.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} data-testid="button-portal-logout">
            <LogOut className="h-4 w-4 mr-1" /> Se déconnecter
          </Button>
        </header>

        <Section icon={CalendarDays} title="Mes rendez-vous" testid="portal-appointments">
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-3">Aucun rendez-vous à venir.</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {data.upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">{formatDay(a.startAt)} à {formatTime(a.startAt)}</p>
                    <p className="text-muted-foreground">{a.categoryName || "Rendez-vous"}{a.status === "pending" ? " · en attente de confirmation" : ""}</p>
                  </div>
                  {a.manageUrl && <a href={a.manageUrl} className="text-sm font-bold text-primary hover:underline">Déplacer ou annuler</a>}
                </li>
              ))}
            </ul>
          )}
          <a href={data.bookingUrl} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline" data-testid="link-portal-book">
            <CalendarPlus className="h-4 w-4" /> Prendre un rendez-vous
          </a>
        </Section>

        {data.questionnaires.length > 0 && (
          <Section icon={ClipboardList} title="À remplir" testid="portal-questionnaires">
            <ul className="space-y-2">
              {data.questionnaires.map((q) => (
                <li key={q.id}>
                  <a href={q.url} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
                    {q.name} <ArrowRight className="h-4 w-4 text-primary" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.programmes.length > 0 && (
          <Section icon={Leaf} title="Mes programmes" testid="portal-programmes">
            <ul className="space-y-2">
              {data.programmes.map((p) => (
                <li key={p.id}>
                  <Link href={`/espace/programme/${p.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold hover:bg-secondary/40" data-testid={`link-portal-programme-${p.id}`}>
                    <span>{p.title}{p.startDate ? <span className="font-normal text-muted-foreground"> · depuis le {formatDate(`${p.startDate}T12:00:00`)}</span> : null}</span>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.bilans.length > 0 && (
          <Section icon={Gauge} title="Mes bilans" testid="portal-bilans">
            <ul className="space-y-2">
              {data.bilans.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                  <span><span className="font-semibold">{b.name}</span> <span className="text-muted-foreground">· {formatDate(b.submittedAt)}</span></span>
                  <span className="font-bold text-heading whitespace-nowrap">{b.score}/100{b.label ? ` · ${b.label}` : ""}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.documents.length > 0 && (
          <Section icon={FileDown} title="Documents partagés" testid="portal-documents">
            <ul className="space-y-2">
              {data.documents.map((d) => (
                <li key={d.id}>
                  <a href={`/api/portal/documents/${d.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
                    {d.filename} <FileDown className="h-4 w-4 text-primary" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.invoices.length > 0 && (
          <Section icon={Receipt} title="Factures et devis" testid="portal-invoices">
            <ul className="space-y-2">
              {data.invoices.map((i) => {
                const s = statut(i.docType, i.status);
                return (
                  <li key={i.id}>
                    <a href={i.url} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary/40">
                      <span><span className="font-semibold">{i.docType === "devis" ? "Devis" : i.docType === "avoir" ? "Avoir" : "Facture"} {i.number}</span> <span className="text-muted-foreground">· {formatDate(i.issueDate)}</span></span>
                      <span className="flex items-center gap-2"><span className="font-bold">{formatPrice(i.totalCents)}</span><span className={`${STATUS_PILL} ${s.className}`}>{s.label}</span></span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Une question ? Contactez {data.practitioner.name}{data.practitioner.email ? ` (${data.practitioner.email})` : ""}.
        </p>
      </div>
    </div>
  );
}
