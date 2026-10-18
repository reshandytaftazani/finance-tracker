import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/authContext";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Masukkan password terlebih dahulu.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Gagal masuk. Periksa password dan coba lagi.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 shadow-xs">
            <Lock className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Masuk ke Personal Finance
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Aplikasi keuangan pribadi untuk pemilik tunggal (single-owner).
          </p>
        </div>

        <div className="finance-panel p-6 sm:p-8 shadow-xs border border-[var(--border)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-700 dark:text-rose-400 flex items-start gap-2.5"
              >
                <span className="font-semibold shrink-0">Kesalahan:</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-[var(--foreground)]"
              >
                Password Pemilik
              </label>
              <div className="relative mt-2">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password Anda"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-[var(--foreground)] placeholder-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 sm:text-sm pr-11"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-hidden"
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Memverifikasi..." : "Masuk"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-5">
            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Kredensial disimpan secara aman (Argon2id) dan dikonfigurasi melalui CLI server:{" "}
                <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  python -m scripts.auth set-password
                </code>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
