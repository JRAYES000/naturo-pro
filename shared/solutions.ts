/**
 * shared/solutions.ts — bibliothèque de référence : catégories, précautions
 * structurées et rapprochement avec le profil d'une cliente.
 *
 * Précautions = drapeaux par critère (grossesse, anticoagulants…) à deux niveaux :
 * « ci » (contre-indiqué, à éviter) ou « prudence » (avis, dose, surveillance).
 * Un critère absent veut dire « rien de signalé », jamais « sans risque » : l'UI le
 * dit en clair. Le texte libre `contraindications` reste la référence détaillée.
 *
 * Les traitements de la cliente sont du texte libre (saisie aidée par la BDPM) :
 * on y cherche substances et noms commerciaux courants par classe. Repérage
 * informatif, jamais exhaustif ni un avis médical.
 */

export const SOLUTION_CATEGORIES = [
  "Plante",
  "Huile essentielle",
  "Complément",
  "Fleur de Bach",
  "Bourgeon",
  "Hydrolat",
  "Oligo-élément",
] as const;

export const SOLUTION_CATEGORY_PLURALS: Record<string, string> = {
  "Plante": "Plantes",
  "Huile essentielle": "Huiles essentielles",
  "Complément": "Compléments",
  "Fleur de Bach": "Fleurs de Bach",
  "Bourgeon": "Bourgeons",
  "Hydrolat": "Hydrolats",
  "Oligo-élément": "Oligo-éléments",
};

export const SAFETY_CRITERIA = [
  { key: "grossesse", label: "Grossesse", kind: "profil" },
  { key: "allaitement", label: "Allaitement", kind: "profil" },
  { key: "enfant", label: "Enfant", kind: "profil" },
  { key: "epilepsie", label: "Épilepsie", kind: "profil" },
  { key: "anticoagulant", label: "Anticoagulants", kind: "traitement" },
  { key: "antidepresseur", label: "Antidépresseurs", kind: "traitement" },
  { key: "sedatif", label: "Somnifères, anxiolytiques", kind: "traitement" },
  { key: "antidiabetique", label: "Diabète", kind: "traitement" },
  { key: "cardio", label: "Tension, cœur", kind: "traitement" },
  { key: "hormonal", label: "Hormones, contraception", kind: "traitement" },
  { key: "thyroide", label: "Thyroïde", kind: "traitement" },
] as const;

export type SafetyKey = (typeof SAFETY_CRITERIA)[number]["key"];
export type SafetyLevel = "ci" | "prudence";
export type Safety = Partial<Record<SafetyKey, SafetyLevel>>;

export const SAFETY_KEYS = SAFETY_CRITERIA.map((c) => c.key) as SafetyKey[];
export const SAFETY_LABELS = Object.fromEntries(SAFETY_CRITERIA.map((c) => [c.key, c.label])) as Record<SafetyKey, string>;
export const SAFETY_LEVEL_LABELS: Record<SafetyLevel, string> = { ci: "Contre-indiqué", prudence: "Prudence" };

export function normalizeText(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Lecture tolérante de la colonne JSON `safety` (clés et niveaux inconnus ignorés). */
export function parseSafety(raw: string | null | undefined): Safety {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out: Safety = {};
    if (obj && typeof obj === "object") {
      for (const k of SAFETY_KEYS) if (obj[k] === "ci" || obj[k] === "prudence") out[k] = obj[k];
    }
    return out;
  } catch {
    return {};
  }
}

/** Sérialisation stable (ordre des critères), null si rien de signalé. */
export function serializeSafety(s: Safety | null | undefined): string | null {
  if (!s) return null;
  const out: Safety = {};
  for (const k of SAFETY_KEYS) if (s[k] === "ci" || s[k] === "prudence") out[k] = s[k];
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [];
  } catch {
    return [];
  }
}

export function serializeList(list: string[] | null | undefined): string | null {
  const clean = Array.from(new Set((list || []).map((x) => x.trim()).filter(Boolean)));
  return clean.length ? JSON.stringify(clean) : null;
}

// ── Balisage semi-automatique depuis le texte des précautions ───────────────
// Sert au catalogue de base (corrigé à la main via des surcharges, cf.
// server/solutions-enrich.ts) et au brouillon IA. Une phrase qui cite le critère
// avec un mot d'exclusion = « ci », sinon « prudence ».

const CRITERIA_PATTERNS: Record<SafetyKey, RegExp> = {
  grossesse: /grossesse|enceinte|trimestre/,
  allaitement: /allait/,
  enfant: /enfant|bebe|nourrisson|moins de \d+ ans|< ?\d+ ans/,
  epilepsie: /epilep|convuls/,
  anticoagulant: /anticoagul|antiagreg|anti-agreg|fluidifiant|\bavk\b|vitamine k|warfarine|saignement|hemorrag/,
  antidepresseur: /antidepress|\bisrs\b|serotonin/,
  sedatif: /sedatif|somnifer|anxiolyt|benzodiaz|hypnoti/,
  antidiabetique: /diabet|hypoglyc|insuline|glycemi/,
  cardio: /hypertension|tension arterielle|cardiaque|cardio|digitali|hypotens|beta-?bloq|antihypert/,
  hormonal: /contracepti|pilule|hormon|oestrog|estrog/,
  thyroide: /thyro/,
};

const EXCLUSION = /contre-indiqu|interdit|eviter|deconseill|proscri|jamais|pas de |pas chez|pas sous|ne pas/;

export function deriveSafety(text: string | null | undefined): Safety {
  const out: Safety = {};
  const clauses = normalizeText(text).split(/[.;]\s*/);
  for (const clause of clauses) {
    if (!clause) continue;
    const level: SafetyLevel = EXCLUSION.test(clause) ? "ci" : "prudence";
    for (const k of SAFETY_KEYS) {
      if (!CRITERIA_PATTERNS[k].test(clause)) continue;
      if (out[k] !== "ci") out[k] = level;
    }
  }
  return out;
}

// ── Traitements de la cliente → critères ────────────────────────────────────
// Substances (DCI) et noms commerciaux courants, en minuscules sans accents.

const TREATMENT_KEYWORDS: Partial<Record<SafetyKey, string[]>> = {
  anticoagulant: [
    "warfarine", "coumadine", "fluindione", "previscan", "acenocoumarol", "sintrom", "apixaban", "eliquis",
    "rivaroxaban", "xarelto", "dabigatran", "pradaxa", "edoxaban", "lixiana", "heparine", "lovenox", "enoxaparine",
    "innohep", "tinzaparine", "fragmine", "dalteparine", "kardegic", "resitune", "aspirine", "acetylsalicylique",
    "clopidogrel", "plavix", "ticagrelor", "brilique", "prasugrel", "efient", "anticoagulant",
  ],
  antidepresseur: [
    "sertraline", "zoloft", "fluoxetine", "prozac", "paroxetine", "deroxat", "escitalopram", "seroplex", "citalopram",
    "seropram", "venlafaxine", "effexor", "duloxetine", "cymbalta", "mirtazapine", "norset", "amitriptyline",
    "laroxyl", "clomipramine", "anafranil", "agomelatine", "valdoxan", "vortioxetine", "brintellix", "fluvoxamine",
    "floxyfral", "milnacipran", "ixel", "lithium", "teralithe", "antidepresseur",
  ],
  sedatif: [
    "alprazolam", "xanax", "bromazepam", "lexomil", "diazepam", "valium", "oxazepam", "seresta", "lorazepam",
    "temesta", "prazepam", "lysanxia", "clorazepate", "tranxene", "zolpidem", "stilnox", "zopiclone", "imovane",
    "hydroxyzine", "atarax", "clonazepam", "rivotril", "lormetazepam", "noctamide", "loprazolam", "havlane",
    "etifoxine", "stresam", "somnifere", "anxiolytique",
  ],
  antidiabetique: [
    "metformine", "glucophage", "stagid", "insuline", "gliclazide", "diamicron", "glimepiride", "amarel",
    "sitagliptine", "januvia", "xelevia", "janumet", "semaglutide", "ozempic", "rybelsus", "dulaglutide",
    "trulicity", "liraglutide", "victoza", "empagliflozine", "jardiance", "dapagliflozine", "forxiga", "antidiabetique",
  ],
  cardio: [
    "amlodipine", "amlor", "ramipril", "triatec", "perindopril", "coversyl", "enalapril", "renitec", "lisinopril",
    "losartan", "cozaar", "valsartan", "tareg", "irbesartan", "aprovel", "candesartan", "atacand", "olmesartan",
    "telmisartan", "micardis", "bisoprolol", "cardensiel", "detensiel", "nebivolol", "temerit", "atenolol",
    "tenormine", "metoprolol", "propranolol", "avlocardyl", "hydrochlorothiazide", "esidrex", "indapamide", "fludex",
    "furosemide", "lasilix", "spironolactone", "aldactone", "digoxine", "amiodarone", "cordarone", "nicardipine",
    "loxen", "diltiazem", "tildiem", "verapamil", "isoptine", "antihypertenseur",
  ],
  hormonal: [
    "pilule", "contraceptif", "contraception", "levonorgestrel", "desogestrel", "optimizette", "leeloo", "minidril",
    "jasmine", "drospirenone", "ethinylestradiol", "estradiol", "provames", "oestrogel", "utrogestan", "progesterone",
    "dienogest", "visanne", "tamoxifene", "letrozole", "femara", "anastrozole", "arimidex", "implanon", "nexplanon",
    "nuvaring", "mirena", "hormonotherapie", "traitement hormonal",
  ],
  thyroide: [
    "levothyrox", "levothyroxine", "l-thyroxine", "thyroxine", "euthyral", "tcaps", "neomercazole", "carbimazole",
    "thiamazole", "thyrozol", "propylthiouracile",
  ],
  epilepsie: [
    "valproate", "depakine", "depakote", "levetiracetam", "keppra", "lamotrigine", "lamictal", "carbamazepine",
    "tegretol", "oxcarbazepine", "trileptal", "topiramate", "epitomax", "lacosamide", "vimpat", "phenytoine",
    "di-hydan", "gabapentine", "neurontin", "pregabaline", "lyrica", "antiepileptique",
  ],
};

export interface DetectedRisk {
  key: SafetyKey;
  /** Ce qui a déclenché le repérage (mot du traitement, âge…), pour l'afficher. */
  reasons: string[];
}

function containsWord(haystack: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}`).test(haystack);
}

/** Âge en années révolues depuis une date « AAAA-MM-JJ », null si illisible. */
export function ageFromBirthDate(dateOfBirth: string | null | undefined, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth || "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

export const CHILD_AGE_LIMIT = 12;

/**
 * Critères qui concernent une cliente : classes de traitements repérées dans
 * `currentTreatments`, épilepsie citée dans les antécédents, enfant (< 12 ans).
 */
export function detectClientRisks(
  client: { currentTreatments?: string | null; antecedents?: string | null; dateOfBirth?: string | null },
  now: Date = new Date(),
): DetectedRisk[] {
  const out = new Map<SafetyKey, Set<string>>();
  const add = (k: SafetyKey, reason: string) => {
    if (!out.has(k)) out.set(k, new Set());
    out.get(k)!.add(reason);
  };
  const treatments = normalizeText(client.currentTreatments);
  if (treatments) {
    for (const [k, words] of Object.entries(TREATMENT_KEYWORDS) as [SafetyKey, string[]][]) {
      for (const w of words) if (containsWord(treatments, w)) add(k, w);
    }
  }
  if (/epilep/.test(normalizeText(client.antecedents))) add("epilepsie", "antécédents");
  const age = ageFromBirthDate(client.dateOfBirth, now);
  if (age !== null && age < CHILD_AGE_LIMIT) add("enfant", `${age} ans`);
  return SAFETY_KEYS.filter((k) => out.has(k)).map((k) => ({ key: k, reasons: Array.from(out.get(k)!) }));
}

export interface SafetyAlert {
  key: SafetyKey;
  level: SafetyLevel;
}

/** Croisement fiche × critères : ce qui doit alerter, contre-indications d'abord. */
export function safetyAlerts(safety: Safety, keys: readonly SafetyKey[]): SafetyAlert[] {
  const alerts = keys.filter((k) => safety[k]).map((k) => ({ key: k, level: safety[k]! }));
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "ci" ? -1 : 1));
}

/**
 * Fiches citées dans le texte d'un programme : le nom (sans parenthèse, ex.
 * « Lavande vraie (HE) » → « lavande vraie ») apparaît dans un conseil.
 */
export function solutionsMentioned<T extends { name: string }>(items: string[], solutions: T[]): T[] {
  const text = items.map(normalizeText).join(" \n ");
  if (!text.trim()) return [];
  const baseOf = (s: T) => normalizeText(s.name.replace(/\s*\([^)]*\)\s*/g, " "));
  const matched = solutions.filter((s) => {
    const base = baseOf(s);
    return text.includes(normalizeText(s.name)) || (base.length >= 4 && containsWord(text, base));
  });
  const bases = matched.map(baseOf);
  // Nom court (« Romarin ») ignoré quand une fiche plus précise qui le contient
  // (« Romarin à cinéole (HE) ») est aussi citée.
  return matched.filter((s) => {
    const base = baseOf(s);
    return !bases.some((b) => b !== base && b.includes(base));
  });
}
