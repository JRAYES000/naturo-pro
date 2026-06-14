/**
 * client/src/pages/Packages.tsx — Forfaits / carnets de séances prépayées
 *
 * Permet de vendre un pack de N séances à une cliente et de suivre la
 * consommation au fil des consultations.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Ticket, PlusCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { Loading } from "@/components/Loading";
import { HelpNote } from "@/components/HelpNote";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/hooks/use-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Package } from "@shared/schema";
import type { Client } from "@shared/schema";

// ── Zod form schema ──────────────────────────────────────────────────────────

const formSchema = z.object({
  clientId: z.string().min(1, "Sélectionnez une cliente"),
  name: z.string().min(1, "Le nom est requis").max(255),
  totalSessions: z.coerce.number().int().positive("Nombre de séances requis"),
  priceCents: z.coerce.number().int().min(0).default(0),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function clientName(clients: Client[], clientId: number): string {
  const c = clients.find((cl) => cl.id === clientId);
  if (!c) return `#${clientId}`;
  return `${c.firstName} ${c.lastName}`;
}

function progressColor(used: number, total: number): string {
  const ratio = total > 0 ? used / total : 0;
  if (ratio >= 1) return "bg-red-500";
  if (ratio >= 0.75) return "bg-amber-400";
  return "bg-emerald-500";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Packages() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Package | "new" | null>(null);
  const [filterClientId, setFilterClientId] = useState<string>("all");

  const { data: pkgs = [], isLoading } = useQuery<Package[]>({
    queryKey: ["/api/packages"],
    queryFn: () => apiRequest("GET", "/api/packages").then((r) => r.json()),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: () => apiRequest("GET", "/api/clients").then((r) => r.json()),
  });

  // Filtrage par cliente
  const displayed = filterClientId === "all"
    ? pkgs
    : pkgs.filter((p) => p.clientId === Number(filterClientId));

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: FormValues) =>
      apiRequest("POST", "/api/packages", {
        ...data,
        clientId: Number(data.clientId),
        priceCents: data.priceCents,
        notes: data.notes ?? null,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Forfait créé", variant: "success" });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormValues> }) =>
      apiRequest("PATCH", `/api/packages/${id}`, {
        ...data,
        clientId: data.clientId ? Number(data.clientId) : undefined,
        priceCents: data.priceCents,
        notes: data.notes ?? null,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Forfait mis à jour", variant: "success" });
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/packages/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/packages"] });
      const prev = queryClient.getQueryData<Package[]>(["/api/packages"]);
      queryClient.setQueryData<Package[]>(["/api/packages"], (old) =>
        (old ?? []).filter((it) => it.id !== id),
      );
      return { prev };
    },
    onSuccess: () => {
      toast({ title: "Forfait supprimé", variant: "success" });
    },
    onError: (_e, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/packages"], ctx.prev);
      toast({ title: "Erreur", description: "Suppression impossible.", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/packages"] }),
  });

  const useMut = useMutation({
    mutationFn: (pkg: Package) =>
      apiRequest("PATCH", `/api/packages/${pkg.id}`, {
        usedSessions: pkg.usedSessions + 1,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      toast({ title: "Séance enregistrée", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="max-w-5xl">
        {/* En-tête */}
        <PageHeader
          title="Forfaits"
          subtitle="Les forfaits de séances prépayées de vos clients."
          icon={Ticket}
          actions={
            <Button
              onClick={() => setEditing("new")}
              className="rounded-lg font-bold"
              data-testid="button-new-package"
            >
              <Plus className="h-4 w-4 mr-1" /> Nouveau forfait
            </Button>
          }
        />

        <HelpNote title="Comment fonctionnent les forfaits ?">
          <p>
            Un <strong>forfait</strong> vous permet de vendre un carnet de N séances à une cliente
            (ex. « Pack 5 séances — 250 €») et de décompter chaque consultation au fil du temps.
          </p>
          <div>
            <p className="font-semibold text-foreground mb-2">Comment ça marche ?</p>
            <ul>
              <li><strong>Créez</strong> un forfait en choisissant la cliente, le nombre de séances et le prix total.</li>
              <li>Après chaque consultation, cliquez sur <strong>« Utiliser une séance »</strong> pour décrémenter le solde.</li>
              <li>La barre de progression devient <strong>rouge</strong> quand toutes les séances sont consommées.</li>
              <li>Vous pouvez <strong>modifier</strong> un forfait à tout moment (nom, prix, notes).</li>
            </ul>
          </div>
        </HelpNote>

        {/* Filtre par cliente */}
        {clients.length > 0 && (
          <div className="mb-4 max-w-xs">
            <Select value={filterClientId} onValueChange={setFilterClientId}>
              <SelectTrigger data-testid="select-filter-client">
                <SelectValue placeholder="Toutes les clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les clientes</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.firstName} {c.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Liste des forfaits */}
        {isLoading ? (
          <Loading variant="cards" label="Chargement des forfaits…" />
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Aucun forfait pour le moment."
            description="Cliquez sur « Nouveau forfait » pour commencer."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayed.map((pkg) => {
              const ratio = pkg.totalSessions > 0 ? pkg.usedSessions / pkg.totalSessions : 0;
              const isFull = ratio >= 1;
              return (
                <div
                  key={pkg.id}
                  className="card-naturo rounded-lg p-5 flex flex-col gap-3 border"
                  data-testid={`card-package-${pkg.id}`}
                >
                  {/* En-tête carte */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-base leading-tight" data-testid={`text-package-name-${pkg.id}`}>{pkg.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{clientName(clients, pkg.clientId)}</p>
                    </div>
                    {isFull && (
                      <Badge variant="destructive" className="text-xs shrink-0">Épuisé</Badge>
                    )}
                  </div>

                  {/* Barre de progression */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span data-testid={`text-package-used-${pkg.id}`}>{pkg.usedSessions} / {pkg.totalSessions} séances</span>
                      <span>{formatPrice(pkg.priceCents)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressColor(pkg.usedSessions, pkg.totalSessions)}`}
                        style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {pkg.notes && (
                    <p className="text-xs text-muted-foreground italic line-clamp-2">{pkg.notes}</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-[10px] text-xs font-semibold"
                      disabled={isFull || useMut.isPending}
                      onClick={() => useMut.mutate(pkg)}
                      data-testid={`button-use-package-${pkg.id}`}
                    >
                      <PlusCircle className="h-3.5 w-3.5 mr-1" />
                      Utiliser une séance
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10"
                      aria-label="Modifier le forfait"
                      onClick={() => setEditing(pkg)}
                      data-testid={`button-edit-package-${pkg.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 text-destructive hover:text-destructive"
                      aria-label="Supprimer le forfait"
                      onClick={async () => {
                        if (!(await confirm({
                          title: "Supprimer ce forfait ?",
                          description: "Cette action est définitive et supprimera le suivi des séances de ce forfait.",
                          confirmLabel: "Supprimer",
                          cancelLabel: "Annuler",
                          destructive: true,
                        }))) return;
                        deleteMut.mutate(pkg.id);
                      }}
                      data-testid={`button-delete-package-${pkg.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog création / édition */}
      {editing !== null && (
        <PackageDialog
          pkg={editing === "new" ? null : editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSave={(values) => {
            if (editing === "new") {
              createMut.mutate(values);
            } else {
              updateMut.mutate({ id: (editing as Package).id, data: values });
            }
          }}
          isPending={createMut.isPending || updateMut.isPending}
        />
      )}
    </AppLayout>
  );
}

// ── Dialog create / edit ──────────────────────────────────────────────────────

interface PackageDialogProps {
  pkg: Package | null;
  clients: Client[];
  onClose: () => void;
  onSave: (values: FormValues) => void;
  isPending: boolean;
}

function PackageDialog({ pkg, clients, onClose, onSave, isPending }: PackageDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: pkg
      ? {
          clientId: String(pkg.clientId),
          name: pkg.name,
          totalSessions: pkg.totalSessions,
          priceCents: pkg.priceCents ?? 0,
          notes: pkg.notes ?? "",
        }
      : {
          clientId: "",
          name: "",
          totalSessions: 5,
          priceCents: 0,
          notes: "",
        },
  });

  const clientIdVal = watch("clientId");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{pkg ? "Modifier le forfait" : "Nouveau forfait"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4 mt-2">
          {/* Cliente */}
          <div className="space-y-1">
            <Label htmlFor="pkg-client">Cliente *</Label>
            <Select
              value={clientIdVal}
              onValueChange={(v) => setValue("clientId", v, { shouldValidate: true })}
            >
              <SelectTrigger id="pkg-client" data-testid="select-pkg-client">
                <SelectValue placeholder="Sélectionner une cliente…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.firstName} {c.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.clientId && (
              <p className="text-xs text-destructive">{errors.clientId.message}</p>
            )}
          </div>

          {/* Nom */}
          <div className="space-y-1">
            <Label htmlFor="pkg-name">Nom du forfait *</Label>
            <Input
              id="pkg-name"
              placeholder="Ex : Pack 5 séances suivi nutritionnel"
              data-testid="input-pkg-name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Séances + prix */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pkg-total">Nb de séances *</Label>
              <Input
                id="pkg-total"
                type="number"
                min={1}
                data-testid="input-pkg-total"
                {...register("totalSessions")}
              />
              {errors.totalSessions && (
                <p className="text-xs text-destructive">{errors.totalSessions.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-price">Prix total (€)</Label>
              <Input
                id="pkg-price"
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                data-testid="input-pkg-price"
                onChange={(e) =>
                  setValue("priceCents", Math.round(parseFloat(e.target.value || "0") * 100))
                }
                defaultValue={pkg ? (pkg.priceCents ?? 0) / 100 : 0}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="pkg-notes">Notes (optionnel)</Label>
            <Textarea
              id="pkg-notes"
              rows={2}
              placeholder="Ex : Tarif préférentiel, valable 12 mois…"
              data-testid="input-pkg-notes"
              {...register("notes")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-[10px]">
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="rounded-[10px] font-bold"
              data-testid="button-save-package"
            >
              {pkg ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
