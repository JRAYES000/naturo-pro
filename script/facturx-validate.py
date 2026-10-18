"""Validation des Factur-X produits par l'application.

Pour chaque PDF listé dans <dossier>/manifest.json (écrit par script/facturx-samples.ts) :
  1. XML embarqué extrait et validé contre le XSD Factur-X EN 16931 ;
  2. schématron Factur-X EN 16931 (règles EN 16931 + Factur-X) ;
  3. schématron français BR-FR « flux 2 » pour les factures B2B (échange entre
     plateformes agréées) ;
  4. structure PDF/A-3b : XMP pdfaid + extension Factur-X, OutputIntent, pièce
     jointe /AF avec AFRelationship, polices incorporées.

Les XSD et schématrons sont ceux livrés par la bibliothèque factur-x (Akretion),
exécutés avec Saxon (saxonche). Sortie non nulle au moindre écart.

Usage : python -I script/facturx-validate.py <dossier>
Dépendances : pip install factur-x==7.7 saxonche==13.1.0 pikepdf==10.17.0 lxml
"""
import io
import json
import os
import re
import sys
import importlib.resources as ir

import facturx
import pikepdf
from lxml import etree
from saxonche import PySaxonProcessor

SVRL = "{http://purl.oclc.org/dsdl/svrl}"
XSL_DIR = str(ir.files("facturx").joinpath("xsd_and_schematron"))
XSL_EN16931 = os.path.join(XSL_DIR, facturx.facturx.FACTURX_LEVEL2schematron["en16931"])
XSL_BR_FR = os.path.join(XSL_DIR, facturx.facturx.CII_FR_CTC_schematron)


def schematron(proc, xsl, xml_path):
    xp = proc.new_xslt30_processor()
    xp.set_cwd(os.path.dirname(xsl))
    out = xp.compile_stylesheet(stylesheet_file=xsl).transform_to_string(source_file=xml_path)
    root = etree.fromstring(out.encode("utf-8"))
    found = []
    for node in root.iter(SVRL + "failed-assert", SVRL + "successful-report"):
        flag = (node.get("flag") or node.get("role") or "error").lower()
        text = node.find(SVRL + "text")
        msg = " ".join("".join(text.itertext()).split()) if text is not None else ""
        found.append((flag, node.get("id") or "", msg))
    return found


def pdfa_problems(path):
    problems = []
    raw = open(path, "rb").read()
    head = raw[:32].split(b"\n")
    if not head[0].startswith(b"%PDF-1."):
        problems.append("en-tête PDF absent")
    if len(head) < 2 or not head[1].startswith(b"%") or sum(1 for b in head[1][1:5] if b > 127) < 4:
        problems.append("commentaire binaire absent après l'en-tête")
    pdf = pikepdf.open(path)
    root = pdf.Root
    if "/ID" not in pdf.trailer:
        problems.append("trailer sans /ID")
    intents = root.get("/OutputIntents")
    if not intents or not any(i.get("/S") == "/GTS_PDFA1" and "/DestOutputProfile" in i for i in intents):
        problems.append("OutputIntent GTS_PDFA1 absent")
    meta = root.get("/Metadata")
    if meta is None:
        problems.append("métadonnées XMP absentes")
    else:
        if meta.get("/Filter") is not None:
            problems.append("XMP compressé")
        xmp = meta.read_bytes().decode("utf-8", "replace")
        for needle in ("<pdfaid:part>3</pdfaid:part>", "<pdfaid:conformance>B</pdfaid:conformance>",
                       "<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>",
                       "<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>",
                       "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"):
            if needle not in xmp:
                problems.append(f"XMP : {needle} manquant")
    af = root.get("/AF")
    if not af or not any(str(f.get("/AFRelationship")) in ("/Data", "/Alternative", "/Source") for f in af):
        problems.append("pièce jointe /AF sans AFRelationship valide")
    seen = set()
    for page in pdf.pages:
        for _, font in page.obj.get("/Resources", {}).get("/Font", {}).items():
            if font.objgen in seen:
                continue
            seen.add(font.objgen)
            desc = font.get("/FontDescriptor")
            if desc is None and "/DescendantFonts" in font:
                desc = font.DescendantFonts[0].get("/FontDescriptor")
            if desc is None or not any(k in desc for k in ("/FontFile", "/FontFile2", "/FontFile3")):
                problems.append(f"police non incorporée : {font.get('/BaseFont')}")
    return problems


def main():
    folder = sys.argv[1]
    manifest = json.load(open(os.path.join(folder, "manifest.json"), encoding="utf-8"))
    errors = 0
    with PySaxonProcessor(license=False) as proc:
        for entry in manifest:
            path = os.path.join(folder, entry["file"])
            print(f"== {entry['file']}")
            _, xml = facturx.get_xml_from_pdf(io.BytesIO(open(path, "rb").read()), check_xsd=False)
            xml_path = path + ".extrait.xml"
            open(xml_path, "wb").write(xml)
            try:
                facturx.xml_check_xsd(xml, flavor="factur-x", level="en16931")
                print("   [OK] XSD Factur-X EN 16931")
            except Exception as e:  # noqa: BLE001
                errors += 1
                print(f"   [KO] XSD : {e}")
            checks = [("schématron Factur-X EN 16931", XSL_EN16931)]
            if entry.get("b2b"):
                checks.append(("schématron BR-FR flux 2", XSL_BR_FR))
            for label, xsl in checks:
                found = schematron(proc, xsl, xml_path)
                fatal = [f for f in found if f[0] in ("fatal", "error")]
                errors += len(fatal)
                print(f"   [{'OK' if not fatal else 'KO'}] {label} : {len(fatal)} erreur(s), {len(found) - len(fatal)} avertissement(s)")
                for flag, rid, msg in found:
                    print(f"        - {flag} {rid} {msg[:240]}")
            problems = pdfa_problems(path)
            errors += len(problems)
            print(f"   [{'OK' if not problems else 'KO'}] structure PDF/A-3b")
            for p in problems:
                print(f"        - {p}")
    print("RÉSULTAT :", "VALIDE" if errors == 0 else f"{errors} écart(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
