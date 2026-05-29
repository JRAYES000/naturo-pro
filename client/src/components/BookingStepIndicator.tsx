import { Check } from "lucide-react";

const STEPS = [
  { label: "Prestation" },
  { label: "Date" },
  { label: "Créneau" },
  { label: "Coordonnées" },
];

interface BookingStepIndicatorProps {
  currentStep: number; // 1-4
}

export function BookingStepIndicator({ currentStep }: BookingStepIndicatorProps) {
  return (
    <nav aria-label="Progression de réservation" className="mb-8">
      {/* Mobile: thin bar progress */}
      <div className="sm:hidden flex items-center gap-1.5 mb-3">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i + 1 <= currentStep ? "bg-primary" : "bg-secondary"
            }`}
          />
        ))}
      </div>
      <p className="sm:hidden text-xs text-muted-foreground text-center mb-1" data-testid="text-step-mobile">
        Étape {currentStep} sur {STEPS.length} — <span className="font-bold text-primary">{STEPS[currentStep - 1]?.label}</span>
      </p>

      {/* Desktop: pill steps */}
      <ol className="hidden sm:flex items-center gap-0" data-testid="step-indicator-desktop">
        {STEPS.map((step, i) => {
          const idx = i + 1;
          const done = idx < currentStep;
          const active = idx === currentStep;
          const upcoming = idx > currentStep;
          return (
            <li key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    done
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : active
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-md"
                      : "bg-secondary text-muted-foreground"
                  }`}
                  data-testid={`step-circle-${idx}`}
                >
                  {done ? <Check className="h-4 w-4" /> : idx}
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap transition-colors duration-200 ${
                    active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 mx-2 mb-5 transition-all duration-300 ${
                    idx < currentStep ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
