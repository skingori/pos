"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ToastTone = "success" | "error" | "warn";

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_MS = 5000;
const MAX_TOASTS = 4;

const toneClass: Record<ToastTone, string> = {
  success: "sf-alert sf-alert-ok",
  error: "sf-alert sf-alert-error",
  warn: "sf-alert sf-alert-warn",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const text = message.trim();
    if (!text) return;
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, tone, message: text }].slice(-MAX_TOASTS));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, DISMISS_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      warn: (message) => push("warn", message),
    }),
    [push]
  );

  const host =
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-4"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto w-full max-w-md shadow-lg ${toneClass[t.tone]}`}
          >
            <p className="whitespace-pre-wrap break-words text-sm font-medium">{t.message}</p>
          </div>
        ))}
      </div>,
      document.body
    );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {host}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
