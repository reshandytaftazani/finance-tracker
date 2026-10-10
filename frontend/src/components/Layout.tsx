import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeftRight, LayoutDashboard, ShieldCheck, Wallet } from "lucide-react";
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchHealth } from "../api/client";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const { data: health, isSuccess, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30000,
    retry: 1,
  });

  const navItems = [
    { label: "Dashboard", path: "/", icon: LayoutDashboard },
    { label: "Transaksi", path: "/transactions", icon: ArrowLeftRight },
    { label: "Budget", path: "/budgets", icon: Wallet },
  ];

  return (
    <div className="finance-app min-h-screen flex flex-col text-slate-900">
      <a href="#main-content" className="skip-link" onClick={() => document.getElementById("main-content")?.focus()}>Lewati ke konten utama</a>
      {/* Top Navigation */}
      <header className="finance-topbar">
        <div className="finance-shell">
          <div className="finance-topbar-inner">
            <div className="flex min-w-0 items-center gap-8">
              <div className="finance-brand">
                <span>
                  Personal Finance Tracker
                </span>
              </div>
              <nav aria-label="Navigasi utama" className="hidden lg:flex gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={isActive ? "page" : undefined}
                      className="finance-nav-link"
                    >
                      <Icon aria-hidden="true" className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-3 text-xs">
              {/* Local Security Badge */}
              <div className="hidden xl:inline-flex items-center text-slate-600">
                <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                127.0.0.1
              </div>

              {/* Health Status Indicator */}
              <div
                className={`finance-status border ${
                  isSuccess && health?.status === "ok"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : isError
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                <Activity aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mr-1.5" />
                <span>
                  {isSuccess && health?.status === "ok"
                    ? "API Aktif"
                    : isError
                    ? "API Terputus"
                    : "Memeriksa API"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav aria-label="Navigasi utama" className="finance-shell finance-mobile-nav lg:hidden grid grid-cols-3 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? "page" : undefined}
                className="finance-nav-link"
              >
                <Icon aria-hidden="true" className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="finance-shell finance-main scroll-mt-48 flex-1 min-w-0">
        {children}
      </main>

      {/* Footer */}
      <footer className="finance-footer">
        <div className="finance-shell">
          Personal Finance Tracker &bull; Mode Lokal Tunggal (Single-Owner)
        </div>
      </footer>
    </div>
  );
};
