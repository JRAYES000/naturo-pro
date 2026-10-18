/**
 * CompanyLookup — recherche d'une entreprise par SIREN, SIRET ou nom dans
 * l'annuaire public des entreprises (via GET /api/company-lookup), pour remplir
 * une fiche cliente, une facture ou ses propres réglages sans ressaisie.
 */
import { useState } from "react";
import { Search, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

export interface CompanyLookupResult {
  siren: string;
  siret: string | null;
  name: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  vatNumber: string | null;
  legalForm: string | null;
  clientKind: "entreprise" | "association" | "public";
  isEI: boolean;
  active: boolean;
}

export function CompanyLookup({
  initialQuery = "",
  onPick,
  label = "Rechercher",
  testid = "button-company-lookup",
}: {
  initialQuery?: string;
  onPick: (r: CompanyLookupResult) => void;
  label?: string;
  testid?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompanyLookupResult[] | null>(null);

  async function search(query = q) {
    if (!query.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/company-lookup?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (e: any) {
      setError(e?.message || "Recherche impossible");
      setResults(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-md shrink-0"
        onClick={() => {
          setQ(initialQuery);
          setResults(null);
          setError(null);
          setOpen(true);
          if (initialQuery.replace(/\D/g, "").length >= 9) void search(initialQuery);
        }}
        data-testid={testid}
      >
        <Search className="h-4 w-4 mr-1" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rechercher une entreprise</DialogTitle>
            <DialogDescription>
              Annuaire public des entreprises (INSEE). Saisissez un SIREN, un SIRET ou un nom.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="552 032 534 ou nom de l'entreprise"
              autoFocus
              data-testid="input-company-lookup"
            />
            <Button type="submit" disabled={pending} className="rounded-md" data-testid="button-company-lookup-search">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {results && results.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune entreprise trouvée.</p>
          )}
          {results && results.length > 0 && (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.siren}-${r.siret}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r);
                      setOpen(false);
                    }}
                    className="w-full text-left rounded-md border p-3 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`button-company-result-${r.siren}`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      {r.name}
                      {!r.active && <span className="text-xs font-normal text-destructive">(fermée)</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1">
                      SIREN {r.siren}
                      {r.siret ? ` · SIRET ${r.siret}` : ""}
                      {r.vatNumber ? ` · TVA ${r.vatNumber}` : ""}
                    </span>
                    {(r.address || r.city) && (
                      <span className="block text-xs text-muted-foreground">
                        {[r.address, [r.postalCode, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
