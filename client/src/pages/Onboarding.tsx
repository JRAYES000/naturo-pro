import { useState } from "react";
import { useLocation } from "wouter";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

const SPECIALTY_OPTIONS = [
  "Alimentation",
  "Stress",
  "Sommeil",
  "Digestion",
  "Hormones",
  "Énergie",
  "Détox",
  "Sport",
];

type FormData = {
  phone: string;
  city: string;
  address: string;
  bio: string;
  specialties: string[];
  customSpecialty: string;
  serviceName: string;
  serviceDuration: number;
  servicePrice: number;
  serviceColor: string;
};

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { refetch } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<FormData>({
    phone: "",
    city: "",
    address: "",
    bio: "",
    specialties: [],
    customSpecialty: "",
    serviceName: "Consultation",
    serviceDuration: 60,
    servicePrice: 60,
    serviceColor: "#186749",
  });

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function toggleSpecialty(s: string) {
    setData((d) => ({
      ...d,
      specialties: d.specialties.includes(s)
        ? d.specialties.filter((x) => x !== s)
        : [...d.specialties, s],
    }));
  }

  function addCustomSpecialty() {
    const v = data.customSpecialty.trim();
    if (!v) return;
    if (!data.specialties.includes(v)) {
      setData((d) => ({ ...d, specialties: [...d.specialties, v], customSpecialty: "" }));
    } else {
      setData((d) => ({ ...d, customSpecialty: "" }));
    }
  }

  async function finish(skipped = false) {
    setSubmitting(true);
    try {
      const payload = skipped
        ? {}
        : {
            phone: data.phone || undefined,
            city: data.city || undefined,
            address: data.address || undefined,
            bio: data.bio || undefined,
            specialties: data.specialties.length ? data.specialties.join(", ") : undefined,
            firstService: {
              name: data.serviceName || "Consultation",
              durationMin: Number(data.serviceDuration) || 60,
              priceCents: Math.round((Number(data.servicePrice) || 0) * 100),
              color: data.serviceColor || "#186749",
            },
          };
      await apiRequest("POST", "/api/auth/onboarding", payload);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await refetch();
      toast({ title: "C'est prêt 🌿", description: "Votre cabinet est configuré." });
      navigate("/app");
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de terminer la configuration.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen leaf-bg px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <div
          className="rounded-[15px] p-4 mb-6 flex items-center gap-3"
          style={{ background: "rgba(23, 236, 155, 0.12)", border: "1px solid rgba(24, 103, 73, 0.18)" }}
        >
          <Sparkles className="h-5 w-5 flex-shrink-0" style={{ color: "#186749" }} />
          <p className="text-sm font-semibold" style={{ color: "#1b4332" }}>
            Configurez votre compte pour commencer 🌿
          </p>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 text-sm font-semibold" style={{ color: "#1b4332" }}>
            <span>Étape {step} sur {totalSteps}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="card-naturo">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-extrabold mb-1" style={{ color: "#1b4332" }}>Votre profil pro</h2>
                <p className="text-sm text-muted-foreground">Ces informations apparaîtront sur votre page publique.</p>
              </div>
              <div>
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="06 12 34 56 78"
                  value={data.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  data-testid="input-phone"
                />
              </div>
              <div>
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  placeholder="Paris"
                  value={data.city}
                  onChange={(e) => update("city", e.target.value)}
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  placeholder="12 rue de la Paix"
                  value={data.address}
                  onChange={(e) => update("address", e.target.value)}
                  data-testid="input-address"
                />
              </div>
              <div>
                <Label htmlFor="bio">Présentation courte</Label>
                <Textarea
                  id="bio"
                  placeholder="Quelques mots sur vous, votre approche…"
                  maxLength={200}
                  rows={3}
                  value={data.bio}
                  onChange={(e) => update("bio", e.target.value.slice(0, 200))}
                  data-testid="input-bio"
                />
                <p className="text-xs text-muted-foreground mt-1">{data.bio.length}/200</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-extrabold mb-1" style={{ color: "#1b4332" }}>Vos spécialités</h2>
                <p className="text-sm text-muted-foreground">Choisissez celles qui vous correspondent.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SPECIALTY_OPTIONS.map((s) => {
                  const active = data.specialties.includes(s);
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggleSpecialty(s)}
                      data-testid={`chip-specialty-${s.toLowerCase()}`}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                        active
                          ? "text-white"
                          : "bg-white text-foreground border-border hover:bg-secondary"
                      }`}
                      style={
                        active
                          ? { background: "#186749", borderColor: "#186749" }
                          : undefined
                      }
                    >
                      {active && <Check className="inline h-3 w-3 mr-1" />}
                      {s}
                    </button>
                  );
                })}
                {data.specialties
                  .filter((s) => !SPECIALTY_OPTIONS.includes(s))
                  .map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggleSpecialty(s)}
                      className="px-4 py-2 rounded-full text-sm font-semibold border text-white"
                      style={{ background: "#186749", borderColor: "#186749" }}
                      data-testid={`chip-specialty-custom-${s}`}
                    >
                      <Check className="inline h-3 w-3 mr-1" />
                      {s}
                    </button>
                  ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Ajouter une spécialité personnalisée"
                  value={data.customSpecialty}
                  onChange={(e) => update("customSpecialty", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSpecialty();
                    }
                  }}
                  data-testid="input-custom-specialty"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomSpecialty}
                  className="rounded-[15px] font-bold"
                  data-testid="button-add-specialty"
                >
                  Ajouter
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-extrabold mb-1" style={{ color: "#1b4332" }}>Votre première prestation</h2>
                <p className="text-sm text-muted-foreground">Vous pourrez en ajouter d'autres ensuite.</p>
              </div>
              <div>
                <Label htmlFor="service-name">Nom de la prestation</Label>
                <Input
                  id="service-name"
                  value={data.serviceName}
                  onChange={(e) => update("serviceName", e.target.value)}
                  data-testid="input-service-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="service-duration">Durée (minutes)</Label>
                  <Input
                    id="service-duration"
                    type="number"
                    min={15}
                    step={15}
                    value={data.serviceDuration}
                    onChange={(e) => update("serviceDuration", Number(e.target.value))}
                    data-testid="input-service-duration"
                  />
                </div>
                <div>
                  <Label htmlFor="service-price">Prix (€)</Label>
                  <Input
                    id="service-price"
                    type="number"
                    min={0}
                    step={1}
                    value={data.servicePrice}
                    onChange={(e) => update("servicePrice", Number(e.target.value))}
                    data-testid="input-service-price"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="service-color">Couleur</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="service-color"
                    type="color"
                    value={data.serviceColor}
                    onChange={(e) => update("serviceColor", e.target.value)}
                    className="h-10 w-16 rounded-[15px] border border-input cursor-pointer"
                    data-testid="input-service-color"
                  />
                  <Input
                    value={data.serviceColor}
                    onChange={(e) => update("serviceColor", e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || submitting}
              className="rounded-[15px] py-6 font-bold"
              data-testid="button-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Précédent
            </Button>
            {step < totalSteps ? (
              <Button
                type="button"
                onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                disabled={submitting}
                className="rounded-[15px] py-6 font-bold"
                data-testid="button-next"
              >
                Suivant
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => finish(false)}
                disabled={submitting}
                className="rounded-[15px] py-6 font-bold"
                data-testid="button-finish"
              >
                {submitting ? "Enregistrement…" : "Terminer 🌿"}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => finish(true)}
            disabled={submitting}
            className="text-sm text-muted-foreground hover:text-foreground underline"
            data-testid="button-skip-onboarding"
          >
            Passer cette étape
          </button>
        </div>
      </div>
    </div>
  );
}
