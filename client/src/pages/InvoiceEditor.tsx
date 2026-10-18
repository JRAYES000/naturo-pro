import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  Trash2, Plus, Save, Download, Mail, Receipt, FileCode2, Stamp, CircleAlert, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Loading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPrice } from "@/lib/format";
import type { Client, Invoice, InvoiceItem } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";
import { CompanyLookup } from "@/components/CompanyLookup";

type LineKind = "service" | "goods";
type ClientKind = "particulier" | "entreprise" | "association" | "public";

interface ItemDraft {
  description: string;
  quantity: number;
  unitPriceCents: number;
  kind: LineKind;
}

interface ComplianceIssue { code: string; level: "erreur" | "attention"; where: string; message: string }

interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
  credited?: { id: number; number: string; issueDate: number } | null;
  compliance?: ComplianceIssue[];
}

const CLIENT_KINDS: Array<[ClientKind, string]> = [
  ["particulier", "Particulier"],
  ["entreprise", "Entreprise ou professionnel"],
  ["association", "Association"],
  ["public", "Organisme public"],
];

function toDateInputValue(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(v: string): number | null {
  if (!v) return null;
  return new Date(v + "T12:00:00").getTime();
}

function formatDateLong(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Lit la query string à la fois dans le hash (après ?) et dans window.location.search
function readQueryParam(name: string): string | null {
  try {
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx >= 0) {
      const p = new URLSearchParams(hash.slice(qIdx + 1));
      const v = p.get(name);
      if (v) return v;
    }
    const s = window.location.search || "";
    if (s) {
      const p = new URLSearchParams(s);
      const v = p.get(name);
      if (v) return v;
    }
  } catch (_e) {
    /* ignore */
  }
  return null;
}

function ComplianceCard({ issues }: { issues: ComplianceIssue[] }) {
  return (
    <div className="card-naturo" data-testid="card-compliance">
      <h3 className="mb-2 text-heading">Contrôle de conformité</h3>
      {issues.length === 0 ? (
        <p className="text-sm flex gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          Mentions obligatoires complètes.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {issues.map((i) => (
            <li key={i.code} className="flex gap-2" data-testid={`text-compliance-${i.code}`}>
              {i.level === "erreur"
                ? <CircleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
              <span>
                {i.message}
                {i.where === "reglages" && (
                  <> <Link href="/app/settings" className="text-primary font-semibold hover:underline">Réglages</Link></>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvoiceEditor() {
  const [, params] = useRoute("/app/invoices/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const confirm = useConfirm();
  const id = params?.id;
  const isNew = id === "new";
  const numericId = isNew ? null : Number(id);

  // Lecture immédiate de la query au mount (synchrone) — ne pas la mettre dans un useEffect tardif
  const [fromAppointmentId] = useState<string | null>(() => isNew ? readQueryParam("fromAppointment") : null);

  const { data: invoice, isLoading } = useQuery<InvoiceWithItems>({
    queryKey: ["/api/invoices", numericId],
    enabled: !!numericId,
  });

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const [clientId, setClientId] = useState<number | null>(null);
  const [clientType, setClientType] = useState<ClientKind>("particulier");
  const [clientCompanyName, setClientCompanyName] = useState("");
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [clientVatNumber, setClientVatNumber] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPostalCode, setClientPostalCode] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [serviceDate, setServiceDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ description: "Consultation", quantity: 1, unitPriceCents: 0, kind: "service" }]);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>("");
  // Devis : même éditeur, type choisi à la création.
  const [docType, setDocType] = useState<"invoice" | "devis">("invoice");

  const currentDocType = isNew ? docType : ((invoice as any)?.docType || "invoice");
  const isDevis = currentDocType === "devis";
  const isAvoir = currentDocType === "avoir";
  const isDraft = !isNew && invoice?.status === "draft";
  const isPro = clientType !== "particulier";

  // Pré-remplir si modification
  useEffect(() => {
    if (invoice && !isNew) {
      const inv = invoice as any;
      setClientId(invoice.clientId ?? null);
      setClientType((inv.clientType as ClientKind) || "particulier");
      setClientCompanyName(inv.clientCompanyName || "");
      setClientCompanyId(inv.clientSiret || inv.clientSiren || "");
      setClientVatNumber(inv.clientVatNumber || "");
      setClientFirstName(invoice.clientFirstName || "");
      setClientLastName(invoice.clientLastName || "");
      setClientEmail(invoice.clientEmail || "");
      setClientAddress(invoice.clientAddress || "");
      setClientPostalCode(invoice.clientPostalCode || "");
      setClientCity(invoice.clientCity || "");
      setServiceDate(toDateInputValue(inv.serviceDate));
      setDueDate(toDateInputValue(invoice.dueDate));
      setNotes(invoice.notes || "");
      setPaymentMethod(invoice.paymentMethod || "");
      setPaidAt(toDateInputValue(invoice.paidAt));
      if (invoice.items && invoice.items.length > 0) {
        setItems(invoice.items.map((it) => ({
          description: it.description,
          quantity: it.quantity ?? 1,
          unitPriceCents: it.unitPriceCents ?? 0,
          kind: ((it as any).kind as LineKind) || "service",
        })));
      }
    }
  }, [invoice, isNew]);

  // Pré-remplissage depuis RDV : POST /api/invoices/from-appointment/:id, push cache, navigate.
  useEffect(() => {
    if (!isNew || !fromAppointmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("POST", `/api/invoices/from-appointment/${fromAppointmentId}`, {});
        const created: any = await res.json();
        if (cancelled || !created?.id) return;
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        navigate(`/app/invoices/${created.id}`, { replace: true });
      } catch (e: any) {
        if (!cancelled) toast({ title: "Erreur création facture", description: e.message, variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, fromAppointmentId, navigate, toast]);

  // Pré-remplir la cliente choisie : un client professionnel apporte sa raison
  // sociale, son SIREN/SIRET et son n° de TVA dans des champs dédiés.
  useEffect(() => {
    if (!clientId || !isNew) return;
    const c: any = clients.find((x) => x.id === clientId);
    if (!c) return;
    const kind: ClientKind = (["entreprise", "association", "public"].includes(c.clientType) ? c.clientType : "particulier");
    setClientType(kind);
    setClientCompanyName(kind !== "particulier" ? c.companyName || "" : "");
    setClientCompanyId(kind !== "particulier" ? c.companySiret || "" : "");
    setClientVatNumber(kind !== "particulier" ? c.companyVatNumber || "" : "");
    setClientFirstName(c.firstName || "");
    setClientLastName(c.lastName || "");
    setClientEmail(c.email || "");
    setClientAddress(c.address || "");
    setClientPostalCode(c.postalCode || "");
    setClientCity(c.city || "");
  }, [clientId, clients, isNew]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + Math.max(0, Math.floor(it.quantity || 0)) * Math.max(0, Math.floor(it.unitPriceCents || 0)), 0);
    const vatRate = invoice?.vatRate ?? 0;
    const vatEnabled = !!invoice?.vatEnabled;
    const vat = vatEnabled ? Math.round((subtotal * vatRate) / 10000) : 0;
    return { subtotal, vat, total: subtotal + vat, vatEnabled, vatRate };
  }, [items, invoice]);

  const clientPayload = () => ({
    clientId,
    clientType,
    clientCompanyName: isPro ? clientCompanyName || null : null,
    clientCompanyId: isPro ? clientCompanyId || null : null,
    clientVatNumber: isPro ? clientVatNumber || null : null,
    clientFirstName, clientLastName, clientEmail,
    clientAddress: clientAddress || null,
    clientPostalCode: clientPostalCode || null,
    clientCity: clientCity || null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    if (numericId) queryClient.invalidateQueries({ queryKey: ["/api/invoices", numericId] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const { clientId: cid, ...rest } = clientPayload();
      const body = {
        clientId: cid,
        ...rest,
        serviceDate: fromDateInputValue(serviceDate),
        dueDate: fromDateInputValue(dueDate),
        notes: notes || null,
        items: items.filter((i) => i.description.trim()),
        docType,
      };
      const res = await apiRequest("POST", "/api/invoices", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: docType === "devis" ? "Devis créé" : "Brouillon créé",
        description: docType === "devis" ? data.number : "Relisez-le puis émettez-le : il recevra alors son numéro définitif.",
        variant: "success",
      });
      navigate(`/app/invoices/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (patch: any) => (await apiRequest("PATCH", `/api/invoices/${numericId}`, patch)).json(),
    onSuccess: (data: any) => {
      invalidate();
      toast({ title: data?.status && data.status !== "draft" && isDraft ? `Émise : ${data.number}` : "Enregistré", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const issueMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/invoices/${numericId}/issue`, {})).json(),
    onSuccess: (data: any) => {
      invalidate();
      toast({ title: `${isAvoir ? "Avoir" : "Facture"} émis${isAvoir ? "" : "e"}`, description: `Numéro ${data.number}`, variant: "success" });
    },
    onError: (e: any) => toast({ title: "Émission impossible", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/invoices/${numericId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Brouillon supprimé", variant: "success" });
      navigate("/app/invoices");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Avoir : document lié à la facture d'origine, créé en brouillon pour relecture
  // (avoir partiel possible en ajustant les lignes avant émission).
  const avoirMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/invoices/${numericId}/avoir`, {})).json(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Avoir créé en brouillon", description: "Ajustez les lignes si l'avoir est partiel, puis émettez-le.", variant: "success" });
      navigate(`/app/invoices/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Devis → brouillon de facture : le numéro légal sera attribué à l'émission.
  const convertMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/invoices/${numericId}/convert`, {})).json(),
    onSuccess: () => {
      invalidate();
      toast({ title: "Devis converti en facture (brouillon)", description: "Relisez-la puis émettez-la.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const sendMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/invoices/${numericId}/send`, {})).json(),
    onSuccess: () => {
      invalidate();
      toast({ title: "Email envoyé", description: "Le document a été envoyé avec son PDF en pièce jointe.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur d'envoi", description: e.message, variant: "destructive" }),
  });

  // Une fois émise (statut ≠ draft), la facture est légalement figée côté serveur sur
  // le client et les lignes : le PDF détenu par la cliente fait foi.
  const isLocked = !isNew && invoice?.status !== "draft";

  /** Enregistre le contenu du brouillon (et, si demandé, l'émet dans la même requête). */
  function draftPatch(extra: Record<string, unknown> = {}) {
    const { clientId: _c, ...client } = clientPayload();
    return {
      ...client,
      serviceDate: fromDateInputValue(serviceDate),
      dueDate: fromDateInputValue(dueDate),
      notes: notes || null,
      items: items.filter((i) => i.description.trim()),
      ...extra,
    };
  }

  function saveAll() {
    if (isNew) {
      createMut.mutate();
      return;
    }
    if (!isLocked) {
      updateMut.mutate(draftPatch());
      return;
    }
    // Facture émise : seuls l'échéance, les notes et le règlement restent modifiables.
    updateMut.mutate({
      dueDate: fromDateInputValue(dueDate),
      notes: notes || null,
      paymentMethod: paymentMethod || null,
      paidAt: fromDateInputValue(paidAt),
    });
  }

  async function issue(paid = false) {
    const label = isAvoir ? "cet avoir" : "cette facture";
    if (!(await confirm({
      title: paid ? `Émettre ${label} et la marquer réglée ?` : `Émettre ${label} ?`,
      description: "Elle reçoit son numéro définitif et ne pourra plus être modifiée (une correction passera par un avoir).",
      confirmLabel: "Émettre",
      cancelLabel: "Annuler",
    }))) return;
    if (paid) {
      updateMut.mutate(draftPatch({
        status: "paid",
        paymentMethod: paymentMethod || null,
        paidAt: fromDateInputValue(paidAt) || Date.now(),
      }));
    } else {
      // Enregistre d'abord le contenu, puis émet.
      await apiRequest("PATCH", `/api/invoices/${numericId}`, draftPatch()).catch(() => undefined);
      issueMut.mutate();
    }
  }

  async function send() {
    if (isDraft && !isDevis) {
      if (!(await confirm({
        title: "Émettre et envoyer ?",
        description: "L'envoi émet le document : il reçoit son numéro définitif et ne pourra plus être modifié.",
        confirmLabel: "Émettre et envoyer",
        cancelLabel: "Annuler",
      }))) return;
      await apiRequest("PATCH", `/api/invoices/${numericId}`, draftPatch()).catch(() => undefined);
    }
    sendMut.mutate();
  }

  function setStatus(newStatus: string) {
    const patch: any = { status: newStatus };
    if (newStatus === "paid" && !paidAt) {
      const now = toDateInputValue(Date.now());
      setPaidAt(now);
      patch.paidAt = fromDateInputValue(now);
      if (paymentMethod) patch.paymentMethod = paymentMethod;
    }
    updateMut.mutate(patch);
  }

  if (!isNew && isLoading) {
    return <AppLayout><Loading variant="inline" /></AppLayout>;
  }

  const docName = isDevis ? "devis" : isAvoir ? "avoir" : "facture";
  const title = isNew
    ? (docType === "devis" ? "Nouveau devis" : "Nouvelle facture")
    : isDraft && !isDevis
      ? (isAvoir ? "Avoir (brouillon)" : "Facture (brouillon)")
      : `${isAvoir ? "Avoir" : isDevis ? "Devis" : "Facture"} ${invoice?.number ?? ""}`;
  const statusChoices = isDevis ? ["draft", "sent", "cancelled"] : ["issued", "sent", "paid", "cancelled"];
  const busy = createMut.isPending || updateMut.isPending || issueMut.isPending;

  return (
    <AppLayout>
      <div className="max-w-5xl pb-8 lg:pb-0">
        <PageHeader
          title={title}
          subtitle={!isNew && invoice
            ? (isDraft && !isDevis ? "Non émis : le numéro définitif est attribué à l'émission." : `Créé le ${new Date(invoice.createdAt).toLocaleDateString("fr-FR")}`)
            : undefined}
          icon={Receipt}
          backTo={{ href: "/app/invoices", label: "Factures" }}
          actions={!isNew && invoice ? (
            <>
              {isDevis && (
                <Button
                  onClick={() => convertMut.mutate()}
                  disabled={convertMut.isPending}
                  className="rounded-md font-bold"
                  data-testid="button-convert-devis"
                >
                  {convertMut.isPending ? "Conversion…" : "Convertir en facture"}
                </Button>
              )}
              {isDraft && !isDevis && (
                <Button onClick={() => issue(false)} disabled={busy} className="rounded-md font-bold" data-testid="button-issue">
                  <Stamp className="h-4 w-4 mr-1" /> Émettre
                </Button>
              )}
              <a
                href={`/api/invoices/${numericId}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-bold border border-input hover:bg-secondary"
                title={isLocked && !isDevis ? "PDF Factur-X (PDF/A-3 avec XML EN 16931)" : "Aperçu PDF"}
                data-testid="button-download-pdf"
              >
                <Download className="h-4 w-4" /> {isLocked && !isDevis ? "Factur-X" : "PDF"}
              </a>
              {isLocked && !isDevis && (
                <a
                  href={`/api/invoices/${numericId}/facturx.xml`}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-bold border border-input hover:bg-secondary"
                  title="XML Factur-X seul (CII EN 16931), pour un logiciel comptable"
                  data-testid="button-download-xml"
                >
                  <FileCode2 className="h-4 w-4" /> XML
                </a>
              )}
              <Button
                variant="outline"
                onClick={send}
                disabled={sendMut.isPending || !clientEmail}
                className="rounded-md font-bold"
                data-testid="button-send-email"
              >
                <Mail className="h-4 w-4 mr-1" /> Envoyer
              </Button>
            </>
          ) : undefined}
        />

        {isNew && (
          <div className="mb-4 flex gap-2" data-testid="toggle-doc-type">
            {(["invoice", "devis"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDocType(t)}
                className={`px-4 py-2 rounded-md text-sm font-bold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  docType === t ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-secondary"
                }`}
                data-testid={`button-doctype-${t}`}
              >
                {t === "invoice" ? "Facture" : "Devis"}
              </button>
            ))}
            {docType === "devis" && (
              <p className="text-xs text-muted-foreground self-center">
                Un devis n'a pas de valeur comptable : il ne compte pas dans votre CA et pourra être converti en facture en un clic.
              </p>
            )}
          </div>
        )}

        {isDevis && !isNew && (
          <div className="mb-4 text-sm bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-4 py-3" data-testid="banner-devis">
            Ce document est un <strong>devis</strong> (hors comptabilité, non compté dans le CA). Une fois accepté,
            « Convertir en facture » le transforme en brouillon de facture.
          </div>
        )}

        {isAvoir && invoice?.credited && (
          <div className="mb-4 text-sm bg-violet-50 border border-violet-200 text-violet-800 rounded-lg px-4 py-3" data-testid="banner-avoir">
            Avoir sur la facture{" "}
            <Link href={`/app/invoices/${invoice.credited.id}`} className="font-bold underline">
              N° {invoice.credited.number}
            </Link>{" "}
            du {formatDateLong(invoice.credited.issueDate)}. Il vient en déduction de votre chiffre d'affaires.
          </div>
        )}

        {isLocked && (
          <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="flex-1">
              Ce document est {invoice?.status === "paid" ? "réglé" : "émis"} : le client et les lignes ne sont plus modifiables
              (le PDF transmis doit rester fidèle). L'échéance, les notes et le règlement restent modifiables.
            </span>
            {!isDevis && !isAvoir && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => avoirMut.mutate()}
                disabled={avoirMut.isPending}
                className="rounded-md font-bold shrink-0 border-amber-300 bg-white hover:bg-amber-100"
                data-testid="button-create-avoir"
              >
                {avoirMut.isPending ? "Création…" : "Créer un avoir"}
              </Button>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche : client + lignes + notes */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card-naturo">
              <h3 className="mb-3 text-heading">Client</h3>
              {isNew && clients.length > 0 && (
                <div className="mb-3">
                  <Label>Sélectionner un client existant</Label>
                  <Select
                    value={clientId ? String(clientId) : ""}
                    onValueChange={(v) => setClientId(v ? Number(v) : null)}
                  >
                    <SelectTrigger data-testid="select-client"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.clientType && c.clientType !== "particulier" && c.companyName ? `${c.companyName} — ` : ""}
                          {c.firstName} {c.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Type de client</Label>
                  <Select value={clientType} onValueChange={(v) => setClientType(v as ClientKind)} disabled={isLocked}>
                    <SelectTrigger data-testid="select-client-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isPro && (
                  <>
                    <div className="sm:col-span-2">
                      <Label>Raison sociale</Label>
                      <Input value={clientCompanyName} onChange={(e) => setClientCompanyName(e.target.value)} disabled={isLocked} data-testid="input-client-company" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>SIREN ou SIRET</Label>
                      <div className="flex gap-2">
                        <Input value={clientCompanyId} onChange={(e) => setClientCompanyId(e.target.value)} disabled={isLocked} placeholder="552 032 534" data-testid="input-client-siren" />
                        {!isLocked && (
                          <CompanyLookup
                            initialQuery={clientCompanyId || clientCompanyName}
                            testid="button-client-lookup"
                            onPick={(r) => {
                              setClientCompanyName(r.name);
                              setClientCompanyId(r.siret || r.siren);
                              if (r.vatNumber) setClientVatNumber(r.vatNumber);
                              if (r.address) setClientAddress(r.address);
                              if (r.postalCode) setClientPostalCode(r.postalCode);
                              if (r.city) setClientCity(r.city);
                              if (clientType === "entreprise" && r.clientKind !== "entreprise") setClientType(r.clientKind);
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>N° de TVA intracommunautaire</Label>
                      <Input value={clientVatNumber} onChange={(e) => setClientVatNumber(e.target.value)} disabled={isLocked} placeholder="FR…" data-testid="input-client-vat" />
                    </div>
                    {clientType === "public" && (
                      <p className="sm:col-span-2 text-xs text-amber-700">
                        Facture à un organisme public : elle doit être déposée sur Chorus Pro.
                      </p>
                    )}
                  </>
                )}
                <div>
                  <Label>{isPro ? "Prénom du contact" : "Prénom"}</Label>
                  <Input value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} disabled={isLocked} data-testid="input-client-firstname" />
                </div>
                <div>
                  <Label>{isPro ? "Nom du contact" : "Nom"}</Label>
                  <Input value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} disabled={isLocked} data-testid="input-client-lastname" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Email</Label>
                  <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} disabled={isLocked} data-testid="input-client-email" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Adresse</Label>
                  <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} disabled={isLocked} data-testid="input-client-address" />
                </div>
                <div>
                  <Label>Code postal</Label>
                  <Input value={clientPostalCode} onChange={(e) => setClientPostalCode(e.target.value)} disabled={isLocked} data-testid="input-client-postal" />
                </div>
                <div>
                  <Label>Ville</Label>
                  <Input value={clientCity} onChange={(e) => setClientCity(e.target.value)} disabled={isLocked} data-testid="input-client-city" />
                </div>
              </div>
            </div>

            <div className="card-naturo">
              <h3 className="mb-3 text-heading">Lignes</h3>
              <div className="space-y-2">
                <div className="hidden xl:grid grid-cols-12 gap-2 text-xs font-bold text-muted-foreground uppercase">
                  <div className="col-span-4">Désignation</div>
                  <div className="col-span-2">Nature</div>
                  <div className="col-span-2 text-right">Qté</div>
                  <div className="col-span-2 text-right">Prix unitaire</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-lg border p-3 space-y-2 xl:border-0 xl:p-0 xl:space-y-0 xl:grid xl:grid-cols-12 xl:gap-2 xl:items-center"
                    data-testid={`row-item-${i}`}
                  >
                    <Input
                      className="xl:col-span-4"
                      value={it.description}
                      onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                      placeholder="Désignation"
                      disabled={isLocked}
                      data-testid={`input-item-description-${i}`}
                    />
                    <div className="xl:col-span-2">
                      <Select
                        value={it.kind}
                        onValueChange={(v) => setItems(items.map((x, j) => j === i ? { ...x, kind: v as LineKind } : x))}
                        disabled={isLocked}
                      >
                        <SelectTrigger aria-label="Nature de la ligne" data-testid={`select-item-kind-${i}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="service">Prestation</SelectItem>
                          <SelectItem value="goods">Produit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2 xl:contents">
                      <div className="xl:col-span-2">
                        <label className="text-xs text-muted-foreground xl:hidden">Quantité</label>
                        <Input
                          className="text-right"
                          type="number"
                          min={0}
                          value={it.quantity}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x))}
                          disabled={isLocked}
                          data-testid={`input-item-qty-${i}`}
                        />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="text-xs text-muted-foreground xl:hidden">Prix unitaire</label>
                        <Input
                          className="text-right"
                          type="number"
                          min={0}
                          step={0.01}
                          value={(it.unitPriceCents / 100).toFixed(2)}
                          onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unitPriceCents: Math.round(Number(e.target.value) * 100) } : x))}
                          disabled={isLocked}
                          data-testid={`input-item-price-${i}`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between xl:contents">
                      <div className="text-sm xl:col-span-1 xl:text-right font-bold">
                        <span className="text-xs text-muted-foreground font-normal xl:hidden">Total : </span>
                        {formatPrice(Math.max(0, Math.floor(it.quantity || 0)) * Math.max(0, Math.floor(it.unitPriceCents || 0)))}
                      </div>
                      <button
                        className="xl:col-span-1 xl:justify-self-end h-10 w-10 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                        onClick={() => setItems(items.filter((_, j) => j !== i))}
                        disabled={items.length <= 1 || isLocked}
                        aria-label="Supprimer la ligne"
                        data-testid={`button-remove-item-${i}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems([...items, { description: "", quantity: 1, unitPriceCents: 0, kind: "service" }])}
                  className="text-primary font-bold"
                  disabled={isLocked}
                  data-testid="button-add-item"
                >
                  <Plus className="h-4 w-4 mr-1" /> Ajouter une ligne
                </Button>
              </div>

              {/* Totaux */}
              <div className="mt-4 pt-4 border-t flex justify-end">
                <div className="w-full sm:w-72 space-y-1 text-sm">
                  {totals.vatEnabled ? (
                    <>
                      <div className="flex justify-between"><span>Total HT</span><span className="font-bold">{formatPrice(totals.subtotal)}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>TVA ({(totals.vatRate / 100).toLocaleString("fr-FR")} %)</span><span>{formatPrice(totals.vat)}</span></div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground text-right">TVA non applicable, art. 293 B du CGI</p>
                  )}
                  <div className="flex justify-between text-base pt-1 border-t mt-1">
                    <span className="font-bold">{isAvoir ? "Total de l'avoir" : totals.vatEnabled ? "Total TTC" : "Total"}</span>
                    <span className="font-bold text-heading">{formatPrice(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-naturo">
              <h3 className="mb-3 text-heading">Notes</h3>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Message à la cliente, référence de commande…" data-testid="input-notes" />
            </div>
          </div>

          {/* Colonne droite : conformité, dates, statut, règlement */}
          <div className="space-y-4">
            {!isNew && invoice?.compliance && !isDevis && <ComplianceCard issues={invoice.compliance} />}

            <div className="card-naturo">
              <h3 className="mb-3 text-heading">Dates</h3>
              <div className="space-y-3">
                <div>
                  <Label>Date d'émission</Label>
                  <p className="text-sm py-2" data-testid="text-issue-date">
                    {isNew || (isDraft && !isDevis) ? "Fixée le jour de l'émission" : formatDateLong(invoice?.issueDate)}
                  </p>
                </div>
                {!isDevis && (
                  <div>
                    <Label>Date de la prestation</Label>
                    <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} disabled={isLocked} data-testid="input-service-date" />
                    <p className="text-xs text-muted-foreground mt-1">Mention obligatoire si elle diffère de la date d'émission.</p>
                  </div>
                )}
                <div>
                  <Label>{isDevis ? "Valable jusqu'au" : "Échéance"}</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="input-due-date" />
                </div>
              </div>
            </div>

            {!isNew && (
              <>
                {isDraft && !isDevis ? (
                  <div className="card-naturo space-y-2">
                    <h3 className="text-heading">Émission</h3>
                    <p className="text-sm text-muted-foreground">
                      Un brouillon n'a pas de numéro. À l'émission, il reçoit le suivant de votre séquence légale
                      et devient un Factur-X non modifiable.
                    </p>
                    <Button onClick={() => issue(false)} disabled={busy} className="w-full rounded-md font-bold" data-testid="button-issue-side">
                      <Stamp className="h-4 w-4 mr-1" /> Émettre
                    </Button>
                    {!isAvoir && (
                      <Button variant="outline" onClick={() => issue(true)} disabled={busy} className="w-full rounded-md font-bold" data-testid="button-issue-paid">
                        Émettre et marquer réglée
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="card-naturo">
                    <h3 className="mb-3 text-heading">Statut</h3>
                    <div className="space-y-2">
                      {statusChoices.map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(s)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            invoice?.status === s ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-secondary"
                          }`}
                          data-testid={`button-status-${s}`}
                        >
                          {isAvoir && s === "paid" ? "Remboursé" : <StatusBadge domain="invoice" status={s} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card-naturo">
                  <h3 className="mb-3 text-heading">{isAvoir ? "Remboursement" : "Règlement"}</h3>
                  <div className="space-y-3">
                    <div>
                      <Label>Mode de paiement</Label>
                      <Select value={paymentMethod || "_none"} onValueChange={(v) => setPaymentMethod(v === "_none" ? "" : v)}>
                        <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          <SelectItem value="cash">Espèces</SelectItem>
                          <SelectItem value="check">Chèque</SelectItem>
                          <SelectItem value="transfer">Virement</SelectItem>
                          <SelectItem value="card">Carte</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Date de paiement</Label>
                      <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} data-testid="input-paid-at" />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Button onClick={saveAll} className="w-full rounded-md font-bold" disabled={busy} data-testid="button-save">
                <Save className="h-4 w-4 mr-1" /> {isNew ? (docType === "devis" ? "Créer le devis" : "Créer le brouillon") : "Enregistrer"}
              </Button>
              {!isNew && invoice?.status === "draft" && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!(await confirm({
                      title: `Supprimer ce ${isDevis ? "devis" : "brouillon"} ?`,
                      description: "Il n'a pas été émis : sa suppression ne laisse aucune trace comptable.",
                      confirmLabel: "Supprimer",
                      cancelLabel: "Annuler",
                      destructive: true,
                    }))) return;
                    deleteMut.mutate();
                  }}
                  className="w-full rounded-md font-bold text-destructive border-destructive/30 hover:bg-destructive/10"
                  data-testid="button-delete"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer sticky mobile : total + enregistrement rapide sans scroller jusqu'en bas */}
        <div className="lg:hidden sticky bottom-0 -mx-4 px-4 py-3 border-t bg-background/95 backdrop-blur flex items-center justify-between gap-3 mt-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total {docName}</p>
            <p className="text-xl font-bold text-heading">{formatPrice(totals.total)}</p>
          </div>
          <Button
            onClick={saveAll}
            disabled={busy}
            className="rounded-md font-bold min-h-[44px]"
            data-testid="button-save-sticky"
          >
            <Save className="h-4 w-4 mr-1" /> {isNew ? "Créer" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function InvoiceEditorGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="La facturation" description="Création de factures, PDF, envoi par email et suivi des paiements sont réservés à l'abonnement Naturo Pro." />;
  }
  return <InvoiceEditor />;
}
