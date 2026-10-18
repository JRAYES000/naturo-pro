/**
 * ReferralCard — parrainage : lien personnel à transmettre à une consœur et suivi
 * des praticiennes inscrites grâce à lui.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ReferralData {
  code: string;
  link: string;
  referrals: Array<{ name: string; createdAt: number; status: string; rewarded?: boolean }>;
}

export function ReferralCard() {
  const { toast } = useToast();
  const { data } = useQuery<ReferralData>({ queryKey: ["/api/referral"] });
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(data!.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copie impossible", description: "Sélectionnez le lien et copiez-le à la main.", variant: "destructive" });
    }
  }

  return (
    <div className="card-naturo space-y-3" data-testid="section-referral">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-heading" />
        <h2 className="font-bold">Parrainage</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Recommandez Naturo Pro à une consœur avec votre lien d'inscription. Quand elle s'abonne, vous recevez
        chacune un mois offert : déduit de la prochaine facture pour une abonnée, ajouté à l'accès complet sinon.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-sm" aria-label="Votre lien de parrainage" data-testid="input-referral-link" />
        <Button variant="outline" onClick={copy} className="rounded-md font-bold shrink-0" data-testid="button-copy-referral">
          {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />} {copied ? "Copié" : "Copier"}
        </Button>
      </div>
      {data.referrals.length > 0 ? (
        <ul className="space-y-1 text-sm" data-testid="list-referrals">
          {data.referrals.map((r, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{r.name} · inscrite le {new Date(r.createdAt).toLocaleDateString("fr-FR")}</span>
              <span className="text-muted-foreground">{r.status}{r.rewarded ? " · mois offert" : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune consœur inscrite avec votre lien pour l'instant.</p>
      )}
    </div>
  );
}
