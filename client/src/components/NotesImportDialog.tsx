/**
 * NotesImportDialog — reprise d'anciennes notes de consultation (cahier, Word,
 * ancien logiciel) : texte collé, .txt ou PDF texte. L'IA les découpe en
 * consultations datées et les range dans les rubriques du compte-rendu ; la
 * praticienne relit et corrige tout avant l'enregistrement.
 */
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Upload, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const FIELDS: Array<[keyof Consultation, string]> = [
  ["motif", "Motif"], ["anamnese", "Anamnèse"], ["bilan", "Bilan"], ["conseilsAlimentaires", "Conseils alimentaires"],
  ["hygieneDeVie", "Hygiène de vie"], ["suivi", "Suivi"], ["notesLibres", "Notes libres"],
];

interface Consultation {
  date: string | null;
  motif: string; anamnese: string; bilan: string; conseilsAlimentaires: string; hygieneDeVie: string; suivi: string; notesLibres: string;
}

export function NotesImportDialog({ clientId, open, onClose }: { clientId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ filename: string; mimeType: string; dataBase64: string } | null>(null);
  const [items, setItems] = useState<Consultation[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setText(""); setFile(null); setItems(null); };
  const close = () => { reset(); onClose(); };

  const analyse = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/import-notes`, file ? { file } : { text })).json(),
    onSuccess: (r: { consultations: Consultation[]; truncated: boolean }) => {
      setItems(r.consultations);
      if (r.truncated) toast({ title: "Texte long", description: "Seul le début (40 000 caractères) a été analysé : importez le reste dans un second temps." });
    },
    onError: (e: any) => toast({ title: "Analyse impossible", description: e.message, variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/clients/${clientId}/import-notes/save`, { consultations: items })).json(),
    onSuccess: (r: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "followups"] });
      toast({ title: "Notes importées", description: `${r.created} consultation(s) ajoutée(s) à l'historique.`, variant: "success" });
      close();
    },
    onError: (e: any) => toast({ title: "Enregistrement impossible", description: e.message, variant: "destructive" }),
  });

  function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "1,5 Mo au maximum : copiez-collez plutôt le texte.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFile({ filename: f.name, mimeType: f.type || "application/octet-stream", dataBase64: String(reader.result).split(",")[1] || "" });
    reader.readAsDataURL(f);
  }
  const update = (i: number, patch: Partial<Consultation>) => setItems((list) => list && list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer d'anciennes notes</DialogTitle>
          <DialogDescription>
            Cahier retranscrit, document Word, export d'un ancien logiciel : l'IA découpe vos notes en consultations
            datées et les range dans les rubriques du compte-rendu, sans rien ajouter. Vous relisez avant d'enregistrer.
          </DialogDescription>
        </DialogHeader>

        {!items ? (
          <div className="space-y-3">
            <Textarea value={text} onChange={(e) => { setText(e.target.value); setFile(null); }} rows={10}
              placeholder={"Ex. :\n12/03/2024 — fatigue chronique, dort mal. Conseils : moins de café, magnésium.\n02/05/2024 — mieux, sommeil amélioré…"}
              data-testid="input-import-text" />
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button variant="outline" size="sm" className="rounded-md" onClick={() => fileRef.current?.click()} data-testid="button-import-file">
                <Upload className="h-4 w-4 mr-1" /> Ou choisir un fichier (.txt, PDF)
              </Button>
              {file && <span className="text-sm text-muted-foreground">{file.filename}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Le texte est analysé par le service d'IA de Naturo Pro (OpenRouter). Un PDF scanné (photo) n'est pas lisible : copiez-en le texte.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => analyse.mutate()} disabled={analyse.isPending || (!file && text.trim().length < 20)} className="rounded-md font-bold" data-testid="button-import-analyse">
                {analyse.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {analyse.isPending ? "Analyse en cours…" : "Analyser"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">{items.length} consultation(s) reconnue(s). Vérifiez dates et rubriques avant d'enregistrer.</p>
            {items.map((c, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2" data-testid={`import-item-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`import-date-${i}`}>Date</Label>
                    <Input id={`import-date-${i}`} type="date" value={c.date ?? ""} onChange={(e) => update(i, { date: e.target.value || null })} className="w-44" />
                    {!c.date && <span className="text-xs text-amber-700">Date inconnue : aujourd'hui par défaut</span>}
                  </div>
                  <button type="button" onClick={() => setItems((l) => l && l.filter((_, j) => j !== i))}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10" aria-label="Retirer cette consultation">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {FIELDS.filter(([k]) => (c[k] as string) || k === "motif").map(([k, label]) => (
                  <div key={k}>
                    <Label className="text-xs">{label}</Label>
                    <Textarea value={c[k] as string} onChange={(e) => update(i, { [k]: e.target.value } as Partial<Consultation>)} rows={2} />
                  </div>
                ))}
              </div>
            ))}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setItems(null)}>Recommencer</Button>
              <Button onClick={() => save.mutate()} disabled={!items.length || save.isPending} className="rounded-md font-bold" data-testid="button-import-save">
                Enregistrer {items.length} consultation(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
