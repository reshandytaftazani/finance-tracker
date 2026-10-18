import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeftRight, LayoutDashboard, LogOut, ShieldCheck, Wallet } from "lucide-react";
import React from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fetchHealth } from "../api/client";
import { useAuth } from "../lib/authContext";
import { ThemeToggle } from "./ThemeToggle";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout } = useAuth();
  const isLoginPage = location.pathname === "/login";

  const { data: health, isSuccess, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30000,
    retry: 1,
  });

  const navItems = isLoginPage
    ? []
    : [
        { label: "Dashboard", path: "/", icon: LayoutDashboard },
        { label: "Transaksi", path: "/transactions", icon: ArrowLeftRight },
        { label: "Budget", path: "/budgets", icon: Wallet },
      ];

  return (
    <div className="finance-app min-h-screen flex flex-col text-[var(--foreground)] bg-[var(--background)]" onClickCapture={(event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.origin !== window.location.origin || anchor.hash || anchor.pathname === location.pathname) return;
      if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      event.preventDefault();
      document.startViewTransition(() => { flushSync(() => navigate(anchor.pathname + anchor.search)); });
    }}>
      <a href="#main-content" className="skip-link" onClick={() => document.getElementById("main-content")?.focus()}>Lewati ke konten utama</a>
      {/* Top Navigation */}
      <header className="finance-topbar">
        <div className="finance-shell">
          <div className="finance-topbar-inner">
            <div className="flex min-w-0 items-center gap-8">
              <div className="finance-brand">
                <span className="finance-brand-mark" aria-hidden="true"><Wallet size={21} strokeWidth={1.8} /></span>
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
              <div className="hidden xl:inline-flex items-center text-slate-600 dark:text-slate-400">
                <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5 mr-1.5 text-slate-500 dark:text-slate-400" />
                127.0.0.1
              </div>

              {/* Health Status Indicator */}
              <div
                className={`finance-status border ${
                  isSuccess && health?.status === "ok"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                    : isError
                    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                    : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
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

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Logout button when authenticated */}
              {auth?.auth_enabled && auth?.authenticated && (
                <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
                  <span className="hidden sm:inline-flex text-slate-700 dark:text-slate-300 font-medium text-xs">
                    {auth.display_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => logout()}
                    aria-label="Keluar dari akun"
                    title="Keluar"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    <span className="hidden md:inline">Keluar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {navItems.length > 0 && (
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
        )}
      </header>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="finance-shell finance-main scroll-mt-48 flex-1 min-w-0">
        <div key={location.pathname} className="finance-route">{children}</div>
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
