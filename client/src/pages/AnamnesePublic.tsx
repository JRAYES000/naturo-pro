/**
 * AnamnesePublic.tsx — Page publique de saisie d'un questionnaire d'anamnèse
 * Route hash : /#/anamnese/:token (SANS ProtectedRoute, accessible par la cliente)
 *
 * La cliente arrive via un lien envoyé par sa naturopathe.
 * Elle remplit le questionnaire et soumet — aucun compte requis.
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionType = "text" | "textarea" | "choice" | "multi" | "scale";

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
}

interface TemplatePublic {
  name: string;
  description: string | null;
  questions: Question[];
}

type AnswerValue = string | string[] | number;
type Answers = Record<string, AnswerValue>;

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AnamnesePublicPage() {
  const { token } = useParams<{ token: string }>();
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = useQuery<TemplatePublic>({
    queryKey: ["/api/public/anamnese", token],
    queryFn: () => apiRequest("GET", `/api/public/anamnese/${token}`).then(r => {
      if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.message || "Erreur")));
      return r.json();
    }),
    retry: false,
  });

  const submitMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/public/anamnese/${token}`, { answers }).then(r => {
        if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.message || "Erreur")));
        return r.json();
      }),
    onSuccess: () => setSubmitted(true),
  });

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }

  function toggleMulti(id: string, option: string) {
    const current = (answers[id] as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter(v => v !== option)
      : [...current, option];
    setAnswer(id, next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    // Vérification des champs requis
    for (const q of data.questions) {
      if (!q.required) continue;
      const ans = answers[q.id];
      const empty = ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0);
      if (empty) {
        alert(`La question « ${q.label} » est obligatoire.`);
        return;
      }
    }
    submitMut.mutate();
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PublicShell>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PublicShell>
    );
  }

  if (error || !data) {
    const msg = (error as Error)?.message ?? "Questionnaire introuvable";
    const alreadySubmitted = msg.toLowerCase().includes("déjà été soumis");
    return (
      <PublicShell>
        <div className="text-center py-16 px-4">
          {alreadySubmitted ? (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h2 className="text-xl font-extrabold mb-2" style={{ color: "#1b4332" }}>
                Questionnaire déjà soumis
              </h2>
              <p className="text-muted-foreground text-sm">
                Vous avez déjà rempli ce questionnaire. Votre naturopathe a bien reçu vos réponses.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h2 className="text-xl font-extrabold mb-2">Lien invalide</h2>
              <p className="text-muted-foreground text-sm">{msg}</p>
            </>
          )}
        </div>
      </PublicShell>
    );
  }

  if (submitted) {
    return (
      <PublicShell>
        <div className="text-center py-16 px-4">
          <CheckCircle2 className="h-14 w-14 mx-auto mb-5 text-primary" />
          <h2 className="text-2xl font-extrabold mb-3" style={{ color: "#1b4332" }}>
            Merci !
          </h2>
          <p className="text-muted-foreground">
            Vos réponses ont bien été envoyées à votre naturopathe.
            Vous n'avez rien d'autre à faire.
          </p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold mb-2" style={{ color: "#1b4332" }}>{data.name}</h1>
          {data.description && (
            <p className="text-muted-foreground text-sm">{data.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
            Vos réponses seront transmises directement à votre praticienne, en toute confidentialité.
            Les champs marqués d'un <span className="text-destructive font-bold">*</span> sont obligatoires.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {data.questions.map((q, idx) => (
            <QuestionField
              key={q.id}
              question={q}
              index={idx}
              value={answers[q.id]}
              onChange={val => setAnswer(q.id, val)}
              onToggleMulti={opt => toggleMulti(q.id, opt)}
            />
          ))}

          {submitMut.isError && (
            <p className="text-sm text-destructive">
              {(submitMut.error as Error)?.message ?? "Une erreur est survenue."}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitMut.isPending}
            className="w-full rounded-[15px] py-5 font-bold text-base"
            style={{ background: "#186749" }}
            data-testid="button-submit-anamnese"
          >
            {submitMut.isPending ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</span>
            ) : "Envoyer mes réponses"}
          </Button>
        </form>
      </div>
    </PublicShell>
  );
}

// ─── Wrapper de la page publique ──────────────────────────────────────────────

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "#186749" }}>
          <span className="text-white font-extrabold text-sm">N</span>
        </div>
        <span className="font-extrabold text-sm" style={{ color: "#1b4332" }}>Naturo Pro</span>
      </header>
      <main>{children}</main>
    </div>
  );
}

// ─── Champ de question ────────────────────────────────────────────────────────

function QuestionField({ question, index, value, onChange, onToggleMulti }: {
  question: Question;
  index: number;
  value: AnswerValue | undefined;
  onChange: (val: AnswerValue) => void;
  onToggleMulti: (opt: string) => void;
}) {
  const labelEl = (
    <Label className="text-sm font-semibold text-foreground block mb-2">
      {index + 1}. {question.label}
      {question.required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );

  switch (question.type) {
    case "text":
      return (
        <div>
          {labelEl}
          <Input
            value={(value as string) ?? ""}
            onChange={e => onChange(e.target.value)}
            placeholder="Votre réponse…"
            data-testid={`field-${question.id}`}
          />
        </div>
      );

    case "textarea":
      return (
        <div>
          {labelEl}
          <Textarea
            rows={4}
            value={(value as string) ?? ""}
            onChange={e => onChange(e.target.value)}
            placeholder="Votre réponse…"
            data-testid={`field-${question.id}`}
          />
        </div>
      );

    case "choice":
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {(question.options ?? []).map(opt => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  value={opt}
                  checked={(value as string) === opt}
                  onChange={() => onChange(opt)}
                  className="accent-primary"
                  data-testid={`radio-${question.id}-${opt}`}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
            {(question.options ?? []).length === 0 && (
              <Input
                value={(value as string) ?? ""}
                onChange={e => onChange(e.target.value)}
                placeholder="Votre réponse…"
              />
            )}
          </div>
        </div>
      );

    case "multi":
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {(question.options ?? []).map(opt => {
              const checked = Array.isArray(value) && value.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleMulti(opt)}
                    className="accent-primary"
                    data-testid={`checkbox-${question.id}-${opt}`}
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      );

    case "scale":
      return (
        <div>
          {labelEl}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-6 text-center">1</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={(value as number) ?? 5}
              onChange={e => onChange(Number(e.target.value))}
              className="flex-1 accent-primary"
              data-testid={`range-${question.id}`}
            />
            <span className="text-xs text-muted-foreground w-6 text-center">10</span>
            <span className="font-extrabold text-primary w-8 text-center text-sm">
              {(value as number) ?? 5}
            </span>
          </div>
        </div>
      );

    default:
      return null;
  }
}
