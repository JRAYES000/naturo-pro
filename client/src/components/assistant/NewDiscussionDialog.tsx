import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ASSISTANT_THEMES, THEME_OTHER } from "@shared/assistant-themes";
import type { Client, AiDiscussion } from "@shared/schema";

export function NewDiscussionDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (d: AiDiscussion) => void }) {
  const [mode, setMode] = useState<"client" | "theme">("theme");
  const [clientId, setClientId] = useState<string>("");
  const [theme, setTheme] = useState<string>(ASSISTANT_THEMES[0]);
  const [customTheme, setCustomTheme] = useState("");
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"], enabled: open });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/discussions", body),
    onSuccess: async (res) => {
      const d = (await res.json()) as AiDiscussion;
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] });
      onOpenChange(false);
      onCreated(d);
    },
  });

  function submit() {
    if (mode === "client") {
      if (!clientId) return;
      createMut.mutate({ clientId: Number(clientId) });
    } else {
      const t = theme === THEME_OTHER ? customTheme.trim() : theme;
      createMut.mutate({ theme: t || null });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle discussion</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-4">
          <Button variant={mode === "theme" ? "default" : "secondary"} onClick={() => setMode("theme")} className="flex-1">Thématique</Button>
          <Button variant={mode === "client" ? "default" : "secondary"} onClick={() => setMode("client")} className="flex-1">Pour une cliente</Button>
        </div>
        {mode === "client" ? (
          <div>
            <Label>Cliente</Label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full border border-border rounded-[12px] h-10 px-3 mt-1" data-testid="select-client">
              <option value="">Choisir…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Thématique</Label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full border border-border rounded-[12px] h-10 px-3" data-testid="select-theme">
              {ASSISTANT_THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {theme === THEME_OTHER && (
              <Input value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} placeholder="Précise la thématique" data-testid="input-custom-theme" />
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={createMut.isPending} className="rounded-[12px]" data-testid="button-create-discussion">Créer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
