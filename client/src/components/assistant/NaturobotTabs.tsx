import { Link, useLocation } from "wouter";
import { MessageCircle, Sparkles } from "lucide-react";

const TABS = [
  { href: "/app/chat", match: "/app/chat", label: "Discussion", icon: MessageCircle, id: "discussion" },
  { href: "/app/studio-contenu", match: "/app/studio-contenu", label: "Studio contenu", icon: Sparkles, id: "studio" },
];

export function NaturobotTabs() {
  const [location] = useLocation();
  return (
    <div className="flex gap-2 mb-4">
      {TABS.map((t) => {
        const active = location.startsWith(t.match);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-bold transition ${
              active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary hover:bg-secondary/70"
            }`}
            data-testid={`tab-naturobot-${t.id}`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
