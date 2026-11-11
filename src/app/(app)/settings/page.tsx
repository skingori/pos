"use client";

import { useEffect, useState } from "react";

type Settings = {
  shopName: string;
  defaultMarkupPercent: number;
  vatPercent: number;
  pricesIncludeVat: boolean;
  currency: string;
  address: string | null;
  phone: string | null;
  kraPin: string | null;
  receiptFooter: string;
};

const input =
  "h-9 w-full rounded-md border border-[var(--sf-border)] bg-white px-2.5 text-sm text-[var(--sf-brand)] outline-none focus:border-[var(--sf-accent)] focus:ring-1 focus:ring-[var(--sf-accent)]";
const labelCls = "mb-1 block text-xs font-medium text-[var(--sf-muted)]";

function Switch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? "bg-[var(--sf-accent)]" : "bg-slate-300"
      }`}
      onClick={onChange}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedVatPercent, setSavedVatPercent] = useState(16);

  async function load() {
    setLoading(true);
    const s = await fetch("/api/settings").then((r) => r.json());
    if (s && typeof s === "object") {
      setSettings(s);
      if (Number(s.vatPercent) > 0) setSavedVatPercent(Number(s.vatPercent));
    } else {
      setSettings(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setMsg("");
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!settings) return;
    setError("");
    setMsg("");
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setSettings(data);
    if (Number(data.vatPercent) > 0) setSavedVatPercent(Number(data.vatPercent));
    setMsg("Saved");
    if (typeof window !== "undefined") {
      if (data?.shopName) {
        window.dispatchEvent(
          new CustomEvent("sf:shop-updated", { detail: { shopName: data.shopName } })
        );
      }
      window.dispatchEvent(new CustomEvent("sf:settings-updated", { detail: data }));
    }
  }

  function setVatEnabled(on: boolean) {
    if (!settings) return;
    if (on) {
      patch("vatPercent", savedVatPercent > 0 ? savedVatPercent : 16);
      return;
    }
    if (settings.vatPercent > 0) setSavedVatPercent(settings.vatPercent);
    patch("vatPercent", 0);
  }

  if (loading || !settings) {
    return <p className="text-sm text-[var(--sf-muted)]">Loading settings…</p>;
  }

  const vatOn = settings.vatPercent > 0;
  const panel =
    "overflow-hidden rounded-xl border border-[var(--sf-border)] bg-white shadow-sm";
  const primaryBtn =
    "inline-flex h-8 items-center rounded-lg bg-[var(--sf-accent)] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[var(--sf-accent-deep)] disabled:opacity-50";

  const metrics = [
    {
      label: "Shop",
      value: settings.shopName || "—",
      note: "Receipt header",
    },
    {
      label: "VAT",
      value: vatOn ? `${settings.vatPercent}%` : "Off",
      note: vatOn
        ? settings.pricesIncludeVat
          ? "Prices include VAT"
          : "VAT exclusive"
        : "Not charged at POS",
    },
    {
      label: "Markup",
      value: `${settings.defaultMarkupPercent}%`,
      note: "Inventory suggest sell",
    },
  ];

  return (
    <div className="space-y-4">
      <section className={panel} aria-label="Settings overview">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <h1 className="sf-display truncate text-lg font-extrabold tracking-tight text-[var(--sf-brand)] sm:text-xl">
              Settings
            </h1>
            <p className="mt-0.5 text-xs text-[var(--sf-muted)]">Shop, receipts, and VAT</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {error ? (
              <span className="text-xs font-semibold text-rose-700">{error}</span>
            ) : msg ? (
              <span className="text-xs font-semibold text-emerald-700">{msg}</span>
            ) : null}
            <button type="button" className={primaryBtn} disabled={saving} onClick={() => save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 border-t border-slate-100 sm:grid-cols-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="relative min-w-0 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[var(--sf-brand)]/80 to-transparent" />
              <p className="pl-2 text-[10px] font-bold uppercase tracking-wider text-[var(--sf-muted)]">
                {m.label}
              </p>
              <p className="mt-1 truncate pl-2 font-mono text-base font-extrabold tabular-nums text-[var(--sf-brand)]">
                {m.value}
              </p>
              <p className="mt-0.5 truncate pl-2 text-[10px] text-[var(--sf-muted)]">{m.note}</p>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={save} className="space-y-4">
        <section className={panel} aria-label="Shop and receipt">
          <header className="border-b border-slate-100 px-5 py-3">
            <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">
              Shop & receipt
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">
              Printed on receipts and purchase slips
            </p>
          </header>
          <div className="grid gap-x-3 gap-y-3 px-5 py-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="shopName">
                Shop name
              </label>
              <input
                id="shopName"
                className={input}
                value={settings.shopName}
                onChange={(e) => patch("shopName", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                className={input}
                value={settings.phone || ""}
                onChange={(e) => patch("phone", e.target.value || null)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="address">
                Address
              </label>
              <input
                id="address"
                className={input}
                value={settings.address || ""}
                onChange={(e) => patch("address", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="kraPin">
                KRA PIN
              </label>
              <input
                id="kraPin"
                className={`${input} font-mono`}
                value={settings.kraPin || ""}
                onChange={(e) => patch("kraPin", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="currency">
                Currency
              </label>
              <input
                id="currency"
                className={`${input} font-mono`}
                value={settings.currency}
                onChange={(e) => patch("currency", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="receiptFooter">
                Receipt footer
              </label>
              <textarea
                id="receiptFooter"
                rows={2}
                className={`${input} h-auto resize-y py-2`}
                value={settings.receiptFooter || ""}
                onChange={(e) => patch("receiptFooter", e.target.value)}
                placeholder="Thank you for shopping with us"
              />
            </div>
          </div>
        </section>

        <section className={panel} aria-label="Tax and pricing">
          <header className="border-b border-slate-100 px-5 py-3">
            <h2 className="sf-display text-[13px] font-bold text-[var(--sf-brand)]">
              Tax & pricing
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--sf-muted)]">Markup and POS VAT</p>
          </header>
          <div className="grid gap-x-3 gap-y-3 px-5 py-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="markup">
                Default markup %
              </label>
              <input
                id="markup"
                type="number"
                min={0}
                max={500}
                step="0.01"
                className={`${input} font-mono`}
                value={settings.defaultMarkupPercent}
                onChange={(e) => patch("defaultMarkupPercent", Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 sm:pt-5">
              <div>
                <label className="text-xs font-medium text-[var(--sf-brand)]" htmlFor="vatToggle">
                  Charge VAT
                </label>
                <p className="text-[11px] text-[var(--sf-muted)]">Adds VAT on POS totals</p>
              </div>
              <Switch id="vatToggle" checked={vatOn} onChange={() => setVatEnabled(!vatOn)} />
            </div>
            {vatOn ? (
              <>
                <div>
                  <label className={labelCls} htmlFor="vatPercent">
                    VAT %
                  </label>
                  <input
                    id="vatPercent"
                    type="number"
                    min={0.01}
                    max={100}
                    step="0.01"
                    className={`${input} font-mono`}
                    value={settings.vatPercent}
                    onChange={(e) => {
                      const n = Number(e.target.value) || 0;
                      if (n > 0) setSavedVatPercent(n);
                      patch("vatPercent", n);
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 sm:pt-5">
                  <div>
                    <label className="text-xs font-medium text-[var(--sf-brand)]" htmlFor="incVat">
                      Prices include VAT
                    </label>
                    <p className="text-[11px] text-[var(--sf-muted)]">Sell price already has VAT</p>
                  </div>
                  <Switch
                    id="incVat"
                    checked={settings.pricesIncludeVat}
                    onChange={() => patch("pricesIncludeVat", !settings.pricesIncludeVat)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <button type="submit" className={primaryBtn} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
