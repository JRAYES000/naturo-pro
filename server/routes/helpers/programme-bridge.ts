/**
 * server/routes/helpers/programme-bridge.ts — pont Naturobot → Programme (Lot 1, action 10)
 *
 * Transforme la dernière réponse de Naturobot en sections de Programme
 * (le format attendu par server/routes/programmes.ts : [{section, items}]).
 *
 * Heuristique de découpe, dans l'ordre :
 *   1. Titres markdown (## / ###) ou lignes **en gras seules** → une section chacun.
 *   2. À l'intérieur d'une section, les puces (-, *, •, 1.) deviennent les items ;
 *      les paragraphes sans puce deviennent chacun un item.
 *   3. Sans aucun titre : une section unique « Programme » avec les puces/paragraphes.
 *
 * Fonction pure — testée dans programme-bridge.test.ts sans DB ni IA.
 */

export type ProgramSection = { section: string; items: string[] };

const HEADING_RE = /^(?:#{2,4}\s+(.+?)\s*#*\s*$|\*\*([^*]+)\*\*\s*:?\s*$)/;
const BULLET_RE = /^\s*(?:[-*•–]|\d+[.)])\s+(.*)$/;

/** Retire les marqueurs markdown résiduels d'une ligne (gras, italique). */
function cleanInline(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").trim();
}

export function programmeFromMarkdown(markdown: string): ProgramSection[] {
  const lines = (markdown || "").split(/\r?\n/);
  const sections: ProgramSection[] = [];
  let current: ProgramSection | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = cleanInline(paragraph.join(" "));
    paragraph = [];
    if (!text) return;
    if (!current) current = openSection("Programme");
    current.items.push(text);
  };
  const openSection = (title: string): ProgramSection => {
    const s = { section: cleanInline(title), items: [] as string[] };
    sections.push(s);
    return s;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(HEADING_RE);
    if (heading) {
      flushParagraph();
      current = openSection(heading[1] ?? heading[2] ?? "Section");
      continue;
    }
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      flushParagraph();
      const item = cleanInline(bullet[1]);
      if (item) {
        if (!current) current = openSection("Programme");
        current.items.push(item);
      }
      continue;
    }
    if (!line.trim()) { flushParagraph(); continue; }
    paragraph.push(line.trim());
  }
  flushParagraph();

  // Sections vides (titre sans contenu) retirées — un PDF n'affiche rien d'utile pour elles.
  return sections.filter((s) => s.items.length > 0);
}
