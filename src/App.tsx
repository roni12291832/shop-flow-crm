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
import SpecialDates from "./pages/SpecialDates";
import NpsDashboard from "./pages/NpsDashboard";
import NpsConfig from "./pages/NpsConfig";
import NpsPublic from "./pages/NpsPublic";
import SellerMode from "./pages/SellerMode";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
    <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
    <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
    <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
    <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
    <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="/metas" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
    <Route path="/metas/configurar" element={<ProtectedRoute><GoalsConfig /></ProtectedRoute>} />
    <Route path="/regua-relacionamento" element={<ProtectedRoute><RelationshipRules /></ProtectedRoute>} />
    <Route path="/datas-especiais" element={<ProtectedRoute><SpecialDates /></ProtectedRoute>} />
    <Route path="/nps" element={<ProtectedRoute><NpsDashboard /></ProtectedRoute>} />
    <Route path="/nps/configurar" element={<ProtectedRoute><NpsConfig /></ProtectedRoute>} />
    <Route path="/nps/:token" element={<NpsPublic />} />
    <Route path="/vendedor" element={<ProtectedRoute><SellerMode /></ProtectedRoute>} />
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
