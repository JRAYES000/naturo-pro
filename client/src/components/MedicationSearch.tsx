/**
 * MedicationSearch — recherche d'une spécialité dans la base publique des
 * médicaments (BDPM, ANSM) pour l'ajouter aux traitements en cours de la cliente.
 * La source et la date de mise à jour sont affichées (Licence ouverte).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pill } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

interface MedicationResult { cis: string; name: string; form: string | null; routes: string | null; holder: string | null; commercialized: boolean }
interface SearchResponse { results: MedicationResult[]; source: { label: string; updatedAt: number | null } }

export function MedicationSearch({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useQuery<SearchResponse>({
    queryKey: ["/api/medications", { q: debounced }],
    queryFn: async () => (await apiRequest("GET", `/api/medications?q=${encodeURIComponent(debounced)}`)).json(),
    enabled: debounced.length >= 2,
  });
  const results = debounced.length >= 2 ? data?.results ?? [] : [];

  return (
    <div className="relative" data-testid="medication-search">
      <div className="relative">
        <Pill className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un médicament (ex. : doliprane)" className="pl-9"
          aria-label="Rechercher un médicament dans la base publique" data-testid="input-medication-search" />
      </div>
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md" role="listbox">
          {results.map((m) => (
            <li key={m.cis}>
              <button type="button" role="option" aria-selected="false"
                onClick={() => { onPick(m.name); setQ(""); setDebounced(""); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
                data-testid={`medication-${m.cis}`}>
                <span className="font-semibold">{m.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[m.routes, m.holder?.trim(), m.commercialized ? null : "non commercialisée"].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data?.source?.updatedAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          Source : base de données publique des médicaments (ANSM), copie du {new Date(data.source.updatedAt).toLocaleDateString("fr-FR")}.
        </p>
      )}
    </div>
  );
}
