/**
 * client/src/pages/Chat.tsx — Naturobot (assistant IA naturopathie)
 *
 * Conversation continue avec le « formateur virtuel » (LLM via OpenRouter côté serveur),
 * organisée en discussions (par cliente ou par thématique). Sélection via l'URL
 * (`/app/chat/:discussionId?`), historique persisté par discussion via
 * /api/discussions/:id/messages. Les réponses de l'assistant sont rendues en Markdown.
 */

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Trash2, Sparkles, Info, Copy, Check, Pencil, ShieldCheck, Plus, FileText, BookMarked, ChevronDown, X, Square, ArrowDown, CornerDownLeft, ClipboardCopy, ThumbsUp, ThumbsDown, RefreshCw, Mic, MicOff } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { NewDiscussionDialog } from "@/components/assistant/NewDiscussionDialog";
import { DiscussionSidebar } from "@/components/assistant/DiscussionSidebar";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import type { AiChatMessage, AiDiscussion, AiSavedReply, Client } from "@shared/schema";
import { useDictation } from "@/hooks/use-dictation";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";

// Portrait de Naturobot — fichier statique servi à la racine (client/public/naturobot.jpg).
// Si absent, l'avatar retombe proprement sur une icône.
const NATUROBOT_AVATAR = "/naturobot.jpg";

// Lot 4 (action P3) + Lot 5 (N6) — questions suggérées PAR CATÉGORIE à
// l'ouverture d'une discussion vide.
const SUGGESTED_CATEGORIES: Array<{ label: string; questions: string[] }> = [
  {
    label: "Phytothérapie",
    questions: [
      "Quelles précautions avec le millepertuis ?",
      "Quelles plantes conseiller pour un sommeil difficile ?",
    ],
  },
  {
    label: "Sommeil & stress",
    questions: [
      "Comment accompagner une cliente stressée en période d'examens ?",
      "Routine du soir pour améliorer l'endormissement ?",
    ],
  },
  {
    label: "Digestion",
    questions: [
      "Quels sont les émonctoires et comment les soutenir ?",
      "Idées de petits-déjeuners pour une cliente en fatigue chronique",
    ],
  },
  {
    label: "Programme client",
    questions: [
      "Propose-moi une trame de première consultation",
      "Construis un programme type gestion du stress sur 4 semaines",
    ],
  },
];

function initials(name?: string | null): string {
  if (!name) return "•";
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Avatar circulaire : affiche l'image si elle charge, sinon le repli (icône ou initiales).
function Avatar({ src, fallback, title }: { src?: string | null; fallback: ReactNode; title?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div
      title={title}
      className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold select-none"
    >
      {src && !err ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setErr(true)} />
      ) : (
        fallback
      )}
    </div>
  );
}

// Rendu Markdown : tables GFM lisibles (bordées + scroll horizontal) et lignes
// horizontales (`---`) masquées (le modèle en émet entre les chapitres, inutiles).
const mdComponents: Components = {
  hr: () => null,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2" />,
  blockquote: ({ node, ...props }) => <blockquote className="my-2 border-l-2 border-primary/40 pl-3 not-italic text-muted-foreground" {...props} />,
  code: ({ node, className, ...props }) => <code className={`${className ?? ""} rounded-sm bg-muted px-1 py-0.5 text-[0.85em] before:content-none after:content-none`} {...props} />,
  table: ({ node, ...props }) => (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse [&_tbody_tr:nth-child(even)]:bg-muted/50" {...props} />
      </div>
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="bg-primary !text-primary-foreground px-2.5 py-1.5 text-left font-semibold whitespace-nowrap" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="px-2.5 py-1.5 border-t border-border align-top" {...props} />
  ),
};

function formatTime(ts?: number | string | Date | null): string | undefined {
  if (ts == null) return undefined;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? undefined : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

// Mémoïsée : sans ça, chaque frappe dans la zone de saisie re-parsait le Markdown de
// toute la discussion. Les callbacks reçoivent l'id du message pour rester stables.
const Bubble = memo(function Bubble({ id, role, content, createdAt, typing, streaming, userPhoto, userName, onSave, onReuse, saved, feedback, onFeedback, onRegenerate }: {
  id?: number; role: string; content: string; createdAt?: number | string | Date | null; typing?: boolean; streaming?: boolean;
  userPhoto?: string | null; userName?: string | null;
  onSave?: (id: number) => void; onReuse?: (text: string) => void; saved?: boolean;
  feedback?: 1 | -1; onFeedback?: (id: number, value: 1 | -1 | 0) => void; onRegenerate?: () => void;
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const avatar = isUser ? (
    <Avatar src={userPhoto} fallback={initials(userName)} title={userName ?? undefined} />
  ) : (
    <Avatar src={NATUROBOT_AVATAR} fallback={<Sparkles className="h-4 w-4" />} title="Naturobot" />
  );
  const done = !typing && !streaming && !!content;
  const actionCls = "inline-flex items-center gap-1 rounded-md px-2 h-8 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition disabled:opacity-60";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"}`} data-testid={`message-${role}`}>
      {!isUser && avatar}
      <div className={`flex flex-col min-w-0 ${isUser ? "items-end max-w-[82%]" : "items-start max-w-[92%]"}`}>
        <div
          title={formatTime(createdAt)}
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed max-w-full ${
            isUser ? "bg-primary text-primary-foreground whitespace-pre-wrap break-words" : "bg-card text-foreground border border-border"
          } ${typing ? "animate-pulse" : ""}`}
        >
          {isUser ? (
            content
          ) : (
            <div className="prose prose-sm max-w-none break-words prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
              {streaming && <span className="inline-block h-4 w-1.5 -mb-0.5 ml-0.5 rounded-sm bg-primary motion-safe:animate-pulse" aria-hidden="true" />}
            </div>
          )}
        </div>
        {/* Actions toujours visibles : le survol n'existe pas sur mobile. */}
        {done && !isUser && (
          <div className="flex flex-wrap gap-1 mt-1">
            <button onClick={copy} className={actionCls} aria-label="Copier la réponse" data-testid="button-copy-message">
              {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié" : "Copier"}
            </button>
            {/* Lot 5 (N4) — archiver la réponse dans la bibliothèque */}
            {onSave && id != null && (
              <button onClick={() => onSave(id)} disabled={saved} className={actionCls} aria-label="Enregistrer dans la bibliothèque" data-testid="button-save-reply">
                <BookMarked className={`h-3.5 w-3.5 ${saved ? "text-primary" : ""}`} />
                {saved ? "Enregistrée" : "Bibliothèque"}
              </button>
            )}
            {onRegenerate && (
              <button onClick={onRegenerate} className={actionCls} aria-label="Régénérer la réponse" data-testid="button-regenerate">
                <RefreshCw className="h-3.5 w-3.5" /> Régénérer
              </button>
            )}
            {onFeedback && id != null && (
              <>
                <button onClick={() => onFeedback(id, feedback === 1 ? 0 : 1)} aria-pressed={feedback === 1} className={`${actionCls} ${feedback === 1 ? "text-primary" : ""}`} aria-label="Réponse utile" title="Réponse utile" data-testid="button-feedback-up">
                  <ThumbsUp className={`h-3.5 w-3.5 ${feedback === 1 ? "fill-current" : ""}`} />
                </button>
                <button onClick={() => onFeedback(id, feedback === -1 ? 0 : -1)} aria-pressed={feedback === -1} className={`${actionCls} ${feedback === -1 ? "text-destructive" : ""}`} aria-label="Réponse décevante" title="Réponse décevante" data-testid="button-feedback-down">
                  <ThumbsDown className={`h-3.5 w-3.5 ${feedback === -1 ? "fill-current" : ""}`} />
                </button>
              </>
            )}
          </div>
        )}
        {done && isUser && onReuse && (
          <button onClick={() => onReuse(content)} className={`${actionCls} mt-1`} aria-label="Reprendre cette question" data-testid="button-reuse-question">
            <CornerDownLeft className="h-3.5 w-3.5" /> Reprendre
          </button>
        )}
      </div>
      {isUser && avatar}
    </div>
  );
});

type Source = { title: string; excerpt?: string };
// Les anciennes réponses du serveur envoyaient de simples titres.
const toSources = (raw: unknown): Source[] =>
  Array.isArray(raw) ? raw.map((x: any) => (typeof x === "string" ? { title: x } : { title: String(x?.title ?? ""), excerpt: x?.excerpt })) : [];

function SourcesList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mt-1 ml-10 text-xs" data-testid="text-sources">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">Sources :</span>
        {sources.map((src, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            disabled={!src.excerpt}
            aria-expanded={open === i}
            className={`rounded-sm px-1.5 py-0.5 border border-border ${open === i ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-primary"} disabled:cursor-default`}
            data-testid="button-source"
          >
            {src.title}
          </button>
        ))}
      </div>
      {open != null && sources[open]?.excerpt && (
        <blockquote className="mt-1.5 max-w-[92%] rounded-md border-l-2 border-primary/40 bg-card px-3 py-2 text-muted-foreground" data-testid="text-source-excerpt">
          {sources[open].excerpt}
        </blockquote>
      )}
    </div>
  );
}

function Chat() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { user, refetch } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const selectedId = params.discussionId ? Number(params.discussionId) : null;

  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: discussions = [] } = useQuery<AiDiscussion[]>({ queryKey: ["/api/discussions"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  // Lot 4 (action P4) — indicateur d'usage IA (jour + mois).
  const { data: aiUsage } = useQuery<{ month: number; today: number; dailyLimit: number }>({
    queryKey: ["/api/ai-usage"],
  });

  // Lot 5 (N7) — transparence : résumé dépliable de ce qui est transmis à l'IA.
  const [clientSummaryOpen, setClientSummaryOpen] = useState(false);

  // Lot 5 (N4) — archiver une réponse dans la bibliothèque. L'état « enregistrée »
  // se déduit de la bibliothèque elle-même (même contenu) : il survit au rechargement.
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const { data: savedReplies = [] } = useQuery<AiSavedReply[]>({ queryKey: ["/api/saved-replies"] });
  const savedContents = new Set(savedReplies.map((r) => r.content));

  const { data: feedback = {} } = useQuery<Record<number, 1 | -1>>({ queryKey: ["/api/naturobot/feedback"] });
  const feedbackMut = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: 1 | -1 | 0 }) =>
      apiRequest("POST", `/api/discussions/${selectedIdRef.current}/messages/${id}/feedback`, { value }),
    onMutate: ({ id, value }) => {
      queryClient.setQueryData<Record<number, 1 | -1>>(["/api/naturobot/feedback"], (old = {}) => {
        const next = { ...old };
        if (value === 0) delete next[id]; else next[id] = value;
        return next;
      });
    },
    onSuccess: (_r, { value }) => {
      if (value === -1) toast({ title: "Merci pour votre retour", description: "Cette réponse sera relue pour améliorer Naturobot. Vous pouvez aussi la régénérer." });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/naturobot/feedback"] });
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    },
  });
  const saveReplyMut = useMutation({
    mutationFn: async (m: AiChatMessage) =>
      apiRequest("POST", "/api/saved-replies", {
        title: `${selected?.title || "Réponse Naturobot"} — ${new Date(m.createdAt).toLocaleDateString("fr-FR")}`,
        content: m.content,
      }),
    onSuccess: (_r, m) => {
      setSavedIds((s) => new Set(s).add(m.id));
      queryClient.invalidateQueries({ queryKey: ["/api/saved-replies"] });
      toast({ title: "Réponse enregistrée", description: "Retrouvez-la dans l'onglet Bibliothèque.", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  // Lot 5 (N10) — bannière d'intro Discussion vs Studio (première visite).
  const introSeen = !!(user as any)?.naturobotIntroSeenAt;
  const dismissIntroMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/profile", { naturobotIntroSeenAt: Date.now() }),
    onSuccess: () => refetch(),
  });
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const selected = discussions.find((d) => d.id === selectedId) || null;
  const { data: messages = [], isLoading } = useQuery<AiChatMessage[]>({
    queryKey: ["/api/discussions", selectedId, "messages"],
    enabled: selectedId != null,
  });
  // Refs lues par les callbacks stables passés aux bulles mémoïsées.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const savedIdsRef = useRef(savedIds);
  savedIdsRef.current = savedIds;
  const savedContentsRef = useRef(savedContents);
  savedContentsRef.current = savedContents;
  const feedbackMutRef = useRef(feedbackMut);
  feedbackMutRef.current = feedbackMut;
  const saveReplyMutRef = useRef(saveReplyMut);
  saveReplyMutRef.current = saveReplyMut;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  // Pendant une régénération, l'ancien dernier échange est masqué (il sera remplacé).
  const visibleMessages = regenerating ? messages.slice(0, -2) : messages;
  const canRegenerate = messages.length >= 2 && messages[messages.length - 1].role === "assistant" && messages[messages.length - 2].role === "user";

  // Sélection auto de la discussion la plus récente si aucune dans l'URL.
  useEffect(() => {
    if (selectedId == null && discussions.length) navigate(`/app/chat/${discussions[0].id}`);
  }, [selectedId, discussions, navigate]);

  const sendMut = useMutation({
    mutationFn: async ({ message, regenerate }: { message: string; regenerate?: boolean }) => {
      const ctrl = new AbortController();
      const lastIdBefore = messagesRef.current[messagesRef.current.length - 1]?.id;
      setLiveMsg("Naturobot rédige sa réponse…");
      abortRef.current = ctrl;
      setStreamText(""); setSources([]);
      let acc = "";
      let frame = 0;
      // Un rendu par image (rAF) au lieu d'un par paquet réseau : le Markdown n'est
      // re-parsé qu'au rythme de l'écran, même quand le modèle débite très vite.
      const flush = () => {
        frame = 0;
        const sep = acc.indexOf("@@SOURCES@@:");
        if (sep >= 0) {
          try { setSources(toSources(JSON.parse(acc.slice(sep + "@@SOURCES@@:".length)))); } catch { /* partiel */ }
          setStreamText(acc.slice(0, sep).replace(/\n$/, ""));
        } else setStreamText(acc);
      };
      try {
        const res = regenerate
          ? await apiRequest("POST", `/api/discussions/${selectedId}/regenerate`, undefined, { signal: ctrl.signal })
          : await apiRequest("POST", `/api/discussions/${selectedId}/messages`, { message }, { signal: ctrl.signal });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          if (!frame) frame = requestAnimationFrame(flush);
        }
      } catch (e: any) {
        // Arrêt volontaire : le serveur enregistre la réponse partielle après coup.
        // On attend qu'elle apparaisse (dernier message changé) plutôt qu'un délai fixe.
        if (!ctrl.signal.aborted) throw e;
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const fresh = await queryClient.fetchQuery<AiChatMessage[]>({ queryKey: ["/api/discussions", selectedId, "messages"], staleTime: 0 });
          if (fresh[fresh.length - 1]?.id !== lastIdBefore) break;
        }
      } finally {
        if (frame) cancelAnimationFrame(frame);
        flush();
        abortRef.current = null;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions", selectedId, "messages"] });
      setPending(null); setStreamText(""); setRegenerating(false);
      setLiveMsg("Réponse de Naturobot reçue.");
      await queryClient.invalidateQueries({ queryKey: ["/api/discussions"] }); // titre auto + updatedAt
      queryClient.invalidateQueries({ queryKey: ["/api/ai-usage"] });
      // Réponse complète rendue : on cale la question tout en haut (lecture depuis le début).
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const c = scrollRef.current;
        if (!c) return;
        const qs = c.querySelectorAll('[data-testid="message-user"]');
        const q = qs[qs.length - 1] as HTMLElement | undefined;
        if (q) c.scrollTo({ top: Math.max(0, q.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 12), behavior: "smooth" });
      }));
    },
    onError: (e: any, { message, regenerate }) => {
      // La question n'est pas perdue : elle revient dans la zone de saisie.
      setPending(null); setStreamText(""); setSources([]); setRegenerating(false);
      setLiveMsg("");
      if (!regenerate) setInput((cur) => cur || message);
      toast({ title: "Erreur", description: e?.message || "L'assistant n'a pas pu répondre.", variant: "destructive" });
    },
  });

  // Lot 1 (action 10) — pont Naturobot → Programme.
  const createProgrammeMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/discussions/${selectedId}/create-programme`)).json(),
    onSuccess: async (prog: { id: number; title: string }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/programmes"] });
      toast({ title: "Programme créé", description: `« ${prog.title} » est prêt dans vos Programmes (brouillon, modifiable, exportable en PDF).`, variant: "success" });
      navigate("/app/programmes");
    },
    onError: (e: any) => toast({ title: "Impossible de créer le programme", description: e?.message, variant: "destructive" }),
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

  // Ouverture d'une discussion (messages chargés) : afficher le dernier échange (bas).
  useEffect(() => {
    if (isLoading || selectedId == null) return;
    const c = scrollRef.current;
    if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
  }, [isLoading, selectedId]);

  // Pendant que Naturobot écrit : on garde la dernière question tout en haut (au
  // lieu de suivre le bas) — la réponse se construit en dessous et se lit depuis
  // son début, sans avoir à remonter à la souris. Clampé : à mesure que la réponse
  // grandit, la question remonte jusqu'en haut.
  useEffect(() => {
    if (!(sendMut.isPending || pending != null)) return;
    const c = scrollRef.current;
    if (!c) return;
    const qs = c.querySelectorAll('[data-testid="message-user"]');
    const q = qs[qs.length - 1] as HTMLElement | undefined;
    if (q) c.scrollTo({ top: Math.max(0, q.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 12) });
  }, [streamText, pending, sendMut.isPending]);

  // Changement de discussion : les sources affichées appartenaient à la précédente.
  useEffect(() => { setSources([]); }, [selectedId]);

  function onScroll() {
    const c = scrollRef.current;
    if (c) setAtBottom(c.scrollHeight - c.scrollTop - c.clientHeight < 80);
  }
  function scrollToBottom() {
    const c = scrollRef.current;
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
  }

  const onSaveReply = useCallback((id: number) => {
    const m = messagesRef.current.find((x) => x.id === id);
    if (m && !savedIdsRef.current.has(id) && !savedContentsRef.current.has(m.content)) saveReplyMutRef.current.mutate(m);
  }, []);
  const onFeedback = useCallback((id: number, value: 1 | -1 | 0) => {
    feedbackMutRef.current.mutate({ id, value });
  }, []);

  // Dictée : le texte reconnu s'ajoute à la saisie en cours.
  const dictation = useDictation((text) => setInput((cur) => (cur.trim() ? `${cur.trimEnd()} ${text}` : text)));
  const onReuse = useCallback((text: string) => {
    setInput(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  async function copyDiscussion() {
    const md = messages
      .map((m) => (m.role === "user" ? `**Question :** ${m.content}` : `**Naturobot :**\n\n${m.content}`))
      .join("\n\n---\n\n");
    await navigator.clipboard.writeText(`# ${selected?.title ?? "Discussion Naturobot"}\n\n${md}`);
    toast({ title: "Discussion copiée", description: "Collez-la dans un document ou un e-mail.", variant: "success" });
  }

  // Auto-grow : la zone de saisie s'agrandit avec le contenu (jusqu'à 200px, puis scroll interne).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Vide : hauteur naturelle (une ligne) — une mesure prise avant la mise en page
    // gonflait sinon la zone au maximum dès l'ouverture.
    if (!input) { el.style.height = ""; return; }
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  function submit(text?: string) {
    const t = (text ?? input).trim();
    if (!t || sendMut.isPending || selectedId == null) return;
    if (dictation.listening) dictation.stop();
    setPending(t); setInput(""); sendMut.mutate({ message: t });
  }
  function regenerate() {
    if (sendMut.isPending || !canRegenerate) return;
    const q = messages[messages.length - 2].content;
    setRegenerating(true); setPending(q); sendMut.mutate({ message: q, regenerate: true });
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing : ne pas intercepter Entrée pendant une composition IME (accents, etc.).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (input.trim() && !sendMut.isPending) submit();
    }
  }
  async function del() {
    const ok = await confirm({ title: "Supprimer cette discussion ?", description: "Les échanges seront effacés. Action irréversible.", confirmLabel: "Supprimer", destructive: true });
    if (ok) deleteMut.mutate();
  }

  return (
    <AppLayout>
      <NaturobotTabs />
      <PageHeader title="Naturobot" subtitle="Votre formateur en naturopathie, disponible à tout moment." icon={Sparkles} />

      {/* Lot 5 (N10) — intro Discussion vs Studio, affichée jusqu'à fermeture */}
      {!introSeen && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-secondary/40 px-4 py-3 text-sm flex items-start gap-3" data-testid="banner-naturobot-intro">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p className="flex-1">
            <strong>Deux modes, deux usages :</strong> l'onglet <strong>Discussion</strong> est votre formateur virtuel
            pour les conseils cliniques (protocoles, plantes, cas pratiques) ; l'onglet <strong>Studio contenu</strong>{" "}
            génère vos posts marketing pour les réseaux sociaux. La <strong>Bibliothèque</strong> archive vos meilleures réponses.
          </p>
          <button
            onClick={() => dismissIntroMut.mutate()}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Fermer l'introduction"
            data-testid="button-dismiss-naturobot-intro"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Mobile : la barre des discussions est masquée, on choisit ici. */}
      <div className="flex gap-2 mb-3 md:hidden">
        <select
          value={selectedId ?? ""}
          onChange={(e) => e.target.value && navigate(`/app/chat/${e.target.value}`)}
          className="h-11 flex-1 min-w-0 rounded-md border border-border bg-card px-3 text-sm"
          aria-label="Choisir une discussion"
          data-testid="select-discussion-mobile"
        >
          {selectedId == null && <option value="">Choisir une discussion…</option>}
          {discussions.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <Button
          onClick={() => setDialogOpen(true)}
          className="rounded-lg shrink-0 h-11 w-11"
          size="icon"
          aria-label="Nouvelle discussion"
          data-testid="button-new-discussion-mobile"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Hauteur : la conversation occupe l'écran (l'avertissement santé est passé sous la saisie). */}
      <div className="card-naturo flex h-[calc(100dvh-13rem)] min-h-[480px] !p-0 overflow-hidden">
        <DiscussionSidebar discussions={discussions} clients={clients} selectedId={selectedId}
          onNew={() => setDialogOpen(true)} filter={filter} setFilter={setFilter} />

        <div className="flex-1 flex flex-col min-w-0">
          {selected && (
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <Input autoFocus defaultValue={selected.title}
                    onBlur={(e) => {
                      const next = e.target.value.trim() || selected.title;
                      if (next !== selected.title) renameMut.mutate(next);
                      else setEditing(false);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
                    className="h-8" data-testid="input-rename-discussion" />
                ) : (
                  <p className="font-semibold text-heading flex items-center gap-1.5 min-w-0">
                    <span className="truncate" title={selected.title}>{selected.title}</span>
                    <button onClick={() => setEditing(true)} className="shrink-0 text-muted-foreground hover:text-primary" aria-label="Renommer" data-testid="button-rename"><Pencil className="h-3.5 w-3.5" /></button>
                  </p>
                )}
                {selected.clientId != null && (
                  <button
                    className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 hover:text-primary"
                    onClick={() => setClientSummaryOpen((o) => !o)}
                    data-testid="text-rgpd-banner"
                    title="Voir ce qui est transmis à l'IA"
                  >
                    <ShieldCheck className="h-3 w-3" /> Fiche cliente prise en compte
                    <ChevronDown className={`h-3 w-3 transition-transform ${clientSummaryOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
              {/* Lot 1 (action 10) — pont Naturobot → Programme : la dernière réponse
                  de l'assistant devient un Programme brouillon, exportable en PDF. */}
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg font-bold shrink-0"
                aria-label="Créer un programme depuis cette discussion"
                title="Créer un programme depuis cette discussion"
                onClick={async () => {
                  // Lot 5 (N7) — consentement explicite avant toute sauvegarde d'une
                  // réponse IA dans le dossier (même formule que le benchmark).
                  const ok = await confirm({
                    title: "Créer un programme depuis cette discussion ?",
                    description: "L'IA propose un contenu à titre indicatif. Rien n'est enregistré dans le dossier sans votre accord : le programme sera créé en brouillon, à relire et valider par vos soins avant tout envoi à la cliente.",
                    confirmLabel: "Créer le brouillon",
                    cancelLabel: "Annuler",
                  });
                  if (ok) createProgrammeMut.mutate();
                }}
                disabled={createProgrammeMut.isPending || messages.every((m) => m.role !== "assistant")}
                data-testid="button-create-programme"
              >
                <FileText className="h-4 w-4 xl:mr-1" />
                <span className="hidden xl:inline">{createProgrammeMut.isPending ? "Création…" : "Créer un programme"}</span>
              </Button>
              <button onClick={copyDiscussion} disabled={messages.length === 0} className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-40" aria-label="Copier toute la discussion" title="Copier toute la discussion" data-testid="button-copy-discussion"><ClipboardCopy className="h-4 w-4" /></button>
              <button onClick={del} className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Supprimer" data-testid="button-delete-discussion"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}

          {/* Lot 5 (N7) — résumé de ce qui est réellement transmis à l'IA */}
          {selected && selected.clientId != null && clientSummaryOpen && (() => {
            const c = clients.find((cl) => cl.id === selected.clientId);
            if (!c) return null;
            const age = c.dateOfBirth ? Math.floor((Date.now() - new Date(c.dateOfBirth).getTime()) / 3.15576e10) : null;
            const lignes = [
              `Prénom : ${c.firstName}`,
              age && age > 0 && age < 120 ? `Âge : ${age} ans` : null,
              `Allergies : ${c.allergies?.trim() || "aucune renseignée"}`,
              `Antécédents : ${c.antecedents?.trim() || "aucun renseigné"}`,
              `Hygiène de vie : ${c.lifestyleNotes?.trim() || "non renseignée"}`,
              c.penseBete?.trim() ? `Notes : ${c.penseBete.trim()}` : null,
            ].filter(Boolean) as string[];
            return (
              <div className="border-b border-border bg-secondary/40 px-4 py-2.5 text-xs" data-testid="panel-client-summary">
                <p className="font-bold mb-1">Informations transmises à l'IA pour cette discussion :</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {lignes.map((l, i) => <li key={i} className="truncate">• {l}</li>)}
                </ul>
                <p className="mt-1.5 italic text-muted-foreground">
                  L'IA propose des pistes à titre indicatif. Seule la praticienne valide : rien n'est enregistré dans le
                  dossier client sans votre accord explicite.
                </p>
              </div>
            );
          })()}

          <div className="relative flex-1 min-h-0 flex flex-col">
          <div ref={scrollRef} onScroll={onScroll} role="log" aria-label="Conversation avec Naturobot" className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/30">
            {selectedId == null ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={Sparkles}
                  title="Prêt à discuter avec Naturobot"
                  description="Naturobot est votre formateur virtuel en naturopathie. Posez vos questions sur les protocoles, plantes, cas cliniques…"
                  card={false}
                  action={<Button onClick={() => setDialogOpen(true)} className="rounded-lg" data-testid="button-new-discussion-empty"><Plus className="h-4 w-4 mr-1" /> Nouvelle discussion</Button>}
                  testid="empty-state-no-discussion"
                />
              </div>
            ) : isLoading ? <Loading /> : visibleMessages.length === 0 && !pending && !sendMut.isPending ? (
              <div className="h-full flex flex-col items-center justify-center gap-4">
                <EmptyState
                  icon={Sparkles}
                  title="Prêt à discuter avec Naturobot"
                  description="Naturobot est votre formateur virtuel en naturopathie. Posez vos questions sur les protocoles, plantes, cas cliniques…"
                  card={false}
                  testid="empty-state-discussion-vide"
                />
                {/* Lot 4 (P3) + Lot 5 (N6) — chips de questions suggérées par catégorie */}
                <div className="max-w-lg px-4 space-y-2.5" data-testid="suggested-questions">
                  {SUGGESTED_CATEGORIES.map((cat) => (
                    <div key={cat.label}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.questions.map((q) => (
                          <button
                            key={q}
                            onClick={() => submit(q)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/30 bg-card text-primary hover:bg-primary/10 transition"
                            data-testid="chip-suggested-question"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {visibleMessages.map((m) => (
                  <div key={m.id}>
                    <Bubble
                      id={m.id}
                      role={m.role}
                      content={m.content}
                      createdAt={m.createdAt}
                      userPhoto={user?.photoUrl}
                      userName={user?.name}
                      onSave={m.role === "assistant" ? onSaveReply : undefined}
                      onReuse={m.role === "user" ? onReuse : undefined}
                      saved={savedIds.has(m.id) || savedContents.has(m.content)}
                      feedback={feedback[m.id]}
                      onFeedback={m.role === "assistant" ? onFeedback : undefined}
                      onRegenerate={m.id === lastAssistantId && canRegenerate && !sendMut.isPending ? regenerate : undefined}
                    />
                    {/* Sources du dernier échange : restent visibles une fois la réponse finie. */}
                    {m.id === lastAssistantId && !sendMut.isPending && sources.length > 0 && <SourcesList sources={sources} />}
                  </div>
                ))}
                {pending && <Bubble role="user" content={pending} userPhoto={user?.photoUrl} userName={user?.name} />}
                {sendMut.isPending && (
                  <div>
                    {streamText === "" ? (
                      <div className="flex items-end gap-2 justify-start" data-testid="message-assistant-thinking">
                        <Avatar src={NATUROBOT_AVATAR} fallback={<Sparkles className="h-4 w-4" />} title="Naturobot" />
                        <div className="bg-card border border-border rounded-xl px-4 py-3">
                          <div className="flex gap-1 items-center" aria-label="Naturobot réfléchit" role="status">
                            {/* Pulsation douce plutôt qu'un rebond élastique : l'attente
                                se signale, elle ne s'agite pas. */}
                            <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" style={{ animationDelay: "0ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" style={{ animationDelay: "200ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" style={{ animationDelay: "400ms" }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Bubble role="assistant" content={streamText} streaming />
                    )}
                    {sources.length > 0 && <SourcesList sources={sources} />}
                  </div>
                )}
              </>
            )}
          </div>
            <div className="sr-only" role="status" aria-live="polite">{liveMsg}</div>
            {!atBottom && selectedId != null && messages.length > 0 && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 h-9 px-3 inline-flex items-center gap-1 rounded-full bg-card text-xs text-muted-foreground hover:text-primary shadow-md"
                aria-label="Aller au dernier message"
                data-testid="button-scroll-bottom"
              >
                <ArrowDown className="h-3.5 w-3.5" /> Dernier message
              </button>
            )}
          </div>

          {selectedId != null && (
            <div className="border-t border-border p-3 bg-card">
              <div className="flex items-end gap-2">
                <Textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder={dictation.listening ? "Parlez, je vous écoute…" : "Écrivez votre question…"} className="resize-none overflow-y-auto min-h-[44px] max-h-[200px]" rows={1} data-testid="input-chat-message" />
                {dictation.supported && (
                  <Button
                    onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                    variant="outline"
                    className={`rounded-lg shrink-0 ${dictation.listening ? "text-destructive border-destructive/40" : ""}`}
                    aria-label={dictation.listening ? "Arrêter la dictée" : "Dicter la question"}
                    aria-pressed={dictation.listening}
                    title={dictation.listening ? "Arrêter la dictée" : "Dicter la question"}
                    data-testid="button-dictation"
                  >
                    {dictation.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                {sendMut.isPending ? (
                  <Button onClick={() => abortRef.current?.abort()} variant="outline" className="rounded-lg shrink-0" aria-label="Arrêter la réponse" title="Arrêter la réponse" data-testid="button-stop-message"><Square className="h-4 w-4 fill-current" /></Button>
                ) : (
                  <Button onClick={() => submit()} disabled={!input.trim()} className="rounded-lg shrink-0" aria-label="Envoyer" data-testid="button-send-message"><Send className="h-4 w-4" /></Button>
                )}
              </div>
              {/* Lot 5 (N9) — coût affiché sur l'action, au moment de décider */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-amber-700" data-testid="text-disclaimer-sante">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Usage éducatif : ne remplace pas un avis médical. Pour tout problème de santé, orientez vers un professionnel de santé.
                </span>
                <span className="hidden sm:inline">Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</span>
                {/* Lot 4 (action P4) — transparence sur l'usage IA */}
                {aiUsage && (
                  <span className="sm:ml-auto" data-testid="text-ai-usage" title="Chaque envoi = 1 appel IA (Naturobot + générations)">
                    IA : {aiUsage.today}/{aiUsage.dailyLimit} aujourd'hui · {aiUsage.month} ce mois-ci
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <NewDiscussionDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(d) => navigate(`/app/chat/${d.id}`)} />
    </AppLayout>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function ChatGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="Naturobot" description="L'assistant IA Naturobot est réservé à l'abonnement Naturo Pro." />;
  }
  return <Chat />;
}
