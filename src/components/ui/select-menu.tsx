"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFixedMenu } from "./use-fixed-menu";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`size-3.5 shrink-0 text-[var(--sf-muted)] transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function SelectMenu({
  value,
  onChange,
  options,
  label,
  id,
  disabled,
  placeholder = "Select…",
  className = "",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pos = useFixedMenu(open, triggerRef, { minSpace: 140, maxMenu: 240 });

  const selected = options.find((o) => o.value === value);
  const display = selected?.label || placeholder;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        className="fixed z-[70] overflow-hidden rounded-lg border border-[var(--sf-border)] bg-white shadow-lg ring-1 ring-black/5"
        style={{
          left: pos.left,
          width: Math.max(pos.width, 140),
          maxHeight: pos.maxHeight,
          top: pos.place === "below" ? pos.top : undefined,
          bottom: pos.place === "above" ? window.innerHeight - pos.top : undefined,
        }}
      >
        <ul className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--sf-surface-2)] ${
                    on ? "bg-[var(--sf-surface-2)] font-semibold text-[var(--sf-brand)]" : "text-[var(--sf-text)]"
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span
                    className={`grid size-3.5 shrink-0 place-items-center text-[10px] ${
                      on ? "text-[var(--sf-accent)]" : "text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0 truncate">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className={className}>
      {label ? (
        <label htmlFor={id} className="text-[11px] font-semibold text-[var(--sf-muted)]">
          {label}
        </label>
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`flex h-8 w-full items-center justify-between gap-2 rounded-md border-[1.5px] border-[var(--sf-border-strong)] bg-white px-2.5 text-left text-xs font-semibold text-[var(--sf-brand)] transition hover:border-[#94a3b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
          label ? "mt-1" : ""
        } ${open ? "border-[var(--sf-accent)] shadow-[0_0_0_3px_var(--sf-accent-soft)]" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`truncate ${selected ? "" : "font-medium text-[var(--sf-muted)]"}`}>{display}</span>
        <Chevron open={open} />
      </button>
      {menu}
    </div>
  );
}
