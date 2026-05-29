import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Agenda from "@/pages/Agenda";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import ConsultationNote from "@/pages/ConsultationNote";
import Categories from "@/pages/Categories";
import Availability from "@/pages/Availability";
import PublicPageEditor from "@/pages/PublicPageEditor";
import Settings from "@/pages/Settings";
import Invoices from "@/pages/Invoices";
import InvoiceEditor from "@/pages/InvoiceEditor";
import PublicPage from "@/pages/PublicPage";
import BookingFlow from "@/pages/BookingFlow";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Onboarding from "@/pages/Onboarding";
import Reminders from "@/pages/Reminders";
import EmailTemplates from "@/pages/EmailTemplates";
import BookingManage from "@/pages/BookingManage";
// Phase 3 Lot 4 — admin
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminUserDetail from "@/pages/admin/AdminUserDetail";
// Phase 3 Lot 2 — détection sous-domaine personnel
import { isOnTenantSubdomain } from "@/lib/tenant";

function AppRouter() {
  // Phase 3 Lot 2 — sur {slug}.app.ecole-naturo.fr, la racine "/" affiche
  // directement la page publique du tenant et "/book" son tunnel de réservation
  // (au lieu de la landing/login génériques).
  const onTenant = isOnTenantSubdomain();
  return (
    <Switch>
      <Route path="/" component={onTenant ? PublicPage : Landing} />
      {onTenant && <Route path="/book" component={BookingFlow} />}
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

      {/* Phase 3 Lot 4 — admin (le 403 backend renvoie un message géré dans la page) */}
      <Route path="/admin/users" component={() => <ProtectedRoute><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/users/:id" component={() => <ProtectedRoute><AdminUserDetail /></ProtectedRoute>} />

      <Route path="/p/:slug" component={PublicPage} />
      <Route path="/p/:slug/book" component={BookingFlow} />
      <Route path="/manage/:token" component={BookingManage} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
