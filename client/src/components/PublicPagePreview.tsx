import { MapPin } from "lucide-react";

/**
 * Aperçu live (miniature) de la page publique, affiché dans l'éditeur.
 * Reflète en temps réel le brouillon en cours d'édition, couleurs comprises.
 */
export function PublicPagePreview({
  name,
  bio,
  photoUrl,
  city,
  address,
  specialties,
  primaryColor,
  accentColor,
}: {
  name?: string;
  bio?: string;
  photoUrl?: string;
  city?: string;
  address?: string;
  specialties?: string[];
  primaryColor?: string;
  accentColor?: string;
}) {
  const primary = primaryColor || "#186749";
  const accent = accentColor || "#17EC9B";
  const displayName = name?.trim() || "Votre nom";
  const location = [address, city].filter(Boolean).join(" · ");
  const tags = specialties || [];

  return (
    <div className="rounded-lg border border-input overflow-hidden bg-card" data-testid="public-page-preview">
      {/* Header miniature */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: `${primary}10` }}
      >
        <span className="font-extrabold text-sm" style={{ color: primary }}>
          {displayName}
        </span>
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
          style={{ background: primary }}
        >
          Prendre RDV
        </span>
      </div>

      {/* Hero miniature */}
      <div className="p-4 flex gap-4 items-center" style={{ background: `${accent}0d` }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={displayName}
            className="h-16 w-16 rounded-full object-cover border-2 shrink-0"
            style={{ borderColor: "#fff" }}
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
          />
        ) : (
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-extrabold text-white shrink-0"
            style={{ background: primary }}
          >
            {displayName[0]}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: primary }}>
            Naturopathe certifié(e)
          </p>
          <p className="font-extrabold text-base leading-tight truncate" style={{ color: primary }}>
            {displayName}
          </p>
          {location && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" /> {location}
            </p>
          )}
        </div>
      </div>

      {/* Bio + chips */}
      <div className="px-4 pb-4 pt-3">
        <p className="text-xs leading-relaxed text-foreground/80 line-clamp-3">
          {bio?.trim() || "Naturopathe à votre écoute pour vous accompagner vers une santé naturelle."}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.slice(0, 6).map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${primary}1a`, color: primary }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
