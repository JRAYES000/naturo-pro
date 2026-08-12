import { MessageCircle, Sparkles, BookMarked } from "lucide-react";
import { SubNav, type SubNavTab } from "@/components/SubNav";

const TABS: SubNavTab[] = [
  { href: "/app/chat", label: "Discussion", icon: MessageCircle, id: "discussion" },
  { href: "/app/studio-contenu", label: "Studio contenu", icon: Sparkles, id: "studio" },
  // Lot 5 (NaturoBot N4) — réponses IA archivées, consultables hors des fils.
  { href: "/app/naturobot-bibliotheque", label: "Bibliothèque", icon: BookMarked, id: "bibliotheque" },
];

export function NaturobotTabs() {
  return <SubNav group="naturobot" tabs={TABS} />;
}
