import { useState, useEffect, useMemo, useRef, useDeferredValue, memo, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Sparkles, Copy, Check, Save, Send, Loader2, Trash2, Image as ImageIcon, Download, Instagram, Facebook,
  Layers, Film, Smartphone, Users, Hash, Shuffle, RotateCcw, Pencil, Search, CircleStop, ArrowRight, Repeat,
  Lightbulb, type LucideIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import { StudioIntroBanner } from "@/components/assistant/StudioIntroBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { renderCarouselSlides, buildCaptionFile, type CarouselDeck, type RenderedSlide } from "@/lib/slide-canvas";
import { createZip, triggerDownload, type ZipEntry } from "@/lib/zip";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";
import { filterContentPosts, countByStatus, captionLength, countHashtags, slugify, pickRandom } from "@/lib/studio-content";

type Channel = "instagram" | "facebook";
type ContentFormat = "carrousel" | "reel" | "story" | "post_groupe" | "legende";
type TopicType = "client_theme" | "theme" | "libre";
type StudioTab = "creer" | "bibliotheque";
interface IdeaSources { clientThemes: { theme: string; count: number }[]; predefinedThemes: string[]; }
interface Angle { title: string; hook: string; suggestedFormat: ContentFormat; }
// backgroundImage n'est PAS dans la liste (LONGTEXT de plusieurs Mo) : chargé à la demande.
interface ContentPost { id: number; channel: string; format: string; theme: string | null; title: string; body: string; status: string; createdAt: number; updatedAt: number; publishedAt: number | null; slidesJson?: string | null; }
const STATUS_LABELS: Record<string, string> = { brouillon: "Brouillon", a_publier: "À publier", publie: "Publié" };
const STATUS_ORDER = ["brouillon", "a_publier", "publie"] as const;

const FORMAT_LABELS: Record<ContentFormat, string> = {
  carrousel: "Carrousel Instagram",
  reel: "Script de Reel",
  story: "Story",
  post_groupe: "Post groupe Facebook",
  legende: "Légende + hashtags",
};
const FORMATS: { id: ContentFormat; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "carrousel", label: "Carrousel", hint: "Slides éducatives + visuels prêts à poster", icon: Layers },
  { id: "reel", label: "Reel", hint: "Script court à filmer face caméra", icon: Film },
  { id: "story", label: "Story", hint: "Séquence d'écrans à faire défiler", icon: Smartphone },
  { id: "post_groupe", label: "Post groupe", hint: "Message qui fait réagir un groupe Facebook", icon: Users },
  { id: "legende", label: "Légende", hint: "Texte de publication + hashtags", icon: Hash },
];
const CHANNELS: { id: Channel; label: string; icon: LucideIcon }[] = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "facebook", label: "Facebook", icon: Facebook },
];
const isFormat = (f: string): f is ContentFormat => f in FORMAT_LABELS;
const isChannel = (c: string): c is Channel => c === "instagram" || c === "facebook";
const formatDate = (ms: number) => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function StepTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="text-sm font-bold mb-2 flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{n}</span>
      {children}
    </p>
  );
}

function StudioContenu() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<StudioTab>("creer");
  const [channel, setChannel] = useState<Channel>("instagram");
  const [format, setFormat] = useState<ContentFormat>("carrousel");
  const [topic, setTopic] = useState("");
  const [topicType, setTopicType] = useState<TopicType>("theme");
  const [streamText, setStreamText] = useState("");
  const [editing, setEditing] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [deck, setDeck] = useState<CarouselDeck | null>(null);
  const [background, setBackground] = useState<string | null>(null);
  const [rendered, setRendered] = useState<RenderedSlide[]>([]);
  // Format et canal du contenu affiché (peuvent différer des réglages si on les change après coup).
  const [resultMeta, setResultMeta] = useState<{ channel: Channel; format: ContentFormat; topic: string } | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function clearVisuals() {
    setRendered((prev) => { prev.forEach((r) => URL.revokeObjectURL(r.url)); return []; });
    setDeck(null);
    setBackground(null);
  }
  // Libère les images de slides au démontage de la page.
  const renderedRef = useRef(rendered);
  renderedRef.current = rendered;
  useEffect(() => () => renderedRef.current.forEach((r) => URL.revokeObjectURL(r.url)), []);

  const { data: sources } = useQuery<IdeaSources>({ queryKey: ["/api/content/idea-sources"], staleTime: 5 * 60_000 });
  const { data: posts = [], isLoading: postsLoading } = useQuery<ContentPost[]>({ queryKey: ["/api/content/posts"] });

  const { data: voice } = useQuery<{ marketingTone: string | null; marketingAudience: string | null }>({ queryKey: ["/api/content/profile"] });
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  useEffect(() => {
    if (voice) { setTone(voice.marketingTone ?? ""); setAudience(voice.marketingAudience ?? ""); }
  }, [voice]);
  const voiceDirty = !!voice && (tone !== (voice.marketingTone ?? "") || audience !== (voice.marketingAudience ?? ""));
  const voiceMut = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/content/profile", { marketingTone: tone || null, marketingAudience: audience || null }),
    onSuccess: async () => { toast({ title: "Voix enregistrée", description: "Elle sera utilisée pour tes prochaines générations." }); await queryClient.invalidateQueries({ queryKey: ["/api/content/profile"] }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec.", variant: "destructive" }),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      setStreamText("");
      setEditing(false);
      setSavedId(null);
      clearVisuals();
      setResultMeta({ channel, format, topic: topic.trim() });
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const res = await apiRequest("POST", "/api/content/generate", { channel, format, topicType, topic });
      const reader = res.body!.getReader();
      readerRef.current = reader;
      const dec = new TextDecoder();
      let acc = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setStreamText(acc);
        }
      } finally { readerRef.current = null; }
      return acc;
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "La génération a échoué.", variant: "destructive" }),
  });
  function stopGeneration() { readerRef.current?.cancel().catch(() => {}); }

  const suggestMut = useMutation({
    mutationFn: async (themes: string[]) => {
      const res = await apiRequest("POST", "/api/content/suggest", { themes });
      return (await res.json()).angles as Angle[];
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Impossible de proposer des idées.", variant: "destructive" }),
  });

  const meta = resultMeta ?? { channel, format, topic: topic.trim() };
  const saveMut = useMutation({
    mutationFn: async () => {
      const title = meta.topic ? `${FORMAT_LABELS[meta.format]} · ${meta.topic}` : FORMAT_LABELS[meta.format];
      const payload: Record<string, unknown> = { channel: meta.channel, format: meta.format, theme: meta.topic || null, title: title.slice(0, 255), body: streamText };
      if (meta.format === "carrousel" && deck) {
        payload.slidesJson = JSON.stringify(deck);
        payload.backgroundImage = background ?? null;
      }
      const res = await apiRequest("POST", "/api/content/posts", payload);
      return res.json() as Promise<ContentPost>;
    },
    onSuccess: async (post) => {
      setSavedId(post.id);
      setEditing(false);
      toast({ title: "Enregistré", description: "Contenu ajouté à « Mes contenus »." });
      await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec de l'enregistrement.", variant: "destructive" }),
  });

  const slidesMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/content/slides", { channel: meta.channel, format: "carrousel", topic: meta.topic || "carrousel", text: streamText });
      return res.json() as Promise<{ slides: CarouselDeck["slides"]; caption: string; hashtags: string[]; background: string | null }>;
    },
    onSuccess: async (data) => {
      const d: CarouselDeck = { slides: data.slides, caption: data.caption, hashtags: data.hashtags };
      setDeck(d);
      setBackground(data.background);
      setSavedId(null); // les visuels sont nouveaux : on peut ré-enregistrer avec eux.
      setRendered((prev) => { prev.forEach((r) => URL.revokeObjectURL(r.url)); return []; });
      const r = await renderCarouselSlides(d, { background: data.background, practitionerName: user?.name || "" });
      setRendered(r);
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec de la génération des visuels.", variant: "destructive" }),
  });

  async function downloadAllZip() {
    if (!deck || !rendered.length) return;
    const entries: ZipEntry[] = [];
    for (const r of rendered) entries.push({ name: `slide-${r.index + 1}.png`, data: new Uint8Array(await r.blob.arrayBuffer()) });
    entries.push({ name: "legende.txt", data: new TextEncoder().encode(buildCaptionFile(deck)) });
    triggerDownload(createZip(entries), `carrousel-${slugify(meta.topic, "carrousel")}.zip`);
  }

  const canGenerate = !!topic.trim() && !genMut.isPending;
  function generate() { if (canGenerate) genMut.mutate(); }
  // Ctrl/Cmd + Entrée lance la génération depuis l'onglet Créer.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => {
    if (tab !== "creer") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generateRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  function pickTheme(t: string, type: "client_theme" | "theme") { setTopic(t); setTopicType(type); }
  function pickAngle(a: Angle) { setTopic(a.title); setTopicType("client_theme"); if (isFormat(a.suggestedFormat)) setFormat(a.suggestedFormat); }
  function surprise() {
    const pool = [...(sources?.clientThemes.map((t) => t.theme) ?? []), ...(sources?.predefinedThemes ?? [])];
    const t = pickRandom(pool, topic);
    if (t) pickTheme(t, sources?.clientThemes.some((c) => c.theme === t) ? "client_theme" : "theme");
  }
  function copyOut() {
    navigator.clipboard.writeText(streamText)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => toast({ title: "Erreur", description: "Copie impossible.", variant: "destructive" }));
  }
  function reuse(p: ContentPost) {
    setTopic(p.theme || p.title);
    setTopicType("libre");
    if (isChannel(p.channel)) setChannel(p.channel);
    if (isFormat(p.format)) setFormat(p.format);
    setTab("creer");
    toast({ title: "Sujet repris", description: "Change le format ou le canal si tu veux une déclinaison, puis clique sur « Générer »." });
  }

  const length = streamText ? captionLength(streamText, meta.channel) : null;
  const hashtags = streamText ? countHashtags(streamText) : 0;
  const streaming = genMut.isPending;

  return (
    <AppLayout>
      <NaturobotTabs />
      <PageHeader title="Naturobot" subtitle="Crée des contenus prêts à publier pour attirer des clientes." icon={Sparkles} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as StudioTab)}>
        <TabsList className="rounded-lg">
          <TabsTrigger value="creer" data-testid="tab-studio-creer">Créer</TabsTrigger>
          <TabsTrigger value="bibliotheque" data-testid="tab-studio-bibliotheque">
            Mes contenus{posts.length ? <span className="ml-1.5 text-xs opacity-70" data-testid="text-posts-count">({posts.length})</span> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="creer">
          <StudioIntroBanner />
          <div className="grid gap-4 md:grid-cols-[360px_1fr] items-start">
            {/* Réglages */}
            <div className="card-naturo space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <StepTitle n={1}>Choisis un sujet</StepTitle>
                  <Button variant="ghost" size="sm" className="rounded-md h-7 px-2 text-xs -mt-2" onClick={surprise}
                    disabled={!sources} data-testid="button-surprise-topic">
                    <Shuffle className="h-3.5 w-3.5 mr-1" /> Au hasard
                  </Button>
                </div>

                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Inspiré de tes clientes</p>
                {sources?.clientThemes?.length ? (
                  <>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {sources.clientThemes.map((t) => (
                        <button key={t.theme} type="button" onClick={() => pickTheme(t.theme, "client_theme")}
                          aria-pressed={topicType === "client_theme" && topic === t.theme}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                            topicType === "client_theme" && topic === t.theme
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-primary hover:bg-secondary/70"
                          }`}
                          data-testid={`chip-client-theme-${t.theme}`}>
                          {t.theme} ({t.count})
                        </button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="rounded-md" disabled={suggestMut.isPending}
                      onClick={() => suggestMut.mutate(sources.clientThemes.map((t) => t.theme))}
                      data-testid="button-suggest-angles">
                      {suggestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lightbulb className="h-4 w-4 mr-1" />}
                      {suggestMut.data?.length ? "Autres idées" : "Propose-moi 5 idées"}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Quand tu auras quelques échanges clientes, je te dirai tes sujets phares. En attendant, choisis un thème ci-dessous.
                  </p>
                )}
                {suggestMut.data?.length ? (
                  <div className="mt-3 space-y-2">
                    {suggestMut.data.map((a, i) => {
                      const active = topic === a.title;
                      return (
                        <button key={i} type="button" onClick={() => pickAngle(a)} aria-pressed={active}
                          className={`block w-full text-left p-2 rounded-md border transition ${active ? "border-primary bg-secondary/40" : "border-border hover:border-primary"}`}
                          data-testid={`angle-${i}`}>
                          <span className="text-sm font-semibold">{a.title}</span>
                          <span className="block text-xs text-muted-foreground">{a.hook}</span>
                          {isFormat(a.suggestedFormat) ? (
                            <span className="mt-1 inline-block text-[11px] px-1.5 py-0.5 rounded-sm bg-secondary text-primary">{FORMAT_LABELS[a.suggestedFormat]}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-3">
                  <label className="text-xs font-semibold text-muted-foreground" htmlFor="studio-theme">Thème</label>
                  <Select value={topicType === "theme" ? topic : ""} onValueChange={(v) => pickTheme(v, "theme")}>
                    <SelectTrigger id="studio-theme" data-testid="select-theme"><SelectValue placeholder="Choisir un thème" /></SelectTrigger>
                    <SelectContent>
                      {sources?.predefinedThemes?.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-3">
                  <label className="text-xs font-semibold text-muted-foreground" htmlFor="studio-topic">…ou un sujet libre</label>
                  <Input id="studio-topic" value={topicType === "libre" ? topic : ""} maxLength={200}
                    onChange={(e) => { setTopic(e.target.value); setTopicType("libre"); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); generate(); } }}
                    placeholder="Ex. magnésium, jeûne intermittent…" data-testid="input-topic" />
                </div>
              </div>

              <div>
                <StepTitle n={2}>Choisis le canal et le format</StepTitle>
                <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Canal">
                  {CHANNELS.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={channel === c.id} onClick={() => setChannel(c.id)}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                        channel === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"
                      }`}
                      data-testid={`button-channel-${c.id}`}>
                      <c.icon className="h-4 w-4" /> {c.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Format">
                  {FORMATS.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={format === f.id} onClick={() => setFormat(f.id)}
                      className={`text-left rounded-md border p-2 transition ${
                        format === f.id ? "border-primary bg-secondary/50" : "border-border hover:border-primary"
                      } ${f.id === "legende" ? "col-span-2" : ""}`}
                      data-testid={`button-format-${f.id}`}>
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <f.icon className="h-4 w-4 text-primary" /> {f.label}
                      </span>
                      <span className="block text-[11px] leading-tight text-muted-foreground mt-0.5">{f.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <StepTitle n={3}>Génère</StepTitle>
                {topic.trim() ? (
                  <p className="text-xs text-muted-foreground mb-2" data-testid="text-selected-topic">
                    Sujet : <span className="font-semibold text-foreground">{topic}</span> · {FORMAT_LABELS[format]} · {channel === "instagram" ? "Instagram" : "Facebook"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mb-2">Choisis d'abord un sujet à l'étape 1.</p>
                )}
                <Button className="w-full rounded-md py-6 font-bold" disabled={!canGenerate}
                  onClick={generate} data-testid="button-generate-content">
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {streaming ? "Rédaction en cours…" : "Générer"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-1">Raccourci : Ctrl + Entrée</p>
              </div>

              <details className="pt-3 border-t border-border">
                <summary className="text-sm font-bold cursor-pointer">
                  Ma voix {voice?.marketingTone || voice?.marketingAudience ? <span className="text-xs font-normal text-muted-foreground">· réglée</span> : <span className="text-xs font-normal text-muted-foreground">(optionnel)</span>}
                </summary>
                <div className="space-y-2 mt-2">
                  <p className="text-xs text-muted-foreground">Ton style et ta cible, pris en compte à chaque génération.</p>
                  <Input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={64} placeholder="Ton (ex. chaleureux & complice)" data-testid="input-tone" />
                  <Input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={255} placeholder="Audience (ex. femmes 30-50, fatigue & stress)" data-testid="input-audience" />
                  <Button variant="outline" size="sm" className="rounded-md" disabled={voiceMut.isPending || !voiceDirty} onClick={() => voiceMut.mutate()} data-testid="button-save-voice">
                    {voiceMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    {voiceDirty ? "Enregistrer ma voix" : "Voix à jour"}
                  </Button>
                </div>
              </details>
            </div>

            {/* Résultat */}
            <div ref={resultRef} className="card-naturo min-h-[300px] scroll-mt-4" aria-live="polite" aria-busy={streaming}>
              {streamText || streaming ? (
                <>
                  <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                    <div className="min-w-0 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="px-2 py-0.5 rounded-sm bg-secondary text-primary font-semibold">{FORMAT_LABELS[meta.format]}</span>
                      <span className="px-2 py-0.5 rounded-sm bg-secondary text-primary">{meta.channel === "instagram" ? "Instagram" : "Facebook"}</span>
                      {meta.topic ? <span className="text-muted-foreground truncate max-w-[240px]">· {meta.topic}</span> : null}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {streaming ? (
                        <Button variant="outline" size="sm" className="rounded-md" onClick={stopGeneration} data-testid="button-stop-generation">
                          <CircleStop className="h-4 w-4 mr-1" /> Arrêter
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="rounded-md" aria-label="Copier le contenu" onClick={copyOut} data-testid="button-copy-content">
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-md" onClick={() => setEditing((v) => !v)} aria-pressed={editing} data-testid="button-edit-result">
                            <Pencil className="h-4 w-4 mr-1" /> {editing ? "Aperçu" : "Modifier"}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-md" disabled={!canGenerate} onClick={generate} data-testid="button-regenerate">
                            <RotateCcw className="h-4 w-4 mr-1" /> Autre version
                          </Button>
                          {savedId ? (
                            <Button size="sm" className="rounded-md" onClick={() => setTab("bibliotheque")} data-testid="button-goto-library">
                              <Check className="h-4 w-4 mr-1" /> Enregistré · Voir <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                          ) : (
                            <Button size="sm" className="rounded-md" disabled={saveMut.isPending || !streamText.trim()} onClick={() => saveMut.mutate()} data-testid="button-save-content">
                              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Enregistrer
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {streaming && !streamText ? (
                    <div className="space-y-2" data-testid="skeleton-generation">
                      <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : editing ? (
                    <Textarea value={streamText} onChange={(e) => { setStreamText(e.target.value); setSavedId(null); }}
                      rows={18} className="font-mono text-sm" data-testid="textarea-edit-result" />
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
                    </div>
                  )}

                  {length && !streaming ? (
                    <p className={`mt-3 text-xs ${length.over ? "text-destructive font-semibold" : "text-muted-foreground"}`} data-testid="text-caption-length">
                      {length.count.toLocaleString("fr-FR")} caractères
                      {meta.channel === "instagram" ? ` / ${length.limit.toLocaleString("fr-FR")} max sur Instagram` : ""}
                      {hashtags ? ` · ${hashtags} hashtag${hashtags > 1 ? "s" : ""}` : ""}
                      {length.over ? " — raccourcis avant de publier." : ""}
                    </p>
                  ) : null}

                  {meta.format === "carrousel" && streamText && !streaming ? (
                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <p className="text-sm font-bold">Visuels du carrousel</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="rounded-md" disabled={slidesMut.isPending}
                            onClick={() => slidesMut.mutate()} data-testid="button-generate-visuals">
                            {slidesMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ImageIcon className="h-4 w-4 mr-1" />}
                            {slidesMut.isPending ? "Création des images…" : rendered.length ? "Regénérer les visuels" : "Générer les visuels"}
                          </Button>
                          {rendered.length ? (
                            <Button size="sm" className="rounded-md" onClick={downloadAllZip} data-testid="button-download-zip">
                              <Download className="h-4 w-4 mr-1" /> Tout télécharger (.zip)
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {slidesMut.isPending && !rendered.length ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />)}
                        </div>
                      ) : rendered.length ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {rendered.map((r) => (
                            <div key={r.index} className="space-y-1">
                              <img src={r.url} alt={`Slide ${r.index + 1}`} loading="lazy" className="rounded-lg border border-border w-full" data-testid={`img-slide-${r.index}`} />
                              <Button variant="outline" size="sm" className="rounded-md w-full" aria-label={`Télécharger la slide ${r.index + 1}`}
                                onClick={() => triggerDownload(r.blob, `slide-${r.index + 1}.png`)} data-testid={`button-download-slide-${r.index}`}>
                                <Download className="h-4 w-4 mr-1" /> Slide {r.index + 1}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Transforme ton carrousel en images prêtes à poster : texte net + fond généré. Téléchargeables une par une ou en .zip.
                          {savedId ? " Pense à ré-enregistrer après pour garder les visuels." : ""}
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4" data-testid="empty-result">
                  <Sparkles className="h-8 w-8 text-primary mb-3" />
                  <p className="font-bold mb-1">Ton contenu apparaîtra ici</p>
                  <ol className="text-sm text-muted-foreground space-y-1 mb-4">
                    <li>1. Choisis un sujet (ou « Au hasard »)</li>
                    <li>2. Choisis le canal et le format</li>
                    <li>3. Clique sur « Générer », ajuste, enregistre</li>
                  </ol>
                  {posts.length ? (
                    <Button variant="outline" size="sm" className="rounded-md" onClick={() => setTab("bibliotheque")} data-testid="button-open-library">
                      Voir mes {posts.length} contenu{posts.length > 1 ? "s" : ""} <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bibliotheque">
          <ContentLibrary posts={posts} loading={postsLoading} onReuse={reuse} onCreate={() => setTab("creer")} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function ContentLibrary({ posts, loading, onReuse, onCreate }: { posts: ContentPost[]; loading: boolean; onReuse: (p: ContentPost) => void; onCreate: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [editingId, setEditingId] = useState<number | null>(null);

  const counts = useMemo(() => countByStatus(posts), [posts]);
  const filtered = useMemo(
    () => filterContentPosts(posts, { status: statusFilter, channel: channelFilter, query: deferredQuery }),
    [posts, statusFilter, channelFilter, deferredQuery],
  );

  const patchMut = useMutation({
    mutationFn: async (v: { id: number; body?: string; status?: string }) => {
      const res = await apiRequest("PATCH", `/api/content/posts/${v.id}`, { body: v.body, status: v.status });
      return res.json();
    },
    onSuccess: async (_d, v) => {
      if (v.body !== undefined) { setEditingId(null); toast({ title: "Modifications enregistrées" }); }
      else if (v.status) toast({ title: `Statut : ${STATUS_LABELS[v.status]}` });
      await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec.", variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/content/posts/${id}`),
    onSuccess: async () => { setEditingId(null); toast({ title: "Contenu supprimé" }); await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec.", variant: "destructive" }),
  });

  async function remove(id: number) {
    if (await confirm({ title: "Supprimer ce contenu ?", description: "Cette action est définitive.", destructive: true })) delMut.mutate(id);
  }

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}</div>;
  }

  if (!posts.length) {
    return (
      <div className="card-naturo text-center py-10" data-testid="empty-library">
        <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
        <p className="font-bold mb-1">Aucun contenu enregistré pour l'instant</p>
        <p className="text-sm text-muted-foreground mb-4">Génère un premier post, puis clique sur « Enregistrer » : il arrivera ici, prêt à être planifié.</p>
        <Button className="rounded-md" onClick={onCreate} data-testid="button-create-first">
          <Send className="h-4 w-4 mr-2" /> Créer mon premier contenu
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un contenu…" className="pl-8" aria-label="Rechercher un contenu" data-testid="input-search-content" />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-channel"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les canaux</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 flex-wrap">
        {(["all", ...STATUS_ORDER] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-primary hover:bg-secondary/70"}`}
            data-testid={`filter-${s}`}>
            {s === "all" ? "Tous" : STATUS_LABELS[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Aucun contenu ne correspond.{" "}
          <button type="button" className="underline text-primary" onClick={() => { setQuery(""); setStatusFilter("all"); setChannelFilter("all"); }} data-testid="button-reset-filters">
            Réinitialiser les filtres
          </button>
        </div>
      ) : filtered.map((p) => (
        <PostCard key={p.id} post={p} practitionerName={user?.name || ""}
          editing={editingId === p.id} saving={patchMut.isPending && patchMut.variables?.id === p.id}
          onEdit={() => setEditingId(p.id)} onCancelEdit={() => setEditingId(null)}
          onSaveBody={(body) => patchMut.mutate({ id: p.id, body })}
          onStatus={(status) => patchMut.mutate({ id: p.id, status })}
          onDelete={() => remove(p.id)} onReuse={() => onReuse(p)} />
      ))}
    </div>
  );
}

interface PostCardProps {
  post: ContentPost; practitionerName: string; editing: boolean; saving: boolean;
  onEdit: () => void; onCancelEdit: () => void; onSaveBody: (body: string) => void;
  onStatus: (s: string) => void; onDelete: () => void; onReuse: () => void;
}
const PostCard = memo(function PostCard({ post: p, practitionerName, editing, saving, onEdit, onCancelEdit, onSaveBody, onStatus, onDelete, onReuse }: PostCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editBody, setEditBody] = useState(p.body);
  useEffect(() => { if (editing) setEditBody(p.body); }, [editing, p.body]);
  const long = p.body.length > 420 || p.body.split("\n").length > 7;
  const ChannelIcon = p.channel === "facebook" ? Facebook : Instagram;

  return (
    <div className="card-naturo" data-testid={`content-post-${p.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold flex items-center gap-1.5"><ChannelIcon className="h-4 w-4 text-primary flex-shrink-0" />{p.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-post-date-${p.id}`}>
            Créé le {formatDate(p.createdAt)}{p.status === "publie" && p.publishedAt ? ` · publié le ${formatDate(p.publishedAt)}` : ""}
            {p.slidesJson ? (
              <span className="ml-2 px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary inline-flex items-center gap-1" data-testid={`badge-visuals-${p.id}`}>
                <ImageIcon className="h-3 w-3" /> Visuels
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={p.status} onValueChange={onStatus}>
            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Statut" data-testid={`select-status-${p.id}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="rounded-md" aria-label="Copier le contenu"
            onClick={() => navigator.clipboard.writeText(p.body)
              .then(() => toast({ title: "Copié" }))
              .catch(() => toast({ title: "Erreur", description: "Copie impossible.", variant: "destructive" }))}
            data-testid={`button-copy-${p.id}`}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="rounded-md" aria-label="Décliner ce sujet" title="Décliner ce sujet dans un autre format" onClick={onReuse} data-testid={`button-reuse-${p.id}`}>
            <Repeat className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="rounded-md" aria-label="Modifier le contenu" onClick={onEdit} data-testid={`button-edit-${p.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="sm" className="rounded-md" aria-label="Supprimer le contenu" onClick={onDelete} data-testid={`button-delete-${p.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={10} data-testid={`textarea-edit-${p.id}`} />
          <div className="flex gap-2">
            <Button size="sm" className="rounded-md" disabled={saving || !editBody.trim() || editBody === p.body} onClick={() => onSaveBody(editBody)} data-testid={`button-save-edit-${p.id}`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Enregistrer
            </Button>
            <Button size="sm" variant="outline" className="rounded-md" onClick={onCancelEdit}>Annuler</Button>
          </div>
        </div>
      ) : (
        <>
          <div className={`prose prose-sm max-w-none ${long && !expanded ? "max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" : ""}`} data-testid={`text-post-body-${p.id}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
          </div>
          {long ? (
            <button type="button" className="text-xs font-semibold text-primary mt-1" onClick={() => setExpanded((v) => !v)} data-testid={`button-expand-${p.id}`}>
              {expanded ? "Réduire" : "Lire tout"}
            </button>
          ) : null}
        </>
      )}
      {p.slidesJson ? <PostVisuals post={p} practitionerName={practitionerName} /> : null}
    </div>
  );
});

// Aperçu + téléchargement (.zip) des visuels d'un carrousel sauvegardé (rendu à la demande).
function PostVisuals({ post, practitionerName }: { post: ContentPost; practitionerName: string }) {
  const { toast } = useToast();
  const [slides, setSlides] = useState<RenderedSlide[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fond, setFond] = useState<string | null | undefined>(undefined);

  let deck: CarouselDeck | null = null;
  try { deck = post.slidesJson ? (JSON.parse(post.slidesJson) as CarouselDeck) : null; } catch { deck = null; }
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) return null;
  const safeDeck = deck;

  // Le fond (data-URL de plusieurs Mo) n'est plus renvoyé par /api/content/posts :
  // on le récupère au premier rendu de visuels, puis on le garde en mémoire.
  async function chargerFond(): Promise<string | null> {
    if (fond !== undefined) return fond;
    try {
      const r = await apiRequest("GET", `/api/content/posts/${post.id}/background`);
      const j = await r.json();
      setFond(j.backgroundImage ?? null);
      return j.backgroundImage ?? null;
    } catch {
      setFond(null);
      return null;
    }
  }

  async function toggle() {
    if (slides) { slides.forEach((s) => URL.revokeObjectURL(s.url)); setSlides(null); return; }
    setBusy(true);
    try {
      setSlides(await renderCarouselSlides(safeDeck, { background: await chargerFond(), practitionerName }));
    } catch {
      toast({ title: "Erreur", description: "Rendu des visuels impossible.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function zip() {
    setBusy(true);
    try {
      const r = slides ?? await renderCarouselSlides(safeDeck, { background: await chargerFond(), practitionerName });
      const entries: ZipEntry[] = [];
      for (const s of r) entries.push({ name: `slide-${s.index + 1}.png`, data: new Uint8Array(await s.blob.arrayBuffer()) });
      entries.push({ name: "legende.txt", data: new TextEncoder().encode(buildCaptionFile(safeDeck)) });
      triggerDownload(createZip(entries), `carrousel-${post.id}.zip`);
      if (!slides) r.forEach((s) => URL.revokeObjectURL(s.url));
    } catch {
      toast({ title: "Erreur", description: "Téléchargement impossible.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2">
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="rounded-lg" disabled={busy} onClick={toggle} data-testid={`button-visuals-toggle-${post.id}`}>
          <ImageIcon className="h-4 w-4 mr-1" /> {slides ? "Masquer les visuels" : "Aperçu des visuels"}
        </Button>
        <Button size="sm" className="rounded-lg" disabled={busy} onClick={zip} data-testid={`button-visuals-zip-${post.id}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />} Télécharger (.zip)
        </Button>
      </div>
      {slides ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
          {slides.map((s) => (
            <img key={s.index} src={s.url} alt={`Slide ${s.index + 1}`} className="rounded-md border border-border w-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Lot 1 (action 7) — gating interface : écran payant remplacé par un état bloqué
// explicite (jamais une erreur technique ni un bouton mort) pour un compte gratuit.
export default function StudioContenuGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="Le Studio contenu" description="La génération de contenus pour vos réseaux sociaux est réservée à l'abonnement Naturo Pro." />;
  }
  return <StudioContenu />;
}
