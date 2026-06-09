import { Link } from "wouter";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center leaf-bg px-6">
      <div className="text-center">
        <Logo className="mx-auto mb-8" />
        <p className="text-7xl font-extrabold mb-4" style={{ color: "#186749" }}>404</p>
        <h1 className="text-2xl font-extrabold mb-2 text-heading">Page introuvable</h1>
        <p className="text-muted-foreground mb-6">La page que vous cherchez n'existe pas (ou plus).</p>
        <Link href="/" className="btn-primary-naturo inline-flex">Retour à l'accueil</Link>
      </div>
    </div>
  );
}
