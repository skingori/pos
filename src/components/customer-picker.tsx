"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFixedMenu } from "@/components/ui/use-fixed-menu";

export type PickerCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  balance: number;
  priceLevel?: { discountPercent: number } | null;
};

type Props = {
  customers: PickerCustomer[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (customer: PickerCustomer) => void;
  label?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
};

export function CustomerPicker({
  customers,
  value,
  onChange,
  onCreated,
  label = "Customer",
  emptyLabel = "Walk-in",
  allowEmpty = true,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const pos = useFixedMenu(open, triggerRef);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", creditLimit: "0" });

  const selected = customers.find((c) => c.id === value);
  const display = selected?.name || (allowEmpty ? emptyLabel : "Select customer");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.phone || "").toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term)
    );
  }, [customers, q]);

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

  useEffect(() => {
    if (open) {
      setQ("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  function openAdd() {
    setOpen(false);
    setForm({ name: "", phone: "", email: "", creditLimit: "0" });
    setError("");
    setAddOpen(true);
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        creditLimit: Number(form.creditLimit) || 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not add customer");
      return;
    }
    const created: PickerCustomer = {
      id: data.id,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      balance: Number(data.balance) || 0,
      priceLevel: data.priceLevel ?? null,
    };
    onCreated(created);
    onChange(created.id);
    setAddOpen(false);
  }

  const menu =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        className="fixed z-[70] flex flex-col overflow-hidden rounded-lg border border-[var(--sf-border)] bg-white shadow-lg ring-1 ring-black/5"
        style={{
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxHeight,
          top: pos.place === "below" ? pos.top : undefined,
          bottom: pos.place === "above" ? window.innerHeight - pos.top : undefined,
        }}
      >
        <div className="shrink-0 border-b border-[var(--sf-border)] p-1.5">
          <input
            ref={searchRef}
            className="h-8 w-full rounded-md border border-[var(--sf-border)] px-2 text-xs outline-none focus:border-[var(--sf-accent)] focus:shadow-[0_0_0_3px_var(--sf-accent-soft)]"
            placeholder="Search name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {allowEmpty && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--sf-surface-2)] ${
                  !value ? "bg-[var(--sf-surface-2)] font-semibold text-[var(--sf-brand)]" : "text-[var(--sf-text)]"
                }`}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <span
                  className={`grid size-3.5 shrink-0 place-items-center text-[10px] ${
                    !value ? "text-[var(--sf-accent)]" : "text-transparent"
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
                {emptyLabel}
              </button>
            </li>
          )}
          {filtered.map((c) => {
            const on = c.id === value;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--sf-surface-2)] ${
                    on ? "bg-[var(--sf-surface-2)] font-semibold text-[var(--sf-brand)]" : "text-[var(--sf-text)]"
                  }`}
                  onClick={() => {
                    onChange(c.id);
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
                  <span className="min-w-0 truncate">
                    {c.name}
                    {c.phone ? (
                      <span className="ml-1 font-normal text-[var(--sf-muted)]">{c.phone}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
          {!filtered.length && (
            <li className="px-2.5 py-2 text-xs text-[var(--sf-muted)]">No customers match.</li>
          )}
        </ul>
        <div className="shrink-0 border-t border-[var(--sf-border)] p-1.5">
          <button
            type="button"
            className="flex h-8 w-full items-center justify-center gap-1 rounded-md border border-[var(--sf-border)] bg-white text-[11px] font-semibold text-[var(--sf-brand)] hover:bg-[var(--sf-surface-2)]"
            onClick={openAdd}
          >
            + Add customer
          </button>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <div ref={rootRef}>
        <span className="text-[11px] font-semibold text-[var(--sf-muted)]">{label}</span>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          className={`mt-1 flex h-8 w-full items-center justify-between gap-2 rounded-md border-[1.5px] border-[var(--sf-border-strong)] bg-white px-2.5 text-left text-xs font-semibold text-[var(--sf-brand)] transition hover:border-[#94a3b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-accent)] ${
            open ? "border-[var(--sf-accent)] shadow-[0_0_0_3px_var(--sf-accent-soft)]" : ""
          }`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="truncate">{display}</span>
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
        </button>
      </div>
      {menu}

      {addOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-add-customer-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAddOpen(false);
            }}
          >
            <form
              onSubmit={saveCustomer}
              className="my-auto w-full max-w-md space-y-3 rounded-lg border border-[var(--sf-border)] bg-white p-4 shadow-lg"
            >
              <div>
                <h2 id="pos-add-customer-title" className="sf-display text-sm font-bold text-[var(--sf-brand)]">
                  Add customer
                </h2>
                <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
                  Stays on this sale — new customer is selected after save.
                </p>
              </div>
              {error && <p className="sf-alert sf-alert-error text-xs">{error}</p>}
              <label className="block text-xs">
                Name
                <input
                  className="sf-input mt-1"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Rafiki Hardwares"
                />
              </label>
              <label className="block text-xs">
                Phone
                <input
                  className="sf-input mt-1"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="07xxxxxxxx"
                />
              </label>
              <label className="block text-xs">
                Email <span className="font-normal text-[var(--sf-muted)]">(optional)</span>
                <input
                  type="email"
                  className="sf-input mt-1"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="block text-xs">
                Credit limit (KSh)
                <input
                  className="sf-input mt-1"
                  inputMode="decimal"
                  value={form.creditLimit}
                  onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="h-8 rounded-md border border-[var(--sf-border)] bg-white px-3 text-xs font-semibold"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8 rounded-md bg-[var(--sf-brand)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add & select"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </>
  );
}
