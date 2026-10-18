/**
 * TwoFactorSettings — double authentification (TOTP) dans les Paramètres :
 * activation (QR code ou clé à saisir, puis code de confirmation), codes de
 * secours affichés une seule fois, régénération et désactivation.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff, KeyRound, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { QrCodeImage } from "@/components/QrCode";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TwoFactorState { enabled: boolean; enabledAt: number | null; backupCodesLeft: number }

function CodeInput({ value, onChange, testid }: { value: string; onChange: (v: string) => void; testid: string }) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} inputMode="numeric" autoComplete="one-time-code" data-testid={testid}>
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
      </InputOTPGroup>
    </InputOTP>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { toast } = useToast();
  const text = `Naturo Pro — codes de secours (double authentification)\nChaque code ne sert qu'une fois.\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-3" data-testid="block-backup-codes">
      <p className="text-sm">
        <strong>Notez ces codes de secours</strong> et gardez-les en lieu sûr : ils permettent de vous connecter si
        vous perdez votre téléphone. Chacun ne sert qu'une fois. Ils ne seront plus affichés.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-secondary/40 rounded-md p-3" data-testid="list-backup-codes">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="rounded-md font-bold" onClick={async () => {
          try { await navigator.clipboard.writeText(text); toast({ title: "Codes copiés" }); } catch { toast({ title: "Copie impossible", variant: "destructive" }); }
        }}>
          <Copy className="h-4 w-4 mr-1" /> Copier
        </Button>
        <Button variant="outline" size="sm" className="rounded-md font-bold" onClick={() => {
          const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url; a.download = "naturo-pro-codes-de-secours.txt"; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>
          <Download className="h-4 w-4 mr-1" /> Télécharger
        </Button>
        <Button size="sm" className="rounded-md font-bold" onClick={onDone} data-testid="button-backup-codes-done">J'ai noté mes codes</Button>
      </div>
    </div>
  );
}

export function TwoFactorSettings() {
  const { toast } = useToast();
  const { data: state } = useQuery<TwoFactorState>({ queryKey: ["/api/auth/2fa"] });
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disable" | "regenerate">("idle");
  const [password, setPassword] = useState("");
  const [factor, setFactor] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/2fa"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };
  const fail = (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" });

  const setupMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/setup", {})).json(),
    onSuccess: (d) => { setSetup(d); setCode(""); },
    onError: fail,
  });
  const enableMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/enable", { code })).json(),
    onSuccess: (d) => {
      setSetup(null); setCode(""); setBackupCodes(d.backupCodes); refresh();
      toast({ title: "Double authentification activée", variant: "success" });
    },
    onError: (e: any) => { setCode(""); fail(e); },
  });
  const regenMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/backup-codes", { code: factor })).json(),
    onSuccess: (d) => { setMode("idle"); setFactor(""); setBackupCodes(d.backupCodes); refresh(); },
    onError: fail,
  });
  const disableMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/2fa/disable", { password, code: factor })).json(),
    onSuccess: () => {
      setMode("idle"); setPassword(""); setFactor(""); refresh();
      toast({ title: "Double authentification désactivée", variant: "success" });
    },
    onError: fail,
  });

  return (
    <div className="card-naturo space-y-4" data-testid="section-two-factor">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-heading" />
        <h2 className="font-bold">Double authentification</h2>
      </div>

      {backupCodes ? (
        <BackupCodes codes={backupCodes} onDone={() => setBackupCodes(null)} />
      ) : state?.enabled ? (
        <div className="space-y-3">
          <p className="text-sm" data-testid="text-2fa-enabled">
            <strong className="text-emerald-700">Activée</strong>
            {state.enabledAt ? ` depuis le ${new Date(state.enabledAt).toLocaleDateString("fr-FR")}` : ""}. À chaque
            connexion, un code de votre application d'authentification vous est demandé.{" "}
            {state.backupCodesLeft} code{state.backupCodesLeft > 1 ? "s" : ""} de secours restant{state.backupCodesLeft > 1 ? "s" : ""}.
          </p>
          {mode === "idle" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-md font-bold" onClick={() => setMode("regenerate")} data-testid="button-2fa-regenerate">
                <KeyRound className="h-4 w-4 mr-1" /> Nouveaux codes de secours
              </Button>
              <Button variant="outline" size="sm" className="rounded-md font-bold text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setMode("disable")} data-testid="button-2fa-disable">
                <ShieldOff className="h-4 w-4 mr-1" /> Désactiver
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              {mode === "disable" && (
                <div>
                  <Label htmlFor="twofa-password">Mot de passe</Label>
                  <Input id="twofa-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-2fa-password" />
                </div>
              )}
              <div>
                <Label htmlFor="twofa-factor">Code de l'application (ou code de secours)</Label>
                <Input id="twofa-factor" value={factor} onChange={(e) => setFactor(e.target.value)} autoComplete="one-time-code" placeholder="123456" className="w-48" data-testid="input-2fa-factor" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-md font-bold"
                  variant={mode === "disable" ? "destructive" : "default"}
                  disabled={factor.trim().length < 6 || (mode === "disable" && !password) || disableMut.isPending || regenMut.isPending}
                  onClick={() => (mode === "disable" ? disableMut.mutate() : regenMut.mutate())}
                  data-testid="button-2fa-confirm">
                  {mode === "disable" ? "Désactiver" : "Générer de nouveaux codes"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setFactor(""); setPassword(""); }}>Annuler</Button>
              </div>
            </div>
          )}
        </div>
      ) : setup ? (
        <div className="space-y-4" data-testid="block-2fa-setup">
          <ol className="text-sm space-y-1 list-decimal pl-5">
            <li>Ouvrez votre application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
            <li>Scannez ce QR code, ou saisissez la clé à la main.</li>
            <li>Entrez le code à 6 chiffres affiché pour confirmer.</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <QrCodeImage value={setup.otpauthUri} size={176} alt="QR code à scanner avec l'application d'authentification" />
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Clé à saisir à la main</p>
                <p className="font-mono text-sm break-all select-all" data-testid="text-2fa-secret">{setup.secret}</p>
              </div>
              <CodeInput value={code} onChange={setCode} testid="input-2fa-setup-code" />
              <div className="flex gap-2">
                <Button size="sm" className="rounded-md font-bold" disabled={code.length !== 6 || enableMut.isPending} onClick={() => enableMut.mutate()} data-testid="button-2fa-enable">
                  Activer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSetup(null)}>Annuler</Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Protégez l'accès aux dossiers de vos clientes : en plus du mot de passe, un code à 6 chiffres généré par
            une application sur votre téléphone vous sera demandé à chaque connexion.
          </p>
          <Button size="sm" className="rounded-md font-bold" onClick={() => setupMut.mutate()} disabled={setupMut.isPending || !state} data-testid="button-2fa-setup">
            <ShieldCheck className="h-4 w-4 mr-1" /> Activer la double authentification
          </Button>
        </div>
      )}
    </div>
  );
}
