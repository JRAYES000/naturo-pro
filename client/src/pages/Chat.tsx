/**
 * client/src/pages/Chat.tsx — Assistant IA naturopathie
 *
 * Conversation continue avec le « formateur virtuel » (API Mistral côté serveur),
 * organisée en discussions (par cliente ou par thématique). Sélection via l'URL
 * (`/app/chat/:discussionId?`), historique persisté par discussion via
 * /api/discussions/:id/messages. Les réponses de l'assistant sont rendues en Markdown.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Trash2, Sparkles, Info, Copy, Check, Pencil, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { NewDiscussionDialog } from "@/components/assistant/NewDiscussionDialog";
import { DiscussionSidebar } from "@/components/assistant/DiscussionSidebar";
import type { AiChatMessage, AiDiscussion, Client } from "@shared/schema";

function Bubble({ role, content, typing }: { role: string; content: string; typing?: boolean }) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${role}`}>
      <div
        className={`group relative max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-secondary text-foreground"
        } ${typing ? "animate-pulse" : ""}`}
      >
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-pre:bg-muted prose-pre:text-foreground">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
        {!isUser && !typing && content && (
          <button
            onClick={copy}
            className="absolute -bottom-2 -right-2 opacity-0 group-hover:opacity-100 transition bg-card border border-border rounded-full p-1 shadow-sm"
            aria-label="Copier la réponse"
            data-testid="button-copy-message"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  const params = useParams();
  const selectedId = params.discussionId ? Number(params.discussionId) : null;

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: discussions = [] } = useQuery<AiDiscussion[]>({ queryKey: ["/api/discussions"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const selected = discussions.find((d) => d.id === selectedId) || null;
  const { data: messages = [], isLoading } = useQuery<AiChatMessage[]>({
    queryKey: ["/api/discussions", selectedId, "messages"],
    enabled: selectedId != null,
  });

  // Sélection auto de la discussion la plus récente si aucune dans l'URL.
  useEffect(() => {
    if (selectedId == null && discussions.length) navigate(`/app/chat/${discussions[0].id}`);
  }, [selectedId, discussions, navigate]);

  const sendMut = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/discussions/${selectedId}/messages`, { message });
      setStreamText(""); setSources([]);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const sep = acc.indexOf("@@SOURCES@@:");
        if (sep >= 0) {
          try { setSources(JSON.parse(acc.slice(sep + "@@SOURCES@@:".length))); } catch { /* partiel */ }
          setStreamText(acc.slice(0, sep).replace(/\n$/, ""));
        } else setStreamText(acc);
      }
    },
    onSuccess: async () => {
      setPending(null); setStreamText(""); setSources([]);
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions", selectedId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] }); // titre auto + updatedAt
    },
    onError: (e: any) => {
      setPending(null); setStreamText(""); setSources([]);
      toast({ title: "Erreur", description: e?.message || "L'assistant n'a pas pu répondre.", variant: "destructive" });
    },
  });

  const renameMut = useMutation({
    mutationFn: (title: string) => apiRequest("PATCH", `/api/discussions/${selectedId}`, { title }),
    onSuccess: async () => { setEditing(false); await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] }); },
  });
  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/discussions/${selectedId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] });
      navigate("/app/chat");
      toast({ title: "Discussion supprimée", variant: "success" });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, streamText, sources, sendMut.isPending]);

  function submit(text?: string) {
    const t = (text ?? input).trim();
    if (!t || sendMut.isPending || selectedId == null) return;
    setPending(t); setInput(""); sendMut.mutate(t);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }
  async function del() {
    const ok = await confirm({ title: "Supprimer cette discussion ?", description: "Les échanges seront effacés. Action irréversible.", confirmLabel: "Supprimer", destructive: true });
    if (ok) deleteMut.mutate();
  }

  return (
    <AppLayout>
      <PageHeader title="Assistant IA" subtitle="Ton formateur en naturopathie, disponible à tout moment." icon={Sparkles} />

      <div className="rounded-[15px] border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2 items-start mb-4" data-testid="text-disclaimer-sante">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Cet assistant est à visée <strong>éducative</strong> et ne remplace pas un avis médical. Pour tout problème de santé, oriente la personne vers un professionnel de santé.</span>
      </div>

      <div className="card-naturo flex h-[calc(100vh-22rem)] min-h-[460px] !p-0 overflow-hidden">
        <DiscussionSidebar discussions={discussions} clients={clients} selectedId={selectedId}
          onNew={() => setDialogOpen(true)} filter={filter} setFilter={setFilter} />

        <div className="flex-1 flex flex-col min-w-0">
          {selected && (
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <Input autoFocus defaultValue={selected.title} onBlur={(e) => renameMut.mutate(e.target.value.trim() || selected.title)}
                    onKeyDown={(e) => { if (e.key === "Enter") renameMut.mutate((e.target as HTMLInputElement).value.trim() || selected.title); }}
                    className="h-8" data-testid="input-rename-discussion" />
                ) : (
                  <p className="font-semibold text-heading truncate flex items-center gap-1.5">
                    {selected.title}
                    <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary" aria-label="Renommer" data-testid="button-rename"><Pencil className="h-3.5 w-3.5" /></button>
                  </p>
                )}
                {selected.clientId != null && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5" data-testid="text-rgpd-banner">
                    <ShieldCheck className="h-3 w-3" /> Fiche cliente prise en compte
                  </p>
                )}
              </div>
              <button onClick={del} className="text-muted-foreground hover:text-destructive" aria-label="Supprimer" data-testid="button-delete-discussion"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {selectedId == null ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                <Sparkles className="h-8 w-8 text-primary" />
                <p className="font-semibold text-heading">Choisis ou démarre une discussion</p>
                <Button onClick={() => setDialogOpen(true)} className="rounded-[12px] mt-2">Nouvelle discussion</Button>
              </div>
            ) : isLoading ? <Loading /> : (
              <>
                {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}
                {pending && <Bubble role="user" content={pending} />}
                {sendMut.isPending && (
                  <div>
                    <Bubble role="assistant" content={streamText || "…"} typing={!streamText} />
                    {sources.length > 0 && <p className="text-xs text-muted-foreground mt-1 ml-1" data-testid="text-sources">Sources : {sources.join(", ")}</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {selectedId != null && (
            <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Écris ta question…" className="resize-none min-h-[44px] max-h-32" rows={1} data-testid="input-chat-message" />
              <Button onClick={() => submit()} disabled={!input.trim() || sendMut.isPending} className="rounded-[12px] shrink-0" data-testid="button-send-message"><Send className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </div>

      <NewDiscussionDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(d) => navigate(`/app/chat/${d.id}`)} />
    </AppLayout>
  );
}
