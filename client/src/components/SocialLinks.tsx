import { Facebook, Globe, Instagram } from "lucide-react";
import { socialHref } from "@/lib/public-page";

/**
 * Liens Instagram, Facebook et site web de la praticienne, sur sa page publique
 * et dans l'aperçu de l'éditeur. Une saisie inexploitable n'est pas affichée.
 */
export function SocialLinks({ instagram, facebook, websiteUrl, color, size = "md", className = "" }: {
  instagram?: string | null; facebook?: string | null; websiteUrl?: string | null;
  color: string; size?: "sm" | "md"; className?: string;
}) {
  const links = [
    { href: socialHref("instagram", instagram), label: "Instagram", Icon: Instagram },
    { href: socialHref("facebook", facebook), label: "Facebook", Icon: Facebook },
    { href: socialHref("website", websiteUrl), label: "Site web", Icon: Globe },
  ].filter((l): l is { href: string; label: string; Icon: typeof Globe } => !!l.href);
  if (links.length === 0) return null;
  const box = size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} data-testid="social-links">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={`${box} rounded-full inline-flex items-center justify-center transition-opacity hover:opacity-80`}
          style={{ background: `${color}1a`, color }}
          data-testid={`link-social-${label === "Site web" ? "website" : label.toLowerCase()}`}
        >
          <Icon className={icon} />
        </a>
      ))}
    </div>
  );
}
