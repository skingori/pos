import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized, forbidden } from "@/lib/api-auth";
import { canManageInventory } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { resolveBranchId } from "@/lib/branch";
import { setStock } from "@/lib/branch-stock";

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

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!canManageInventory(user.role)) return forbidden();

  const branchId = await resolveBranchId(user);
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

  const categories = await prisma.category.findMany();
  const byName = Object.fromEntries(categories.map((c) => [c.name.toLowerCase(), c.id]));

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name || row.product || "";
    const sku = row.sku || "";
    if (!name || !sku) {
      errors.push(`Row ${i + 2}: name and sku are required`);
      continue;
    }
    const cost = Number(row.cost ?? row.buying ?? row.buying_price ?? 0);
    const sellPrice = Number(row.sellprice ?? row.sell_price ?? row.sell ?? 0);
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(sellPrice) || sellPrice <= 0) {
      errors.push(`Row ${i + 2}: valid cost and sell price required`);
      continue;
    }

    let categoryId: string | null = null;
    const catName = row.category || row.category_name || "";
    if (catName) {
      categoryId = byName[catName.toLowerCase()] || null;
      if (!categoryId) {
        const createdCat = await prisma.category.create({ data: { name: catName } });
        categoryId = createdCat.id;
        byName[catName.toLowerCase()] = createdCat.id;
      }
    }

    const qty = Number(row.qty ?? row.quantity ?? 0) || 0;
    const reorderLevel = Number(row.reorder ?? row.reorder_level ?? 0) || 0;
    const data = {
      name,
      barcode: row.barcode || null,
      categoryId,
      cost,
      sellPrice,
      unit: row.unit || "pc",
      trackSerial: ["1", "true", "yes"].includes(
        (row.trackserial || row.track_serial || "").toLowerCase()
      ),
      active: true,
    };

    const existing = await prisma.product.findUnique({ where: { sku } });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
      await setStock(prisma, branchId, existing.id, { qty, reorderLevel });
      updated++;
    } else {
      const createdProduct = await prisma.product.create({ data: { ...data, sku } });
      await setStock(prisma, branchId, createdProduct.id, { qty, reorderLevel });
      created++;
    }
  }

  await writeAudit({
    userId: user.id,
    action: "IMPORT",
    entity: "Product",
    detail: `created ${created}, updated ${updated}, errors ${errors.length}, branch ${branchId}`,
  });

  return NextResponse.json({
    created,
    updated,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
  });
}
