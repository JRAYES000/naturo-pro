import { storage } from "./storage";
import { hashPassword } from "./auth";

export async function seedIfEmpty() {
  const count = await storage.countUsers();
  if (count > 0) return;
  console.log("[seed] creating demo data...");

  const now = Date.now();
  const user = await storage.createUser({
    email: "marie@demo.fr",
    passwordHash: hashPassword("demo1234"),
    googleId: null,
    name: "Marie Dupont",
    slug: "marie-dupont",
    bio: "Naturopathe certifiée à Lyon, j'accompagne mes clients vers une santé naturelle et durable. Spécialisée en gestion du stress, sommeil, alimentation vivante et accompagnement de la femme.",
    photoUrl: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&h=400&fit=crop",
    phone: "06 12 34 56 78",
    specialties: JSON.stringify(["Gestion du stress", "Alimentation vivante", "Sommeil", "Iridologie"]),
    address: "12 rue des Plantes",
    city: "Lyon",
    googleCalendarToken: null,
    googleCalendarEmail: null,
    emailRemindersEnabled: true,
    publicPageEnabled: true,
    primaryColor: "#186749",
    accentColor: "#17EC9B",
    createdAt: now,
  });

  // Categories
  const cat1 = await storage.createCategory({
    userId: user.id, name: "Première consultation", durationMinutes: 90,
    priceCents: 8000, location: "cabinet", color: "#186749",
    description: "Bilan complet : antécédents, mode de vie, objectifs.",
    isActive: true,
  });
  const cat2 = await storage.createCategory({
    userId: user.id, name: "Suivi", durationMinutes: 45,
    priceCents: 5000, location: "cabinet", color: "#17EC9B",
    description: "Suivi des conseils et ajustements.",
    isActive: true,
  });
  const cat3 = await storage.createCategory({
    userId: user.id, name: "Bilan iridologie", durationMinutes: 60,
    priceCents: 6500, location: "cabinet", color: "#1b4332",
    description: "Lecture de l'iris pour orienter le bilan.",
    isActive: true,
  });

  // Availability — Mon-Fri 9-12 + 14-18
  const slots = [];
  for (let d = 1; d <= 5; d++) {
    slots.push({ userId: user.id, dayOfWeek: d, startTime: "09:00", endTime: "12:00" });
    slots.push({ userId: user.id, dayOfWeek: d, startTime: "14:00", endTime: "18:00" });
  }
  await storage.replaceAvailability(user.id, slots);

  // Clients
  const clientsData = [
    { firstName: "Sophie", lastName: "Martin", email: "sophie.martin@example.com", phone: "06 11 22 33 44",
      dateOfBirth: "1985-03-12", address: "5 rue Lafayette, Lyon", allergies: "Aucune connue",
      antecedents: "Migraines chroniques, troubles du sommeil. Traitement homéopathique en cours.",
      lifestyleNotes: "Travail de bureau, sédentaire. Yoga 1x/sem.", penseBete: "Aime parler de ses enfants" },
    { firstName: "Thomas", lastName: "Bernard", email: "tbernard@example.com", phone: "06 22 33 44 55",
      dateOfBirth: "1978-07-22", address: "Lyon", allergies: "Pollen, gluten suspect",
      antecedents: "Reflux gastrique, fatigue chronique.",
      lifestyleNotes: "Sportif (course à pied 3x/sem). Sommeil correct.", penseBete: "Préfère RDV en fin de journée" },
    { firstName: "Camille", lastName: "Petit", email: "cpetit@example.com", phone: "07 88 99 00 11",
      dateOfBirth: "1992-11-30", address: "Villeurbanne", allergies: "Lactose",
      antecedents: "Eczéma, anxiété. Cycle irrégulier.",
      lifestyleNotes: "Étudiante, alimentation très transformée.", penseBete: "Très réceptive, motivée" },
    { firstName: "Lucas", lastName: "Roux", email: "lucas.roux@example.com", phone: "06 55 44 33 22",
      dateOfBirth: "1990-05-15", address: "Lyon 7", allergies: "Aucune",
      antecedents: "Surpoids, hypertension légère.",
      lifestyleNotes: "Cadre, stress important. Peu de sport.", penseBete: "Plutôt timide, à mettre à l'aise" },
    { firstName: "Léa", lastName: "Garcia", email: "lea.garcia@example.com", phone: "07 66 77 88 99",
      dateOfBirth: "1988-09-03", address: "Caluire", allergies: "Acariens",
      antecedents: "Endométriose, fatigue post-partum.",
      lifestyleNotes: "Maman de 2 enfants, alimentation bio.", penseBete: "Recherche un suivi long terme" },
  ];
  const created: any[] = [];
  for (const c of clientsData) created.push(await storage.createClient(user.id, c));

  // Appointments — past and future
  const day = 24 * 3600 * 1000;
  const cats = [cat1, cat2, cat3];
  const dates = [-10, -7, -3, 0, 1, 3, 5, 8].map(d => {
    const t = new Date(); t.setHours(10, 0, 0, 0); t.setDate(t.getDate() + d); return t;
  });
  for (let i = 0; i < dates.length; i++) {
    const c = created[i % created.length];
    const cat = cats[i % cats.length];
    const startAt = dates[i].getTime() + (i % 3) * 30 * 60 * 1000;
    const endAt = startAt + cat.durationMinutes * 60 * 1000;
    const isPast = startAt < Date.now();
    const appt = await storage.createAppointment({
      userId: user.id, clientId: c.id, categoryId: cat.id,
      startAt, endAt,
      status: isPast ? "completed" : "confirmed",
      clientFirstName: c.firstName, clientLastName: c.lastName, clientEmail: c.email, clientPhone: c.phone,
      notesBefore: null, location: cat.location, googleEventId: null, reminderSent: false,
    });
    if (isPast && i < 3) {
      const tnow = Date.now();
      await storage.createNote({
        appointmentId: appt.id, clientId: c.id, userId: user.id,
        motif: "Fatigue persistante, troubles digestifs.",
        anamnese: "Cliente travaille beaucoup, peu de temps pour les repas. Sommeil léger, réveils nocturnes.",
        bilan: "Surcharge hépatique probable, déséquilibre du microbiote.",
        conseilsAlimentaires: "Réduire les sucres rapides. Inclure des légumes verts à chaque repas. Hydratation 1,5L.",
        hygieneDeVie: "Marche 30min/j. Coucher avant 23h. Bain de bouche au gingembre le matin.",
        suivi: "RDV de suivi dans 4 semaines.",
        notesLibres: "Cliente très réceptive. À encourager.",
        createdAt: tnow, updatedAt: tnow,
      });
    }
  }

  console.log("[seed] done.");
}
