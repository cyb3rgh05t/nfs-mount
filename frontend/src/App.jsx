import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import NFSPage from "./pages/NFSPage";
import MergerFSPage from "./pages/MergerFSPage";
import SettingsPage from "./pages/SettingsPage";
import VPNPage from "./pages/VPNPage";
import UsersPage from "./pages/UsersPage";
import DocsPage from "./pages/DocsPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-nfs-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-nfs-primary/30 border-t-nfs-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-nfs-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-nfs-primary/30 border-t-nfs-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/nfs" element={<NFSPage />} />
                <Route path="/mergerfs" element={<MergerFSPage />} />
                <Route path="/vpn" element={<VPNPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/docs" element={<DocsPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
