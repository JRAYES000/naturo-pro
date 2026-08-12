/**
 * SavedReplies.tsx — Lot 5 (NaturoBot N4)
 * Route : /#/app/naturobot-bibliotheque
 *
 * Bibliothèque personnelle des réponses IA archivées depuis une discussion
 * (bouton « Enregistrer dans la bibliothèque » sur chaque réponse de Naturobot).
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BookMarked, Copy, Check, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { FeatureGate } from "@/components/FeatureGate";
import type { AiSavedReply } from "@shared/schema";

function SavedReplyCard({ reply, onDelete }: { reply: AiSavedReply; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(reply.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <li className="card-naturo" data-testid={`saved-reply-${reply.id}`}>
      <div className="flex items-start justify-between gap-3">
        <button className="flex-1 min-w-0 text-left" onClick={() => setOpen((o) => !o)} data-testid={`button-toggle-reply-${reply.id}`}>
          <p className="font-extrabold truncate">{reply.title}</p>
          <p className="text-xs text-muted-foreground">
            Enregistrée le {new Date(reply.createdAt).toLocaleDateString("fr-FR")}
          </p>
        </button>
        <div className="flex gap-1 shrink-0">
          <button
            className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground"
            onClick={copy}
            title="Copier le contenu"
            aria-label="Copier le contenu"
            data-testid={`button-copy-reply-${reply.id}`}
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive"
            onClick={onDelete}
            title="Supprimer"
            aria-label="Supprimer"
            data-testid={`button-delete-reply-${reply.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Replier" : "Déplier"}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-border prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{reply.content}</ReactMarkdown>
        </div>
      )}
    </li>
  );
}

function SavedRepliesPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: replies = [], isLoading } = useQuery<AiSavedReply[]>({ queryKey: ["/api/saved-replies"] });

  const delMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/saved-replies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-replies"] });
      toast({ title: "Réponse supprimée", variant: "success" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <PageHeader
        title="Bibliothèque Naturobot"
        subtitle="Vos meilleures réponses IA, archivées pour ne pas reposer deux fois la même question."
        icon={BookMarked}
      />
      <NaturobotTabs />
      {isLoading ? (
        <Loading variant="list" label="Chargement de la bibliothèque…" />
      ) : replies.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Aucune réponse enregistrée"
          description="Dans une discussion Naturobot, survolez une réponse utile et cliquez sur l'icône marque-page pour l'archiver ici."
          testid="empty-saved-replies"
        />
      ) : (
        <ul className="space-y-3 max-w-4xl">
          {replies.map((r) => (
            <SavedReplyCard
              key={r.id}
              reply={r}
              onDelete={async () => {
                if (!(await confirm({ title: "Supprimer cette réponse ?", description: "Elle sera retirée définitivement de votre bibliothèque.", confirmLabel: "Supprimer", destructive: true }))) return;
                delMut.mutate(r.id);
              }}
            />
          ))}
        </ul>
      )}
    </AppLayout>
  );
}

export default function SavedRepliesGated() {
  const { user } = useAuth();
  if (user && !user.hasFullAccess) {
    return <FeatureGate feature="La bibliothèque Naturobot" description="L'archivage des réponses IA est réservé à l'abonnement Naturo Pro." />;
  }
  return <SavedRepliesPage />;
}
