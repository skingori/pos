import { formatKes } from "@/lib/money";
import type { ThermalReceiptData } from "@/components/thermal-receipt";

function escapePdf(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function receiptLines(data: ThermalReceiptData & { docType?: "receipt" | "bill" }) {
  const when = data.completedAt ? new Date(data.completedAt) : new Date();
  const isBill = data.docType === "bill";
  const out: string[] = [];
  out.push(data.shopName);
  if (data.address) out.push(data.address);
  if (data.phone) out.push(`Tel: ${data.phone}`);
  if (data.kraPin) out.push(`PIN: ${data.kraPin}`);
  out.push("--------------------------------");
  out.push(isBill ? "*** BILL COPY — NOT PAID ***" : `Receipt #${data.receiptNo}`);
  out.push(when.toLocaleString("en-KE"));
  if (data.cashier) out.push(`Cashier: ${data.cashier}`);
  if (data.customer?.name) out.push(`Customer: ${data.customer.name}`);
  out.push("--------------------------------");
  for (const l of data.lines) {
    out.push(l.name);
    out.push(`  ${l.qty} ${l.unit} x ${formatKes(l.unitPrice)} = ${formatKes(l.lineTotal)}`);
  }
  out.push("--------------------------------");
  if (typeof data.subtotal === "number") out.push(`Subtotal: ${formatKes(data.subtotal)}`);
  if ((data.discount || 0) > 0) out.push(`Discount: -${formatKes(data.discount || 0)}`);
  if ((data.taxAmount || 0) > 0) out.push(`VAT ${data.taxRate}%: ${formatKes(data.taxAmount || 0)}`);
  out.push(`TOTAL: ${formatKes(data.total)}`);
  if (!isBill && data.payments?.length) {
    out.push("--------------------------------");
    for (const p of data.payments) {
      out.push(
        `${p.method}${p.mpesaReceipt ? ` ${p.mpesaReceipt}` : ""}: ${formatKes(p.amount)}`
      );
    }
  }
  const creditAmt = (data.payments || [])
    .filter((p) => p.method === "CREDIT")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const prevBal =
    data.creditBalanceBefore != null && Number.isFinite(data.creditBalanceBefore)
      ? Number(data.creditBalanceBefore)
      : null;
  if (creditAmt > 0.009 || (isBill && prevBal != null && prevBal > 0.009)) {
    out.push("--------------------------------");
    out.push("Account");
    if (prevBal != null) out.push(`Previous balance: ${formatKes(prevBal)}`);
    if (creditAmt > 0.009) {
      out.push(`${isBill ? "This bill (credit)" : "This credit"}: ${formatKes(creditAmt)}`);
    }
    if (prevBal != null) {
      out.push(
        `${isBill ? "Balance if on credit" : "New balance"}: ${formatKes(prevBal + creditAmt)}`
      );
    }
  }
  if (isBill) {
    out.push("--------------------------------");
    out.push("This is a bill / estimate only.");
    out.push("Payment not yet received.");
  } else if (data.receiptFooter) {
    out.push("--------------------------------");
    out.push(data.receiptFooter);
  }
  return out;
}

export function receiptPlainText(
  data: ThermalReceiptData & { docType?: "receipt" | "bill" }
) {
  return receiptLines(data).join("\n");
}

export function emailReceipt(
  data: ThermalReceiptData & { docType?: "receipt" | "bill" },
  to?: string | null
) {
  const isBill = data.docType === "bill";
  const subject = encodeURIComponent(
    isBill
      ? `Bill copy — ${data.shopName}`
      : `Receipt #${data.receiptNo} — ${data.shopName}`
  );
  const body = encodeURIComponent(receiptPlainText(data));
  const addr = (to || "").trim();
  window.location.href = `mailto:${addr}?subject=${subject}&body=${body}`;
}

export function downloadReceiptPdf(
  data: ThermalReceiptData & { docType?: "receipt" | "bill" },
  filename?: string
) {
  const lines = receiptLines(data);
  const fontSize = 10;
  const leading = 13;
  const marginX = 36;
  const pageWidth = 226; // ~80mm
  const pageHeight = Math.max(400, 60 + lines.length * leading);
  const startY = pageHeight - 36;

  const content: string[] = ["BT", `/F1 ${fontSize} Tf`, `${marginX} ${startY} Td`, `${leading} TL`];
  lines.forEach((line, i) => {
    const safe = escapePdf(line.slice(0, 64));
    if (i === 0) content.push(`(${safe}) Tj`);
    else content.push(`T* (${safe}) Tj`);
  });
  content.push("ET");
  const stream = content.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n`
  );
  objects.push(
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>endobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ||
    (data.docType === "bill"
      ? `bill-copy-${Date.now()}.pdf`
      : `receipt-${data.receiptNo}.pdf`);
  a.click();
  URL.revokeObjectURL(url);
}
