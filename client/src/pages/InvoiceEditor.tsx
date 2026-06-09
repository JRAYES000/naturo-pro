import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Trash2, Plus, Save, Download, Mail, Receipt } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
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

interface ItemDraft {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces",
  check: "Chèque",
  transfer: "Virement",
  card: "Carte",
};

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
  return new Date(v + "T00:00:00").getTime();
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

export default function InvoiceEditor() {
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
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientPostalCode, setClientPostalCode] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [issueDate, setIssueDate] = useState<string>(toDateInputValue(Date.now()));
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ description: "Consultation", quantity: 1, unitPriceCents: 0 }]);
  const [status, setStatus] = useState<string>("draft");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>("");

  // Pré-remplir si modification
  useEffect(() => {
    if (invoice && !isNew) {
      setClientId(invoice.clientId ?? null);
      setClientFirstName(invoice.clientFirstName || "");
      setClientLastName(invoice.clientLastName || "");
      setClientEmail(invoice.clientEmail || "");
      setClientAddress(invoice.clientAddress || "");
      setClientPostalCode(invoice.clientPostalCode || "");
      setClientCity(invoice.clientCity || "");
      setIssueDate(toDateInputValue(invoice.issueDate));
      setDueDate(toDateInputValue(invoice.dueDate));
      setNotes(invoice.notes || "");
      setStatus(invoice.status);
      setPaymentMethod(invoice.paymentMethod || "");
      setPaidAt(toDateInputValue(invoice.paidAt));
      if (invoice.items && invoice.items.length > 0) {
        setItems(invoice.items.map((it) => ({
          description: it.description,
          quantity: it.quantity ?? 1,
          unitPriceCents: it.unitPriceCents ?? 0,
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
        console.log("[InvoiceEditor] Pré-remplissage depuis RDV", fromAppointmentId);
        const res = await apiRequest("POST", `/api/invoices/from-appointment/${fromAppointmentId}`, {});
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || `HTTP ${res.status}`);
        }
        const created: any = await res.json();
        if (cancelled || !created?.id) return;
        queryClient.setQueryData(["/api/invoices", created.id], created);
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        navigate(`/app/invoices/${created.id}`, { replace: true });
      } catch (e: any) {
        console.error("[InvoiceEditor] Erreur création facture depuis RDV", e);
        if (!cancelled) toast({ title: "Erreur création facture", description: e.message, variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, fromAppointmentId, navigate, toast]);

  // Pré-remplir client à la sélection
  useEffect(() => {
    if (!clientId) return;
    const c = clients.find((x) => x.id === clientId);
    if (c && isNew) {
      setClientFirstName(c.firstName || "");
      setClientLastName(c.lastName || "");
      setClientEmail(c.email || "");
      setClientAddress((c as any).address || "");
      setClientPostalCode((c as any).postalCode || "");
      setClientCity((c as any).city || "");
    }
  }, [clientId, clients, isNew]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + Math.max(0, Math.floor(it.quantity || 0)) * Math.max(0, Math.floor(it.unitPriceCents || 0)), 0);
    const vatRate = invoice?.vatRate ?? 0;
    const vatEnabled = !!invoice?.vatEnabled;
    const vat = vatEnabled ? Math.round((subtotal * vatRate) / 10000) : 0;
    return { subtotal, vat, total: subtotal + vat, vatEnabled, vatRate };
  }, [items, invoice]);

  const createMut = useMutation({
    mutationFn: async () => {
      const body = {
        clientId, clientFirstName, clientLastName, clientEmail,
        clientAddress: clientAddress || null,
        clientPostalCode: clientPostalCode || null,
        clientCity: clientCity || null,
        issueDate: fromDateInputValue(issueDate) || Date.now(),
        dueDate: fromDateInputValue(dueDate),
        notes: notes || null,
        items: items.filter((i) => i.description.trim()),
      };
      const res = await apiRequest("POST", "/api/invoices", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Facture créée", description: data.number, variant: "success" });
      navigate(`/app/invoices/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (patch: any) => {
      const res = await apiRequest("PATCH", `/api/invoices/${numericId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", numericId] });
      toast({ title: "Facture mise à jour", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/invoices/${numericId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Facture supprimée", variant: "success" });
      navigate("/app/invoices");
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invoices/${numericId}/send`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", numericId] });
      toast({ title: "Email envoyé", description: "La facture a été envoyée au client avec le PDF en pièce jointe.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur d'envoi", description: e.message, variant: "destructive" }),
  });

  function saveAll() {
    if (isNew) {
      createMut.mutate();
      return;
    }
    const patch: any = {
      clientFirstName, clientLastName, clientEmail,
      clientAddress: clientAddress || null,
      clientPostalCode: clientPostalCode || null,
      clientCity: clientCity || null,
      dueDate: fromDateInputValue(dueDate),
      notes: notes || null,
      items: items.filter((i) => i.description.trim()),
      status,
      paymentMethod: paymentMethod || null,
      paidAt: fromDateInputValue(paidAt),
    };
    updateMut.mutate(patch);
  }

  function setStatusAndPaid(newStatus: string) {
    setStatus(newStatus);
    if (!isNew) {
      const patch: any = { status: newStatus };
      if (newStatus === "paid" && !paidAt) {
        const now = toDateInputValue(Date.now());
        setPaidAt(now);
        patch.paidAt = fromDateInputValue(now);
      }
      updateMut.mutate(patch);
    }
  }

  if (!isNew && isLoading) {
    return <AppLayout><div className="p-8">Chargement…</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-5xl">
        <PageHeader
          title={isNew ? "Nouvelle facture" : (invoice?.number ?? "")}
          subtitle={!isNew && invoice ? `Créée le ${new Date(invoice.createdAt).toLocaleDateString("fr-FR")}` : undefined}
          icon={Receipt}
          backTo={{ href: "/app/invoices", label: "Factures" }}
          actions={!isNew && invoice ? (
            <>
              <a
                href={`/api/invoices/${numericId}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-[15px] text-sm font-bold border border-input hover:bg-secondary"
                data-testid="button-download-pdf"
              >
                <Download className="h-4 w-4" /> PDF
              </a>
              <Button
                variant="outline"
                onClick={() => sendMut.mutate()}
                disabled={sendMut.isPending || !clientEmail}
                className="rounded-[15px] font-bold"
                data-testid="button-send-email"
              >
                <Mail className="h-4 w-4 mr-1" /> Envoyer
              </Button>
            </>
          ) : undefined}
        />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Colonne gauche : client + lignes + dates */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card-naturo">
              <h3 className="font-extrabold mb-3 text-heading">Client</h3>
              {isNew && clients.length > 0 && (
                <div className="mb-3">
                  <Label>Sélectionner un client existant</Label>
                  <Select
                    value={clientId ? String(clientId) : ""}
                    onValueChange={(v) => setClientId(v ? Number(v) : null)}
                  >
                    <SelectTrigger data-testid="select-client"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.firstName} {c.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Prénom</Label>
                  <Input value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} data-testid="input-client-firstname" />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} data-testid="input-client-lastname" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Email</Label>
                  <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} data-testid="input-client-email" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Adresse</Label>
                  <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} data-testid="input-client-address" />
                </div>
                <div>
                  <Label>Code postal</Label>
                  <Input value={clientPostalCode} onChange={(e) => setClientPostalCode(e.target.value)} data-testid="input-client-postal" />
                </div>
                <div>
                  <Label>Ville</Label>
                  <Input value={clientCity} onChange={(e) => setClientCity(e.target.value)} data-testid="input-client-city" />
                </div>
              </div>
            </div>

            <div className="card-naturo">
              <h3 className="font-extrabold mb-3 text-heading">Lignes</h3>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-bold text-muted-foreground uppercase">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-right">Qté</div>
                  <div className="col-span-2 text-right">Prix unitaire</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`row-item-${i}`}>
                    <Input
                      className="col-span-12 sm:col-span-6"
                      value={it.description}
                      onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                      placeholder="Description"
                      data-testid={`input-item-description-${i}`}
                    />
                    <Input
                      className="col-span-4 sm:col-span-2 text-right"
                      type="number"
                      min={0}
                      value={it.quantity}
                      onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
                      data-testid={`input-item-qty-${i}`}
                    />
                    <Input
                      className="col-span-5 sm:col-span-2 text-right"
                      type="number"
                      min={0}
                      step={0.01}
                      value={(it.unitPriceCents / 100).toFixed(2)}
                      onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unitPriceCents: Math.round(Number(e.target.value) * 100) } : x))}
                      data-testid={`input-item-price-${i}`}
                    />
                    <div className="col-span-2 sm:col-span-1 text-right font-bold text-sm">
                      {formatPrice(Math.max(0, Math.floor(it.quantity || 0)) * Math.max(0, Math.floor(it.unitPriceCents || 0)))}
                    </div>
                    <button
                      className="col-span-1 p-1.5 rounded-md hover:bg-destructive/10 text-destructive justify-self-end"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                      disabled={items.length <= 1}
                      data-testid={`button-remove-item-${i}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItems([...items, { description: "", quantity: 1, unitPriceCents: 0 }])}
                  className="text-primary font-bold"
                  data-testid="button-add-item"
                >
                  <Plus className="h-4 w-4 mr-1" /> Ajouter une ligne
                </Button>
              </div>

              {/* Totaux */}
              <div className="mt-4 pt-4 border-t flex justify-end">
                <div className="w-full sm:w-72 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Sous-total HT</span><span className="font-bold">{formatPrice(totals.subtotal)}</span></div>
                  {totals.vatEnabled && (
                    <div className="flex justify-between text-muted-foreground"><span>TVA ({(totals.vatRate / 100).toFixed(0)}%)</span><span>{formatPrice(totals.vat)}</span></div>
                  )}
                  <div className="flex justify-between text-base pt-1 border-t mt-1"><span className="font-bold">Total</span><span className="font-extrabold text-heading">{formatPrice(totals.total)}</span></div>
                </div>
              </div>
            </div>

            <div className="card-naturo">
              <h3 className="font-extrabold mb-3 text-heading">Notes</h3>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Mentions, message au client…" data-testid="input-notes" />
            </div>
          </div>

          {/* Colonne droite : statut + paiement + dates */}
          <div className="space-y-4">
            <div className="card-naturo">
              <h3 className="font-extrabold mb-3 text-heading">Dates</h3>
              <div className="space-y-3">
                <div>
                  <Label>Date d'émission</Label>
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={!isNew} data-testid="input-issue-date" />
                </div>
                <div>
                  <Label>Échéance</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="input-due-date" />
                </div>
              </div>
            </div>

            {!isNew && (
              <>
                <div className="card-naturo">
                  <h3 className="font-extrabold mb-3 text-heading">Statut</h3>
                  <div className="space-y-2">
                    {(["draft", "sent", "paid", "cancelled"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatusAndPaid(s)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold border ${
                          status === s ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-secondary"
                        }`}
                        data-testid={`button-status-${s}`}
                      >
                        <StatusBadge domain="invoice" status={s} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card-naturo">
                  <h3 className="font-extrabold mb-3 text-heading">Paiement</h3>
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
              <Button onClick={saveAll} className="w-full rounded-[15px] font-bold" disabled={createMut.isPending || updateMut.isPending} data-testid="button-save">
                <Save className="h-4 w-4 mr-1" /> {isNew ? "Créer la facture" : "Enregistrer"}
              </Button>
              {!isNew && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!(await confirm({
                      title: "Supprimer cette facture ?",
                      description: "Cette action est définitive et ne peut pas être annulée.",
                      confirmLabel: "Supprimer",
                      cancelLabel: "Annuler",
                      destructive: true,
                    }))) return;
                    deleteMut.mutate();
                  }}
                  className="w-full rounded-[15px] font-bold text-destructive border-destructive/30 hover:bg-destructive/10"
                  data-testid="button-delete"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
