/** Extraction de texte des supports de cours. unpdf est ESM-only → import() dynamique. */
export async function extractText(buffer: Buffer, mimeType: string | null, filename: string): Promise<string> {
  const isPdf = (mimeType && mimeType.includes("pdf")) || filename.toLowerCase().endsWith(".pdf");
  if (!isPdf) return buffer.toString("utf-8"); // .txt / .md
  const { getDocumentProxy, extractText: extractPdf } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractPdf(pdf, { mergePages: true });
  const out = (text || "").trim();
  if (!out) throw new Error("PDF sans texte extractible (scanné ?)");
  return out;
}
