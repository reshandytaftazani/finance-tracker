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
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-lg text-slate-900 tracking-tight">
                  Personal Finance Tracker
                </span>
              </div>
              <nav className="hidden md:flex space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2 text-slate-500" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center space-x-3 text-xs">
              {/* Local Security Badge */}
              <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                127.0.0.1
              </div>

              {/* Health Status Indicator */}
              <div
                className={`inline-flex items-center px-2.5 py-1 rounded-md border font-medium ${
                  isSuccess && health?.status === "ok"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : isError
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                <Activity className="w-3.5 h-3.5 mr-1.5" />
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
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-2 flex flex-wrap gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium ${
                  isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4 mr-1.5 text-slate-500" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          Personal Finance Tracker &bull; Mode Lokal Tunggal (Single-Owner)
        </div>
      </footer>
    </div>
  );
};
