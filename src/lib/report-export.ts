import { toCsv } from "@/lib/csv";

type Row = Record<string, string | number | null | undefined>;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapePdf(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function downloadReportCsv(rows: Row[], filename: string) {
  const csv = toCsv(rows);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** Excel-friendly HTML workbook (.xls) — opens in Excel / LibreOffice without extra deps. */
export function downloadReportExcel(rows: Row[], filename: string, sheetName = "Report") {
  if (!rows.length) {
    downloadBlob(new Blob([""], { type: "application/vnd.ms-excel" }), filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const head = headers.map((h) => `<th>${escapeXml(h)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${headers
          .map((h) => `<td>${escapeXml(r[h] == null ? "" : String(r[h]))}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(
    sheetName
  )}</title></head><body><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  downloadBlob(
    new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }),
    filename.endsWith(".xls") ? filename : `${filename}.xls`
  );
}

export function downloadReportPdf(
  title: string,
  subtitle: string,
  rows: Row[],
  filename: string
) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines: string[] = [title, subtitle, ""];
  if (!rows.length) {
    lines.push("No rows for this period.");
  } else {
    lines.push(headers.join(" | "));
    lines.push("-".repeat(Math.min(90, headers.join(" | ").length)));
    for (const r of rows.slice(0, 200)) {
      lines.push(headers.map((h) => (r[h] == null ? "" : String(r[h]))).join(" | "));
    }
    if (rows.length > 200) lines.push(`…and ${rows.length - 200} more rows`);
  }

  const fontSize = 8;
  const leading = 10;
  const marginX = 28;
  const pageWidth = 595;
  const pageHeight = Math.max(842, 48 + lines.length * leading);
  const startY = pageHeight - 36;

  const content: string[] = [
    "BT",
    `/F1 ${fontSize} Tf`,
    `${marginX} ${startY} Td`,
    `${leading} TL`,
  ];
  lines.forEach((line, i) => {
    const safe = escapePdf(line.slice(0, 110));
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

  downloadBlob(new Blob([pdf], { type: "application/pdf" }), filename);
}
