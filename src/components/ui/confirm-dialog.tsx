"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Tone = "danger" | "default" | "success";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  loading?: boolean;
  hideCancel?: boolean;
  inputValue?: string;
  inputPlaceholder?: string;
  inputLabel?: string;
  onInputChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const toneStyles: Record<Tone, { icon: string; btn: string }> = {
  danger: {
    icon: "bg-rose-100 text-rose-700",
    btn: "bg-rose-600 hover:bg-rose-500 focus-visible:outline-rose-600",
  },
  default: {
    icon: "bg-slate-100 text-slate-700",
    btn: "bg-[var(--sf-brand)] hover:bg-[var(--sf-brand-soft)] focus-visible:outline-[var(--sf-brand)]",
  },
  success: {
    icon: "bg-emerald-100 text-emerald-800",
    btn: "bg-emerald-600 hover:bg-emerald-500 focus-visible:outline-emerald-600",
  },
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  tone = "default",
  loading,
  hideCancel,
  inputValue,
  inputPlaceholder,
  inputLabel,
  onInputChange,
  onConfirm,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = typeof onInputChange === "function";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  useEffect(() => {
    if (!open || !showInput) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, showInput]);

  if (!open || typeof document === "undefined") return null;

  const styles = toneStyles[tone];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sf-confirm-title"
      aria-describedby="sf-confirm-desc"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) onConfirm();
          }}
        >
          <div className="px-5 pt-5 text-center sm:px-6 sm:pt-6">
            <div
              className={`mx-auto mb-3 grid size-12 place-items-center rounded-full ${styles.icon}`}
              aria-hidden
            >
              {tone === "danger" ? (
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4m0 4h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
                </svg>
              ) : tone === "success" ? (
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5m0 3h.01" />
                </svg>
              )}
            </div>
            <h2 id="sf-confirm-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <p id="sf-confirm-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
              {message}
            </p>
            {showInput ? (
              <label className="mt-4 block text-left text-xs font-medium text-slate-500">
                {inputLabel || "Label"}
                <input
                  ref={inputRef}
                  className="mt-1.5 h-10 w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 outline-none focus:ring-2 focus:ring-[var(--sf-brand)]"
                  value={inputValue || ""}
                  placeholder={inputPlaceholder}
                  disabled={loading}
                  onChange={(e) => onInputChange?.(e.target.value)}
                />
              </label>
            ) : null}
          </div>
          <div
            className={`mt-5 grid gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 ${hideCancel ? "" : "sm:grid-cols-2"}`}
          >
            {!hideCancel && (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={loading}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="submit"
              className={`inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${styles.btn}`}
              disabled={loading}
            >
              {loading ? "Please wait…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
