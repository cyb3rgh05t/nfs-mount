import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import NFSClientPage from "./pages/NFSClientPage";
import NFSExportsPage from "./pages/NFSExportsPage";
import MergerFSPage from "./pages/MergerFSPage";
import SettingsPage from "./pages/SettingsPage";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import HealthCheckPage from "./pages/HealthCheckPage";
import BenchmarkPage from "./pages/BenchmarkPage";
import LogsPage from "./pages/LogsPage";
import VPNPage from "./pages/VPNPage";
import ServerMonitorPage from "./pages/ServerMonitorPage";
import AboutPage from "./pages/AboutPage";

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
                <Route path="/nfs/client" element={<NFSClientPage />} />
                <Route path="/nfs/exports" element={<NFSExportsPage />} />
                <Route
                  path="/nfs"
                  element={<Navigate to="/nfs/client" replace />}
                />
                <Route path="/mergerfs" element={<MergerFSPage />} />
                <Route path="/vpn" element={<VPNPage />} />
                <Route path="/monitor" element={<ServerMonitorPage />} />
                <Route path="/diagnostics" element={<DiagnosticsPage />} />
                <Route path="/health" element={<HealthCheckPage />} />
                <Route path="/benchmark" element={<BenchmarkPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/about" element={<AboutPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
