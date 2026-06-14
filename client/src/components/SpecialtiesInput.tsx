import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Champ de saisie de spécialités sous forme de "chips" (tags).
 *
 * Remplace l'ancien <Input> à virgules qui était cassé : taper une virgule
 * déclenchait un split + filter(Boolean) qui effaçait la virgule à chaque frappe,
 * rendant impossible la saisie de plusieurs spécialités.
 *
 * Ici : on tape un libellé puis Entrée / virgule / point-virgule pour valider le
 * tag. Backspace sur champ vide retire le dernier tag. Les doublons (insensibles
 * à la casse) sont ignorés. La valeur reste un string[] — aucun changement backend.
 */
export function SpecialtiesInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Tapez une spécialité puis Entrée…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    // Pas de doublon (insensible à la casse)
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, t]);
    setInput("");
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  // Suggestions non encore sélectionnées
  const remaining = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 min-h-[44px] focus-within:ring-2 focus-within:ring-ring"
        data-testid="chips-specialties"
      >
        {value.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1 bg-secondary text-primary text-sm font-bold px-2.5 py-1 rounded-full"
            data-testid={`chip-specialty-${idx}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="hover:text-destructive"
              aria-label={`Retirer ${tag}`}
              data-testid={`button-remove-specialty-${idx}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[140px] bg-transparent outline-none text-sm py-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => addTag(input)}
          placeholder={value.length === 0 ? placeholder : ""}
          data-testid="input-specialties"
        />
      </div>

      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="text-xs font-medium px-2.5 py-1 rounded-full border border-input text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
              data-testid={`suggestion-specialty-${s}`}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
