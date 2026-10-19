import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { useAuth } from "./lib/authContext";
import { ThemeProvider } from "./lib/themeProvider";
import { BudgetPage } from "./pages/BudgetPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { WalletsPage } from "./pages/WalletsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { auth, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-500 text-sm">
        Memeriksa sesi pengguna...
      </div>
    );
  }

  if (auth?.auth_enabled && !auth?.authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { auth, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (auth?.auth_enabled === false || auth?.authenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <LoginPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/"
                  element={
                    <AuthGuard>
                      <DashboardPage />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/transactions"
                  element={
                    <AuthGuard>
                      <TransactionsPage />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/budgets"
                  element={
                    <AuthGuard>
                      <BudgetPage />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/wallets"
                  element={
                    <AuthGuard>
                      <WalletsPage />
                    </AuthGuard>
                  }
                />
              </Routes>
            </Layout>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
