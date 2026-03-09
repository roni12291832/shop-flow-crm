import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Pipeline from "./pages/Pipeline";
import Tasks from "./pages/Tasks";
import Chat from "./pages/Chat";
import Ranking from "./pages/Ranking";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Goals from "./pages/Goals";
import GoalsConfig from "./pages/GoalsConfig";
import RelationshipRules from "./pages/RelationshipRules";
import NpsDashboard from "./pages/NpsDashboard";
import NpsConfig from "./pages/NpsConfig";
import NpsPublic from "./pages/NpsPublic";
import SellerMode from "./pages/SellerMode";
import AdminPanel from "./pages/AdminPanel";
import WhatsAppConnect from "./pages/WhatsAppConnect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, noLayout }: { children: React.ReactNode; noLayout?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (noLayout) return <>{children}</>;
  return <AppLayout>{children}</AppLayout>;
}

/** Route only for admin/gerente — redirects vendedor to /vendedor */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, roles } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  // If user is ONLY vendedor (no admin/gerente role), redirect to seller mode
  const isOnlySeller = roles.length > 0 && roles.every(r => r === "vendedor" || r === "atendimento");
  if (isOnlySeller) return <Navigate to="/vendedor" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Auto-redirect vendedor-only users from "/" to "/vendedor" */
function HomeRedirect() {
  const { roles, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  const isOnlySeller = roles.length > 0 && roles.every(r => r === "vendedor" || r === "atendimento");
  if (isOnlySeller) return <Navigate to="/vendedor" replace />;
  return <Dashboard />;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
    <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
    <Route path="/clients" element={<AdminRoute><Clients /></AdminRoute>} />
    <Route path="/pipeline" element={<AdminRoute><Pipeline /></AdminRoute>} />
    <Route path="/tasks" element={<AdminRoute><Tasks /></AdminRoute>} />
    <Route path="/chat" element={<AdminRoute><Chat /></AdminRoute>} />
    <Route path="/ranking" element={<AdminRoute><Ranking /></AdminRoute>} />
    <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
    <Route path="/metas" element={<AdminRoute><Goals /></AdminRoute>} />
    <Route path="/metas/configurar" element={<AdminRoute><GoalsConfig /></AdminRoute>} />
    <Route path="/regua-relacionamento" element={<AdminRoute><RelationshipRules /></AdminRoute>} />
    <Route path="/nps" element={<AdminRoute><NpsDashboard /></AdminRoute>} />
    <Route path="/nps/configurar" element={<AdminRoute><NpsConfig /></AdminRoute>} />
    <Route path="/nps/:token" element={<NpsPublic />} />
    <Route path="/vendedor" element={<ProtectedRoute noLayout><SellerMode /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute noLayout><AdminPanel /></ProtectedRoute>} />
    <Route path="/whatsapp-connect" element={<AdminRoute><WhatsAppConnect /></AdminRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
