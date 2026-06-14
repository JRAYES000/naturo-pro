import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Copy, Check, Save, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Channel = "instagram" | "facebook";
type ContentFormat = "carrousel" | "reel" | "story" | "post_groupe" | "legende";
type TopicType = "client_theme" | "theme" | "libre";
interface IdeaSources { clientThemes: { theme: string; count: number }[]; predefinedThemes: string[]; }
interface Angle { title: string; hook: string; suggestedFormat: ContentFormat; }

const FORMAT_LABELS: Record<ContentFormat, string> = {
  carrousel: "Carrousel Instagram",
  reel: "Script de Reel",
  story: "Story",
  post_groupe: "Post groupe Facebook",
  legende: "Légende + hashtags",
};

export default function StudioContenu() {
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel>("instagram");
  const [format, setFormat] = useState<ContentFormat>("carrousel");
  const [topic, setTopic] = useState("");
  const [topicType, setTopicType] = useState<TopicType>("theme");
  const [streamText, setStreamText] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: sources } = useQuery<IdeaSources>({ queryKey: ["/api/content/idea-sources"] });

  const genMut = useMutation({
    mutationFn: async () => {
      setStreamText("");
      const res = await apiRequest("POST", "/api/content/generate", { channel, format, topicType, topic });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setStreamText(acc);
      }
      return acc;
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "La génération a échoué.", variant: "destructive" }),
  });

  const suggestMut = useMutation({
    mutationFn: async (themes: string[]) => {
      const res = await apiRequest("POST", "/api/content/suggest", { themes });
      return (await res.json()).angles as Angle[];
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Impossible de proposer des idées.", variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const title = topic ? `${FORMAT_LABELS[format]} · ${topic}` : FORMAT_LABELS[format];
      const res = await apiRequest("POST", "/api/content/posts", { channel, format, theme: topic || null, title, body: streamText });
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Enregistré", description: "Contenu ajouté à « Mes contenus »." });
      await queryClient.invalidateQueries({ queryKey: ["/api/content/posts"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec de l'enregistrement.", variant: "destructive" }),
  });

  function pickTheme(t: string, type: "client_theme" | "theme") { setTopic(t); setTopicType(type); }
  function pickAngle(a: Angle) { setTopic(a.title); setTopicType("client_theme"); setFormat(a.suggestedFormat); }
  function copyOut() {
    navigator.clipboard.writeText(streamText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <AppLayout>
      <PageHeader title="Naturobot" subtitle="Crée des contenus prêts à publier pour attirer des clientes." icon={Sparkles} />
      <NaturobotTabs />
      <Tabs defaultValue="creer">
        <TabsList className="rounded-[12px]">
          <TabsTrigger value="creer" data-testid="tab-studio-creer">Créer</TabsTrigger>
          <TabsTrigger value="bibliotheque" data-testid="tab-studio-bibliotheque">Mes contenus</TabsTrigger>
        </TabsList>

        <TabsContent value="creer">
          <div className="grid gap-4 md:grid-cols-[340px_1fr]">
            {/* Réglages */}
            <div className="card-naturo space-y-4">
              <div>
                <p className="text-sm font-bold mb-2">Inspiré de tes clientes</p>
                {sources?.clientThemes?.length ? (
                  <>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {sources.clientThemes.map((t) => (
                        <button key={t.theme} onClick={() => pickTheme(t.theme, "client_theme")}
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
                    <Button variant="outline" size="sm" className="rounded-[12px]" disabled={suggestMut.isPending}
                      onClick={() => suggestMut.mutate(sources.clientThemes.map((t) => t.theme))}
                      data-testid="button-suggest-angles">
                      {suggestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Propose-moi 5 idées"}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Quand tu auras quelques échanges clientes, je te dirai tes sujets phares. En attendant, choisis un thème ci-dessous.
                  </p>
                )}
                {suggestMut.data?.length ? (
                  <div className="mt-3 space-y-2">
                    {suggestMut.data.map((a, i) => (
                      <button key={i} onClick={() => pickAngle(a)}
                        className="block w-full text-left p-2 rounded-[10px] border border-border hover:border-primary transition"
                        data-testid={`angle-${i}`}>
                        <span className="text-sm font-semibold">{a.title}</span>
                        <span className="block text-xs text-muted-foreground">{a.hook}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-bold">Thème</label>
                <Select value={topicType === "theme" ? topic : ""} onValueChange={(v) => pickTheme(v, "theme")}>
                  <SelectTrigger data-testid="select-theme"><SelectValue placeholder="Choisir un thème" /></SelectTrigger>
                  <SelectContent>
                    {sources?.predefinedThemes?.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-bold">…ou un sujet libre</label>
                <Input value={topicType === "libre" ? topic : ""} onChange={(e) => { setTopic(e.target.value); setTopicType("libre"); }}
                  placeholder="Ex. magnésium, jeûne intermittent…" data-testid="input-topic" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-bold">Canal</label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                    <SelectTrigger data-testid="select-channel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-bold">Format</label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ContentFormat)}>
                    <SelectTrigger data-testid="select-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FORMAT_LABELS) as ContentFormat[]).map((f) => (
                        <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {topic.trim() ? (
                <p className="text-xs text-muted-foreground" data-testid="text-selected-topic">
                  Sujet sélectionné : <span className="font-semibold text-foreground">{topic}</span> · {FORMAT_LABELS[format]}
                </p>
              ) : null}
              <Button className="w-full rounded-[12px] py-6 font-bold" disabled={!topic.trim() || genMut.isPending}
                onClick={() => genMut.mutate()} data-testid="button-generate-content">
                {genMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Générer
              </Button>
            </div>

            {/* Résultat */}
            <div className="card-naturo min-h-[300px]">
              {streamText ? (
                <>
                  <div className="flex justify-end gap-2 mb-2">
                    <Button variant="outline" size="sm" className="rounded-[12px]" onClick={copyOut} data-testid="button-copy-content">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" className="rounded-[12px]" disabled={saveMut.isPending || genMut.isPending} onClick={() => saveMut.mutate()} data-testid="button-save-content">
                      <Save className="h-4 w-4 mr-1" /> Enregistrer
                    </Button>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Choisis une source d'idée, un canal et un format, puis clique sur « Générer ».</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bibliotheque">
          <div className="card-naturo">Bientôt : ta bibliothèque de contenus.</div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
