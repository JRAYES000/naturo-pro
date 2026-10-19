/**
 * Réponses Naturobot notées « pouce bas » par les praticiennes (admin) : de quoi
 * repérer ce qui déçoit et ajuster les instructions globales ou les supports.
 */
import { useQuery } from "@tanstack/react-query";
import { ThumbsDown } from "lucide-react";
import { Loading } from "@/components/Loading";

type Negative = { messageId: number; question: string; answer: string; createdAt: number };

export function FeedbackReview() {
  const { data, isLoading } = useQuery<{ negative: Negative[]; total: number }>({
    queryKey: ["/api/admin/assistant/feedback"],
  });
  return (
    <div className="card-naturo mb-6" data-testid="card-naturobot-feedback">
      <h2 className="text-heading mb-1 flex items-center gap-2">
        <ThumbsDown className="h-4 w-4 text-muted-foreground" /> Réponses jugées décevantes
      </h2>
      <p className="text-sm text-muted-foreground mb-3">
        {data ? `${data.negative.length} réponse(s) notée(s) « pouce bas » sur ${data.total} avis reçus.` : "Avis des praticiennes sur les réponses de Naturobot."}
      </p>
      {isLoading ? (
        <Loading />
      ) : !data?.negative.length ? (
        <p className="text-sm text-muted-foreground">Aucune réponse signalée pour l'instant.</p>
      ) : (
        <ul className="space-y-2">
          {data.negative.map((n) => (
            <li key={n.messageId} className="rounded-lg border border-border">
              <details>
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  <span className="font-semibold">{n.question || "(question introuvable)"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleDateString("fr-FR")}</span>
                </summary>
                <p className="px-3 pb-3 text-sm text-muted-foreground whitespace-pre-wrap">{n.answer}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
