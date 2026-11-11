import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { roundMoney } from "@/lib/money";
import { getShopSettings } from "@/lib/settings";
import { postPurchaseJournal } from "@/lib/gl";
import { resolveBranchId } from "@/lib/branch";
import { receiveLines } from "@/lib/purchase-receive";

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function groupKey(row: Record<string, string>) {
  const ref = (row.purchase_ref || row.ref || "").trim();
  if (ref) return `ref:${ref.toLowerCase()}`;
  const supplier = (row.supplier || "").trim().toLowerCase() || "none";
  const note = (row.note || "").trim().toLowerCase();
  const received = (row.received_at || "").trim().slice(0, 10);
  return `grp:${supplier}|${note}|${received}`;
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!hasPermission(user, "purchasing.manage")) return forbidden();

  const contentType = req.headers.get("content-type") || "";
  let text = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }
    text = await file.text();
  } else {
    text = await req.text();
  }

  const rows = parseCsv(text);
  if (!rows.length) {
    return NextResponse.json({ error: "No data rows found" }, { status: 400 });
  }

  const branchId = await resolveBranchId(user);
  const settings = await getShopSettings();
  const products = await prisma.product.findMany({
    where: { active: true, isReturnSku: false },
    select: { id: true, name: true, sku: true },
  });
  const bySku = new Map(
    products.filter((p) => p.sku).map((p) => [p.sku.toLowerCase(), p])
  );
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));

  const suppliers = await prisma.supplier.findMany({ where: { active: true } });
  const supplierByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s]));

  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  let created = 0;
  let lineCount = 0;
  const errors: string[] = [];

  for (const [, groupRows] of groups) {
    const first = groupRows[0];
    const supplierName = (first.supplier || "").trim();
    let supplierId: string | null = null;
    if (supplierName) {
      const existing = supplierByName.get(supplierName.toLowerCase());
      if (existing) {
        supplierId = existing.id;
      } else {
        const createdSupplier = await prisma.supplier.create({
          data: { name: supplierName },
        });
        supplierByName.set(supplierName.toLowerCase(), createdSupplier);
        supplierId = createdSupplier.id;
      }
    }

    const lines: { productId: string; qty: number; unitCost: number }[] = [];
    for (let i = 0; i < groupRows.length; i++) {
      const row = groupRows[i];
      const sku = (row.product_sku || row.sku || "").trim();
      const name = (row.product_name || row.product || "").trim();
      const product =
        (sku && bySku.get(sku.toLowerCase())) ||
        (name && byName.get(name.toLowerCase())) ||
        null;
      if (!product) {
        errors.push(`Row product not found: ${sku || name || "(blank)"}`);
        continue;
      }
      const qty = Number(row.qty);
      const unitCost = Number(row.unit_cost || row.cost);
      if (!(qty > 0) || !(unitCost >= 0) || Number.isNaN(unitCost)) {
        errors.push(`Invalid qty/cost for ${product.name}`);
        continue;
      }
      lines.push({ productId: product.id, qty, unitCost });
    }

    if (!lines.length) continue;

    const totalCost = roundMoney(lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
    const receivedAtRaw = (first.received_at || "").trim();
    const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : new Date();
    if (Number.isNaN(receivedAt.getTime())) {
      errors.push(`Invalid received_at: ${receivedAtRaw}`);
      continue;
    }

    try {
      const purchase = await prisma.$transaction(async (tx) => {
        const p = await tx.purchase.create({
          data: {
            supplierId,
            userId: user.id,
            branchId,
            status: "RECEIVED",
            note: (first.note || "").trim() || null,
            totalCost,
            orderedAt: null,
            receivedAt,
            lines: {
              create: lines.map((l) => ({
                productId: l.productId,
                qty: l.qty,
                unitCost: l.unitCost,
              })),
            },
          },
        });
        await receiveLines(tx, branchId, lines, false, settings?.defaultMarkupPercent);
        await postPurchaseJournal(tx, { id: p.id, totalCost: p.totalCost });
        return p;
      });

      await writeAudit({
        userId: user.id,
        action: "PURCHASE_IMPORT",
        entity: "Purchase",
        entityId: purchase.id,
        detail: `${lines.length} lines · ${totalCost}`,
      });
      created += 1;
      lineCount += lines.length;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Import group failed");
    }
  }

  return NextResponse.json({
    created,
    lineCount,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
  });
}
