import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyThemeClass,
  cycleTheme,
  getStoredTheme,
  isValidTheme,
  resolveTheme,
  setStoredTheme,
  THEME_STORAGE_KEY,
} from "../src/lib/theme.ts";

test("isValidTheme correctly validates theme values", () => {
  assert.equal(isValidTheme("system"), true);
  assert.equal(isValidTheme("light"), true);
  assert.equal(isValidTheme("dark"), true);
  assert.equal(isValidTheme("blue"), false);
  assert.equal(isValidTheme(null), false);
  assert.equal(isValidTheme(123), false);
});

test("resolveTheme resolves based on mode and system preference", () => {
  // Explicit light and dark ignore system
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("dark", false), "dark");

  // System follows systemIsDark
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("cycleTheme cycles through system -> light -> dark -> system", () => {
  assert.equal(cycleTheme("system"), "light");
  assert.equal(cycleTheme("light"), "dark");
  assert.equal(cycleTheme("dark"), "system");
});

test("getStoredTheme and setStoredTheme manage storage correctly", () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;

  // Default is system when storage is empty or invalid
  assert.equal(getStoredTheme(mockStorage), "system");

  store.set(THEME_STORAGE_KEY, "invalid-theme");
  assert.equal(getStoredTheme(mockStorage), "system");

  // Setting stored theme
  setStoredTheme("dark", mockStorage);
  assert.equal(store.get(THEME_STORAGE_KEY), "dark");
  assert.equal(getStoredTheme(mockStorage), "dark");

  setStoredTheme("light", mockStorage);
  assert.equal(store.get(THEME_STORAGE_KEY), "light");
  assert.equal(getStoredTheme(mockStorage), "light");

  setStoredTheme("system", mockStorage);
  assert.equal(store.get(THEME_STORAGE_KEY), "system");
  assert.equal(getStoredTheme(mockStorage), "system");
});

test("applyThemeClass adds or removes .dark on element", () => {
  const classes = new Set<string>();
  const mockElement = {
    classList: {
      add: (cls: string) => classes.add(cls),
      remove: (cls: string) => classes.delete(cls),
      contains: (cls: string) => classes.has(cls),
    },
  } as unknown as HTMLElement;

  applyThemeClass("dark", mockElement);
  assert.equal(classes.has("dark"), true);

  applyThemeClass("light", mockElement);
  assert.equal(classes.has("dark"), false);
});
