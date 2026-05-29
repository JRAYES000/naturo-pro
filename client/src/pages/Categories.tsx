import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPrice, durationLabel } from "@/lib/format";
import type { AppointmentCategory } from "@shared/schema";

export default function CategoriesPage() {
  const { toast } = useToast();
  const { data: cats = [] } = useQuery<AppointmentCategory[]>({ queryKey: ["/api/categories"] });
  const [editing, setEditing] = useState<AppointmentCategory | "new" | null>(null);

  const delMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/categories"] }); toast({ title: "Prestation supprimée" }); },
  });

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold" style={{ color: "#1b4332" }}>Prestations</h1>
            <p className="text-muted-foreground text-sm mt-1">Vos catégories de rendez-vous, durées et tarifs.</p>
          </div>
          <Button onClick={() => setEditing("new")} className="rounded-[15px] font-bold" data-testid="button-new-category">
            <Plus className="h-4 w-4 mr-1" /> Nouvelle
          </Button>
        </div>

        {cats.length === 0 ? (
          <div className="card-naturo text-center py-16">
            <Tag className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-bold mb-1">Aucune prestation</p>
            <p className="text-sm text-muted-foreground mb-4">Créez vos premières prestations pour permettre la réservation en ligne.</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {cats.map(c => (
              <li key={c.id} className="card-naturo" data-testid={`category-${c.id}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: c.color || "#186749" }} />
                    <h3 className="font-extrabold">{c.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" onClick={() => setEditing(c)} data-testid={`button-edit-${c.id}`}><Pencil className="h-4 w-4" /></button>
                    <button className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" onClick={() => { if (confirm("Supprimer ?")) delMut.mutate(c.id); }} data-testid={`button-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {c.description && <p className="text-sm text-muted-foreground mb-3">{c.description}</p>}
                <div className="flex items-center gap-3 text-sm">
                  <span className="bg-secondary text-primary font-bold px-2 py-1 rounded-md">{durationLabel(c.durationMinutes)}</span>
                  <span className="bg-accent/30 text-primary font-bold px-2 py-1 rounded-md">{formatPrice(c.priceCents)}</span>
                  <span className="text-muted-foreground">{c.location}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CategoryDialog
        open={!!editing} editing={editing} onClose={() => setEditing(null)}
      />
    </AppLayout>
  );
}

function CategoryDialog({ open, editing, onClose }: any) {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);

  if (open && data === null) {
    setData(editing === "new"
      ? { name: "", durationMinutes: 60, priceCents: 5000, location: "cabinet", color: "#186749", description: "", isActive: true }
      : { ...editing }
    );
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (editing === "new") await apiRequest("POST", "/api/categories", data);
      else await apiRequest("PATCH", `/api/categories/${editing.id}`, data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/categories"] }); toast({ title: "Enregistré" }); setData(null); onClose(); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setData(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing === "new" ? "Nouvelle prestation" : "Modifier"}</DialogTitle></DialogHeader>
        {data && (
          <div className="space-y-3 py-2">
            <div><Label>Nom</Label><Input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} data-testid="input-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Durée (min)</Label><Input type="number" value={data.durationMinutes} onChange={e => setData({ ...data, durationMinutes: Number(e.target.value) })} data-testid="input-duration" /></div>
              <div><Label>Tarif (€)</Label><Input type="number" value={data.priceCents / 100} onChange={e => setData({ ...data, priceCents: Math.round(Number(e.target.value) * 100) })} data-testid="input-price" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Lieu</Label>
                <Select value={data.location} onValueChange={v => setData({ ...data, location: v })}>
                  <SelectTrigger data-testid="select-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cabinet">Cabinet</SelectItem>
                    <SelectItem value="visio">Visio</SelectItem>
                    <SelectItem value="domicile">Domicile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Couleur</Label><Input type="color" value={data.color} onChange={e => setData({ ...data, color: e.target.value })} className="h-10 p-1" data-testid="input-color" /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={data.description || ""} onChange={e => setData({ ...data, description: e.target.value })} data-testid="input-description" /></div>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !data.name} className="w-full rounded-[15px] py-5 font-bold" data-testid="button-save-category">
              {mut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
