/**
 * client/src/pages/Chat.tsx — Assistant IA naturopathie
 *
 * Conversation continue avec le « formateur virtuel » (API Mistral côté serveur).
 * Historique persisté via /api/chat. Bouton « Effacer » pour repartir de zéro.
 * Les réponses de l'assistant sont rendues en Markdown.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Trash2, Sparkles, Info, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AiChatMessage } from "@shared/schema";

const SUGGESTIONS = [
  "Quelles plantes pour accompagner un sommeil difficile ?",
  "Explique-moi le rôle du foie en naturopathie.",
  "Quels conseils d'hygiène de vie pour le stress ?",
  "Différence entre prébiotiques et probiotiques ?",
];

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
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<AiChatMessage[]>({ queryKey: ["/api/chat"] });

  const sendMut = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/chat", { message }),
    onSuccess: async () => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
    },
    onError: (e: any) => {
      setPending(null);
      toast({
        title: "Erreur",
        description: e?.message || "L'assistant n'a pas pu répondre.",
        variant: "destructive",
      });
    },
  });

  const clearMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/chat"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      toast({ title: "Conversation effacée", variant: "success" });
    },
    onError: () =>
      toast({ title: "Erreur", description: "Impossible d'effacer la conversation.", variant: "destructive" }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, sendMut.isPending]);

  function submit(text?: string) {
    const t = (text ?? input).trim();
    if (!t || sendMut.isPending) return;
    setPending(t);
    setInput("");
    sendMut.mutate(t);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function clearHistory() {
    const ok = await confirm({
      title: "Effacer la conversation ?",
      description: "Tout l'historique de tes échanges avec l'assistant sera supprimé. Cette action est irréversible.",
      confirmLabel: "Effacer",
      destructive: true,
    });
    if (ok) clearMut.mutate();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Assistant IA"
        subtitle="Ton formateur en naturopathie, disponible à tout moment."
        icon={Sparkles}
      />

      <div
        className="rounded-[15px] border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2 items-start mb-4"
        data-testid="text-disclaimer-sante"
      >
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Cet assistant est à visée <strong>éducative</strong> et ne remplace pas un avis médical. Pour tout problème de
          santé, oriente la personne vers un professionnel de santé.
        </span>
      </div>

      <div className="card-naturo flex flex-col h-[calc(100vh-22rem)] min-h-[420px] !p-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <Loading />
          ) : messages.length === 0 && !pending ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <p className="font-semibold text-heading">Pose ta première question</p>
              <p className="text-sm max-w-sm">
                Choisis une suggestion ou écris ta propre question.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2 max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-xs rounded-full border border-border bg-card px-3 py-1.5 hover:bg-secondary hover:text-primary transition"
                    data-testid="button-suggestion"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <Bubble key={m.id} role={m.role} content={m.content} />
              ))}
              {pending && <Bubble role="user" content={pending} />}
              {sendMut.isPending && <Bubble role="assistant" content="…" typing />}
            </>
          )}
        </div>

        <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Écris ta question…"
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
            data-testid="input-chat-message"
          />
          <Button
            onClick={() => submit()}
            disabled={!input.trim() || sendMut.isPending}
            className="rounded-[12px] shrink-0"
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearHistory}
          disabled={messages.length === 0 || clearMut.isPending}
          className="text-muted-foreground"
          data-testid="button-clear-chat"
        >
          <Trash2 className="h-4 w-4 mr-1" /> Effacer la conversation
        </Button>
      </div>
    </AppLayout>
  );
}
