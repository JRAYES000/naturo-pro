/**
 * server/notes-import.ts — import d'anciennes notes de consultation par IA (lot 3b,
 * parité naturooo).
 *
 * La praticienne colle ses notes (ou dépose un .txt / un PDF texte) : le modèle les
 * découpe en consultations datées et range le contenu dans les rubriques du
 * compte-rendu (motif, anamnèse, bilan, conseils alimentaires, hygiène de vie,
 * suivi, notes libres), SANS rien inventer. Elle relit et corrige avant
 * l'enregistrement. Fonctions de préparation et de validation pures, testées.
 */
export const NOTES_IMPORT_MAX_CHARS = 40_000;

export const NOTE_FIELDS = ["motif", "anamnese", "bilan", "conseilsAlimentaires", "hygieneDeVie", "suivi", "notesLibres"] as const;
export type NoteField = typeof NOTE_FIELDS[number];

export type ImportedConsultation = { date: string | null } & Record<NoteField, string>;

export function buildNotesImportMessages(text: string, clientName: string, today: string): Array<{ role: string; content: string }> {
  const system = [
    "Tu aides une praticienne en naturopathie à reprendre ses anciennes notes de consultation dans son logiciel.",
    "Découpe le texte en consultations (une par date ou par séance identifiable) et range fidèlement chaque passage",
    "dans la bonne rubrique. Règles strictes :",
    "- N'invente rien, ne complète rien, ne reformule pas le sens : recopie ou résume au plus près du texte source.",
    "- Une rubrique sans contenu reste une chaîne vide.",
    "- Date au format AAAA-MM-JJ si elle figure dans le texte (année la plus plausible, jamais après " + today + "), sinon null.",
    "- Ce qui ne rentre dans aucune rubrique va dans notesLibres.",
    'Réponds UNIQUEMENT en JSON : {"consultations":[{"date":"AAAA-MM-JJ"|null,"motif":"","anamnese":"","bilan":"",',
    '"conseilsAlimentaires":"","hygieneDeVie":"","suivi":"","notesLibres":""}]}',
  ].join("\n");
  const user = `Notes concernant ${clientName || "la cliente"} :\n\n${text.slice(0, NOTES_IMPORT_MAX_CHARS)}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Valide la réponse du modèle : JSON tolérant (balises ```), rubriques bornées, dates plausibles. */
export function parseImportedConsultations(raw: string, today: string): ImportedConsultation[] {
  let txt = String(raw || "").trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) txt = fence[1].trim();
  let data: any;
  try {
    data = JSON.parse(txt);
  } catch {
    const start = txt.indexOf("{"), end = txt.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try { data = JSON.parse(txt.slice(start, end + 1)); } catch { return []; }
  }
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.consultations) ? data.consultations : [];
  const out: ImportedConsultation[] = [];
  for (const item of list.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const c = { date: null } as ImportedConsultation;
    for (const f of NOTE_FIELDS) c[f] = typeof item[f] === "string" ? item[f].trim().slice(0, 10_000) : "";
    const d = typeof item.date === "string" ? item.date.trim() : "";
    c.date = /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= "1990-01-01" && d <= today && !Number.isNaN(Date.parse(d)) ? d : null;
    if (NOTE_FIELDS.some((f) => c[f])) out.push(c);
  }
  return out;
}
