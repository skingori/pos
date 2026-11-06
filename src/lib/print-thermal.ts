/**
 * Print the 80mm receipt via a hidden iframe.
 * Avoids the about:blank popup that often produces a blank first page.
 */
export function printThermalReceipt(elementId = "thermal-receipt") {
  const node = document.getElementById(elementId);
  if (!node) {
    window.print();
    return;
  }

  const css = `
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 80mm !important;
      min-height: 0 !important;
      height: auto !important;
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 2mm 3mm !important; }
    .thermal-receipt {
      width: 74mm;
      max-width: 74mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #fff;
      color: #000;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
      font-size: 11px;
      line-height: 1.3;
      page-break-before: avoid;
      break-before: avoid;
    }
    .thermal-batch-item {
      page-break-after: always;
      break-after: page;
    }
    .thermal-batch-item:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .mx-auto { margin-left: 0; margin-right: 0; }
    .bg-white { background: #fff; }
    .bg-slate-50 { background: #f8fafc; }
    .text-black { color: #000; }
    .text-amber-800 { color: #92400e; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-extrabold { font-weight: 800; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace; }
    .uppercase { text-transform: uppercase; }
    .tracking-wide { letter-spacing: 0.04em; }
    .tracking-wider { letter-spacing: 0.06em; }
    .leading-tight { line-height: 1.15; }
    .leading-snug { line-height: 1.3; }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .whitespace-nowrap { white-space: nowrap; }
    .break-words { overflow-wrap: anywhere; word-break: break-word; }
    .break-all { word-break: break-all; overflow-wrap: anywhere; }
    .overflow-hidden { overflow: hidden; }
    .min-w-0 { min-width: 0; }
    .max-w-\\[42\\%\\] { max-width: 42%; }
    .max-w-\\[55\\%\\] { max-width: 55%; }
    .max-w-\\[58\\%\\] { max-width: 58%; }
    .max-w-\\[60\\%\\] { max-width: 60%; }
    .shrink { flex-shrink: 1; }
    .shrink-0 { flex-shrink: 0; }
    .flex-1 { flex: 1 1 0%; }
    .opacity-80 { opacity: 0.8; }
    .opacity-70 { opacity: 0.7; }
    .rounded { border-radius: 2px; }
    .border { border: 1px solid #000; }
    .border-t { border-top-width: 1px; border-top-style: solid; }
    .border-t-2 { border-top-width: 2px; border-top-style: solid; }
    .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
    .border-y { border-top-width: 1px; border-bottom-width: 1px; border-style: solid; }
    .border-dashed { border-style: dashed; }
    .border-dotted { border-style: dotted; }
    .border-black { border-color: #000; }
    .border-black\\/20 { border-color: rgba(0,0,0,0.2); }
    .border-black\\/40 { border-color: rgba(0,0,0,0.4); }
    .border-black\\/50 { border-color: rgba(0,0,0,0.5); }
    .border-black\\/60 { border-color: rgba(0,0,0,0.6); }
    .w-full { width: 100%; }
    .table-fixed { table-layout: fixed; }
    .w-\\[68\\%\\] { width: 68%; }
    .w-\\[32\\%\\] { width: 32%; }
    .flex { display: flex; }
    .items-start { align-items: flex-start; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 0.4rem; }
    .space-y-0\\.5 > * + * { margin-top: 0.125rem; }
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .align-top { vertical-align: top; }
    table { border-collapse: collapse; width: 100%; }
    .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
    .mt-0\\.5 { margin-top: 0.125rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-3 { margin-top: 0.75rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .p-2 { padding: 0.5rem; }
    .px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .pt-0\\.5 { padding-top: 0.125rem; }
    .pt-1 { padding-top: 0.25rem; }
    .pt-1\\.5 { padding-top: 0.375rem; }
    .pt-2 { padding-top: 0.5rem; }
    .pb-1 { padding-bottom: 0.25rem; }
    .pr-2 { padding-right: 0.5rem; }
    .text-\\[9px\\] { font-size: 9px; }
    .text-\\[10px\\] { font-size: 10px; }
    .text-\\[11px\\] { font-size: 11px; }
    .text-\\[12px\\] { font-size: 12px; }
    .text-\\[13px\\] { font-size: 13px; }
    .text-\\[15px\\] { font-size: 15px; }
  `;

  const prev = document.getElementById("sf-thermal-print-frame");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "sf-thermal-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  // Full slip width so %/flex children do not collapse.
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:80mm;height:200mm;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt</title><style>${css}</style></head><body>${node.outerHTML}</body></html>`
  );
  doc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 800);
  };

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  // Wait until the iframe document has laid out the receipt (avoids blank first page).
  const start = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(runPrint);
    });
  };

  if (doc.readyState === "complete") start();
  else iframe.onload = start;
}

/** Print a commercial A4 invoice preview by element id. */
export function printA4Invoice(elementId = "a4-tax-invoice") {
  const node = document.getElementById(elementId);
  if (!node) {
    window.print();
    return;
  }

  // A4 content width ≈ 210mm − 2×14mm page margins.
  const css = `
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 182mm !important;
      min-width: 182mm !important;
      max-width: 182mm !important;
      background: #fff !important;
      color: #0f172a !important;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .a4-tax-invoice {
      display: block;
      width: 182mm !important;
      min-width: 182mm !important;
      max-width: 182mm !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      color: #0f172a;
      background: #fff;
    }
    .a4-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      width: 182mm;
      padding-bottom: 14px;
      border-bottom: 1px solid #cbd5e1;
    }
    .a4-shop { flex: 1 1 auto; min-width: 0; }
    .a4-shop-name {
      margin: 0;
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .a4-meta { flex: 0 0 auto; text-align: right; }
    .a4-doc-title {
      margin: 0;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #c2410c;
    }
    .a4-receipt-no {
      margin: 6px 0 0;
      font-family: ui-monospace, monospace;
      font-size: 12pt;
      font-weight: 700;
    }
    .a4-muted { margin: 2px 0 0; color: #64748b; font-size: 9pt; }
    .a4-strong { font-weight: 700; }
    .a4-label {
      margin: 0 0 4px;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
    }
    .a4-parties {
      display: flex;
      gap: 16px;
      width: 182mm;
      margin-top: 16px;
    }
    .a4-card {
      flex: 1 1 50%;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 9.5pt;
    }
    .a4-card p { margin: 2px 0; }
    .a4-table {
      width: 182mm !important;
      border-collapse: collapse;
      margin-top: 18px;
      table-layout: fixed;
    }
    .a4-table th,
    .a4-table td {
      padding: 8px 6px;
      vertical-align: top;
      border-bottom: 1px solid #e2e8f0;
      font-size: 9.5pt;
    }
    .a4-table th {
      border-bottom: 1px solid #94a3b8;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #64748b;
      text-align: left;
    }
    .a4-col-desc { width: 40%; text-align: left; word-break: break-word; }
    .a4-col-qty { width: 12%; text-align: left; }
    .a4-col-num {
      width: 24%;
      text-align: right !important;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, monospace;
      font-size: 9pt;
      white-space: nowrap;
    }
    .a4-totals {
      width: 90mm;
      max-width: 100%;
      margin: 18px 0 0 auto;
    }
    .a4-total-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 3px 0;
      font-size: 9.5pt;
      font-variant-numeric: tabular-nums;
    }
    .a4-total-row span:last-child {
      font-family: ui-monospace, monospace;
      white-space: nowrap;
    }
    .a4-total-due {
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px solid #94a3b8;
      font-size: 11pt;
      font-weight: 800;
    }
    .a4-outstanding { color: #92400e; font-weight: 700; }
    .a4-payments {
      width: 182mm;
      margin-top: 18px;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }
    .a4-payments ul { list-style: none; margin: 6px 0 0; padding: 0; }
    .a4-footer {
      margin: 28px 0 0;
      text-align: center;
      font-size: 9pt;
      color: #64748b;
    }
  `;

  const prev = document.getElementById("sf-a4-print-frame");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "sf-a4-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  // Must be full A4 size — a 0×0 iframe collapses %/flex widths to content width.
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Tax Invoice</title><style>${css}</style></head><body>${node.outerHTML}</body></html>`
  );
  doc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 800);
  };

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  const start = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(runPrint);
    });
  };

  if (doc.readyState === "complete") start();
  else iframe.onload = start;
}
