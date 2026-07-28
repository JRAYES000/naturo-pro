/**
 * Campagne de tests fonctionnels Naturo Pro.
 * Crée une praticienne neuve et exerce le produit comme un vrai utilisateur.
 * Aucune donnée existante n'est touchée ; le compte de test est supprimé à la fin.
 */
const B = process.env.BASE || "http://localhost:3000";

let cookie = "";
const resultats = [];
let sectionCourante = "";

const section = (t) => { sectionCourante = t; console.log(`\n\x1b[1m── ${t}\x1b[0m`); };
function note(ok, label, detail = "") {
  resultats.push({ section: sectionCourante, ok, label, detail });
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? "  \x1b[2m" + detail + "\x1b[0m" : ""}`);
}

async function api(method, path, body, opts = {}) {
  const h = { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) };
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const sc = r.headers.get("set-cookie");
  if (sc && !opts.noCookie) cookie = sc.split(";")[0];
  const ct = r.headers.get("content-type") || "";
  let data = null;
  if (ct.includes("json")) data = await r.json().catch(() => null);
  else if (opts.binary) data = Buffer.from(await r.arrayBuffer());
  else data = await r.text().catch(() => null);
  return { status: r.status, data, headers: r.headers };
}

const tag = Date.now();
const EMAIL = `e2e-${tag}@example.invalid`;
const MDP = "MotDePasse123";
let userId, catId, clientId, apptId, invoiceId, tplId, anamneseToken, progId, packId, docId;

// ─────────────────────────────────────────────────────────────────────────────
section("Inscription et authentification");
{
  const r = await api("POST", "/api/auth/register", { email: EMAIL, password: MDP, name: "Camille Durand" });
  note(r.status === 200 && !!r.data?.user, "inscription", `slug=${r.data?.user?.slug}`);
  userId = r.data?.user?.id;
  note(r.data?.user?.plan === "trial" && r.data?.user?.daysUntilTrialEnds === 30, "essai de 30 jours initialisé");
  note(!("passwordHash" in (r.data?.user || {})) && !("resendApiKey" in (r.data?.user || {})), "aucun secret dans la réponse");

  const cats = await api("GET", "/api/categories");
  note(cats.data?.length === 3, "3 prestations pré-remplies", `${cats.data?.length}`);

  const dup = await api("POST", "/api/auth/register", { email: EMAIL, password: MDP, name: "Doublon" }, { noCookie: true });
  note(dup.status === 409, "email déjà pris refusé");

  const faible = await api("POST", "/api/auth/register", { email: `x${tag}@example.invalid`, password: "123", name: "X" }, { noCookie: true });
  note(faible.status === 400, "mot de passe trop court refusé");

  const bad = await api("POST", "/api/auth/login", { email: EMAIL, password: "mauvais" }, { noCookie: true });
  note(bad.status === 401, "mauvais mot de passe refusé");

  const ok = await api("POST", "/api/auth/login", { email: EMAIL, password: MDP });
  note(ok.status === 200, "connexion");

  const me = await api("GET", "/api/auth/me");
  note(me.status === 200 && me.data?.user?.email === EMAIL, "session active");

  const anon = await fetch(B + "/api/clients");
  note(anon.status === 401, "accès sans session refusé");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Assistant de configuration (onboarding)");
{
  // Contrat CLIENT ↔ SERVEUR. onboardingSchema est `.strict()` : le moindre écart de
  // nom de champ fait échouer tout l'assistant en 400, sans rien enregistrer. C'est
  // arrivé en production — `specialties` en chaîne au lieu d'un tableau et une clé
  // `firstService` au lieu de `firstCategory`. Ce test rejoue la charge utile exacte
  // de client/src/pages/Onboarding.tsx.
  const av0 = await api("GET", "/api/availability");
  note(av0.data?.length === 10, "horaires par défaut pré-remplis à l'inscription", `${av0.data?.length} plages`);

  const r = await api("POST", "/api/auth/onboarding", {
    phone: "0612345678", city: "Lyon", address: "12 rue des Plantes",
    bio: "Naturopathe certifiée à Lyon",
    specialties: ["Stress", "Sommeil"],
    firstCategory: { name: "Consultation découverte", durationMinutes: 60, priceCents: 6000, color: "#17EC9B" },
  });
  note(r.status === 200, "assistant rempli accepté", r.status === 200 ? "" : JSON.stringify(r.data).slice(0, 120));

  const me = await api("GET", "/api/auth/me");
  note(me.data?.user?.bio === "Naturopathe certifiée à Lyon", "bio enregistrée");
  note(me.data?.user?.city === "Lyon", "ville enregistrée");
  note(me.data?.user?.onboardingCompleted === true, "assistant marqué terminé");
  const cats = await api("GET", "/api/categories");
  const nouvelle = (cats.data || []).find((c) => c.name === "Consultation découverte");
  note(!!nouvelle && nouvelle.color === "#17EC9B", "prestation créée avec la couleur choisie");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Profil, prestations et disponibilités");
{
  const p = await api("PATCH", "/api/profile", { bio: "Naturopathe à Lyon", city: "Lyon", phone: "0612345678" });
  note(p.status === 200 && p.data?.user?.bio === "Naturopathe à Lyon", "mise à jour du profil");

  const c = await api("POST", "/api/categories", { name: "Bilan complet", durationMinutes: 90, priceCents: 9000, color: "#186749" });
  note(c.status === 200 && c.data?.id, "création d'une prestation");
  catId = c.data?.id;

  const cm = await api("PATCH", `/api/categories/${catId}`, { priceCents: 9500 });
  note(cm.status === 200 && cm.data?.priceCents === 9500, "modification du tarif");

  const av = await api("PUT", "/api/availability", [
    { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 2, startTime: "14:00", endTime: "18:00" },
    { dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
  ]);
  note(av.status === 200, "enregistrement des disponibilités", `${av.data?.length ?? "?"} plages`);
  const avl = await api("GET", "/api/availability");
  note(avl.data?.length === 3, "relecture des disponibilités");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Clients");
{
  const c = await api("POST", "/api/clients", {
    firstName: "Sophie", lastName: "Martin", email: `sophie-${tag}@example.invalid`,
    phone: "0698765432", dateOfBirth: "1985-04-12", allergies: "Arachides",
    antecedents: "Migraines chroniques", lifestyleNotes: "Sédentaire",
  });
  note(c.status === 200 && c.data?.id, "création d'une fiche cliente");
  clientId = c.data?.id;

  const g = await api("GET", `/api/clients/${clientId}`);
  note(g.data?.allergies === "Arachides", "données de santé enregistrées");

  const s = await api("GET", "/api/clients?search=sophie");
  note(s.data?.length === 1, "recherche par prénom");
  const s2 = await api("GET", "/api/clients?search=SOPHIE");
  note(s2.data?.length === 1, "recherche insensible à la casse");
  const s3 = await api("GET", "/api/clients?search=zzzintrouvable");
  note(s3.data?.length === 0, "recherche sans résultat");

  const u = await api("PATCH", `/api/clients/${clientId}`, { phone: "0600000001" });
  note(u.status === 200 && u.data?.phone === "0600000001", "modification de la fiche");

  const doc = await api("POST", `/api/clients/${clientId}/documents`, {
    filename: "analyse-sanguine.pdf", mimeType: "application/pdf",
    dataBase64: Buffer.from("%PDF-1.4 faux document de test").toString("base64"),
  });
  note(doc.status === 201 && doc.data?.id, "upload d'un document");
  docId = doc.data?.id;
  note(!("dataBase64" in (doc.data || {})), "le contenu du document n'est pas renvoyé dans la liste");

  const dl = await api("GET", `/api/documents/${docId}/download`, null, { binary: true });
  note(dl.status === 200 && dl.data?.toString().includes("%PDF"), "téléchargement du document");

  const trop = await api("POST", `/api/clients/${clientId}/documents`, {
    filename: "gros.pdf", mimeType: "application/pdf", dataBase64: "A".repeat(7_000_001),
  });
  note(trop.status === 413, "fichier trop volumineux refusé");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Agenda");
{
  const mardiProchain = (() => {
    const d = new Date(Date.now() + 7 * 86400000);
    while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(8, 0, 0, 0); // 10h Paris l'été
    return d.getTime();
  })();

  const a = await api("POST", "/api/appointments", {
    clientId, categoryId: catId, startAt: mardiProchain, endAt: mardiProchain + 90 * 60000,
    status: "confirmed", location: "cabinet",
  });
  note(a.status === 200 && a.data?.id, "création d'un rendez-vous");
  apptId = a.data?.id;

  const l = await api("GET", "/api/appointments");
  note(Array.isArray(l.data) && l.data.some((x) => x.id === apptId), "le RDV apparaît dans l'agenda");

  const m = await api("PATCH", `/api/appointments/${apptId}`, { notesBefore: "Apporter le bilan" });
  note(m.status === 200 && m.data?.notesBefore === "Apporter le bilan", "modification du RDV");

  const n = await api("POST", `/api/appointments/${apptId}/note`, {
    motif: "Fatigue chronique", anamnese: "Sommeil perturbé", bilan: "Terrain déminéralisé",
    conseilsAlimentaires: "Réduire les sucres", hygieneDeVie: "Marche 30 min/j", suivi: "Revoir dans 3 semaines",
  });
  note(n.status === 200 && n.data?.id, "compte-rendu de consultation");
  const nl = await api("GET", `/api/appointments/${apptId}/note`);
  note(nl.data?.motif === "Fatigue chronique", "relecture du compte-rendu");

  const ics = await api("GET", `/api/appointments/${apptId}/ics`);
  note(ics.status === 200 && String(ics.data).includes("BEGIN:VCALENDAR"), "export .ics");

  const rec = await api("POST", "/api/appointments", {
    clientId, categoryId: catId, startAt: mardiProchain + 86400000, endAt: mardiProchain + 86400000 + 3600000,
    status: "confirmed", recurrence: "weekly", occurrences: 3,
  });
  note(rec.status === 200 && Array.isArray(rec.data) && rec.data.length === 3, "récurrence hebdomadaire ×3", `${rec.data?.length} créés`);
  for (const r of rec.data || []) await api("DELETE", `/api/appointments/${r.id}`);

  const autre = await api("GET", "/api/appointments/999999");
  note(autre.status === 404, "RDV d'un autre praticien inaccessible");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Page publique et réservation (parcours cliente)");
let slug, tokenGestion;
{
  const me = await api("GET", "/api/auth/me");
  slug = me.data.user.slug;

  const pub = await fetch(`${B}/api/public/${slug}`).then((r) => r.json());
  note(pub.naturo?.name === "Camille Durand", "page publique accessible sans compte");
  note(Array.isArray(pub.categories) && pub.categories.length >= 4, "prestations visibles", `${pub.categories?.length}`);
  note(!("email" in pub.naturo) && !("phone" in pub.naturo), "pas de données privées sur la page publique");

  const cat = pub.categories.find((c) => c.id === catId);
  const av = await fetch(`${B}/api/public/${slug}/availability?duration=${cat.durationMinutes}`).then((r) => r.json());
  const jours = Object.keys(av.slotsByDay || {}).sort();
  note(jours.length > 0, "créneaux proposés", `${jours.length} jours`);
  if (!jours.length) { console.log("  Arret : aucun creneau, la suite du parcours en depend."); process.exit(1); }

  const heures = jours.length ? av.slotsByDay[jours[0]].map((i) =>
    new Date(i).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })) : [];
  note(heures[0] === "09:00", "premier créneau à l'heure saisie (09:00 Paris)", heures[0]);
  note(jours.every((j) => [2, 4].includes(new Date(j + "T12:00:00Z").getUTCDay())), "uniquement les jours d'ouverture");

  const creneau = new Date(av.slotsByDay[jours[0]][0]).getTime();
  const resa = await fetch(`${B}/api/public/${slug}/book`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId: cat.id, startAt: creneau, firstName: "Léa", lastName: "Bernard",
      email: `lea-${tag}@example.invalid`, phone: "0611223344", notes: "Première consultation" }),
  });
  const rj = await resa.json();
  note(resa.status === 200 && rj.appointment?.id, "réservation par une cliente");

  const conflit = await fetch(`${B}/api/public/${slug}/book`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId: cat.id, startAt: creneau, firstName: "Autre", lastName: "Cliente",
      email: `autre-${tag}@example.invalid`, phone: "0611223355" }),
  });
  note(conflit.status === 409, "créneau déjà pris refusé");

  const proche = await fetch(`${B}/api/public/${slug}/book`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId: cat.id, startAt: Date.now() + 3600000, firstName: "Trop", lastName: "Tot",
      email: `t-${tag}@example.invalid`, phone: "0611223366" }),
  });
  note(proche.status === 400 || proche.status === 409, "réservation à moins de 2 h refusée");

  const mail = await fetch(`${B}/api/public/${slug}/book`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId: cat.id, startAt: creneau + 86400000 * 2, firstName: "Sans", lastName: "Mail",
      email: "pas-un-email", phone: "0611223377" }),
  });
  note(mail.status === 400, "email invalide refusé");

  const inconnu = await fetch(`${B}/api/public/slug-qui-nexiste-pas`);
  note(inconnu.status === 404, "praticien inexistant → 404");

  // Lien de gestion (annulation / report) — le token est généré par le rappel J-1
  await new Promise((r) => setTimeout(r, 1500)); // le token de gestion est posé en tache de fond par l email de confirmation
  const ap = await api("GET", "/api/appointments");
  const resaId = rj.appointment.id;
  const cancelTok = ap.data.find((x) => x.id === resaId)?.cancelToken;
  tokenGestion = cancelTok;
  if (tokenGestion) {
    const g = await fetch(`${B}/api/public/manage/${tokenGestion}`).then((r) => r.json());
    note(!!g.appointment, "consultation du RDV par lien public");
    note(g.canCancel === true && g.canReschedule === true, "annulation et report proposés");
  } else {
    note(false, "token de gestion présent sur le RDV", "absent — le lien n'est créé qu'au rappel J-1");
  }
  const faux = await fetch(`${B}/api/public/manage/token-bidon`);
  note(faux.status === 404, "lien de gestion invalide → 404");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Facturation");
{
  const f = await api("POST", "/api/invoices", {
    clientId, items: [
      { description: "Consultation de naturopathie", quantity: 1, unitPriceCents: 9500 },
      { description: "Complément alimentaire", quantity: 2, unitPriceCents: 1250 },
    ],
  });
  note(f.status === 201 && f.data?.number, "création d'une facture", f.data?.number);
  invoiceId = f.data?.id;
  note(f.data?.subtotalCents === 12000, "sous-total correct", `${f.data?.subtotalCents} c`);
  note(f.data?.totalCents === 12000, "total sans TVA (défaut)", `${f.data?.totalCents} c`);
  note(/^FACT-\d{4}-\d{4}$/.test(f.data?.number || ""), "format du numéro");

  const f2 = await api("POST", "/api/invoices", { clientId, items: [{ description: "Suivi", quantity: 1, unitPriceCents: 5000 }] });
  const n1 = parseInt((f.data?.number || "").split("-")[2], 10);
  const n2 = parseInt((f2.data?.number || "").split("-")[2], 10);
  note(n2 === n1 + 1, "numérotation séquentielle", `${f.data?.number} → ${f2.data?.number}`);

  const pdf = await api("GET", `/api/invoices/${invoiceId}/pdf`, null, { binary: true });
  note(pdf.status === 200 && pdf.data?.slice(0, 4).toString() === "%PDF", "génération du PDF", `${pdf.data?.length} o`);

  const paye = await api("PATCH", `/api/invoices/${invoiceId}`, { status: "paid", paymentMethod: "transfer", paidAt: Date.now() });
  note(paye.status === 200 && paye.data?.status === "paid", "passage en payée");

  const list = await api("GET", "/api/invoices?status=paid");
  note(list.data?.some((i) => i.id === invoiceId), "filtre par statut");

  const auto = await api("PATCH", `/api/appointments/${apptId}`, { status: "completed" });
  note(auto.status === 200, "RDV marqué terminé");
  const depuisRdv = await api("POST", `/api/invoices/from-appointment/${apptId}`);
  note(depuisRdv.status === 201 || depuisRdv.status === 200, "facture depuis un RDV");

  const inexistante = await api("GET", "/api/invoices/999999");
  note(inexistante.status === 404, "facture d'un autre praticien inaccessible");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Anamnèse, programmes, forfaits");
{
  const t = await api("POST", "/api/anamnese/templates", {
    name: "Bilan de vitalité", description: "Questionnaire initial",
    questions: JSON.stringify([{ id: "q1", label: "Comment dormez-vous ?", type: "text" }]),
  });
  note(t.status === 200 || t.status === 201, "création d'un questionnaire d'anamnèse");
  tplId = t.data?.id;

  if (tplId) {
    const env = await api("POST", "/api/anamnese/send", { templateId: tplId, clientId });
    note(env.status === 200 || env.status === 201, "envoi du questionnaire à une cliente");
    anamneseToken = env.data?.token || env.data?.response?.token;
    if (anamneseToken) {
      const pub = await fetch(`${B}/api/public/anamnese/${anamneseToken}`);
      note(pub.status === 200, "questionnaire accessible par la cliente sans compte");
      const rep = await fetch(`${B}/api/public/anamnese/${anamneseToken}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: JSON.stringify({ q1: "Mal, je me réveille la nuit" }) }),
      });
      note(rep.status === 200, "soumission des réponses");
    } else note(false, "token d'anamnèse récupéré");
    const faux = await fetch(`${B}/api/public/anamnese/token-bidon`);
    note(faux.status === 404, "questionnaire avec token invalide → 404");
  }

  const p = await api("POST", "/api/programmes", { clientId, title: "Programme detox 21 jours", content: [{ section: "Semaine 1", items: ["Tisane de romarin le matin"] }] });
  note(p.status === 200 || p.status === 201, "création d'un programme");
  progId = p.data?.id;

  const k = await api("POST", "/api/packages", { clientId, name: "Carnet 5 séances", totalSessions: 5, priceCents: 40000 });
  note(k.status === 200 || k.status === 201, "création d'un forfait");
  packId = k.data?.id;
  if (packId) {
    const use = await api("PATCH", `/api/packages/${packId}`, { usedSessions: 1 });
    note(use.status === 200 && use.data?.usedSessions === 1, "décompte d'une séance");
  }

  const sol = await api("GET", "/api/solutions");
  note(Array.isArray(sol.data) && sol.data.length > 50, "base de solutions naturelles", `${sol.data?.length} entrées`);
}

// ─────────────────────────────────────────────────────────────────────────────
section("Statistiques et emails");
{
  const s = await api("GET", `/api/stats/overview?from=${Date.now() - 30 * 86400000}&to=${Date.now() + 30 * 86400000}`);
  note(s.status === 200 && s.data, "tableau de statistiques");
  const csv = await api("GET", `/api/stats/recettes.csv?from=${Date.now() - 30 * 86400000}&to=${Date.now() + 30 * 86400000}`);
  note(csv.status === 200, "export CSV des recettes");

  const t = await api("GET", "/api/email-templates");
  note(Array.isArray(t.data), "liste des modèles d'email");
  const up = await api("PUT", "/api/email-templates/confirmation", {
    subject: "Votre RDV du {{appointment.date}}",
    bodyHtml: "<p>Bonjour {{client.name}}, rendez-vous le {{appointment.date}} à {{appointment.time}}.</p>",
  });
  note(up.status === 200, "personnalisation d'un modèle");
  const prev = await api("POST", "/api/email-templates/confirmation/preview", {
    subject: "Test {{client.name}}", bodyHtml: "<p>{{client.name}} — {{appointment.date}}</p>",
  });
  note(prev.status === 200 && !String(prev.data?.html || "").includes("{{"), "aperçu : variables substituées");
}

// ─────────────────────────────────────────────────────────────────────────────
section("RGPD");
{
  const exp = await api("GET", "/api/auth/me/export");
  const j = typeof exp.data === "string" ? JSON.parse(exp.data) : exp.data;
  note(exp.status === 200 && j?.counts, "export complet des données");
  note(j?.clients?.length >= 1 && j?.appointments?.length >= 1 && j?.invoices?.length >= 1, "export non vide",
    `${j?.counts?.clients} clients, ${j?.counts?.appointments} RDV, ${j?.counts?.invoices} factures`);
  note(!JSON.stringify(j?.profile || {}).includes("passwordHash"), "aucun secret dans l'export");

  const sansMdp = await api("DELETE", "/api/auth/me", { password: "mauvais", confirm: true });
  note(sansMdp.status === 403, "suppression refusée avec un mauvais mot de passe");
  const sansConfirm = await api("DELETE", "/api/auth/me", { password: MDP });
  note(sansConfirm.status === 400, "suppression refusée sans confirmation explicite");
}

// ─────────────────────────────────────────────────────────────────────────────
section("Cloisonnement entre praticiennes");
{
  const cookieA = cookie;
  cookie = "";
  const b = await api("POST", "/api/auth/register", { email: `intrus-${tag}@example.invalid`, password: MDP, name: "Intrus Test" });
  const intrusId = b.data?.user?.id;

  const cli = await api("GET", `/api/clients/${clientId}`);
  note(cli.status === 404, "fiche cliente d'une autre praticienne inaccessible");
  const rdv = await api("GET", `/api/appointments/${apptId}`);
  note(rdv.status === 404, "RDV d'une autre praticienne inaccessible");
  const fac = await api("GET", `/api/invoices/${invoiceId}`);
  note(fac.status === 404, "facture d'une autre praticienne inaccessible");
  const doc = await api("GET", `/api/documents/${docId}/download`);
  note(doc.status === 404, "document de santé d'une autre praticienne inaccessible");
  if (progId) { const p = await api("GET", `/api/programmes/${progId}`); note(p.status === 404, "programme d'une autre praticienne inaccessible"); }
  if (packId) { const k = await api("PATCH", `/api/packages/${packId}`, { usedSessions: 9 }); note(k.status === 404, "forfait d'une autre praticienne non modifiable"); }
  const modif = await api("PATCH", `/api/clients/${clientId}`, { firstName: "Piraté" });
  note(modif.status === 404, "fiche cliente d'une autre praticienne non modifiable");
  const adm = await api("GET", "/api/admin/users");
  note(adm.status === 403, "espace admin refusé à une praticienne");

  await api("DELETE", "/api/auth/me", { password: MDP, confirm: true });
  cookie = cookieA;
  void intrusId;
}

// ─────────────────────────────────────────────────────────────────────────────
section("Suppression du compte de test (RGPD)");
{
  const d = await api("DELETE", "/api/auth/me", { password: MDP, confirm: true });
  note(d.status === 200, "suppression du compte");
  const apres = await api("POST", "/api/auth/login", { email: EMAIL, password: MDP }, { noCookie: true });
  note(apres.status === 401, "connexion impossible après suppression");
}

// ─────────────────────────────────────────────────────────────────────────────
const total = resultats.length, ko = resultats.filter((r) => !r.ok);
console.log(`\n\x1b[1m${"═".repeat(64)}\x1b[0m`);
console.log(`\x1b[1mRÉSULTAT : ${total - ko.length}/${total} tests passés\x1b[0m`);
if (ko.length) {
  console.log(`\n\x1b[31mÉchecs :\x1b[0m`);
  for (const r of ko) console.log(`  • [${r.section}] ${r.label}${r.detail ? " — " + r.detail : ""}`);
}
process.exit(ko.length ? 1 : 0);
