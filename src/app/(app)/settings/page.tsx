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

type PriceLevel = { id: string; name: string; discountPercent: number };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [levels, setLevels] = useState<PriceLevel[]>([]);
  const [levelName, setLevelName] = useState("");
  const [levelDiscount, setLevelDiscount] = useState("0");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [s, l] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/price-levels").then((r) => r.json()),
    ]);
    setSettings(s);
    setLevels(l);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError("");
    setMsg("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setSettings(data);
    setMsg("Settings saved");
  }

  async function addLevel(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/price-levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: levelName,
        discountPercent: Number(levelDiscount) || 0,
      }),
    });
    if (res.ok) {
      setLevelName("");
      setLevelDiscount("0");
      load();
    }
  }

  if (!settings) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--sf-brand)]">Settings</h1>
      {error && <p className="sf-alert sf-alert-error">{error}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}

      <form onSubmit={save} className="sf-card space-y-3 p-5">
        <h2 className="font-medium">Company</h2>
        {(
          [
            ["shopName", "Shop name"],
            ["address", "Address"],
            ["phone", "Phone"],
            ["kraPin", "KRA PIN"],
            ["currency", "Currency"],
            ["receiptFooter", "Receipt footer"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            {label}
            <input
              className="sf-input mt-1"
              value={(settings[key] as string) || ""}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="block text-sm">
          Default markup %
          <input
            type="number"
            className="sf-input mt-1"
            value={settings.defaultMarkupPercent}
            onChange={(e) =>
              setSettings({ ...settings, defaultMarkupPercent: Number(e.target.value) })
            }
          />
        </label>
        <label className="block text-sm">
          VAT %
          <input
            type="number"
            className="sf-input mt-1"
            value={settings.vatPercent}
            onChange={(e) =>
              setSettings({ ...settings, vatPercent: Number(e.target.value) })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.pricesIncludeVat}
            onChange={(e) =>
              setSettings({ ...settings, pricesIncludeVat: e.target.checked })
            }
          />
          Prices include VAT
        </label>
        <button type="submit" className="sf-btn sf-btn-primary">
          Save settings
        </button>
      </form>

      <section className="sf-card p-5">
        <h2 className="font-medium">Price levels (QuickBooks-style)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Assign to customers for automatic discounts at POS (e.g. Wholesale 10%).
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {levels.map((l) => (
            <li key={l.id} className="flex justify-between border-t pt-2">
              <span>{l.name}</span>
              <span>{l.discountPercent}% off</span>
            </li>
          ))}
        </ul>
        <form onSubmit={addLevel} className="mt-3 flex flex-wrap gap-2">
          <input
            className="sf-input"
            placeholder="Name e.g. Wholesale"
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            required
          />
          <input
            className="sf-input w-24"
            placeholder="% off"
            value={levelDiscount}
            onChange={(e) => setLevelDiscount(e.target.value)}
          />
          <button type="submit" className="sf-btn sf-btn-ghost">
            Add level
          </button>
        </form>
      </section>
    </div>
  );
}
