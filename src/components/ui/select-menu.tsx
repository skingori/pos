"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  triggerClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  actionLabel?: string;
  onAction?: () => void;
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
  triggerClassName = "",
  searchable = false,
  searchPlaceholder = "Search…",
  actionLabel,
  onAction,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pos = useFixedMenu(open, triggerRef, {
    minSpace: searchable || actionLabel ? 180 : 140,
    maxMenu: searchable ? 280 : 240,
  });

  const selected = options.find((o) => o.value === value);
  const display = selected?.label || placeholder;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (searchable) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open, searchable]);

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

  const listMax = pos
    ? Math.max(80, pos.maxHeight - (searchable ? 44 : 0) - (actionLabel ? 40 : 0))
    : 120;

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
        {searchable ? (
          <div className="border-b border-[var(--sf-border)] p-1.5">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md border-0 bg-[var(--sf-surface-2)] px-2.5 text-xs text-[var(--sf-text)] outline-none ring-1 ring-inset ring-[var(--sf-border)] placeholder:text-[var(--sf-muted)] focus:ring-2 focus:ring-[var(--sf-accent)]"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}
        <ul className="overflow-y-auto py-1" style={{ maxHeight: listMax }}>
          {filtered.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value || "__empty"}>
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
          {!filtered.length ? (
            <li className="px-2.5 py-2 text-xs text-[var(--sf-muted)]">No matches</li>
          ) : null}
        </ul>
        {actionLabel && onAction ? (
          <div className="border-t border-[var(--sf-border)] p-1">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--sf-accent-deep)] hover:bg-[var(--sf-accent-soft)]"
              onClick={() => {
                setOpen(false);
                onAction();
              }}
            >
              <span aria-hidden>+</span>
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>,
      document.body
    );

  const defaultTrigger =
    "flex h-8 w-full items-center justify-between gap-2 rounded-md border-[1.5px] border-[var(--sf-border-strong)] bg-white px-2.5 text-left text-xs font-semibold text-[var(--sf-brand)] transition hover:border-[#94a3b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-accent)] disabled:cursor-not-allowed disabled:opacity-50";

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
        className={`${triggerClassName || defaultTrigger} ${label ? "mt-1" : ""} ${
          open && !triggerClassName
            ? "border-[var(--sf-accent)] shadow-[0_0_0_3px_var(--sf-accent-soft)]"
            : ""
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`truncate ${selected ? "" : "font-medium text-[var(--sf-muted)]"}`}>{display}</span>
        <Chevron open={open} />
      </button>
      {menu}
    </div>
  );
}
