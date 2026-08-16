/**
 * AnamnesePublic.tsx — Page publique de saisie d'un questionnaire d'anamnèse
 * Route hash : /#/anamnese/:token (SANS ProtectedRoute, accessible par la cliente)
 *
 * La cliente arrive via un lien envoyé par sa naturopathe.
 * Elle remplit le questionnaire et soumet — aucun compte requis.
 */

import { useEffect, useState } from "react";
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

// Palette de pastels (classes Tailwind complètes) cyclée pour distinguer les questions.
const PASTELS = [
  "bg-rose-50 border-rose-200",
  "bg-amber-50 border-amber-200",
  "bg-sky-50 border-sky-200",
  "bg-violet-50 border-violet-200",
  "bg-emerald-50 border-emerald-200",
  "bg-orange-50 border-orange-200",
];

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AnamnesePublicPage() {
  const { token } = useParams<{ token: string }>();
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // Avertit la cliente si elle tente de fermer/rafraîchir la page alors que des
  // réponses non soumises existent. Aucune persistance client n'est utilisée
  // (localStorage/sessionStorage interdits par COMMON.md) : cette confirmation
  // est la seule protection possible contre une perte accidentelle de saisie.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (Object.keys(answers).length > 0 && !submitted && !submitMut.isPending) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [answers, submitted, submitMut.isPending]);

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers(prev => ({ ...prev, [id]: value }));
    setErrors(prev => {
      if (!(id in prev)) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  function toggleMulti(id: string, option: string) {
    const current = (answers[id] as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter(v => v !== option)
      : [...current, option];
    setAnswer(id, next);
  }

  function isAnswerEmpty(ans: AnswerValue | undefined): boolean {
    return ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    // Vérification des champs requis — validation inline (plus d'alert()).
    const nextErrors: Record<string, string> = {};
    for (const q of data.questions) {
      if (!q.required) continue;
      if (isAnswerEmpty(answers[q.id])) {
        nextErrors[q.id] = "Cette réponse est obligatoire";
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstErrorId = data.questions.find(q => nextErrors[q.id])?.id;
      if (firstErrorId) {
        const el = document.querySelector(`[data-question-id="${firstErrorId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = el?.querySelector<HTMLElement>("input, textarea, [tabindex]");
        focusable?.focus();
      }
      return;
    }
    setErrors({});
    submitMut.mutate();
  }

  const totalQuestions = data?.questions.length ?? 0;
  const answeredCount = data?.questions.filter(q => !isAnswerEmpty(answers[q.id])).length ?? 0;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const requiredMissing = data?.questions.filter(q => q.required && isAnswerEmpty(answers[q.id])).length ?? 0;

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
              <h2 className="text-xl font-bold mb-2 text-heading">
                Questionnaire déjà soumis
              </h2>
              <p className="text-muted-foreground text-sm">
                Vous avez déjà rempli ce questionnaire. Votre naturopathe a bien reçu vos réponses.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h2 className="text-xl font-bold mb-2">Lien invalide</h2>
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
          <h2 className="text-2xl font-bold mb-3 text-heading">
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
    <PublicShell
      progressBar={
        <div
          className="sticky top-0 z-20 backdrop-blur bg-background/95 py-2 px-4 border-b border-border"
          data-testid="anamnese-progress"
        >
          <div className="max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {answeredCount} / {totalQuestions} questions
              </span>
              <span className="text-xs font-semibold text-primary">{progressPercent}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary motion-safe:transition-all"
                style={{ width: progressPercent + "%" }}
              />
            </div>
          </div>
        </div>
      }
    >
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2 text-heading">{data.name}</h1>
          {data.description && (
            <p className="text-muted-foreground text-sm">{data.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
            Vos réponses seront transmises directement à votre praticienne, en toute confidentialité.
            Les champs marqués d'un <span className="text-destructive font-bold">*</span> sont obligatoires.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {data.questions.map((q, idx) => (
            <div
              key={q.id}
              data-question-id={q.id}
              className={`border rounded-lg p-4 ${errors[q.id] ? "border-destructive" : PASTELS[idx % PASTELS.length]}`}
            >
              <QuestionField
                question={q}
                index={idx}
                value={answers[q.id]}
                onChange={val => setAnswer(q.id, val)}
                onToggleMulti={opt => toggleMulti(q.id, opt)}
                error={errors[q.id]}
              />
            </div>
          ))}

          {submitMut.isError && (
            <p className="text-sm text-destructive">
              {(submitMut.error as Error)?.message ?? "Une erreur est survenue."}
            </p>
          )}

          {requiredMissing > 0 ? (
            <p className="text-sm text-amber-700 font-semibold" data-testid="text-required-missing">
              Il reste {requiredMissing} question{requiredMissing > 1 ? "s" : ""} obligatoire{requiredMissing > 1 ? "s" : ""} à remplir
            </p>
          ) : (
            <p className="text-sm text-primary font-semibold" data-testid="text-required-missing">
              <CheckCircle2 className="inline-block h-4 w-4 align-[-3px] mr-1.5" aria-hidden="true" />Toutes les questions obligatoires sont remplies
            </p>
          )}

          <Button
            type="submit"
            disabled={submitMut.isPending}
            className="w-full rounded-lg py-5 font-bold text-base"
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

function PublicShell({ children, progressBar }: { children: React.ReactNode; progressBar?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "#186749" }}>
          <span className="text-white font-bold text-sm">N</span>
        </div>
        <span className="font-bold text-sm text-heading">Naturo Pro</span>
      </header>
      {/* Le header ci-dessus n'est PAS sticky (comportement d'origine conservé) :
          il scrolle normalement avec la page. La barre de progression, elle,
          est sticky top-0 et se retrouve donc seule fixée en haut lors du
          scroll — aucune superposition avec le header n'est possible. */}
      {progressBar}
      <main>{children}</main>
    </div>
  );
}

// ─── Champ de question ────────────────────────────────────────────────────────

function QuestionField({ question, index, value, onChange, onToggleMulti, error }: {
  question: Question;
  index: number;
  value: AnswerValue | undefined;
  onChange: (val: AnswerValue) => void;
  onToggleMulti: (opt: string) => void;
  error?: string;
}) {
  const labelEl = (
    <Label className="text-sm font-semibold text-foreground block mb-2">
      {index + 1}. {question.label}
      {question.required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );

  const errorId = `err-${question.id}`;
  const errorEl = error ? (
    <p id={errorId} className="text-sm text-destructive font-semibold mt-1">
      {error}
    </p>
  ) : null;

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
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
          {errorEl}
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
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
          {errorEl}
        </div>
      );

    case "choice":
      return (
        <div>
          {labelEl}
          <div className="space-y-2">
            {(question.options ?? []).map(opt => (
              <label
                key={opt}
                className="flex items-center gap-2 cursor-pointer min-h-11 py-2 px-1 -mx-1 rounded-md hover:bg-black/5"
              >
                <input
                  type="radio"
                  name={question.id}
                  value={opt}
                  checked={(value as string) === opt}
                  onChange={() => onChange(opt)}
                  className="accent-primary h-5 w-5 shrink-0"
                  data-testid={`radio-${question.id}-${opt}`}
                  aria-invalid={!!error}
                  aria-describedby={error ? errorId : undefined}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
            {(question.options ?? []).length === 0 && (
              <Input
                value={(value as string) ?? ""}
                onChange={e => onChange(e.target.value)}
                placeholder="Votre réponse…"
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
              />
            )}
          </div>
          {errorEl}
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
                <label
                  key={opt}
                  className="flex items-center gap-2 cursor-pointer min-h-11 py-2 px-1 -mx-1 rounded-md hover:bg-black/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleMulti(opt)}
                    className="accent-primary h-5 w-5 shrink-0"
                    data-testid={`checkbox-${question.id}-${opt}`}
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              );
            })}
          </div>
          {errorEl}
        </div>
      );

    case "scale":
      return (
        <div>
          {labelEl}
          <div className="flex items-center gap-3 min-h-11">
            <span className="text-xs text-muted-foreground w-6 text-center">1</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={(value as number) ?? 5}
              onChange={e => onChange(Number(e.target.value))}
              className="flex-1 accent-primary h-6"
              data-testid={`range-${question.id}`}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
            />
            <span className="text-xs text-muted-foreground w-6 text-center">10</span>
            <span className="font-bold text-primary w-8 text-center text-sm">
              {(value as number) ?? 5}
            </span>
          </div>
          {errorEl}
        </div>
      );

    default:
      return null;
  }
}
