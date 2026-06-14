import { Link } from "wouter";
import { Check, Calendar, Clock, MapPin, User, Euro, ArrowLeft, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, durationLabel } from "@/lib/format";

interface ConfirmationData {
  when: Date;
  cat: {
    name: string;
    durationMinutes: number;
    priceCents: number;
    location: string;
    description?: string | null;
  };
}

interface NaturoInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  photoUrl?: string | null;
}

interface BookingConfirmationProps {
  confirmed: ConfirmationData;
  naturo: NaturoInfo;
  email: string;
  backHref: string;
}

function formatDayFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeFr(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function BookingConfirmation({ confirmed, naturo, email, backHref }: BookingConfirmationProps) {
  const { when, cat } = confirmed;

  return (
    <div className="text-center py-8 px-2" data-testid="booking-confirmation">
      {/* Success badge */}
      <div className="relative inline-flex mb-6">
        <div className="h-24 w-24 mx-auto rounded-full bg-primary/10 border-4 border-primary/20 flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Check className="h-9 w-9 text-primary-foreground" strokeWidth={3} />
          </div>
        </div>
      </div>

      <h1 className="text-3xl sm:text-4xl font-extrabold mb-3 text-heading" data-testid="text-confirmation-title">
        C'est confirmé&nbsp;!
      </h1>
      <p className="text-muted-foreground mb-2 max-w-sm mx-auto">
        Votre rendez-vous avec <strong>{naturo.name}</strong> est bien enregistré.
      </p>
      <p className="text-sm text-muted-foreground mb-8 flex items-center justify-center gap-1.5">
        <Mail className="h-3.5 w-3.5 shrink-0" />
        Une confirmation a été envoyée à{" "}
        <span className="font-bold text-foreground" data-testid="text-confirmation-email">{email}</span>
      </p>

      {/* Recap card */}
      <div className="card-naturo max-w-sm mx-auto text-left mb-6 space-y-3" data-testid="card-booking-recap">
        {/* Service name + badge */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-extrabold text-lg leading-tight" data-testid="text-recap-service">{cat.name}</h2>
          <Badge
            variant="secondary"
            className="shrink-0 bg-primary/10 text-primary border-0 font-bold text-xs"
            data-testid="badge-recap-duration"
          >
            {durationLabel(cat.durationMinutes)}
          </Badge>
        </div>

        {cat.description && (
          <p className="text-sm text-muted-foreground">{cat.description}</p>
        )}

        <hr className="border-border" />

        {/* Date + time */}
        <div className="flex items-start gap-3">
          <Calendar className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold capitalize" data-testid="text-recap-day">{formatDayFr(when)}</p>
            <p className="text-sm text-muted-foreground" data-testid="text-recap-time">à {formatTimeFr(when)}</p>
          </div>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm" data-testid="text-recap-duration">{durationLabel(cat.durationMinutes)}</span>
        </div>

        {/* Practitioner */}
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-bold" data-testid="text-recap-practitioner">{naturo.name}</span>
        </div>

        {/* Address if available */}
        {(naturo.address || naturo.city) && (
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span className="text-sm" data-testid="text-recap-address">
              {[naturo.address, naturo.city].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        {/* Location type */}
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground capitalize" data-testid="text-recap-location">{cat.location}</span>
        </div>

        {/* Price if > 0 */}
        {cat.priceCents > 0 && (
          <>
            <hr className="border-border" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-extrabold text-primary text-lg" data-testid="text-recap-price">
                {formatPrice(cat.priceCents)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Back button */}
      <Link href={backHref} data-testid="button-back-public">
        <Button variant="outline" className="rounded-lg py-6 font-bold gap-2 border-primary/30 hover:bg-primary/5">
          <ArrowLeft className="h-4 w-4" />
          Retour à la page de la praticienne
        </Button>
      </Link>
    </div>
  );
}
