"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/toast";

function syncTheme() {
  try {
    const stored = localStorage.getItem("sf-theme");
    const theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "dark");
  } catch {
    /* ignore */
  }
}

function ThemeSync() {
  useEffect(() => {
    syncTheme();
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const wanted = localStorage.getItem("sf-theme") === "dark";
      const hasDark = root.classList.contains("dark");
      const attr = root.getAttribute("data-theme");
      if (wanted !== hasDark || (wanted ? attr !== "dark" : attr === "dark")) {
        syncTheme();
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeSync />
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
