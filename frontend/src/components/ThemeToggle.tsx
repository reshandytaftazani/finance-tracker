import { Monitor, Moon, Sun } from "lucide-react";
import React from "react";
import { useTheme } from "../lib/themeContext";

export const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const label =
    theme === "system"
      ? `Tema: Sistem (${resolvedTheme === "dark" ? "Gelap" : "Terang"})`
      : theme === "dark"
      ? "Tema: Gelap"
      : "Tema: Terang";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="finance-theme-toggle inline-flex items-center justify-center min-h-[2.25rem] min-w-[2.25rem] p-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] transition-colors"
      title={`${label} (Klik untuk berganti)`}
      aria-label={`${label}. Klik untuk mengubah tema.`}
    >
      {theme === "system" ? (
        <Monitor aria-hidden="true" className="w-4 h-4 text-blue-500 dark:text-blue-400" />
      ) : theme === "dark" ? (
        <Moon aria-hidden="true" className="w-4 h-4 text-amber-400" />
      ) : (
        <Sun aria-hidden="true" className="w-4 h-4 text-amber-500" />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
};
