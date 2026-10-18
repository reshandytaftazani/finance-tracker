/**
 * Theme management: modes, persistence, and DOM class helpers.
 */

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "finance_tracker_theme";

/**
 * Validates if value is a recognized ThemeMode.
 */
export function isValidTheme(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Retrieves stored theme preference, falling back to 'system'.
 */
export function getStoredTheme(storage?: Storage): ThemeMode {
  const targetStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) {
    return "system";
  }
  try {
    const raw = targetStorage.getItem(THEME_STORAGE_KEY);
    if (isValidTheme(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage access errors (private browsing, etc.)
  }
  return "system";
}

/**
 * Saves theme preference to storage.
 */
export function setStoredTheme(theme: ThemeMode, storage?: Storage): void {
  const targetStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) {
    return;
  }
  try {
    targetStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota/permission errors
  }
}

/**
 * Determines effective light/dark theme given the selected mode and OS preference.
 */
export function resolveTheme(theme: ThemeMode, systemIsDark: boolean): ResolvedTheme {
  if (theme === "dark") {
    return "dark";
  }
  if (theme === "light") {
    return "light";
  }
  return systemIsDark ? "dark" : "light";
}

/**
 * Cycles theme sequentially: system -> light -> dark -> system.
 */
export function cycleTheme(current: ThemeMode): ThemeMode {
  if (current === "system") {
    return "light";
  }
  if (current === "light") {
    return "dark";
  }
  return "system";
}

/**
 * Applies the resolved theme class to the document root or specified element.
 */
export function applyThemeClass(resolved: ResolvedTheme, element?: HTMLElement): void {
  const target = element ?? (typeof document !== "undefined" ? document.documentElement : undefined);
  if (!target) {
    return;
  }
  if (resolved === "dark") {
    target.classList.add("dark");
  } else {
    target.classList.remove("dark");
  }
}
