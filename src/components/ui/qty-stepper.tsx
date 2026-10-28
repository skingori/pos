"use client";

import { useEffect, useState } from "react";

const DECIMAL_UNITS = new Set([
  "kg",
  "kgs",
  "g",
  "gram",
  "grams",
  "l",
  "ltr",
  "ltrs",
  "lt",
  "litre",
  "litres",
  "liter",
  "liters",
  "m",
  "mtr",
  "metre",
  "meter",
  "ft",
  "bag",
  "sack",
]);

export function allowsDecimal(unit: string) {
  const u = (unit || "").trim().toLowerCase();
  if (!u) return false;
  if (DECIMAL_UNITS.has(u)) return true;
  return /^(kg|kgs|g|ltr?s?|litres?|liters?|m|metres?|meters?|ft|bag|sack)s?$/.test(u);
}

/** Preferred +/- step for weight/volume units (half kg / half litre). */
export function decimalStep(unit: string) {
  return allowsDecimal(unit) ? 0.5 : 1;
}

export function QtyStepper({
  value,
  max,
  unit,
  onChange,
  compact = false,
}: {
  value: number;
  max: number;
  unit: string;
  onChange: (qty: number) => void;
  compact?: boolean;
}) {
  const decimal = allowsDecimal(unit);
  const step = decimalStep(unit);
  const min = decimal ? 0.5 : 1;
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  function clamp(n: number) {
    const v = decimal ? Math.round(n * 100) / 100 : Math.round(n);
    return Math.min(max, Math.max(decimal ? 0.01 : 1, v));
  }

  function commit() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n <= 0) {
      setDraft(String(value));
      return;
    }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  const over = Number(draft) > max;

  return (
    <div className="flex items-center gap-1.5">
      {compact ? (
        <div className={`sf-qty-compact ${over ? "is-over" : ""}`} title={`${unit} · ${max} left`}>
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={value <= 0.01}
            onClick={() => onChange(clamp(value - step))}
          >
            −
          </button>
          <input
            inputMode={decimal ? "decimal" : "numeric"}
            aria-label="Quantity"
            value={draft}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(String(value));
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={value >= max}
            onClick={() => onChange(clamp(value + step))}
          >
            +
          </button>
        </div>
      ) : (
        <>
          <div className={`sf-qty ${over ? "border-rose-400" : ""}`}>
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={value <= min}
              onClick={() => onChange(clamp(value - step))}
            >
              -
            </button>
            <input
              inputMode={decimal ? "decimal" : "numeric"}
              aria-label="Quantity"
              value={draft}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDraft(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setDraft(String(value));
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  onChange(clamp(value + step));
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  onChange(clamp(value - step));
                }
              }}
            />
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={value >= max}
              onClick={() => onChange(clamp(value + step))}
            >
              +
            </button>
          </div>
          <span className={`text-[11px] ${over ? "font-medium text-rose-600" : "text-slate-400"}`}>
            {over ? `Only ${max} in stock` : `${unit} · ${max} left`}
          </span>
        </>
      )}
    </div>
  );
}
