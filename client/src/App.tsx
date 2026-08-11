import { lazy, Suspense } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import { ConfirmProvider } from "@/hooks/use-confirm";
import { Loading } from "@/components/Loading";
import { isOnTenantSubdomain } from "@/lib/tenant";

// ─── Chargement direct ────────────────────────────────────────────────────────
// Les 4 écrans "point d'entrée" restent dans le bundle initial pour éviter tout
// clignotement à l'ouverture. Ce sont ceux qu'une visiteuse voit AVANT toute
// interaction utile :
//   • Landing / Login : marketing + connexion, la porte d'entrée du domaine app.
//   • PublicPage      : page publique d'une praticienne, la porte d'entrée du
//                       tunnel client (souvent ouverte via un lien partagé).
//   • BookingFlow     : tunnel de réservation, écran le plus critique pour la
//                       conversion — on ne veut PAS d'un état vide pendant le
//                       download d'un chunk quand le client clique "Réserver".
// Tout le reste est chargé à la demande via React.lazy (voir plus bas).
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import PublicPage from "@/pages/PublicPage";
import BookingFlow from "@/pages/BookingFlow";
import NotFound from "@/pages/not-found";

// ─── Chargement à la demande (code splitting) ─────────────────────────────────
// Chaque page devient son propre chunk Vite : les écrans admin, la facturation,
// les templates email, le studio de contenu, l'assistant, etc. ne sont plus
// téléchargés tant que la praticienne n'y va pas. Gain principal : le premier
// écran (Landing ou PublicPage) apparaît beaucoup plus vite, et le tunnel de
// réservation partagé aux clients pèse une fraction du bundle actuel.
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const ConsultationNote = lazy(() => import("@/pages/ConsultationNote"));
const Categories = lazy(() => import("@/pages/Categories"));
const Availability = lazy(() => import("@/pages/Availability"));
const PublicPageEditor = lazy(() => import("@/pages/PublicPageEditor"));
const Settings = lazy(() => import("@/pages/Settings"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const InvoiceEditor = lazy(() => import("@/pages/InvoiceEditor"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Reminders = lazy(() => import("@/pages/Reminders"));
const EmailTemplates = lazy(() => import("@/pages/EmailTemplates"));
const Anamnese = lazy(() => import("@/pages/Anamnese"));
const AnamnesePublic = lazy(() => import("@/pages/AnamnesePublic"));
const Programmes = lazy(() => import("@/pages/Programmes"));
const Solutions = lazy(() => import("@/pages/Solutions"));
const Packages = lazy(() => import("@/pages/Packages"));
const Stats = lazy(() => import("@/pages/Stats"));
const Chat = lazy(() => import("@/pages/Chat"));
const StudioContenu = lazy(() => import("@/pages/StudioContenu"));
const BookingManage = lazy(() => import("@/pages/BookingManage"));
// Phase 3 Lot 4 — admin (rarement visité, jamais en même temps que le reste)
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("@/pages/admin/AdminUserDetail"));
const AssistantAdmin = lazy(() => import("@/pages/admin/AssistantAdmin"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));

// Action 8 (scope resserré) — routes PUBLIQUES pré-login servies en URL propre
// (pathname), en dehors du hash router. Voir le commentaire de tête de
// client/src/main.tsx pour la justification complète (CLAUDE.md respecté : le hash
// routing reste intact et inchangé pour tout le reste de l'app, ci-dessous).
function PublicRouter() {
  const onTenant = isOnTenantSubdomain();
  return (
    <Switch>
      <Route path="/" component={onTenant ? PublicPage : Landing} />
      <Route path="/p/:slug" component={PublicPage} />
      <Route path="/p/:slug/book/:catId?" component={BookingFlow} />
      {onTenant && <Route path="/book/:catId?" component={BookingFlow} />}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRouter() {
  // Phase 3 Lot 2 — sur {slug}.app.ecole-naturo.fr, la racine "/" affiche
  // directement la page publique du tenant et "/book" son tunnel de réservation
  // (au lieu de la landing/login génériques).
  // Ces routes restent définies ICI AUSSI (en plus de PublicRouter) : un ancien lien
  // partagé au format explicite /#/p/{slug} doit continuer à fonctionner à l'identique
  // (hash non vide => on monte ce routeur, pas PublicRouter — cf. App() plus bas).
  const onTenant = isOnTenantSubdomain();
  return (
    <Switch>
      <Route path="/" component={onTenant ? PublicPage : Landing} />
      {onTenant && <Route path="/book/:catId?" component={BookingFlow} />}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email/:token" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />

      <Route path="/app" component={() => <ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/app/onboarding" component={() => <ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/app/agenda" component={() => <ProtectedRoute><Agenda /></ProtectedRoute>} />
      <Route path="/app/clients" component={() => <ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/app/clients/:id" component={() => <ProtectedRoute><ClientDetail /></ProtectedRoute>} />
      <Route path="/app/notes/:appointmentId" component={() => <ProtectedRoute><ConsultationNote /></ProtectedRoute>} />
      <Route path="/app/categories" component={() => <ProtectedRoute><Categories /></ProtectedRoute>} />
      <Route path="/app/availability" component={() => <ProtectedRoute><Availability /></ProtectedRoute>} />
      <Route path="/app/public-page" component={() => <ProtectedRoute><PublicPageEditor /></ProtectedRoute>} />
      <Route path="/app/settings" component={() => <ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/app/invoices" component={() => <ProtectedRoute><Invoices /></ProtectedRoute>} />
      <Route path="/app/invoices/:id" component={() => <ProtectedRoute><InvoiceEditor /></ProtectedRoute>} />
      <Route path="/app/reminders" component={() => <ProtectedRoute><Reminders /></ProtectedRoute>} />
      <Route path="/app/email-templates" component={() => <ProtectedRoute><EmailTemplates /></ProtectedRoute>} />
      <Route path="/app/anamnese" component={() => <ProtectedRoute><Anamnese /></ProtectedRoute>} />
      <Route path="/app/programmes" component={() => <ProtectedRoute><Programmes /></ProtectedRoute>} />
      <Route path="/app/solutions" component={() => <ProtectedRoute><Solutions /></ProtectedRoute>} />
      <Route path="/app/forfaits" component={() => <ProtectedRoute><Packages /></ProtectedRoute>} />
      <Route path="/app/stats" component={() => <ProtectedRoute><Stats /></ProtectedRoute>} />
      <Route path="/app/chat/:discussionId?" component={() => <ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/app/studio-contenu" component={() => <ProtectedRoute><StudioContenu /></ProtectedRoute>} />

      {/* Phase 3 Lot 4 — admin (le 403 backend renvoie un message géré dans la page) */}
      <Route path="/admin/users" component={() => <ProtectedRoute><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/users/:id" component={() => <ProtectedRoute><AdminUserDetail /></ProtectedRoute>} />
      <Route path="/admin/assistant" component={() => <ProtectedRoute><AssistantAdmin /></ProtectedRoute>} />
      <Route path="/admin/analytics" component={() => <ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />

      <Route path="/p/:slug" component={PublicPage} />
      <Route path="/p/:slug/book/:catId?" component={BookingFlow} />
      <Route path="/manage/:token" component={BookingManage} />
      <Route path="/anamnese/:token" component={AnamnesePublic} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  // Invariant posé par client/src/main.tsx : le hash est TOUJOURS non-vide au
  // montage, sauf sur une des routes publiques pathname-based (Action 8, scope
  // resserré). On peut donc décider quel routeur monter juste avec ce test, sans
  // dupliquer le pattern matching des routes ici.
  const isPublicPathBased = !window.location.hash;
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Router hook={isPublicPathBased ? undefined : useHashLocation}>
        <AuthProvider>
          <ConfirmProvider>
            {/* Suspense enveloppe le router : pendant le download d'un chunk
                de page, on affiche le composant Loading unifié (aria-busy,
                cohérent avec le reste des états de chargement de l'app). */}
            <Suspense fallback={<Loading label="Chargement…" />}>
              {isPublicPathBased ? <PublicRouter /> : <AppRouter />}
            </Suspense>
          </ConfirmProvider>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}
