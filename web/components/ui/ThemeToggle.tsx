"use client";

import { useState, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "horse-chaos-theme";

function applyTheme(theme: Theme | null) {
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function resolveSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored ?? resolveSystemTheme();
}

// `false` on the server and during hydration, `true` on every render after it.
// This keeps the first client render byte-identical to the server's without
// setting state from inside an effect.
const subscribeToNothing = () => () => {};
const getMountedSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getMountedSnapshot,
    getServerSnapshot,
  );
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <div className="theme-toggle-wrap">
      <button
        type="button"
        className="theme-toggle-button"
        onClick={toggle}
        aria-label="Toggle color theme"
      >
        {mounted ? (theme === "dark" ? "☀️" : "🌙") : "🌓"}
      </button>
    </div>
  );
}
